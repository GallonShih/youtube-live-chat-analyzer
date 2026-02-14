import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base, ChatMessage, StreamStats,
    ReplaceWord, SpecialWord,
    PendingReplaceWord, PendingSpecialWord, CurrencyRate,
    ExclusionWordlist, WordTrendGroup,
    ETLSetting, ETLExecutionLog, PromptTemplate,
    SystemSetting, ReplacementWordlist,
    ProcessedChatMessage, ProcessedChatCheckpoint,
    LiveStream
)
from app.core.database import get_db
from app.core.security import create_access_token
from main import app

# Use environment variable for DATABASE_URL
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://hermes:hermes@localhost:5432/hermes_test"
)

# Create engine
if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def terminate_other_connections():
    """Terminate all other connections to hermes_test database.
    
    This prevents lock issues from stale connections left by interrupted tests.
    Only works with PostgreSQL.
    """
    if DATABASE_URL.startswith("sqlite"):
        return
    
    try:
        # Connect to 'postgres' database to terminate connections to hermes_test
        admin_url = DATABASE_URL.replace("/hermes_test", "/postgres")
        admin_engine = create_engine(admin_url)
        with admin_engine.connect() as conn:
            conn.execute(text("""
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = 'hermes_test' 
                AND pid <> pg_backend_pid()
            """))
            conn.commit()
        admin_engine.dispose()
    except Exception as e:
        print(f"Warning: Could not terminate other connections: {e}")


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create all tables once at session start, drop at session end.
    
    Terminates stale connections before setup to prevent lock issues.
    """
    # Kill any stale connections first
    terminate_other_connections()
    
    # Now create tables
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    yield
    
    # Cleanup
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(setup_database):
    """Provide a transactional scope around each test.
    
    Uses SAVEPOINT for nested transaction support, which allows
    proper rollback without interfering with table operations.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    # Override the app's get_db dependency
    def override_get_db():
        try:
            yield session
        finally:
            pass  # Don't close here, we'll rollback
    
    app.dependency_overrides[get_db] = override_get_db
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db):
    """Provide test client."""
    yield TestClient(app)


@pytest.fixture
def admin_token():
    """Generate a valid admin JWT token for testing."""
    return create_access_token({"role": "admin"})


@pytest.fixture
def admin_headers(admin_token):
    """Provide Authorization headers with admin token."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def admin_client(db, admin_headers):
    """Provide authenticated test client with admin token."""
    test_client = TestClient(app)
    test_client.headers.update(admin_headers)
    return test_client


@pytest.fixture
def sample_stream_stats(db):
    from datetime import datetime, timezone
    stats = [
        StreamStats(
            live_stream_id="test_stream",
            concurrent_viewers=100 + i * 10,
            collected_at=datetime(2026, 1, 12, 10, i, 0, tzinfo=timezone.utc)
        )
        for i in range(5)
    ]
    db.add_all(stats)
    db.flush()  # Use flush instead of commit for transaction rollback
    return stats


@pytest.fixture
def sample_chat_messages(db):
    from datetime import datetime, timezone
    messages = []
    for i in range(10):
        if i % 2 == 0:
            msg_type = "text_message"
            raw = None
        elif i == 9:
            # ticker_paid_message_item variant
            msg_type = "ticker_paid_message_item"
            raw = {"money": {"currency": "TWD", "amount": "100"}}
        else:
            msg_type = "paid_message"
            raw = {"money": {"currency": "TWD", "amount": "100"}}
        messages.append(ChatMessage(
            message_id=f"msg_{i}",
            live_stream_id="test_stream",
            message=f"Test message {i}",
            timestamp=1704067200000000 + i * 1000000,
            published_at=datetime(2026, 1, 12, 10, i, 0, tzinfo=timezone.utc),
            author_name=f"User{i}",
            author_id=f"user_{i}",
            message_type=msg_type,
            raw_data=raw,
        ))
    db.add_all(messages)
    db.flush()
    return messages


@pytest.fixture
def sample_replace_words(db):
    words = [
        ReplaceWord(source_word="錯字1", target_word="正字1"),
        ReplaceWord(source_word="錯字2", target_word="正字2"),
    ]
    db.add_all(words)
    db.flush()
    return words


@pytest.fixture
def sample_special_words(db):
    words = [
        SpecialWord(word="特殊詞1"),
        SpecialWord(word="特殊詞2"),
    ]
    db.add_all(words)
    db.flush()
    return words


@pytest.fixture
def sample_pending_replace_words(db):
    words = [
        PendingReplaceWord(
            source_word=f"待審核{i}",
            target_word=f"目標{i}",
            confidence_score=0.9 - i * 0.1,
            occurrence_count=10 - i,
            status="pending"
        )
        for i in range(5)
    ]
    db.add_all(words)
    db.flush()
    return words


@pytest.fixture
def sample_pending_special_words(db):
    words = [
        PendingSpecialWord(
            word=f"待審特殊{i}",
            word_type="meme",
            confidence_score=0.9 - i * 0.1,
            occurrence_count=10 - i,
            status="pending"
        )
        for i in range(5)
    ]
    db.add_all(words)
    db.flush()
    return words


@pytest.fixture
def sample_currency_rates(db):
    rates = [
        CurrencyRate(currency="USD", rate_to_twd=31.5, notes="美元"),
        CurrencyRate(currency="JPY", rate_to_twd=0.21, notes="日圓"),
        CurrencyRate(currency="TWD", rate_to_twd=1.0, notes="台幣"),
    ]
    db.add_all(rates)
    db.flush()
    return rates
