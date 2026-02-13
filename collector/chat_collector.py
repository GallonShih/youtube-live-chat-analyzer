"""
Chat message collection using chat-downloader with batch writing support.
"""

import logging
import time
import os
import signal
import atexit
import json
import glob
import threading
from chat_downloader import ChatDownloader
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from models import ChatMessage
from database import get_db_session

logger = logging.getLogger(__name__)


class ChatCollector:
    def __init__(self, live_stream_id, register_signals=False):
        """
        Initialize ChatCollector.
        
        Args:
            live_stream_id: The YouTube video ID to collect chat from
            register_signals: If True, register signal handlers for graceful shutdown.
                             Only set to True when running in main thread.
                             Default is False to allow creation from non-main threads (e.g., watchdog).
        """
        self.live_stream_id = live_stream_id
        self.chat_downloader = ChatDownloader()
        self.is_running = False
        self.last_activity_time = None  # For watchdog monitoring
        
        # Batch write configuration (configurable via environment variables)
        self._buffer = []
        self._buffer_lock = threading.Lock()
        self._buffer_size = int(os.getenv('CHAT_BUFFER_SIZE', 10))
        self._flush_interval = int(os.getenv('CHAT_FLUSH_INTERVAL', 5))
        self._last_flush = time.time()
        
        # Register shutdown handlers only from main thread
        if register_signals:
            self.register_signal_handlers()
        
        # Always register atexit handler (works from any thread)
        atexit.register(self._flush_buffer_sync)

        logger.info(f"ChatCollector initialized with buffer_size={self._buffer_size}, "
                    f"flush_interval={self._flush_interval}s, signals={'registered' if register_signals else 'skipped'}")
    
    def register_signal_handlers(self):
        """Register signal handlers for graceful shutdown. Must be called from main thread."""
        try:
            signal.signal(signal.SIGTERM, self._handle_shutdown)
            signal.signal(signal.SIGINT, self._handle_shutdown)
            logger.info("Signal handlers registered for graceful shutdown")
        except ValueError as e:
            # This happens when called from non-main thread
            logger.warning(f"Could not register signal handlers (not main thread): {e}")

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
        # Atomically take the buffer contents under lock
        with self._buffer_lock:
            if not self._buffer:
                return
            flush_batch = list(self._buffer)
            self._buffer.clear()

        buffer_count = len(flush_batch)
        logger.info(f"Flushing {buffer_count} buffered messages...")

        saved_count = 0
        error_count = 0

        failed_messages = []

        try:
            with get_db_session() as session:
                for msg_data in flush_batch:
                    try:
                        # Use savepoint so one bad message doesn't rollback the whole batch
                        nested = session.begin_nested()
                        chat_message = ChatMessage.from_chat_data(msg_data, self.live_stream_id)
                        if chat_message:
                            session.merge(chat_message)
                            nested.commit()
                            saved_count += 1
                        else:
                            nested.rollback()
                    except Exception as e:
                        nested.rollback()
                        error_count += 1
                        failed_messages.append(msg_data)
                        logger.debug(f"Error processing message {msg_data.get('message_id')}: {e}")

            self._last_flush = time.time()

            from datetime import datetime
            if self.last_activity_time:
                last_activity_str = datetime.fromtimestamp(self.last_activity_time).strftime('%H:%M:%S')
                logger.info(f"Buffer flushed: {saved_count} saved, {error_count} errors (last_activity={last_activity_str})")
            else:
                logger.info(f"Buffer flushed: {saved_count} saved, {error_count} errors")

            # Backup only the failed messages
            if failed_messages:
                self._save_buffer_to_file(failed_messages)

        except Exception as e:
            logger.error(f"Failed to flush buffer: {e}")
            # DB connection-level failure — put messages back in buffer for retry
            with self._buffer_lock:
                self._buffer = flush_batch + self._buffer
                # If buffer is getting too large, dump the oldest to disk to avoid OOM
                if len(self._buffer) > self._buffer_size * 10:
                    overflow = self._buffer[:len(self._buffer) - self._buffer_size * 10]
                    self._buffer = self._buffer[len(self._buffer) - self._buffer_size * 10:]
                    self._save_buffer_to_file(overflow)

    def _save_buffer_to_file(self, messages):
        """Backup messages to local file in case of DB failure."""
        if not messages:
            return

        backup_root = os.getenv('CHAT_BACKUP_DIR', '/data/backup')
        backup_dir = os.path.join(backup_root, self.live_stream_id)
        os.makedirs(backup_dir, exist_ok=True)
        backup_path = os.path.join(backup_dir, f"chat_buffer_backup_{int(time.time())}_{threading.get_ident()}.json")

        try:
            # Convert to JSON-serializable format
            serializable_buffer = []
            for msg in messages:
                try:
                    json.dumps(msg)
                    serializable_buffer.append(msg)
                except (TypeError, ValueError):
                    logger.warning(f"Skipping non-serializable message: {msg.get('message_id', 'unknown')}")

            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(serializable_buffer, f, ensure_ascii=False, default=str)

            logger.warning(f"Buffer backed up to {backup_path} ({len(serializable_buffer)} messages)")

        except Exception as e:
            logger.error(f"Failed to save buffer backup: {e}")

    def _save_filtered_message(self, message_data):
        """Append a filtered message (no timestamp/author) to a JSONL file for later analysis."""
        try:
            backup_root = os.getenv('CHAT_BACKUP_DIR', '/data/backup')
            filtered_dir = os.path.join(backup_root, self.live_stream_id)
            os.makedirs(filtered_dir, exist_ok=True)
            from datetime import date
            filepath = os.path.join(filtered_dir, f"filtered_messages_{date.today().isoformat()}.jsonl")

            with open(filepath, 'a', encoding='utf-8') as f:
                f.write(json.dumps(message_data, ensure_ascii=False, default=str) + '\n')
        except Exception as e:
            logger.debug(f"Failed to save filtered message: {e}")

    def _import_backup_files(self):
        """Import leftover backup JSON files from previous runs into the database.

        Scans /data/backup/<live_stream_id>/ subdirectories. Each subdirectory
        name is the live_stream_id used when writing those messages.
        """
        backup_root = os.getenv('CHAT_BACKUP_DIR', '/data/backup')
        if not os.path.isdir(backup_root):
            return

        # Collect all (stream_id, filepath) pairs across all subdirectories
        import_tasks = []
        for stream_id in os.listdir(backup_root):
            stream_dir = os.path.join(backup_root, stream_id)
            if not os.path.isdir(stream_dir):
                continue
            for filepath in sorted(glob.glob(os.path.join(stream_dir, "chat_buffer_backup_*.json"))):
                import_tasks.append((stream_id, filepath))

        if not import_tasks:
            return

        logger.info(f"Found {len(import_tasks)} backup file(s) to import")

        for stream_id, filepath in import_tasks:
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    messages = json.load(f)

                if not messages:
                    os.remove(filepath)
                    continue

                saved_count = 0
                error_count = 0
                failed_messages = []

                with get_db_session() as session:
                    for msg_data in messages:
                        try:
                            nested = session.begin_nested()
                            chat_message = ChatMessage.from_chat_data(msg_data, stream_id)
                            if chat_message:
                                session.merge(chat_message)
                                nested.commit()
                                saved_count += 1
                            else:
                                nested.rollback()
                        except Exception as e:
                            nested.rollback()
                            error_count += 1
                            failed_messages.append(msg_data)
                            logger.debug(f"Error importing message: {e}")

                if failed_messages:
                    # Rewrite file with only the failed messages for retry
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(failed_messages, f, ensure_ascii=False, default=str)
                    logger.warning(f"Kept {len(failed_messages)} failed message(s) in {os.path.basename(filepath)}")
                else:
                    os.remove(filepath)

                logger.info(f"Imported backup {stream_id}/{os.path.basename(filepath)}: {saved_count} saved, {error_count} errors")

            except Exception as e:
                logger.error(f"Failed to import backup {filepath}: {e}")

    def start_collection(self, url):
        """Start collecting chat messages from live stream"""
        logger.info(f"Starting chat collection for stream: {self.live_stream_id}")
        logger.info(f"URL: {url}")

        self.is_running = True
        self.last_activity_time = time.time()  # Initialize heartbeat

        # Create fresh downloader (previous one may have been closed by stop_collection)
        self.chat_downloader = ChatDownloader()

        try:
            chat = self.chat_downloader.get_chat(url, message_groups=['all'])

            for message_data in chat:
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
            logger.debug(f"Skipping unsupported message type: {message_data.get('action_type')}")
            self._save_filtered_message(message_data)
            return

        should_flush = False
        with self._buffer_lock:
            self._buffer.append(message_data)
            # Update heartbeat only when actual chat messages are buffered
            self.last_activity_time = time.time()
            logger.debug(f"Buffered message: {message_data.get('message_id')} "
                         f"(buffer: {len(self._buffer)}/{self._buffer_size})")
            should_flush = self._should_flush()

        # Flush outside lock to avoid holding lock during DB I/O
        if should_flush:
            self._flush_buffer_sync()

    def _save_message(self, message_data):
        """Save a single chat message to database (legacy method for backwards compatibility)."""
        # Redirect to buffer-based approach
        self._add_to_buffer(message_data)

    def stop_collection(self):
        """Stop chat collection"""
        logger.info("Stopping chat collection...")
        self.is_running = False
        # Force close the chat downloader to interrupt blocking iterator
        try:
            self.chat_downloader.close()
        except Exception as e:
            logger.warning(f"Error closing chat downloader: {e}")
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

                # If stop was called (e.g. URL change), don't retry
                if not self.is_running:
                    logger.info("Collection stopped, skipping retry")
                    return

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

    collector = ChatCollector(video_id, register_signals=True)

    try:
        collector.collect_with_retry(url, max_retries=Config.RETRY_MAX_ATTEMPTS, backoff_seconds=Config.RETRY_BACKOFF_SECONDS)
    except KeyboardInterrupt:
        logger.info("Chat collection stopped by user")
    except SystemExit:
        logger.info("Graceful shutdown completed")
    except Exception as e:
        logger.error(f"Chat collection failed: {e}")
        sys.exit(1)