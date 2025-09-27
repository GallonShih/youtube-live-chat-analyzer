"""
YouTube Data API integration for stream statistics
"""

import logging
import time
import requests
from sqlalchemy.exc import SQLAlchemyError
from models import StreamStats
from database import get_db_session
from config import Config

logger = logging.getLogger(__name__)


class YouTubeAPIClient:
    def __init__(self, api_key=None):
        self.api_key = api_key or Config.YOUTUBE_API_KEY
        if not self.api_key:
            raise ValueError("YouTube API key is required")

        self.base_url = "https://www.googleapis.com/youtube/v3"

    def get_live_stream_details(self, video_id):
        """Get live streaming details for a video"""
        url = f"{self.base_url}/videos"
        params = {
            "part": "liveStreamingDetails",
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

    def get_video_statistics(self, video_id):
        """Get video statistics (views, likes, etc.)"""
        url = f"{self.base_url}/videos"
        params = {
            "part": "statistics",
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

    def collect_stats(self, video_id):
        """Collect and save stream statistics"""
        try:
            # Get live streaming details
            live_data = self.youtube_client.get_live_stream_details(video_id)

            if not live_data.get('items'):
                logger.warning(f"No live streaming data found for video: {video_id}")
                return None

            # Create StreamStats instance
            stats = StreamStats.from_youtube_api(live_data, video_id)

            if stats:
                # Extract values before session to avoid lazy loading issues
                concurrent_viewers = stats.concurrent_viewers

                # Save to database
                with get_db_session() as session:
                    session.add(stats)

                logger.info(f"Saved stats for {video_id}: {concurrent_viewers} viewers")
                return stats
            else:
                logger.warning(f"Could not create stats object for video: {video_id}")
                return None

        except SQLAlchemyError as e:
            logger.error(f"Database error saving stats: {e}")
            raise

        except Exception as e:
            logger.error(f"Error collecting stats for {video_id}: {e}")
            raise

    def start_polling(self, video_id, interval_seconds=60):
        """Start polling for statistics at regular intervals"""
        logger.info(f"Starting stats polling for {video_id} every {interval_seconds} seconds")

        self.is_running = True

        while self.is_running:
            try:
                self.collect_stats(video_id)

            except Exception as e:
                logger.error(f"Stats collection error: {e}")
                # Continue polling even if one collection fails

            if self.is_running:
                time.sleep(interval_seconds)

        logger.info("Stats polling stopped")

    def stop_polling(self):
        """Stop statistics polling"""
        logger.info("Stopping stats polling...")
        self.is_running = False

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