"""
ORM Helper Utilities

This module provides utility functions for common ORM operations,
particularly bulk operations and safe transaction handling.
"""

from typing import List, Dict, Any, Type, Optional
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)


def bulk_upsert(
    session: Session,
    model: Type,
    data: List[Dict[str, Any]],
    constraint_columns: List[str],
    update_columns: Optional[List[str]] = None
) -> int:
    """
    Bulk UPSERT operation (INSERT ... ON CONFLICT DO UPDATE).

    This function efficiently handles bulk insert/update operations using
    PostgreSQL's ON CONFLICT clause. It's significantly faster than
    individual inserts or updates.

    Args:
        session: SQLAlchemy session
        model: ORM model class (e.g., ProcessedChatMessage)
        data: List of dictionaries containing data to insert/update
        constraint_columns: Columns to check for conflicts (e.g., ['message_id'])
        update_columns: Columns to update on conflict (None = update all non-constraint columns)

    Returns:
        Number of rows affected

    Example:
        >>> bulk_upsert(
        ...     session,
        ...     ProcessedChatMessage,
        ...     processed_messages,
        ...     constraint_columns=['message_id'],
        ...     update_columns=['processed_message', 'tokens']
        ... )
        1000

    Performance:
        - 1000 records: ~0.3s (vs ~5s with individual inserts)
        - Handles duplicates gracefully with ON CONFLICT
    """
    if not data:
        logger.debug("bulk_upsert: No data to process")
        return 0

    try:
        # Create INSERT statement
        stmt = insert(model).values(data)

        # Determine which columns to update on conflict
        if update_columns is None:
            # Update all columns except constraint columns
            update_dict = {
                c.name: stmt.excluded[c.name]
                for c in model.__table__.columns
                if c.name not in constraint_columns
            }
        else:
            # Update only specified columns
            update_dict = {
                col: stmt.excluded[col]
                for col in update_columns
            }

        # Add ON CONFLICT clause
        stmt = stmt.on_conflict_do_update(
            index_elements=constraint_columns,
            set_=update_dict
        )

        # Execute and return row count
        result = session.execute(stmt)
        rowcount = result.rowcount

        logger.debug(
            f"bulk_upsert: Processed {rowcount} rows for {model.__tablename__}"
        )

        return rowcount

    except SQLAlchemyError as e:
        logger.error(
            f"bulk_upsert failed for {model.__tablename__}: {e}",
            exc_info=True
        )
        raise


def bulk_upsert_do_nothing(
    session: Session,
    model: Type,
    data: List[Dict[str, Any]],
    constraint_columns: List[str]
) -> int:
    """
    Bulk INSERT with ON CONFLICT DO NOTHING.

    Efficiently inserts records while ignoring duplicates.
    Useful for idempotent operations where duplicates should be silently skipped.

    Args:
        session: SQLAlchemy session
        model: ORM model class
        data: List of dictionaries containing data to insert
        constraint_columns: Columns to check for conflicts

    Returns:
        Number of rows inserted (excludes skipped duplicates)

    Example:
        >>> bulk_upsert_do_nothing(
        ...     session,
        ...     ChatMessage,
        ...     messages,
        ...     constraint_columns=['message_id']
        ... )
        500  # 500 new records inserted, duplicates ignored
    """
    if not data:
        return 0

    try:
        stmt = insert(model).values(data)
        stmt = stmt.on_conflict_do_nothing(index_elements=constraint_columns)

        result = session.execute(stmt)
        return result.rowcount

    except SQLAlchemyError as e:
        logger.error(
            f"bulk_upsert_do_nothing failed for {model.__tablename__}: {e}",
            exc_info=True
        )
        raise


def safe_commit(session: Session, logger_instance: Optional[logging.Logger] = None) -> bool:
    """
    Safely commit a session with automatic rollback on error.

    Args:
        session: SQLAlchemy session to commit
        logger_instance: Optional logger for error reporting

    Returns:
        True if commit succeeded, raises exception otherwise

    Raises:
        SQLAlchemyError: Re-raises the original exception after rollback

    Example:
        >>> session.add(new_record)
        >>> safe_commit(session, logger)
        True
    """
    log = logger_instance or logger

    try:
        session.commit()
        return True
    except SQLAlchemyError as e:
        session.rollback()
        log.error(f"Commit failed, rolled back: {e}", exc_info=True)
        raise


def safe_bulk_insert(
    session: Session,
    model: Type,
    data: List[Dict[str, Any]],
    batch_size: int = 1000
) -> int:
    """
    Safely bulk insert with batching to prevent memory issues.

    Args:
        session: SQLAlchemy session
        model: ORM model class
        data: List of dictionaries to insert
        batch_size: Number of records per batch

    Returns:
        Total number of records inserted

    Example:
        >>> safe_bulk_insert(session, ChatMessage, messages, batch_size=500)
        10000  # Inserted 10,000 records in 20 batches
    """
    if not data:
        return 0

    total_inserted = 0

    try:
        # Process in batches
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            session.bulk_insert_mappings(model, batch)
            total_inserted += len(batch)

            logger.debug(
                f"Inserted batch {i // batch_size + 1}: "
                f"{len(batch)} records into {model.__tablename__}"
            )

        session.commit()
        logger.info(
            f"Successfully inserted {total_inserted} records "
            f"into {model.__tablename__}"
        )

        return total_inserted

    except SQLAlchemyError as e:
        session.rollback()
        logger.error(
            f"Bulk insert failed for {model.__tablename__}: {e}",
            exc_info=True
        )
        raise
