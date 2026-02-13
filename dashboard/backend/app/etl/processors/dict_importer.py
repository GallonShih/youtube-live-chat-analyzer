"""
Dictionary Importer Module
字典匯入邏輯（遷移自 Airflow import_text_analysis_dicts.py）

Uses ORM with bulk_upsert for efficient batch operations.
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from app.etl.processors.base import BaseETLProcessor
from app.etl.config import ETLConfig
from app.utils.orm_helpers import bulk_upsert, bulk_upsert_do_nothing

logger = logging.getLogger(__name__)

# 字典檔案預設路徑
DEFAULT_TEXT_ANALYSIS_DIR = Path(os.getenv('TEXT_ANALYSIS_DIR', '/app/text_analysis').strip())


class DictImporter(BaseETLProcessor):
    """
    字典匯入器

    功能：
    1. 匯入無意義詞彙 (meaningless_words.json)
    2. 匯入替換詞彙 (replace_words.json)
    3. 匯入特殊詞彙 (special_words.json)
    """

    def __init__(self, text_analysis_dir: Optional[Path] = None):
        super().__init__()
        self.text_analysis_dir = text_analysis_dir or DEFAULT_TEXT_ANALYSIS_DIR

    def run(self) -> Dict[str, Any]:
        """
        執行匯入任務

        Returns:
            執行結果摘要
        """
        logger.info("Starting import_text_analysis_dicts...")
        start_time = datetime.now()

        try:
            # 1. 匯入無意義詞彙
            meaningless_result = self._import_meaningless_words()

            # 2. 匯入替換詞彙（檢查是否需要清空）
            truncate_replace = ETLConfig.get('TRUNCATE_REPLACE_WORDS', False)
            if truncate_replace:
                self._truncate_model('replace_words')
                ETLConfig.set('TRUNCATE_REPLACE_WORDS', 'false', 'boolean')
            replace_result = self._import_replace_words()

            # 3. 匯入特殊詞彙（檢查是否需要清空）
            truncate_special = ETLConfig.get('TRUNCATE_SPECIAL_WORDS', False)
            if truncate_special:
                self._truncate_model('special_words')
                ETLConfig.set('TRUNCATE_SPECIAL_WORDS', 'false', 'boolean')
            special_result = self._import_special_words()

            execution_time = int((datetime.now() - start_time).total_seconds())

            # 計算總共處理的詞彙數
            total_processed = (
                meaningless_result.get('total', 0) +
                replace_result.get('total', 0) +
                special_result.get('total', 0)
            )

            result = {
                'status': 'completed',
                'meaningless_words': meaningless_result,
                'replace_words': replace_result,
                'special_words': special_result,
                'total_processed': total_processed,
                'execution_time_seconds': execution_time
            }

            logger.info(f"import_text_analysis_dicts completed in {execution_time}s")
            logger.info(f"Summary: meaningless={meaningless_result['total']}, "
                       f"replace={replace_result['total']}, special={special_result['total']}")

            return result

        except Exception as e:
            logger.error(f"import_text_analysis_dicts failed: {e}")
            return {
                'status': 'failed',
                'error': str(e),
                'execution_time_seconds': int((datetime.now() - start_time).total_seconds())
            }

    def _truncate_model(self, table_name: str):
        """清空指定表（使用 ORM delete）"""
        from app.models import ReplaceWord, SpecialWord, MeaninglessWord

        model_map = {
            'replace_words': ReplaceWord,
            'special_words': SpecialWord,
            'meaningless_words': MeaninglessWord,
        }

        model = model_map.get(table_name)
        if not model:
            logger.warning(f"Unknown table: {table_name}")
            return

        session = self.get_session()
        try:
            session.query(model).delete()
            session.commit()
            logger.info(f"Table {table_name} truncated")
        finally:
            session.close()

    def _import_meaningless_words(self) -> Dict[str, Any]:
        """匯入無意義詞彙"""
        from app.models import MeaninglessWord

        json_file = self.text_analysis_dir / 'meaningless_words.json'

        if not json_file.exists():
            raise FileNotFoundError(f"Meaningless words file not found: {json_file}")

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        words = data.get('meaningless_words', [])

        if not words:
            logger.info("No meaningless words to import")
            return {'processed': 0, 'total': 0}

        session = self.get_session()
        try:
            # Bulk insert with ON CONFLICT DO NOTHING
            word_data = [{"word": word} for word in words]
            bulk_upsert_do_nothing(session, MeaninglessWord, word_data, ['word'])
            session.commit()

            # 查詢總數
            total_count = session.query(MeaninglessWord).count()
        finally:
            session.close()

        logger.info(f"Imported {len(words)} meaningless words, total: {total_count}")
        return {'processed': len(words), 'total': total_count}

    def _import_replace_words(self) -> Dict[str, Any]:
        """匯入替換詞彙對照表"""
        from app.models import ReplaceWord

        json_file = self.text_analysis_dir / 'replace_words.json'

        if not json_file.exists():
            raise FileNotFoundError(f"Replace words file not found: {json_file}")

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        replace_map = data.get('replace_words', {})

        if not replace_map:
            logger.info("No replace words to import")
            return {'processed': 0, 'total': 0}

        session = self.get_session()
        try:
            # Bulk upsert (ON CONFLICT DO UPDATE target_word)
            replace_data = [
                {"source_word": source, "target_word": target}
                for source, target in replace_map.items()
            ]
            bulk_upsert(
                session, ReplaceWord, replace_data,
                constraint_columns=['source_word'],
                update_columns=['target_word']
            )
            session.commit()

            # 查詢總數
            total_count = session.query(ReplaceWord).count()
        finally:
            session.close()

        logger.info(f"Imported {len(replace_map)} replace words, total: {total_count}")
        return {'processed': len(replace_map), 'total': total_count}

    def _import_special_words(self) -> Dict[str, Any]:
        """匯入特殊詞彙"""
        from app.models import SpecialWord

        json_file = self.text_analysis_dir / 'special_words.json'

        if not json_file.exists():
            raise FileNotFoundError(f"Special words file not found: {json_file}")

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        words = data.get('special_words', [])

        if not words:
            logger.info("No special words to import")
            return {'processed': 0, 'total': 0}

        session = self.get_session()
        try:
            # Bulk insert with ON CONFLICT DO NOTHING
            word_data = [{"word": word} for word in words]
            bulk_upsert_do_nothing(session, SpecialWord, word_data, ['word'])
            session.commit()

            # 查詢總數
            total_count = session.query(SpecialWord).count()
        finally:
            session.close()

        logger.info(f"Imported {len(words)} special words, total: {total_count}")
        return {'processed': len(words), 'total': total_count}
