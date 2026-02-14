from sqlalchemy import Column, Integer, String, Text, BigInteger, DateTime, JSON, Numeric, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import datetime

Base = declarative_base()

PAID_MESSAGE_TYPES = ['paid_message', 'ticker_paid_message_item']

class ChatMessage(Base):
    __tablename__ = 'chat_messages'

    message_id = Column(String(255), primary_key=True)
    live_stream_id = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    timestamp = Column(BigInteger, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=False)
    author_name = Column(String(255), nullable=False)
    author_id = Column(String(255), nullable=False)
    author_images = Column(JSONB)
    emotes = Column(JSONB)
    message_type = Column(String(50))
    action_type = Column(String(50))
    raw_data = Column(JSONB)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    @classmethod
    def from_chat_data(cls, chat_data, live_stream_id):
        published_at = datetime.datetime.fromtimestamp(
            chat_data['timestamp'] / 1000000.0,
            tz=datetime.timezone.utc
        )

        return cls(
            message_id=chat_data['message_id'],
            live_stream_id=live_stream_id,
            message=chat_data['message'],
            timestamp=chat_data['timestamp'],
            published_at=published_at,
            author_name=chat_data['author']['name'],
            author_id=chat_data['author']['id'],
            author_images=chat_data['author'].get('images'),
            emotes=chat_data.get('emotes'),
            message_type=chat_data.get('message_type'),
            action_type=chat_data.get('action_type'),
            raw_data=chat_data
        )

    def __repr__(self):
        return f"<ChatMessage(id={self.message_id}, author={self.author_name})>"

class StreamStats(Base):
    __tablename__ = 'stream_stats'

    id = Column(Integer, primary_key=True, autoincrement=True)
    live_stream_id = Column(String(255), nullable=False)
    concurrent_viewers = Column(Integer)
    view_count = Column(BigInteger)
    like_count = Column(Integer)
    favorite_count = Column(Integer)
    comment_count = Column(Integer)
    actual_start_time = Column(DateTime(timezone=True))
    scheduled_start_time = Column(DateTime(timezone=True))
    active_live_chat_id = Column(String(255))
    etag = Column(String(255))
    raw_response = Column(JSONB)
    collected_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    @classmethod
    def from_youtube_api(cls, youtube_data, live_stream_id):
        if not youtube_data.get('items'):
            return None

        item = youtube_data['items'][0]
        live_details = item.get('liveStreamingDetails', {})
        statistics = item.get('statistics', {})

        actual_start_time = None
        scheduled_start_time = None

        if live_details.get('actualStartTime'):
            actual_start_time = datetime.datetime.fromisoformat(
                live_details['actualStartTime'].replace('Z', '+00:00')
            )

        if live_details.get('scheduledStartTime'):
            scheduled_start_time = datetime.datetime.fromisoformat(
                live_details['scheduledStartTime'].replace('Z', '+00:00')
            )

        return cls(
            live_stream_id=live_stream_id,
            concurrent_viewers=int(live_details.get('concurrentViewers', 0)) if live_details.get('concurrentViewers') else None,
            view_count=int(statistics['viewCount']) if statistics.get('viewCount') else None,
            like_count=int(statistics['likeCount']) if statistics.get('likeCount') else None,
            favorite_count=int(statistics['favoriteCount']) if statistics.get('favoriteCount') else None,
            comment_count=int(statistics['commentCount']) if statistics.get('commentCount') else None,
            actual_start_time=actual_start_time,
            scheduled_start_time=scheduled_start_time,
            active_live_chat_id=live_details.get('activeLiveChatId'),
            etag=item.get('etag'),
            raw_response=youtube_data
        )

    def __repr__(self):
        return f"<StreamStats(id={self.id}, stream={self.live_stream_id}, viewers={self.concurrent_viewers}, views={self.view_count})>"

class ReplaceWord(Base):
    __tablename__ = 'replace_words'

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_word = Column(String(255), nullable=False, unique=True)
    target_word = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<ReplaceWord(id={self.id}, {self.source_word} -> {self.target_word})>"

class SpecialWord(Base):
    __tablename__ = 'special_words'

    id = Column(Integer, primary_key=True, autoincrement=True)
    word = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<SpecialWord(id={self.id}, word={self.word})>"

class PendingReplaceWord(Base):
    __tablename__ = 'pending_replace_words'
    __table_args__ = (
        UniqueConstraint('source_word', 'target_word', name='uq_pending_replace_words_source_target'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_word = Column(String(255), nullable=False)
    target_word = Column(String(255), nullable=False)
    confidence_score = Column(Numeric(3, 2))
    occurrence_count = Column(Integer, default=1)
    example_messages = Column(ARRAY(Text))  # TEXT[] in PostgreSQL
    discovered_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    status = Column(String(20), default='pending')
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(String(100))
    notes = Column(Text)

    def __repr__(self):
        return f"<PendingReplaceWord(id={self.id}, {self.source_word} -> {self.target_word}, status={self.status})>"

class PendingSpecialWord(Base):
    __tablename__ = 'pending_special_words'

    id = Column(Integer, primary_key=True, autoincrement=True)
    word = Column(String(255), nullable=False, unique=True)
    confidence_score = Column(Numeric(3, 2))
    occurrence_count = Column(Integer, default=1)
    example_messages = Column(ARRAY(Text))  # TEXT[] in PostgreSQL
    word_type = Column(String(50))
    discovered_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    status = Column(String(20), default='pending')
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(String(100))
    notes = Column(Text)

    def __repr__(self):
        return f"<PendingSpecialWord(id={self.id}, word={self.word}, type={self.word_type}, status={self.status})>"

class CurrencyRate(Base):
    __tablename__ = 'currency_rates'

    currency = Column(String(10), primary_key=True)
    rate_to_twd = Column(JSON)
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())
    notes = Column(String(255))

    def __repr__(self):
        return f"<CurrencyRate(currency={self.currency}, rate={self.rate_to_twd})>"

class SystemSetting(Base):
    __tablename__ = 'system_settings'

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    description = Column(String(500))
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<SystemSetting(key={self.key}, value={self.value})>"


class ExclusionWordlist(Base):
    __tablename__ = 'exclusion_wordlists'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    words = Column(JSON, nullable=False)  # Array of strings
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<ExclusionWordlist(id={self.id}, name={self.name}, words_count={len(self.words) if self.words else 0})>"


class ReplacementWordlist(Base):
    __tablename__ = 'replacement_wordlists'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    replacements = Column(JSONB, nullable=False)  # Array of {source, target} objects
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<ReplacementWordlist(id={self.id}, name={self.name}, replacements_count={len(self.replacements) if self.replacements else 0})>"


class WordTrendGroup(Base):
    __tablename__ = 'word_trend_groups'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    words = Column(JSON, nullable=False)  # Array of strings: ["holo", "cover", "星街"]
    color = Column(String(20), default='#5470C6')
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<WordTrendGroup(id={self.id}, name={self.name}, words_count={len(self.words) if self.words else 0})>"


class ETLSetting(Base):
    __tablename__ = 'etl_settings'

    key = Column(String(100), primary_key=True)
    value = Column(Text)
    value_type = Column(String(20), default='string')  # string, text, boolean, integer, float, datetime
    description = Column(Text)
    is_sensitive = Column(Boolean, default=False)
    category = Column(String(50))  # api, etl, import, ai
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())
    updated_by = Column(String(100), default='system')

    def __repr__(self):
        return f"<ETLSetting(key={self.key}, category={self.category})>"


class ETLExecutionLog(Base):
    __tablename__ = 'etl_execution_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(100), nullable=False)
    job_name = Column(String(255), nullable=False)
    status = Column(String(20), default='running')  # running, completed, failed
    trigger_type = Column(String(20), default='scheduled')  # scheduled, manual
    started_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    completed_at = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer)
    records_processed = Column(Integer, default=0)
    error_message = Column(Text)
    log_metadata = Column('metadata', JSONB)  # Map to 'metadata' column in DB

    def __repr__(self):
        return f"<ETLExecutionLog(id={self.id}, job_id={self.job_id}, status={self.status}, trigger={self.trigger_type})>"


class PromptTemplate(Base):
    __tablename__ = 'prompt_templates'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    template = Column(Text, nullable=False)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())
    created_by = Column(String(100), default='admin')

    def __repr__(self):
        return f"<PromptTemplate(id={self.id}, name={self.name}, is_active={self.is_active})>"


class ProcessedChatMessage(Base):
    """處理後的聊天留言表，包含斷詞結果和 emoji 解析"""
    __tablename__ = 'processed_chat_messages'

    message_id = Column(String(255), primary_key=True)
    live_stream_id = Column(String(255), nullable=False)
    original_message = Column(Text, nullable=False)
    processed_message = Column(Text, nullable=False)
    tokens = Column(ARRAY(Text))  # TEXT[] in PostgreSQL
    unicode_emojis = Column(ARRAY(Text))  # TEXT[] in PostgreSQL
    youtube_emotes = Column(JSONB)  # JSONB in PostgreSQL
    author_name = Column(String(255), nullable=False)
    author_id = Column(String(255), nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=False)
    processed_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    def __repr__(self):
        return f"<ProcessedChatMessage(id={self.message_id}, author={self.author_name})>"


class ProcessedChatCheckpoint(Base):
    """ETL 處理檢查點，記錄最後處理的位置"""
    __tablename__ = 'processed_chat_checkpoint'

    id = Column(Integer, primary_key=True, autoincrement=True)
    last_processed_message_id = Column(String(255))
    last_processed_timestamp = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp())


class MeaninglessWord(Base):
    """無意義詞彙表，用於過濾無意義的詞彙（停用詞）"""
    __tablename__ = 'meaningless_words'

    id = Column(Integer, primary_key=True, autoincrement=True)
    word = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<MeaninglessWord(id={self.id}, word={self.word})>"


class WordAnalysisLog(Base):
    """詞彙分析執行記錄，記錄 AI 詞彙發現任務的執行狀態"""
    __tablename__ = 'word_analysis_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(100), nullable=False)
    etl_log_id = Column(Integer)  # 關聯到 etl_execution_log
    analysis_start_time = Column(DateTime(timezone=True), nullable=False)
    analysis_end_time = Column(DateTime(timezone=True))
    messages_analyzed = Column(Integer, default=0)
    new_replace_words_found = Column(Integer, default=0)
    new_special_words_found = Column(Integer, default=0)
    api_calls_made = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    status = Column(String(20), default='running')  # running, completed, failed
    error_message = Column(Text)
    execution_time_seconds = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    def __repr__(self):
        return f"<WordAnalysisLog(id={self.id}, run_id={self.run_id}, status={self.status})>"


class LiveStream(Base):
    """直播 metadata，當 admin 設定新 YouTube URL 時自動從 API 取得"""
    __tablename__ = 'live_streams'

    video_id = Column(String(20), primary_key=True)
    title = Column(Text)
    channel_id = Column(String(255))
    channel_title = Column(String(255))
    description = Column(Text)
    thumbnail_url = Column(Text)
    tags = Column(JSONB)
    category_id = Column(String(10))
    published_at = Column(DateTime(timezone=True))
    scheduled_start_time = Column(DateTime(timezone=True))
    actual_start_time = Column(DateTime(timezone=True))
    live_broadcast_content = Column(String(20))
    default_language = Column(String(10))
    topic_categories = Column(JSONB)
    fetched_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp(), onupdate=func.current_timestamp())

    def __repr__(self):
        return f"<LiveStream(video_id={self.video_id}, title={self.title})>"


class WordAnalysisCheckpoint(Base):
    """詞彙分析檢查點，記錄 AI 詞彙發現已分析到的位置"""
    __tablename__ = 'word_analysis_checkpoint'

    id = Column(Integer, primary_key=True, autoincrement=True)
    last_analyzed_message_id = Column(String(255))
    last_analyzed_timestamp = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    def __repr__(self):
        return f"<WordAnalysisCheckpoint(id={self.id}, last_analyzed_timestamp={self.last_analyzed_timestamp})>"