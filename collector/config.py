"""
Configuration management for Collector Worker
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    # Database
    DATABASE_URL = os.getenv('DATABASE_URL')

    # YouTube API
    YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')
    YOUTUBE_URL = os.getenv('YOUTUBE_URL')

    # Worker settings
    POLL_INTERVAL = int(os.getenv('POLL_INTERVAL', 60))  # seconds
    URL_CHECK_INTERVAL = int(os.getenv('URL_CHECK_INTERVAL', 30))  # seconds
    ENABLE_BACKFILL = os.getenv('ENABLE_BACKFILL', 'false').lower() == 'true'

    # Retry settings
    RETRY_MAX_ATTEMPTS = int(os.getenv('RETRY_MAX_ATTEMPTS', 3))
    RETRY_BACKOFF_SECONDS = int(os.getenv('RETRY_BACKOFF_SECONDS', 5))
    
    # Watchdog settings - restart chat collection if no activity for this duration
    CHAT_WATCHDOG_TIMEOUT = int(os.getenv('CHAT_WATCHDOG_TIMEOUT', 300))  # 5 minutes default
    CHAT_WATCHDOG_CHECK_INTERVAL = int(os.getenv('CHAT_WATCHDOG_CHECK_INTERVAL', 30))  # Check every 30s

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

    @classmethod
    def get_youtube_url_from_db(cls):
        """Fetch YouTube URL from database, fallback to env if not set"""
        try:
            from database import get_db_session
            from sqlalchemy import text

            if not cls.DATABASE_URL:
                return cls.YOUTUBE_URL

            with get_db_session() as session:
                result = session.execute(
                    text("SELECT value FROM system_settings WHERE key = 'youtube_url'")
                ).fetchone()

                if result and result[0]:
                    return result[0]
        except Exception as e:
            print(f"Warning: Could not fetch YouTube URL from database: {e}")

        return cls.YOUTUBE_URL

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        # Check for URL in both DB and env
        youtube_url = cls.get_youtube_url_from_db()
        
        required_vars = ['DATABASE_URL', 'YOUTUBE_API_KEY']
        missing_vars = []

        for var in required_vars:
            if not getattr(cls, var):
                missing_vars.append(var)
        
        if not youtube_url:
            missing_vars.append('YOUTUBE_URL (env or database)')

        if missing_vars:
            raise ValueError(f"Missing required configuration: {', '.join(missing_vars)}")

        return True

    @classmethod
    def print_config(cls):
        """Print current configuration (excluding sensitive data)"""
        youtube_url = cls.get_youtube_url_from_db()
        url_source = "DB" if youtube_url != cls.YOUTUBE_URL else "ENV"
        
        print("=== Collector Worker Configuration ===")
        print(f"DATABASE_URL: {'***' if cls.DATABASE_URL else 'NOT SET'}")
        print(f"YOUTUBE_API_KEY: {'***' if cls.YOUTUBE_API_KEY else 'NOT SET'}")
        print(f"YOUTUBE_URL: {youtube_url} (from {url_source})")
        print(f"POLL_INTERVAL: {cls.POLL_INTERVAL}")
        print(f"URL_CHECK_INTERVAL: {cls.URL_CHECK_INTERVAL}")
        print(f"ENABLE_BACKFILL: {cls.ENABLE_BACKFILL}")
        print(f"RETRY_MAX_ATTEMPTS: {cls.RETRY_MAX_ATTEMPTS}")
        print(f"RETRY_BACKOFF_SECONDS: {cls.RETRY_BACKOFF_SECONDS}")
        print(f"LOG_LEVEL: {cls.LOG_LEVEL}")
        print("=" * 35)