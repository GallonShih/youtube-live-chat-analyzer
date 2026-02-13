"""
Base ETL Processor

This module provides the base class for all ETL processors.
It standardizes database access patterns, mixing ORM and raw SQL appropriately.

Design Philosophy:
- Use ORM for most operations (CRUD, simple queries, batch operations)
- Use raw SQL for performance-critical operations (UNNEST, complex JSONB, etc.)
- Unified connection management through DatabaseManager
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.core.database import get_db_manager
import logging

logger = logging.getLogger(__name__)


class BaseETLProcessor(ABC):
    """
    Base class for all ETL processors.

    Provides unified database access:
    - get_session() for ORM operations
    - execute_raw_sql() for performance-critical raw SQL queries

    Subclasses must implement the run() method.

    Example:
        >>> class MyProcessor(BaseETLProcessor):
        ...     def run(self):
        ...         with self.get_session() as session:
        ...             # Use ORM for simple operations
        ...             data = session.query(MyModel).all()
        ...
        ...             # Use raw SQL for complex operations
        ...             result = self.execute_raw_sql(
        ...                 "SELECT unnest(tokens) FROM ...",
        ...                 session=session
        ...             )
        ...
        ...             session.commit()
        ...         return {"status": "completed"}
    """

    def __init__(self):
        """Initialize processor with shared DatabaseManager."""
        self.db_manager = get_db_manager()
        self.logger = logging.getLogger(self.__class__.__name__)

    def get_session(self) -> Session:
        """
        Get a SQLAlchemy session from the main DatabaseManager.

        This method uses the application's main connection pool,
        which is shared across all ETL processors and API endpoints.

        Returns:
            SQLAlchemy Session instance

        Usage:
            >>> with self.get_session() as session:
            ...     records = session.query(MyModel).all()
            ...     session.commit()
        """
        return self.db_manager.get_session()

    def execute_raw_sql(
        self,
        sql: str,
        params: Optional[Dict[str, Any]] = None,
        session: Optional[Session] = None
    ):
        """
        Execute raw SQL query (for PostgreSQL-specific features).

        Use this method for:
        - UNNEST operations on arrays
        - Complex JSONB queries (->, ->>, #>, etc.)
        - Performance-critical queries where ORM overhead is significant
        - PostgreSQL-specific functions not well-supported by ORM

        Args:
            sql: SQL query string (use :param for parameter binding)
            params: Dictionary of parameters for the query
            session: Optional existing session (creates new one if None)

        Returns:
            SQLAlchemy ResultProxy

        Example:
            >>> result = self.execute_raw_sql(
            ...     "SELECT unnest(tokens) as word FROM processed_chat_messages WHERE id = :msg_id",
            ...     params={"msg_id": 123}
            ... )
            >>> words = [row.word for row in result.fetchall()]

        Note:
            Always use parameterized queries to prevent SQL injection.
        """
        params = params or {}
        close_session = False

        try:
            if session is None:
                session = self.get_session()
                close_session = True

            self.logger.debug(f"Executing raw SQL: {sql[:100]}...")
            result = session.execute(text(sql), params)

            return result

        except SQLAlchemyError as e:
            self.logger.error(f"Raw SQL execution failed: {e}", exc_info=True)
            if session:
                session.rollback()
            raise

        finally:
            if close_session and session:
                session.close()

    @abstractmethod
    def run(self) -> Dict[str, Any]:
        """
        Execute the ETL processor logic.

        Subclasses must implement this method with their specific processing logic.

        Returns:
            Dictionary containing execution results with at least:
            - status: "completed" | "failed" | "partial"
            - records_processed: int (number of records processed)
            - Additional processor-specific metrics

        Example:
            >>> def run(self):
            ...     with self.get_session() as session:
            ...         # Process data
            ...         count = process_messages(session)
            ...         session.commit()
            ...
            ...     return {
            ...         "status": "completed",
            ...         "records_processed": count,
            ...         "execution_time": elapsed_time
            ...     }

        Raises:
            Exception: Re-raises any exceptions after logging
        """
        pass

    def log_progress(self, message: str, level: str = "info"):
        """
        Log progress message with processor name prefix.

        Args:
            message: Log message
            level: Log level ("debug", "info", "warning", "error")
        """
        log_method = getattr(self.logger, level, self.logger.info)
        log_method(f"[{self.__class__.__name__}] {message}")

    def validate_data(self, data: Any, expected_type: type, field_name: str = "data") -> bool:
        """
        Validate data type before processing.

        Args:
            data: Data to validate
            expected_type: Expected type
            field_name: Name of the field (for error messages)

        Returns:
            True if valid

        Raises:
            TypeError: If data type doesn't match expected type
        """
        if not isinstance(data, expected_type):
            raise TypeError(
                f"{field_name} must be {expected_type.__name__}, "
                f"got {type(data).__name__}"
            )
        return True
