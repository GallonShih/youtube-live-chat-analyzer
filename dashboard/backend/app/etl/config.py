"""
ETL Configuration Module
ETL 設定管理（從資料庫讀取，fallback 到環境變數）
"""

import os
import logging
from typing import Any, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


class ETLConfig:
    """
    ETL 設定管理

    讀取優先級：
    1. 環境變數（僅限敏感資訊如 GEMINI_API_KEY）
    2. 資料庫 etl_settings 表
    3. 程式碼預設值

    注意：快取預設停用，確保每次讀取都是最新值
    """

    _engine: Optional[Engine] = None
    _cache: dict = {}
    _cache_enabled: bool = False  # 預設停用快取，確保讀取最新設定

    # 敏感設定：優先從環境變數讀取
    SENSITIVE_KEYS = {'GEMINI_API_KEY', 'DISCORD_WEBHOOK_URL'}

    @classmethod
    def init_engine(cls, database_url: str):
        """初始化資料庫連線"""
        cls._engine = create_engine(database_url, pool_pre_ping=True)
        cls._cache = {}
        logger.info("ETLConfig engine initialized")

    @classmethod
    def get_engine(cls) -> Optional[Engine]:
        """取得資料庫引擎"""
        if cls._engine is None:
            database_url = os.getenv('DATABASE_URL')
            if database_url:
                cls.init_engine(database_url)
        return cls._engine

    @classmethod
    def clear_cache(cls):
        """清除快取"""
        cls._cache = {}

    @classmethod
    def disable_cache(cls):
        """停用快取（用於需要即時讀取的場景）"""
        cls._cache_enabled = False
        cls._cache = {}

    @classmethod
    def enable_cache(cls):
        """啟用快取"""
        cls._cache_enabled = True

    @classmethod
    def get(cls, key: str, default: Any = None) -> Any:
        """
        讀取設定值

        讀取優先級：
        - 敏感設定 (GEMINI_API_KEY 等): ENV → DB → Default
        - 一般設定: DB → ENV → Default

        Args:
            key: 設定鍵名
            default: 預設值

        Returns:
            設定值（已轉換類型）
        """
        # 檢查快取
        if cls._cache_enabled and key in cls._cache:
            return cls._cache[key]

        value = None

        # 敏感設定：優先從環境變數讀取
        if key in cls.SENSITIVE_KEYS:
            env_value = os.getenv(key)
            if env_value is not None and env_value != '':
                return env_value  # 敏感設定直接返回，不快取

        # 1. 從資料庫讀取
        engine = cls.get_engine()
        if engine:
            try:
                with engine.connect() as conn:
                    result = conn.execute(
                        text("SELECT value, value_type FROM etl_settings WHERE key = :key"),
                        {"key": key}
                    ).fetchone()

                    if result and result[0] is not None and result[0] != '':
                        raw_value, value_type = result
                        value = cls._convert_type(raw_value, value_type)
            except Exception as e:
                logger.warning(f"Failed to read {key} from database: {e}")

        # 2. 從環境變數讀取（非敏感設定的 fallback）
        if value is None:
            env_value = os.getenv(key)
            if env_value is not None and env_value != '':
                value = env_value

        # 3. 使用預設值
        if value is None:
            value = default

        # 寫入快取（如果啟用）
        if cls._cache_enabled and value is not None:
            cls._cache[key] = value

        return value

    @classmethod
    def set(cls, key: str, value: Any, value_type: str = 'string') -> bool:
        """
        設定值到資料庫

        Args:
            key: 設定鍵名
            value: 設定值
            value_type: 值類型

        Returns:
            是否成功
        """
        engine = cls.get_engine()
        if not engine:
            logger.error("Database engine not initialized")
            return False

        try:
            with engine.connect() as conn:
                conn.execute(
                    text("""
                        INSERT INTO etl_settings (key, value, value_type, updated_at)
                        VALUES (:key, :value, :value_type, NOW())
                        ON CONFLICT (key) DO UPDATE SET
                            value = EXCLUDED.value,
                            value_type = EXCLUDED.value_type,
                            updated_at = NOW()
                    """),
                    {"key": key, "value": str(value), "value_type": value_type}
                )
                conn.commit()

            # 更新快取
            if cls._cache_enabled:
                cls._cache[key] = value

            return True
        except Exception as e:
            logger.error(f"Failed to set {key}: {e}")
            return False

    @staticmethod
    def _convert_type(value: str, value_type: str) -> Any:
        """
        類型轉換

        Args:
            value: 原始字串值
            value_type: 目標類型

        Returns:
            轉換後的值
        """
        if value is None:
            return None

        try:
            if value_type == 'boolean':
                return value.lower() in ('true', '1', 'yes')
            elif value_type == 'integer':
                return int(value)
            elif value_type == 'float':
                return float(value)
            elif value_type == 'datetime':
                from datetime import datetime
                return datetime.fromisoformat(value)
            else:
                return value
        except (ValueError, TypeError) as e:
            logger.warning(f"Type conversion failed for value '{value}' to {value_type}: {e}")
            return value
