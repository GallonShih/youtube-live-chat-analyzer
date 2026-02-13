"""
Word Discovery Processor Module
AI 詞彙發現邏輯（遷移自 Airflow discover_new_words.py）

ORM migration:
- _initialize_analysis → ORM (WordAnalysisLog)
- _fetch_new_messages_info → ORM (WordAnalysisCheckpoint, func.count)
- _load_existing_dictionaries → ORM (ReplaceWord, SpecialWord)
- _save_discoveries → ORM (bulk_upsert) + raw SQL (LIKE/LIKE ANY for occurrence counts)
- _update_checkpoint → ORM (WordAnalysisCheckpoint)
- _finalize_analysis → ORM (WordAnalysisLog)
- _analyze_with_gemini → raw SQL (subquery for latest live_stream_id) + ORM (PromptTemplate)
- _create_tables_if_not_exists → removed (tables created by init SQL scripts)
"""

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional, Set, Tuple

from sqlalchemy import func

from app.etl.config import ETLConfig
from app.etl.processors.base import BaseETLProcessor
from app.utils.orm_helpers import bulk_upsert

logger = logging.getLogger(__name__)

# 常數配置
DEFAULT_BATCH_SIZE = 500
DEFAULT_MIN_CONFIDENCE = 0.7


def filter_and_validate_words(
    gemini_replace_words: List[Dict],
    gemini_special_words: List[Dict],
    existing_replace_mapping: Dict[str, str],
    existing_special_words: Set[str]
) -> Tuple[List[Dict], List[Dict]]:
    """
    過濾和驗證 Gemini 發現的詞彙

    規則：
    1. Protected Words 自動顛倒：如果 source 在 protected_words 中，顛倒 source 和 target
    2. Source 已存在自動轉換：DB: A->B, Gemini: A->C => C->B
    3. 跳過重複的 source：轉換後的 source 如果已存在，跳過
    4. Target 自動加入 special words：替換詞彙的 target 自動加入特殊詞彙（如果不在 DB）
    5. 跳過已存在的 special words
    """
    # 計算衍生集合
    replace_sources_set = set(existing_replace_mapping.keys())
    replace_targets_set = set(existing_replace_mapping.values())
    protected_words_set = replace_targets_set | existing_special_words

    # 過濾替換詞彙
    filtered_replace = []
    auto_add_special = []

    for item in gemini_replace_words:
        source = item.get('source', '')
        target = item.get('target', '')

        # 基礎規則: 如果 source 和 target 相同，則跳過
        if source == target:
            continue

        original_source = source
        original_target = target

        # 規則 1: Protected Words 自動顛倒
        if source in protected_words_set:
            source, target = target, source
            item['source'] = source
            item['target'] = target
            item['_transformation'] = f'swapped (protected): {original_source} <-> {original_target}'

            # Swap 後檢查是否完全重複
            if source in replace_sources_set and existing_replace_mapping[source] == target:
                continue

        # 規則 2: Source 已存在自動轉換
        if source in replace_sources_set:
            db_target = existing_replace_mapping[source]
            new_source = target
            new_target = db_target

            item['source'] = new_source
            item['target'] = new_target
            item['_transformation'] = f'transformed: {original_source}->{original_target} => {new_source}->{new_target}'

            source = new_source
            target = new_target

            # 規則 3: 檢查轉換後的 source 是否已經存在
            if source in replace_sources_set:
                continue

        # 通過所有檢查，加入過濾後的列表
        filtered_replace.append(item)

        # 規則 4: Target 自動加入 special words
        if target not in existing_special_words:
            auto_add_special.append({
                'word': target,
                'type': 'auto_from_replace',
                'confidence': 1.0,
                'examples': [f'替換詞彙的目標：{source} -> {target}'],
                'reason': f'自動從替換詞彙的目標詞彙加入',
                '_auto_added': True
            })
            existing_special_words.add(target)

    # 過濾特殊詞彙
    filtered_special = []

    for item in gemini_special_words:
        word = item.get('word', '')

        # 規則 5: 跳過已存在的 special words
        if word in existing_special_words:
            continue

        filtered_special.append(item)

    # 合併自動加入的 special words
    all_special = filtered_special + auto_add_special

    return filtered_replace, all_special


class WordDiscoveryProcessor(BaseETLProcessor):
    """
    AI 詞彙發現處理器

    功能：
    1. 從 chat_messages 讀取新留言
    2. 使用 Gemini API 分析留言
    3. 過濾和驗證發現的詞彙
    4. 儲存到待審核表
    """

    def __init__(self, etl_log_id: Optional[int] = None):
        """
        初始化處理器

        Args:
            etl_log_id: ETL 執行記錄 ID（用於關聯 etl_execution_log）
        """
        super().__init__()
        self.etl_log_id = etl_log_id

    def run(self) -> Dict[str, Any]:
        """
        執行詞彙發現任務

        Returns:
            執行結果摘要
        """
        # 檢查是否啟用
        if not ETLConfig.get('DISCOVER_NEW_WORDS_ENABLED', True):
            logger.info("Word discovery is disabled")
            return {'status': 'skipped', 'reason': 'disabled'}

        run_id = f"word_discovery_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        logger.info(f"Starting discover_new_words (run_id: {run_id})...")
        start_time = datetime.now()

        try:
            # 1. 初始化分析記錄
            log_id = self._initialize_analysis(run_id)

            # 2. 獲取新留言資訊
            checkpoint_time, message_count = self._fetch_new_messages_info()

            if message_count == 0:
                logger.info("No new messages to analyze")
                self._finalize_analysis(log_id, run_id, start_time, 0, 0, 0)
                return {
                    'status': 'completed',
                    'run_id': run_id,
                    'messages_analyzed': 0
                }

            # 3. 載入現有字典
            dictionaries = self._load_existing_dictionaries()

            # 4. 使用 Gemini API 分析
            analysis_result, messages_analyzed, last_message_info = self._analyze_with_gemini(
                checkpoint_time, dictionaries
            )

            # 5. 過濾和驗證
            filtered_replace, filtered_special = self._filter_and_validate(
                analysis_result, dictionaries
            )

            # 6. 儲存發現
            saved_replace, saved_special = self._save_discoveries(
                filtered_replace, filtered_special, dictionaries
            )

            # 7. 更新檢查點
            if last_message_info:
                self._update_checkpoint(last_message_info)

            # 8. 完成分析
            self._finalize_analysis(
                log_id, run_id, start_time,
                messages_analyzed, saved_replace, saved_special
            )

            execution_time = int((datetime.now() - start_time).total_seconds())

            logger.info(f"discover_new_words completed in {execution_time}s")

            return {
                'status': 'completed',
                'run_id': run_id,
                'messages_analyzed': messages_analyzed,
                'replace_words_found': saved_replace,
                'special_words_found': saved_special,
                'execution_time_seconds': execution_time
            }

        except Exception as e:
            logger.error(f"discover_new_words failed: {e}", exc_info=True)

            # Update word_analysis_log status to 'failed' (ORM)
            try:
                self._update_analysis_log_failed(run_id, str(e)[:500], start_time)
            except Exception as update_error:
                logger.error(f"Failed to update error status: {update_error}")

            return {
                'status': 'failed',
                'run_id': run_id,
                'error': str(e),
                'execution_time_seconds': int((datetime.now() - start_time).total_seconds())
            }

    def _initialize_analysis(self, run_id: str) -> int:
        """初始化分析任務，創建 word_analysis_log 記錄並關聯 etl_log_id（ORM）"""
        from app.models import WordAnalysisLog

        session = self.get_session()
        try:
            log = WordAnalysisLog(
                run_id=run_id,
                etl_log_id=self.etl_log_id,
                analysis_start_time=datetime.now(),
                status='running'
            )
            session.add(log)
            session.commit()
            session.refresh(log)
            log_id = log.id

            logger.info(f"Created analysis record: {run_id} (log_id={log_id}, etl_log_id={self.etl_log_id})")
            return log_id
        finally:
            session.close()

    def _fetch_new_messages_info(self) -> Tuple[datetime, int]:
        """獲取新留言資訊（ORM for checkpoint, raw SQL for count with subquery）"""
        from app.models import WordAnalysisCheckpoint, ChatMessage

        session = self.get_session()
        try:
            # 獲取上次分析的時間點（ORM）
            checkpoint = session.query(WordAnalysisCheckpoint).order_by(
                WordAnalysisCheckpoint.updated_at.desc()
            ).first()
            last_analyzed_time = (
                checkpoint.last_analyzed_timestamp if checkpoint
                else datetime.now(timezone.utc) - timedelta(hours=3)
            )

            # 計算待處理留言數量（raw SQL - subquery for latest live_stream_id）
            result = self.execute_raw_sql(
                """
                SELECT COUNT(*)
                FROM chat_messages
                WHERE published_at > :checkpoint_time
                AND live_stream_id = (
                    SELECT live_stream_id
                    FROM chat_messages
                    ORDER BY published_at DESC
                    LIMIT 1
                );
                """,
                {"checkpoint_time": last_analyzed_time},
                session=session
            )
            message_count = result.scalar() or 0
        finally:
            session.close()

        logger.info(f"Checkpoint time: {last_analyzed_time}, New messages: {message_count}")
        return last_analyzed_time, message_count

    def _load_existing_dictionaries(self) -> Dict[str, Any]:
        """載入現有字典（ORM）"""
        from app.models import ReplaceWord, SpecialWord

        session = self.get_session()
        try:
            # 載入替換詞彙
            replace_words = session.query(ReplaceWord).all()
            replace_mapping = {rw.source_word: rw.target_word for rw in replace_words}

            # 載入特殊詞彙
            special_words = session.query(SpecialWord).all()
            existing_special_words = {sw.word for sw in special_words}
        finally:
            session.close()

        logger.info(f"Loaded dictionaries: {len(replace_mapping)} replace, {len(existing_special_words)} special")

        return {
            'replace_mapping': replace_mapping,
            'replace_sources': set(replace_mapping.keys()),
            'replace_targets': set(replace_mapping.values()),
            'special_words': existing_special_words,
            'protected_words': set(replace_mapping.values()) | existing_special_words
        }

    def _analyze_with_gemini(
        self,
        checkpoint_time: datetime,
        dictionaries: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], int, Optional[Dict[str, Any]]]:
        """使用 Gemini API 分析留言"""
        # 取得 API Key
        api_key = ETLConfig.get('GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY')

        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in settings or environment")

        # 延遲匯入
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash-lite')

        # 獲取留言（raw SQL - subquery for latest live_stream_id）
        batch_size = ETLConfig.get('DISCOVER_NEW_WORDS_BATCH_SIZE', DEFAULT_BATCH_SIZE)

        session = self.get_session()
        try:
            result = self.execute_raw_sql(
                """
                SELECT message_id, message, author_name, published_at
                FROM chat_messages
                WHERE published_at > :checkpoint_time
                AND live_stream_id = (
                    SELECT live_stream_id
                    FROM chat_messages
                    ORDER BY published_at DESC
                    LIMIT 1
                )
                ORDER BY published_at ASC
                LIMIT :batch_size;
                """,
                {"checkpoint_time": checkpoint_time, "batch_size": batch_size * 4},
                session=session
            )
            messages = result.fetchall()
        finally:
            session.close()

        if not messages:
            return {'replace_words': [], 'special_words': []}, 0, None

        messages_data = [
            {
                'message_id': m[0],
                'message': m[1],
                'author_name': m[2],
                'published_at': m[3].isoformat() if m[3] else None
            }
            for m in messages
        ]

        logger.info(f"Fetched {len(messages_data)} messages for analysis")

        # 準備提示詞
        messages_text = "\n".join([f"{i+1}. {msg['message']}" for i, msg in enumerate(messages_data[:batch_size])])
        existing_replace_examples = list(dictionaries['replace_sources'])[:20]
        existing_special_examples = list(dictionaries['special_words'])[:30]

        # 預設提示詞範本（作為 fallback）
        # 使用 {{variable}} 格式避免與 JSON 的 {} 衝突
        DEFAULT_PROMPT_TEMPLATE = """
你是一個專門分析網路直播留言的助手。請分析以下留言，找出：

1. **錯別字和變體詞彙**：需要替換成標準詞彙的錯字或諧音
2. **特殊詞彙**：新出現的梗、角色名、網路用語等需要保留的詞彙

**現有的字典（請避免重複建議這些詞）**：
- 已存在的替換詞彙範例：{{replace_examples}}...（共 {{replace_count}} 個）
- 已存在的特殊詞彙範例：{{special_examples}}...（共 {{special_count}} 個）

**重要規則**：
1. 不要建議已存在的詞彙
2. 替換後的標準詞彙（target）必須是準確、完整的詞
3. 特殊詞彙只建議新發現的梗或重要詞彙

**待分析的留言**：
{{messages_text}}

請以 JSON 格式回應，格式如下：
{
  "replace_words": [
    {
      "source": "錯字或變體",
      "target": "標準詞彙",
      "confidence": 0.95,
      "examples": ["範例留言1", "範例留言2"],
      "reason": "簡短說明"
    }
  ],
  "special_words": [
    {
      "word": "特殊詞彙",
      "type": "meme|typo|variant|character|slang",
      "confidence": 0.90,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }
  ]
}

注意事項：
1. 只回報**新發現**的詞彙，避免重複現有字典
2. confidence 分數範圍 0.0-1.0，只回報 >= 0.7 的詞彙
3. 每個詞彙提供 1-3 個範例留言
4. 確保 target（替換後的詞）是正確且完整的標準詞彙
"""

        # 從資料庫讀取啟用的提示詞範本（ORM）
        prompt_template = self._load_active_prompt_template()

        # 如果沒有範本或讀取失敗，使用預設範本
        if not prompt_template:
            prompt_template = DEFAULT_PROMPT_TEMPLATE

        # 使用 str.replace() 填充模板變數（避免與 JSON {} 衝突）
        try:
            prompt = prompt_template
            prompt = prompt.replace('{{replace_examples}}', ', '.join(existing_replace_examples[:10]))
            prompt = prompt.replace('{{replace_count}}', str(len(dictionaries['replace_sources'])))
            prompt = prompt.replace('{{special_examples}}', ', '.join(existing_special_examples[:15]))
            prompt = prompt.replace('{{special_count}}', str(len(dictionaries['special_words'])))
            prompt = prompt.replace('{{messages_text}}', messages_text)
        except Exception as e:
            logger.error(f"Error replacing template variables: {e}")
            # Fallback to default
            prompt = DEFAULT_PROMPT_TEMPLATE
            prompt = prompt.replace('{{replace_examples}}', ', '.join(existing_replace_examples[:10]))
            prompt = prompt.replace('{{replace_count}}', str(len(dictionaries['replace_sources'])))
            prompt = prompt.replace('{{special_examples}}', ', '.join(existing_special_examples[:15]))
            prompt = prompt.replace('{{special_count}}', str(len(dictionaries['special_words'])))
            prompt = prompt.replace('{{messages_text}}', messages_text)


        try:
            # Add timeout to prevent infinite waiting
            logger.info("Calling Gemini API for word discovery...")

            # Configure retry strategy: total timeout includes retries
            from google.api_core import retry
            retry_policy = retry.Retry(
                initial=1.0,
                maximum=10.0,
                multiplier=2.0,
                timeout=60.0  # Total deadline for all retries
            )

            response = model.generate_content(
                prompt,
                request_options={
                    'timeout': 60,  # Per-request timeout
                    'retry': retry_policy
                }
            )
            response_text = response.text
            logger.info("Gemini API call completed successfully")

            # 清理 JSON
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            analysis_result = json.loads(response_text)

            logger.info(f"API Response: {len(analysis_result.get('replace_words', []))} replace, "
                       f"{len(analysis_result.get('special_words', []))} special")

            last_message_info = {
                'message_id': messages_data[-1]['message_id'],
                'published_at': messages_data[-1]['published_at']
            }

            return analysis_result, len(messages_data), last_message_info

        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise

    def _load_active_prompt_template(self) -> Optional[str]:
        """從資料庫讀取啟用的提示詞範本（ORM）"""
        from app.models import PromptTemplate

        session = self.get_session()
        try:
            template = session.query(PromptTemplate).filter(
                PromptTemplate.is_active == True
            ).first()

            if template:
                logger.info("Loaded active prompt template from database")
                return template.template
            else:
                logger.warning("No active prompt template found, using default")
                return None
        except Exception as e:
            logger.error(f"Error loading prompt template: {e}, using default")
            return None
        finally:
            session.close()

    def _filter_and_validate(
        self,
        analysis_result: Dict[str, Any],
        dictionaries: Dict[str, Any]
    ) -> Tuple[List[Dict], List[Dict]]:
        """過濾和驗證發現的詞彙"""
        min_confidence = ETLConfig.get('DISCOVER_NEW_WORDS_MIN_CONFIDENCE', DEFAULT_MIN_CONFIDENCE)

        # 過濾低信心的詞彙
        replace_words = [
            w for w in analysis_result.get('replace_words', [])
            if w.get('confidence', 0) >= min_confidence
        ]
        special_words = [
            w for w in analysis_result.get('special_words', [])
            if w.get('confidence', 0) >= min_confidence
        ]

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace_words=replace_words,
            gemini_special_words=special_words,
            existing_replace_mapping=dictionaries['replace_mapping'],
            existing_special_words=dictionaries['special_words'].copy()
        )

        logger.info(f"Filtered: {len(filtered_replace)} replace, {len(filtered_special)} special")

        return filtered_replace, filtered_special

    def _save_discoveries(
        self,
        filtered_replace: List[Dict],
        filtered_special: List[Dict],
        dictionaries: Dict[str, Any]
    ) -> Tuple[int, int]:
        """儲存發現的詞彙（ORM bulk_upsert + raw SQL for LIKE occurrence counts）"""
        from app.models import PendingReplaceWord, PendingSpecialWord

        saved_replace = 0
        saved_special = 0

        session = self.get_session()
        try:
            # 儲存替換詞彙
            for item in filtered_replace:
                source = item['source']
                target = item['target']

                # 計算近 7 天出現次數（raw SQL - LIKE pattern search, performance critical）
                result = self.execute_raw_sql(
                    """
                    SELECT COUNT(*)
                    FROM chat_messages
                    WHERE message LIKE :pattern
                    AND published_at > NOW() - INTERVAL '7 days'
                    """,
                    {"pattern": f"%{source}%"},
                    session=session
                )
                occurrence_count = result.scalar() or 0

                # Use bulk_upsert for single item with GREATEST logic via raw SQL
                # (bulk_upsert doesn't support GREATEST, so use raw SQL for upsert)
                self.execute_raw_sql(
                    """
                    INSERT INTO pending_replace_words
                        (source_word, target_word, confidence_score, example_messages, occurrence_count)
                    VALUES (:source, :target, :confidence, :examples, :count)
                    ON CONFLICT (source_word, target_word)
                    DO UPDATE SET
                        occurrence_count = EXCLUDED.occurrence_count,
                        confidence_score = GREATEST(pending_replace_words.confidence_score, EXCLUDED.confidence_score),
                        status = 'pending';
                    """,
                    {
                        "source": source,
                        "target": target,
                        "confidence": item.get('confidence', 0.8),
                        "examples": item.get('examples', [])[:5],
                        "count": occurrence_count
                    },
                    session=session
                )
                saved_replace += 1

            # 儲存特殊詞彙
            target_to_sources = {}
            for src, tgt in dictionaries['replace_mapping'].items():
                if tgt not in target_to_sources:
                    target_to_sources[tgt] = []
                target_to_sources[tgt].append(src)

            for item in filtered_special:
                word = item['word']
                synonyms = [word] + target_to_sources.get(word, [])

                # 計算近 7 天出現次數（raw SQL - LIKE ANY pattern, PostgreSQL specific）
                result = self.execute_raw_sql(
                    """
                    SELECT COUNT(*)
                    FROM chat_messages
                    WHERE message LIKE ANY(:patterns)
                    AND published_at > NOW() - INTERVAL '7 days'
                    """,
                    {"patterns": [f"%{s}%" for s in synonyms]},
                    session=session
                )
                occurrence_count = result.scalar() or 0

                # Use raw SQL for upsert with GREATEST logic
                self.execute_raw_sql(
                    """
                    INSERT INTO pending_special_words
                        (word, word_type, confidence_score, example_messages, occurrence_count)
                    VALUES (:word, :word_type, :confidence, :examples, :count)
                    ON CONFLICT (word)
                    DO UPDATE SET
                        occurrence_count = EXCLUDED.occurrence_count,
                        confidence_score = GREATEST(pending_special_words.confidence_score, EXCLUDED.confidence_score),
                        status = 'pending';
                    """,
                    {
                        "word": word,
                        "word_type": item.get('type', 'unknown'),
                        "confidence": item.get('confidence', 0.8),
                        "examples": item.get('examples', [])[:5],
                        "count": occurrence_count
                    },
                    session=session
                )
                saved_special += 1

            session.commit()
        finally:
            session.close()

        logger.info(f"Saved {saved_replace} replace words, {saved_special} special words")
        return saved_replace, saved_special

    def _update_checkpoint(self, last_message_info: Dict[str, Any]):
        """更新分析檢查點（ORM）"""
        from app.models import WordAnalysisCheckpoint

        session = self.get_session()
        try:
            checkpoint = session.query(WordAnalysisCheckpoint).order_by(
                WordAnalysisCheckpoint.id.desc()
            ).first()

            if checkpoint:
                checkpoint.last_analyzed_message_id = last_message_info['message_id']
                checkpoint.last_analyzed_timestamp = last_message_info['published_at']
                checkpoint.updated_at = func.now()
            else:
                checkpoint = WordAnalysisCheckpoint(
                    last_analyzed_message_id=last_message_info['message_id'],
                    last_analyzed_timestamp=last_message_info['published_at'],
                )
                session.add(checkpoint)

            session.commit()
        finally:
            session.close()

        logger.info(f"Checkpoint updated to: {last_message_info['published_at']}")

    def _finalize_analysis(
        self,
        log_id: int,
        run_id: str,
        start_time: datetime,
        messages_analyzed: int,
        replace_words_found: int,
        special_words_found: int
    ):
        """完成分析記錄（ORM）"""
        from app.models import WordAnalysisLog

        execution_time = int((datetime.now() - start_time).total_seconds())

        session = self.get_session()
        try:
            log = session.query(WordAnalysisLog).filter(
                WordAnalysisLog.id == log_id
            ).first()

            if log:
                log.analysis_end_time = datetime.now()
                log.messages_analyzed = messages_analyzed
                log.new_replace_words_found = replace_words_found
                log.new_special_words_found = special_words_found
                log.api_calls_made = 1
                log.status = 'completed'
                log.execution_time_seconds = execution_time

            session.commit()
        finally:
            session.close()

        logger.info(f"Analysis finalized: {run_id}")

    def _update_analysis_log_failed(self, run_id: str, error: str, start_time: datetime):
        """更新分析記錄為失敗狀態（ORM）"""
        from app.models import WordAnalysisLog

        session = self.get_session()
        try:
            log = session.query(WordAnalysisLog).filter(
                WordAnalysisLog.run_id == run_id
            ).first()

            if log:
                log.status = 'failed'
                log.error_message = error
                log.analysis_end_time = datetime.now()
                log.execution_time_seconds = int((datetime.now() - start_time).total_seconds())

            session.commit()
        finally:
            session.close()
