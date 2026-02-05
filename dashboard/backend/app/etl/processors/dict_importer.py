"""
Dictionary Importer Module
字典匯入邏輯（遷移自 Airflow import_text_analysis_dicts.py）
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.etl.config import ETLConfig

logger = logging.getLogger(__name__)

# 字典檔案預設路徑
DEFAULT_TEXT_ANALYSIS_DIR = Path(os.getenv('TEXT_ANALYSIS_DIR', '/app/text_analysis'))


class DictImporter:
    """
    字典匯入器

    功能：
    1. 匯入無意義詞彙 (meaningless_words.json)
    2. 匯入替換詞彙 (replace_words.json)
    3. 匯入特殊詞彙 (special_words.json)
    """

    def __init__(
        self,
        database_url: Optional[str] = None,
        text_analysis_dir: Optional[Path] = None
    ):
        """
        初始化匯入器

        Args:
            database_url: 資料庫連線字串
            text_analysis_dir: 字典檔案目錄
        """
        self.database_url = database_url or ETLConfig.get('DATABASE_URL')
        self.text_analysis_dir = text_analysis_dir or DEFAULT_TEXT_ANALYSIS_DIR
        self._engine: Optional[Engine] = None

    def get_engine(self) -> Engine:
        """取得資料庫連線引擎"""
        if self._engine is None:
            self._engine = create_engine(self.database_url, pool_pre_ping=True)
        return self._engine

    def run(self) -> Dict[str, Any]:
        """
        執行匯入任務

        Returns:
            執行結果摘要
        """
        logger.info("Starting import_text_analysis_dicts...")
        start_time = datetime.now()

        try:
            # 1. 創建表（如果不存在）
            self._create_tables_if_not_exists()

            # 2. 匯入無意義詞彙
            meaningless_result = self._import_meaningless_words()

            # 3. 匯入替換詞彙（檢查是否需要清空）
            truncate_replace = ETLConfig.get('TRUNCATE_REPLACE_WORDS', False)
            if truncate_replace:
                self._truncate_table('replace_words')
                ETLConfig.set('TRUNCATE_REPLACE_WORDS', 'false', 'boolean')
            replace_result = self._import_replace_words()

            # 4. 匯入特殊詞彙（檢查是否需要清空）
            truncate_special = ETLConfig.get('TRUNCATE_SPECIAL_WORDS', False)
            if truncate_special:
                self._truncate_table('special_words')
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

    def _create_tables_if_not_exists(self):
        """創建文字分析相關的資料表"""
        engine = self.get_engine()

        create_tables_sql = """
        -- 無意義詞彙表
        CREATE TABLE IF NOT EXISTS meaningless_words (
            id SERIAL PRIMARY KEY,
            word VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- 替換詞彙表 (key-value mapping)
        CREATE TABLE IF NOT EXISTS replace_words (
            id SERIAL PRIMARY KEY,
            source_word VARCHAR(255) NOT NULL UNIQUE,
            target_word VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- 特殊詞彙表
        CREATE TABLE IF NOT EXISTS special_words (
            id SERIAL PRIMARY KEY,
            word VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- 創建索引以提升查詢效能
        CREATE INDEX IF NOT EXISTS idx_meaningless_words_word ON meaningless_words(word);
        CREATE INDEX IF NOT EXISTS idx_replace_words_source ON replace_words(source_word);
        CREATE INDEX IF NOT EXISTS idx_replace_words_target ON replace_words(target_word);
        CREATE INDEX IF NOT EXISTS idx_special_words_word ON special_words(word);
        """

        with engine.connect() as conn:
            conn.execute(text(create_tables_sql))
            conn.commit()

        logger.info("Dictionary tables created or already exist")

    def _truncate_table(self, table_name: str):
        """清空指定表"""
        engine = self.get_engine()

        with engine.connect() as conn:
            conn.execute(text(f"TRUNCATE TABLE {table_name};"))
            conn.commit()

        logger.info(f"Table {table_name} truncated")

    def _import_meaningless_words(self) -> Dict[str, Any]:
        """匯入無意義詞彙"""
        json_file = self.text_analysis_dir / 'meaningless_words.json'

        if not json_file.exists():
            logger.warning(f"File not found: {json_file}")
            return {'processed': 0, 'total': 0, 'error': 'file_not_found'}

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        words = data.get('meaningless_words', [])

        if not words:
            logger.info("No meaningless words to import")
            return {'processed': 0, 'total': 0}

        engine = self.get_engine()

        with engine.connect() as conn:
            for word in words:
                conn.execute(
                    text("""
                        INSERT INTO meaningless_words (word)
                        VALUES (:word)
                        ON CONFLICT (word) DO NOTHING;
                    """),
                    {"word": word}
                )
            conn.commit()

            # 查詢總數
            result = conn.execute(text("SELECT COUNT(*) FROM meaningless_words;"))
            total_count = result.scalar()

        logger.info(f"Imported {len(words)} meaningless words, total: {total_count}")

        return {'processed': len(words), 'total': total_count}

    def _import_replace_words(self) -> Dict[str, Any]:
        """匯入替換詞彙對照表"""
        json_file = self.text_analysis_dir / 'replace_words.json'

        if not json_file.exists():
            logger.warning(f"File not found: {json_file}")
            return {'processed': 0, 'total': 0, 'error': 'file_not_found'}

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        replace_map = data.get('replace_words', {})

        if not replace_map:
            logger.info("No replace words to import")
            return {'processed': 0, 'total': 0}

        engine = self.get_engine()

        with engine.connect() as conn:
            for source, target in replace_map.items():
                conn.execute(
                    text("""
                        INSERT INTO replace_words (source_word, target_word)
                        VALUES (:source, :target)
                        ON CONFLICT (source_word) DO UPDATE SET
                            target_word = EXCLUDED.target_word,
                            updated_at = NOW();
                    """),
                    {"source": source, "target": target}
                )
            conn.commit()

            # 查詢總數
            result = conn.execute(text("SELECT COUNT(*) FROM replace_words;"))
            total_count = result.scalar()

        logger.info(f"Imported {len(replace_map)} replace words, total: {total_count}")

        return {'processed': len(replace_map), 'total': total_count}

    def _import_special_words(self) -> Dict[str, Any]:
        """匯入特殊詞彙"""
        json_file = self.text_analysis_dir / 'special_words.json'

        if not json_file.exists():
            logger.warning(f"File not found: {json_file}")
            return {'processed': 0, 'total': 0, 'error': 'file_not_found'}

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        words = data.get('special_words', [])

        if not words:
            logger.info("No special words to import")
            return {'processed': 0, 'total': 0}

        engine = self.get_engine()

        with engine.connect() as conn:
            for word in words:
                conn.execute(
                    text("""
                        INSERT INTO special_words (word)
                        VALUES (:word)
                        ON CONFLICT (word) DO NOTHING;
                    """),
                    {"word": word}
                )
            conn.commit()

            # 查詢總數
            result = conn.execute(text("SELECT COUNT(*) FROM special_words;"))
            total_count = result.scalar()

        logger.info(f"Imported {len(words)} special words, total: {total_count}")

        return {'processed': len(words), 'total': total_count}
