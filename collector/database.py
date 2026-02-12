"""
Database connection and session management for YouTube Chat Analyzer
"""

import os
import logging
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from models import Base

logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self, database_url=None):
        self.database_url = database_url or os.getenv('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")

        # Create engine with connection pooling
        # 3 threads use DB concurrently: ChatCollector, StatsCollector, URLMonitor
        self.engine = create_engine(
            self.database_url,
            pool_size=3,
            max_overflow=2,
            pool_pre_ping=True,
            pool_recycle=1800,
            pool_timeout=10,
            pool_reset_on_return="rollback",
            echo=False,
            connect_args={
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5,
            },
        )

        # Create session factory
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def create_tables(self):
        """Create all tables if they don't exist"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created successfully")
        except SQLAlchemyError as e:
            logger.error(f"Error creating tables: {e}")
            raise

    def get_session(self):
        """Get a new database session"""
        return self.SessionLocal()

    def test_connection(self):
        """Test database connectivity"""
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection test successful")
            return True
        except SQLAlchemyError as e:
            logger.error(f"Database connection test failed: {e}")
            return False

    def close(self):
        """Close all connections"""
        self.engine.dispose()
        logger.info("Database connections closed")


# Global database manager instance
db_manager = None


def get_db_manager():
    """Get the global database manager instance"""
    global db_manager
    if db_manager is None:
        db_manager = DatabaseManager()
    return db_manager


@contextmanager
def get_db_session():
    """Get a new database session (context manager)"""
    manager = get_db_manager()
    session = manager.get_session()
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Database session error: {e}")
        raise
    finally:
        session.close()