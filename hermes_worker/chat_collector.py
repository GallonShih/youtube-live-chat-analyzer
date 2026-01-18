"""
Chat message collection using chat-downloader with batch writing support.
"""

import logging
import time
import os
import signal
import atexit
import json
from chat_downloader import ChatDownloader
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from models import ChatMessage
from database import get_db_session

logger = logging.getLogger(__name__)


class ChatCollector:
    def __init__(self, live_stream_id):
        self.live_stream_id = live_stream_id
        self.chat_downloader = ChatDownloader()
        self.is_running = False
        self.last_activity_time = None  # For watchdog monitoring
        
        # Batch write configuration (configurable via environment variables)
        self._buffer = []
        self._buffer_size = int(os.getenv('CHAT_BUFFER_SIZE', 50))
        self._flush_interval = int(os.getenv('CHAT_FLUSH_INTERVAL', 5))
        self._last_flush = time.time()
        
        # Register shutdown handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)
        atexit.register(self._flush_buffer_sync)
        
        logger.info(f"ChatCollector initialized with buffer_size={self._buffer_size}, "
                    f"flush_interval={self._flush_interval}s")

    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info(f"Received signal {signum}, flushing buffer before exit...")
        self._flush_buffer_sync()
        self.stop_collection()
        # Don't call sys.exit here - let the caller handle cleanup
        raise SystemExit(0)

    def _should_flush(self):
        """Check if buffer should be flushed based on size or time interval."""
        if len(self._buffer) >= self._buffer_size:
            return True
        if time.time() - self._last_flush >= self._flush_interval:
            return True
        return False

    def _flush_buffer_sync(self):
        """Synchronously flush all buffered messages to database."""
        if not self._buffer:
            return
        
        buffer_count = len(self._buffer)
        logger.info(f"Flushing {buffer_count} buffered messages...")
        
        saved_count = 0
        duplicate_count = 0
        error_count = 0
        
        try:
            with get_db_session() as session:
                for msg_data in self._buffer:
                    try:
                        chat_message = ChatMessage.from_chat_data(msg_data, self.live_stream_id)
                        if chat_message:
                            # Use merge() for upsert behavior - skips duplicates gracefully
                            session.merge(chat_message)
                            saved_count += 1
                    except Exception as e:
                        error_count += 1
                        logger.debug(f"Error processing message {msg_data.get('message_id')}: {e}")
            
            self._buffer.clear()
            self._last_flush = time.time()
            logger.info(f"Buffer flushed: {saved_count} processed, {error_count} errors")
            
        except Exception as e:
            logger.error(f"Failed to flush buffer: {e}")
            # Backup buffer to local file in case of DB failure
            self._save_buffer_to_file()

    def _save_buffer_to_file(self):
        """Backup buffer to local file in case of DB failure."""
        if not self._buffer:
            return
            
        backup_dir = os.getenv('CHAT_BACKUP_DIR', '/tmp')
        backup_path = os.path.join(backup_dir, f"chat_buffer_backup_{int(time.time())}.json")
        
        try:
            # Convert to JSON-serializable format
            serializable_buffer = []
            for msg in self._buffer:
                try:
                    # Attempt basic serialization
                    json.dumps(msg)
                    serializable_buffer.append(msg)
                except (TypeError, ValueError):
                    # Skip non-serializable messages
                    logger.warning(f"Skipping non-serializable message: {msg.get('message_id', 'unknown')}")
            
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(serializable_buffer, f, ensure_ascii=False, default=str)
            
            logger.warning(f"Buffer backed up to {backup_path} ({len(serializable_buffer)} messages)")
            self._buffer.clear()
            
        except Exception as e:
            logger.error(f"Failed to save buffer backup: {e}")

    def start_collection(self, url):
        """Start collecting chat messages from live stream"""
        logger.info(f"Starting chat collection for stream: {self.live_stream_id}")
        logger.info(f"URL: {url}")

        self.is_running = True
        self.last_activity_time = time.time()  # Initialize heartbeat

        try:
            chat = self.chat_downloader.get_chat(url, message_groups=['all'])

            for message_data in chat:
                # Update heartbeat on each iteration (even if message save fails)
                self.last_activity_time = time.time()
                
                if not self.is_running:
                    logger.info("Chat collection stopped")
                    break

                try:
                    self._add_to_buffer(message_data)
                except Exception as e:
                    logger.error(f"Error adding message to buffer: {e}")
                    # Continue collecting even if one message fails

        except Exception as e:
            logger.error(f"Chat collection error: {e}")
            raise
        finally:
            # Always flush remaining messages when collection ends
            self._flush_buffer_sync()

    def _add_to_buffer(self, message_data):
        """Add message to buffer and flush if needed."""
        # Validate message before buffering
        chat_message = ChatMessage.from_chat_data(message_data, self.live_stream_id)
        
        if chat_message is None:
            # Skip messages that cannot be saved (e.g., ban_user, remove_chat_item)
            logger.debug(f"Skipping unsupported message type: {message_data.get('action_type')}")
            return
        
        # Add raw data to buffer (we'll create ChatMessage objects during flush)
        self._buffer.append(message_data)
        
        logger.debug(f"Buffered message: {message_data.get('message_id')} "
                     f"(buffer: {len(self._buffer)}/{self._buffer_size})")
        
        # Flush if needed
        if self._should_flush():
            self._flush_buffer_sync()

    def _save_message(self, message_data):
        """Save a single chat message to database (legacy method for backwards compatibility)."""
        # Redirect to buffer-based approach
        self._add_to_buffer(message_data)

    def stop_collection(self):
        """Stop chat collection"""
        logger.info("Stopping chat collection...")
        self.is_running = False
        # Flush any remaining buffered messages
        self._flush_buffer_sync()

    def collect_with_retry(self, url, max_retries=3, backoff_seconds=5):
        """Collect chat with retry logic"""
        for attempt in range(max_retries):
            try:
                self.start_collection(url)
                return  # Success, exit retry loop

            except SystemExit:
                # Graceful shutdown requested, don't retry
                logger.info("Graceful shutdown requested, exiting...")
                raise

            except Exception as e:
                logger.error(f"Collection attempt {attempt + 1} failed: {e}")

                if attempt < max_retries - 1:
                    wait_time = backoff_seconds * (2 ** attempt)  # Exponential backoff
                    logger.info(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"All {max_retries} collection attempts failed")
                    raise

    def get_buffer_stats(self):
        """Get current buffer statistics (for monitoring)."""
        return {
            "buffer_count": len(self._buffer),
            "buffer_size": self._buffer_size,
            "flush_interval": self._flush_interval,
            "last_flush": self._last_flush,
            "time_since_flush": time.time() - self._last_flush
        }


def extract_video_id_from_url(url):
    """Extract YouTube video ID from URL"""
    import re

    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    raise ValueError(f"Could not extract video ID from URL: {url}")


if __name__ == "__main__":
    # Test the chat collector
    import sys
    from config import Config

    # Setup logging
    logging.basicConfig(level=logging.INFO)

    # Validate config
    Config.validate()

    if len(sys.argv) < 2:
        print("Usage: python chat_collector.py <youtube_url>")
        sys.exit(1)

    url = sys.argv[1]
    video_id = extract_video_id_from_url(url)

    collector = ChatCollector(video_id)

    try:
        collector.collect_with_retry(url, max_retries=Config.RETRY_MAX_ATTEMPTS, backoff_seconds=Config.RETRY_BACKOFF_SECONDS)
    except KeyboardInterrupt:
        logger.info("Chat collection stopped by user")
    except SystemExit:
        logger.info("Graceful shutdown completed")
    except Exception as e:
        logger.error(f"Chat collection failed: {e}")
        sys.exit(1)