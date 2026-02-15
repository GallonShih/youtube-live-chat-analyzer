import pytest
import datetime
import json
from sqlalchemy import create_engine, text
from app.etl.processors.chat_processor import ChatProcessor

import os

# Use the environment variable if available, otherwise fallback (common for local/CI)
TEST_DB_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql://hermes:hermes@localhost:5432/hermes_test"
)

@pytest.fixture
def setup_integration_data(setup_database):
    """Setup data for chat processor test without holding transaction locks.

    Depends on setup_database to ensure tables exist before truncating.
    """
    engine = create_engine(TEST_DB_URL)
    
    # Clean up first
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE chat_messages CASCADE;"))
        conn.execute(text("TRUNCATE TABLE replace_words CASCADE;"))
        conn.execute(text("TRUNCATE TABLE special_words CASCADE;"))
        conn.execute(text("TRUNCATE TABLE processed_chat_messages CASCADE;")) 
        conn.execute(text("TRUNCATE TABLE processed_chat_checkpoint CASCADE;"))
        
        # 1. Insert Replace Words
        conn.execute(text("INSERT INTO replace_words (source_word, target_word) VALUES ('kusa', '草')"))
        
        # 2. Insert Special Words
        conn.execute(text("INSERT INTO special_words (word) VALUES ('hololive')"))
        
        # 3. Insert Chat Messages
        now = datetime.datetime.now(datetime.timezone.utc)
        msg_time = now - datetime.timedelta(hours=1)
        timestamp = int(msg_time.timestamp() * 1000000)
        
        conn.execute(
            text("""
                INSERT INTO chat_messages 
                (message_id, live_stream_id, message, timestamp, published_at, author_name, author_id, message_type)
                VALUES (:mid, :sid, :msg, :ts, :pub_at, :auth_n, :auth_id, :type)
            """),
            {
                "mid": "msg_test_1",
                "sid": "stream_1",
                "msg": "This is kusa hololive",
                "ts": timestamp,
                "pub_at": msg_time,
                "auth_n": "User1",
                "auth_id": "user_1",
                "type": "text_message"
            }
        )
        conn.commit()
    
    yield
    
    # Cleanup
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE chat_messages CASCADE;"))
        conn.execute(text("TRUNCATE TABLE processed_chat_messages CASCADE;")) 
        conn.commit()

def test_chat_processor_case_insensitive(setup_integration_data):
    """Verify ChatProcessor produces lowercase tokens regardless of input case."""
    engine = create_engine(TEST_DB_URL)

    # Insert a message with mixed case
    now = datetime.datetime.now(datetime.timezone.utc)
    msg_time = now - datetime.timedelta(minutes=30)
    timestamp = int(msg_time.timestamp() * 1000000)

    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO chat_messages
                (message_id, live_stream_id, message, timestamp, published_at, author_name, author_id, message_type)
                VALUES (:mid, :sid, :msg, :ts, :pub_at, :auth_n, :auth_id, :type)
            """),
            {
                "mid": "msg_case_test",
                "sid": "stream_1",
                "msg": "KUSA Hololive TEST",
                "ts": timestamp,
                "pub_at": msg_time,
                "auth_n": "User2",
                "auth_id": "user_2",
                "type": "text_message",
            },
        )
        conn.commit()

    processor = ChatProcessor(database_url=TEST_DB_URL)
    result = processor.run()
    assert result["status"] == "completed"

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT tokens FROM processed_chat_messages WHERE message_id = 'msg_case_test'")
        ).fetchone()
        assert row is not None
        tokens = row[0]
        for t in tokens:
            assert t == t.lower(), f"Token '{t}' is not lowercase"


def test_chat_processor_integration(setup_integration_data):
    """Integration test for ChatProcessor."""
    
    # Initialize processor with test DB URL
    processor = ChatProcessor(database_url=TEST_DB_URL)
    
    # Run processor
    # This will create its own engine connection
    result = processor.run()
    
    assert result["status"] == "completed"
    assert result["total_processed"] == 1
    
    # Verify result in DB
    engine = create_engine(TEST_DB_URL)
    with engine.connect() as conn:
        # Check processed table
        result = conn.execute(text("SELECT processed_message, tokens FROM processed_chat_messages WHERE message_id = 'msg_test_1'"))
        row = result.fetchone()
        
        assert row is not None
        processed_message = row[0]
        # Validating tokens might be tricky as direct SQL return format for ARRAY might vary
        # But let's try basic assertion
        # processed_message should have '草' instead of 'kusa'
        assert "草" in processed_message
        
        # Check checkpoint
        result = conn.execute(text("SELECT last_processed_message_id FROM processed_chat_checkpoint"))
        row = result.fetchone()
        assert row is not None
        assert row[0] == "msg_test_1"
