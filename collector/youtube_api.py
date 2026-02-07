"""
YouTube Data API integration for stream statistics
"""

import logging
import time
import threading
from collections import namedtuple
import requests
from sqlalchemy.exc import SQLAlchemyError
from models import StreamStats
from database import get_db_session
from config import Config

logger = logging.getLogger(__name__)

CollectResult = namedtuple('CollectResult', ['stats', 'stream_ended', 'live_broadcast_content'])


class YouTubeAPIClient:
    def __init__(self, api_key=None):
        self.api_key = api_key or Config.YOUTUBE_API_KEY
        if not self.api_key:
            raise ValueError("YouTube API key is required")

        self.base_url = "https://www.googleapis.com/youtube/v3"

    def get_live_stream_details(self, video_id):
        """Get live streaming details and statistics for a video in a single API call"""
        url = f"{self.base_url}/videos"
        params = {
            "part": "snippet,liveStreamingDetails,statistics",
            "id": video_id
        }
        headers = {
            "x-goog-api-key": self.api_key
        }

        try:
            response = requests.get(url, params=params, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            logger.error(f"YouTube API request failed: {e}")
            raise


class StatsCollector:
    def __init__(self, api_key=None):
        self.youtube_client = YouTubeAPIClient(api_key)
        self.is_running = False
        self._stop_event = threading.Event()

    def collect_stats(self, video_id):
        """Collect and save stream statistics.

        Returns:
            CollectResult with stats and stream_ended flag, or None on failure.
        """
        try:
            # Get live streaming details
            live_data = self.youtube_client.get_live_stream_details(video_id)

            if not live_data.get('items'):
                logger.warning(f"No live streaming data found for video: {video_id}")
                return None

            item = live_data['items'][0]

            # Detect stream ended via snippet.liveBroadcastContent or actualEndTime
            snippet = item.get('snippet', {})
            live_details = item.get('liveStreamingDetails', {})
            live_broadcast_content = snippet.get('liveBroadcastContent', '')
            actual_end_time = live_details.get('actualEndTime')
            stream_ended = (live_broadcast_content == 'none') or (actual_end_time is not None)

            if stream_ended:
                logger.info(f"Stream ended detected for {video_id}: "
                            f"liveBroadcastContent={live_broadcast_content}, actualEndTime={actual_end_time}")

            # Create StreamStats instance
            stats = StreamStats.from_youtube_api(live_data, video_id)

            if stats:
                # Extract values before session to avoid lazy loading issues
                concurrent_viewers = stats.concurrent_viewers
                view_count = stats.view_count

                # Save to database
                with get_db_session() as session:
                    session.add(stats)

                logger.info(f"Saved stats for {video_id}: {concurrent_viewers} concurrent, {view_count} views")
                return CollectResult(stats=stats, stream_ended=stream_ended, live_broadcast_content=live_broadcast_content)
            else:
                logger.warning(f"Could not create stats object for video: {video_id}")
                return CollectResult(stats=None, stream_ended=stream_ended, live_broadcast_content=live_broadcast_content)

        except SQLAlchemyError as e:
            logger.error(f"Database error saving stats: {e}")
            raise

        except Exception as e:
            logger.error(f"Error collecting stats for {video_id}: {e}")
            raise

    def start_polling(self, video_id, interval_seconds=60, on_stream_ended=None, on_status_change=None):
        """Start polling for statistics at regular intervals.

        Args:
            video_id: YouTube video ID to poll.
            interval_seconds: Polling interval in seconds.
            on_stream_ended: Optional callback(video_id) invoked when stream end is detected.
            on_status_change: Optional callback(video_id, live_broadcast_content) invoked
                              when liveBroadcastContent changes between polls.
        """
        logger.info(f"Starting stats polling for {video_id} every {interval_seconds} seconds")

        self.is_running = True
        self._stop_event.clear()
        last_status = None

        while self.is_running:
            try:
                result = self.collect_stats(video_id)

                if result:
                    # Notify on status transitions (upcoming→live, live→none, etc.)
                    if result.live_broadcast_content != last_status:
                        if on_status_change and last_status is not None:
                            on_status_change(video_id, result.live_broadcast_content)
                        last_status = result.live_broadcast_content

                    if result.stream_ended:
                        if on_stream_ended:
                            on_stream_ended(video_id)
                        break

            except Exception as e:
                logger.error(f"Stats collection error: {e}")
                # Continue polling even if one collection fails

            if self.is_running:
                # Use event wait instead of sleep so stop_polling() can interrupt immediately
                if self._stop_event.wait(timeout=interval_seconds):
                    break

        logger.info("Stats polling stopped")

    def stop_polling(self):
        """Stop statistics polling"""
        logger.info("Stopping stats polling...")
        self.is_running = False
        self._stop_event.set()

    def collect_with_retry(self, video_id, max_retries=3, backoff_seconds=5):
        """Collect stats with retry logic"""
        for attempt in range(max_retries):
            try:
                return self.collect_stats(video_id)

            except Exception as e:
                logger.error(f"Stats collection attempt {attempt + 1} failed: {e}")

                if attempt < max_retries - 1:
                    wait_time = backoff_seconds * (2 ** attempt)  # Exponential backoff
                    logger.info(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"All {max_retries} stats collection attempts failed")
                    raise

        return None


if __name__ == "__main__":
    # Test the stats collector
    import sys

    # Setup logging
    logging.basicConfig(level=logging.INFO)

    # Validate config
    Config.validate()

    if len(sys.argv) < 2:
        print("Usage: python youtube_api.py <video_id>")
        sys.exit(1)

    video_id = sys.argv[1]

    collector = StatsCollector()

    try:
        # Test single collection
        stats = collector.collect_with_retry(video_id, max_retries=Config.RETRY_MAX_ATTEMPTS, backoff_seconds=Config.RETRY_BACKOFF_SECONDS)

        if stats:
            print(f"Successfully collected stats: {stats}")
        else:
            print("No stats collected")

    except KeyboardInterrupt:
        logger.info("Stats collection stopped by user")
    except Exception as e:
        logger.error(f"Stats collection failed: {e}")
        sys.exit(1)