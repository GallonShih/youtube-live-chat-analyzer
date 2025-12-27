"""
SQLAlchemy ORM models for Hermes
"""

from sqlalchemy import Column, Integer, String, Text, BigInteger, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import datetime

Base = declarative_base()


class ChatMessage(Base):
    __tablename__ = 'chat_messages'

    message_id = Column(String(255), primary_key=True)
    live_stream_id = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    timestamp = Column(BigInteger, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=False)
    author_name = Column(String(255), nullable=False)
    author_id = Column(String(255), nullable=False)
    author_images = Column(JSON)
    emotes = Column(JSON)
    message_type = Column(String(50))
    action_type = Column(String(50))
    raw_data = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    @classmethod
    def from_chat_data(cls, chat_data, live_stream_id):
        """Create ChatMessage instance from chat-downloader data"""
        # Convert microsecond timestamp to timezone-aware datetime (UTC)
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
    actual_start_time = Column(DateTime(timezone=True))
    scheduled_start_time = Column(DateTime(timezone=True))
    active_live_chat_id = Column(String(255))
    etag = Column(String(255))
    raw_response = Column(JSON)
    collected_at = Column(DateTime(timezone=True), default=func.current_timestamp())

    @classmethod
    def from_youtube_api(cls, youtube_data, live_stream_id):
        """Create StreamStats instance from YouTube Data API response"""
        if not youtube_data.get('items'):
            return None

        item = youtube_data['items'][0]
        live_details = item.get('liveStreamingDetails', {})

        # Parse datetime strings
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
            actual_start_time=actual_start_time,
            scheduled_start_time=scheduled_start_time,
            active_live_chat_id=live_details.get('activeLiveChatId'),
            etag=item.get('etag'),
            raw_response=youtube_data
        )

    def __repr__(self):
        return f"<StreamStats(id={self.id}, stream={self.live_stream_id}, viewers={self.concurrent_viewers})>"