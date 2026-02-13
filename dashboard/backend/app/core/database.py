import os
import logging
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from app.models import Base

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, database_url=None):
        self.database_url = database_url or os.getenv('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")

        engine_args = {"echo": False}
        
        if self.database_url.startswith("postgresql"):
            # Increased pool size to support concurrent ETL tasks and API requests
            # pool_size: Number of connections to maintain in the pool
            # max_overflow: Additional connections allowed beyond pool_size
            engine_args.update({
                "pool_size": 10,  # Increased from 5 to 10 for ORM migration
                "max_overflow": 10,  # Increased from 5 to 10 for ORM migration
                "pool_pre_ping": True,
                "pool_recycle": 1800,
                "pool_reset_on_return": "rollback",
            })

        self.engine = create_engine(self.database_url, **engine_args)

        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def create_tables(self):
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created successfully")
        except SQLAlchemyError as e:
            logger.error(f"Error creating tables: {e}")
            raise

    def get_session(self):
        return self.SessionLocal()

    def test_connection(self):
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection test successful")
            return True
        except SQLAlchemyError as e:
            logger.error(f"Database connection test failed: {e}")
            return False

    def get_pool_status(self) -> dict:
        """
        Get current connection pool status for monitoring and debugging.

        Returns:
            Dictionary containing pool metrics:
            - size: Number of connections currently in the pool
            - checked_in: Number of connections available
            - checked_out: Number of connections currently in use
            - overflow: Number of overflow connections in use
            - total: Total connections (pool + overflow)

        Example:
            >>> db_manager = get_db_manager()
            >>> status = db_manager.get_pool_status()
            >>> print(f"Pool utilization: {status['checked_out']}/{status['total']}")
        """
        pool = self.engine.pool
        return {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
            "total": pool.size() + pool.overflow()
        }

    def close(self):
        self.engine.dispose()
        logger.info("Database connections closed")

db_manager = None

def get_db_manager():
    global db_manager
    if db_manager is None:
        db_manager = DatabaseManager()
    return db_manager

@contextmanager
def get_db_session():
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

def get_db():
    with get_db_session() as session:
        yield session
