"""
Main application for Collector Worker
Coordinates chat collection and stats polling
"""

import logging
import threading
import signal
import sys
import time
from sqlalchemy import text as sa_text
from config import Config
from database import get_db_manager, get_db_session
from chat_collector import ChatCollector, extract_video_id_from_url
from youtube_api import StatsCollector

# Setup logging
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


class CollectorWorker:
    def __init__(self, youtube_url=None):
        # Use URL from DB first, then config, then parameter
        self.youtube_url = youtube_url or Config.get_youtube_url_from_db()
        if not self.youtube_url:
            raise ValueError("YouTube URL must be provided (parameter, database, or YOUTUBE_URL env)")

        self.video_id = extract_video_id_from_url(self.youtube_url)

        # Initialize components (register_signals=True since we're in main thread)
        self.chat_collector = ChatCollector(self.video_id, register_signals=True)
        self.stats_collector = StatsCollector()

        # Threading
        self.chat_thread = None
        self.stats_thread = None
        self.url_monitor_thread = None
        self.is_running = False
        self._restart_lock = threading.Lock()
        self._url_changed = threading.Event()
        self._stream_ended = threading.Event()
        self._stream_upcoming = threading.Event()

    def start(self):
        """Start the Collector worker"""
        logger.info("=== Starting Collector Worker ===")
        Config.print_config()

        # Validate configuration
        try:
            Config.validate()
        except ValueError as e:
            logger.error(f"Configuration error: {e}")
            sys.exit(1)

        # Test database connection
        db_manager = get_db_manager()
        if not db_manager.test_connection():
            logger.error("Database connection failed")
            sys.exit(1)

        # Set running flag
        self.is_running = True

        # Start chat collection in separate thread
        self.chat_thread = threading.Thread(
            target=self._run_chat_collection,
            name="ChatCollector"
        )
        self.chat_thread.daemon = True
        self.chat_thread.start()

        # Start stats polling in separate thread
        self.stats_thread = threading.Thread(
            target=self._run_stats_polling,
            name="StatsCollector"
        )
        self.stats_thread.daemon = True
        self.stats_thread.start()

        # Start URL monitoring thread
        self.url_monitor_thread = threading.Thread(
            target=self._monitor_url_changes,
            name="URLMonitor"
        )
        self.url_monitor_thread.daemon = True
        self.url_monitor_thread.start()

        # Start chat watchdog thread
        self.chat_watchdog_thread = threading.Thread(
            target=self._chat_watchdog,
            name="ChatWatchdog"
        )
        self.chat_watchdog_thread.daemon = True
        self.chat_watchdog_thread.start()

        logger.info(f"Worker started for video: {self.video_id}")
        logger.info("Press Ctrl+C to stop...")

        # Keep main thread alive
        try:
            while self.is_running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        """Stop the Collector worker"""
        logger.info("=== Stopping Collector Worker ===")

        self.is_running = False

        # Wake up any threads waiting on events
        self._url_changed.set()
        self._stream_ended.set()

        # Stop collectors
        if self.chat_collector:
            self.chat_collector.stop_collection()

        if self.stats_collector:
            self.stats_collector.stop_polling()

        # Wait for threads to finish
        if self.chat_thread and self.chat_thread.is_alive():
            logger.info("Waiting for chat collection to stop...")
            self.chat_thread.join(timeout=10)

        if self.stats_thread and self.stats_thread.is_alive():
            logger.info("Waiting for stats polling to stop...")
            self.stats_thread.join(timeout=10)

        # Close database connections
        db_manager = get_db_manager()
        db_manager.close()

        logger.info("Worker stopped successfully")

    def _on_stream_ended(self, video_id):
        """Callback invoked when stats polling detects stream has ended"""
        logger.info(f"Stream ended for {video_id}, updating database and notifying threads")
        self._update_live_broadcast_content(video_id, 'none')
        self._stream_upcoming.clear()
        self._stream_ended.set()

    def _on_status_change(self, video_id, status):
        """Callback invoked when liveBroadcastContent changes between polls"""
        logger.info(f"Broadcast status changed for {video_id}: {status}")
        self._update_live_broadcast_content(video_id, status)
        if status == 'upcoming':
            self._stream_upcoming.set()
        elif status == 'live':
            self._stream_upcoming.clear()

    def _update_live_broadcast_content(self, video_id, status):
        """Update live_broadcast_content in live_streams table"""
        try:
            with get_db_session() as session:
                session.execute(
                    sa_text("UPDATE live_streams SET live_broadcast_content = :status WHERE video_id = :video_id"),
                    {"status": status, "video_id": video_id}
                )
            logger.info(f"Updated live_broadcast_content to '{status}' for video {video_id}")
        except Exception as e:
            logger.error(f"Failed to update live_broadcast_content for {video_id}: {e}")

    def _run_chat_collection(self):
        """Run chat collection with retry logic"""
        while self.is_running:
            self._url_changed.clear()

            # Wait if stream is upcoming (not yet live)
            if self._stream_upcoming.is_set():
                logger.info("Stream is upcoming, waiting for it to go live...")
                while self._stream_upcoming.is_set() and self.is_running and not self._url_changed.is_set():
                    time.sleep(5)
                if not self.is_running or self._url_changed.is_set():
                    continue
                logger.info("Stream is now live, starting chat collection")

            try:
                logger.info("Starting chat collection...")
                self.chat_collector.collect_with_retry(
                    self.youtube_url,
                    max_retries=Config.RETRY_MAX_ATTEMPTS,
                    backoff_seconds=Config.RETRY_BACKOFF_SECONDS
                )

                # If we get here, collection ended normally
                if self.is_running:
                    # Check if stream ended — do grace period then sleep
                    if self._stream_ended.is_set():
                        self._chat_stream_ended_cleanup()
                        continue

                    logger.info("Chat collection ended, restarting in 30 seconds...")
                    # Use event wait so URL changes wake us up immediately
                    if self._url_changed.wait(timeout=30):
                        logger.info("URL change detected, restarting immediately")

            except Exception as e:
                logger.error(f"Chat collection failed: {e}")
                if self.is_running:
                    # Check if stream ended — do grace period then sleep
                    if self._stream_ended.is_set():
                        self._chat_stream_ended_cleanup()
                        continue

                    # Check if stream is upcoming — go back to wait loop
                    if self._stream_upcoming.is_set():
                        continue

                    logger.info("Restarting chat collection in 60 seconds...")
                    if self._url_changed.wait(timeout=60):
                        logger.info("URL change detected, restarting immediately")

    def _chat_stream_ended_cleanup(self):
        """Handle chat collection cleanup after stream ends with a grace period"""
        logger.info("Stream ended, collecting for 60 more seconds...")
        # Wait 60s but wake immediately if URL changes
        if self._url_changed.wait(timeout=60):
            logger.info("URL changed during grace period, switching immediately")
            return
        logger.info("Grace period over, stopping chat collector")
        self.chat_collector.stop_collection()
        logger.info("Chat collection: stream ended, waiting for URL change...")
        self._url_changed.wait()

    def _run_stats_polling(self):
        """Run stats polling with retry logic"""
        while self.is_running:
            self._url_changed.clear()
            try:
                logger.info("Starting stats polling...")
                self.stats_collector.start_polling(
                    self.video_id,
                    interval_seconds=Config.POLL_INTERVAL,
                    on_stream_ended=self._on_stream_ended,
                    on_status_change=self._on_status_change
                )

                # If stream ended, wait for URL change before resuming
                if self._stream_ended.is_set() and self.is_running:
                    logger.info("Stats polling: stream ended, waiting for URL change...")
                    self._url_changed.wait()
                    continue

            except Exception as e:
                logger.error(f"Stats polling failed: {e}")
                if self.is_running:
                    logger.info("Restarting stats polling in 60 seconds...")
                    if self._url_changed.wait(timeout=60):
                        logger.info("URL change detected, restarting immediately")

    def _monitor_url_changes(self):
        """Monitor for YouTube URL changes in database"""
        logger.info(f"URL monitor started (checking every {Config.URL_CHECK_INTERVAL}s)")
        
        while self.is_running:
            try:
                time.sleep(Config.URL_CHECK_INTERVAL)
                
                if not self.is_running:
                    break
                
                new_url = Config.get_youtube_url_from_db()
                
                if new_url and new_url != self.youtube_url:
                    logger.info(f"URL change detected!")
                    logger.info(f"  Old: {self.youtube_url}")
                    logger.info(f"  New: {new_url}")
                    self._handle_url_change(new_url)
                    
            except Exception as e:
                logger.error(f"Error checking URL: {e}")

    def _chat_watchdog(self):
        """Monitor chat collector health and restart if hung"""
        logger.info(f"Chat watchdog started (timeout: {Config.CHAT_WATCHDOG_TIMEOUT}s, check interval: {Config.CHAT_WATCHDOG_CHECK_INTERVAL}s)")
        
        while self.is_running:
            try:
                time.sleep(Config.CHAT_WATCHDOG_CHECK_INTERVAL)
                
                if not self.is_running:
                    break
                
                # Skip monitoring if stream ended or upcoming (chat is intentionally paused)
                if self._stream_ended.is_set() or self._stream_upcoming.is_set():
                    continue

                # Check if chat collector has activity
                if self.chat_collector and self.chat_collector.last_activity_time:
                    idle_time = time.time() - self.chat_collector.last_activity_time
                    
                    if idle_time > Config.CHAT_WATCHDOG_TIMEOUT:
                        logger.warning(f"Chat collector appears hung (no activity for {idle_time:.0f}s)")
                        logger.info("Restarting chat collector...")
                        
                        # Stop current collector
                        self.chat_collector.stop_collection()
                        
                        # Wait a moment for cleanup
                        time.sleep(2)
                        
                        # Create new collector (no signal registration from non-main thread)
                        with self._restart_lock:
                            self.chat_collector = ChatCollector(self.video_id, register_signals=False)
                        
                        logger.info("Chat collector restarted by watchdog")
                        
            except Exception as e:
                logger.error(f"Watchdog error: {e}")

    def _handle_url_change(self, new_url):
        """Handle YouTube URL change by restarting collectors"""
        with self._restart_lock:
            self._stream_ended.clear()
            self._stream_upcoming.clear()
            logger.info("Restarting collectors with new URL...")

            # Stop current collectors (force-closes connections)
            if self.chat_collector:
                self.chat_collector.stop_collection()
            if self.stats_collector:
                self.stats_collector.stop_polling()

            # Update URL and video ID
            self.youtube_url = new_url
            self.video_id = extract_video_id_from_url(new_url)

            # Create new collectors (no signal registration from non-main thread)
            self.chat_collector = ChatCollector(self.video_id, register_signals=False)
            self.stats_collector = StatsCollector()

            # Signal threads to wake up and use new collectors immediately
            self._url_changed.set()

            logger.info(f"Collectors restarted for new video: {self.video_id}")


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    sys.exit(0)


def main():
    """Main entry point"""
    youtube_url = None

    # Check if URL provided as command line argument
    if len(sys.argv) >= 2:
        youtube_url = sys.argv[1]

    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Create and start worker (will use URL from DB/env if not provided)
    worker = CollectorWorker(youtube_url)

    try:
        worker.start()
    except Exception as e:
        logger.error(f"Worker failed: {e}")
        sys.exit(1)
    finally:
        worker.stop()


if __name__ == "__main__":
    main()