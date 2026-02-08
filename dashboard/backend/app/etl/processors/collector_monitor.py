"""
Collector Monitor Module
監控 Collector 資料寫入狀態，異常時發送 Discord 告警
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import requests
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.etl.config import ETLConfig

logger = logging.getLogger(__name__)

ALERT_STATE_KEY = 'MONITOR_ALERT_STATE'


class CollectorMonitor:
    """
    Collector 監控器

    定期檢查 chat_messages 與 stream_stats 是否持續寫入，
    若超過閾值無新資料則透過 Discord Webhook 發送告警。
    當資料恢復後發送恢復通知。
    """

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or ETLConfig.get('DATABASE_URL')
        self._engine: Optional[Engine] = None

    def get_engine(self) -> Engine:
        """取得資料庫連線引擎"""
        if self._engine is None:
            self._engine = create_engine(self.database_url, pool_pre_ping=True)
        return self._engine

    def run(self) -> Dict[str, Any]:
        """
        執行監控檢查

        Returns:
            執行結果摘要
        """
        logger.info("Starting collector monitor check...")

        # Check if monitor is enabled
        enabled = ETLConfig.get('MONITOR_ENABLED', True)
        if not enabled:
            logger.info("Collector monitor is disabled")
            return {'status': 'skipped', 'reason': 'monitor_disabled'}

        # Check Discord webhook URL
        webhook_url = ETLConfig.get('DISCORD_WEBHOOK_URL', '')
        if not webhook_url:
            logger.info("No Discord webhook URL configured, skipping")
            return {'status': 'skipped', 'reason': 'no_webhook_url'}

        # Get threshold
        threshold_minutes = ETLConfig.get('MONITOR_NO_DATA_THRESHOLD_MINUTES', 10)
        if isinstance(threshold_minutes, str):
            threshold_minutes = int(threshold_minutes)

        # Get active streams
        active_streams = self._get_active_streams()
        if not active_streams:
            logger.info("No active live streams found, skipping")
            return {'status': 'skipped', 'reason': 'no_active_streams'}

        # Load current alert state
        alert_state = self._get_alert_state()
        new_alerts = []
        recoveries = []

        for stream in active_streams:
            video_id = stream['video_id']
            title = stream['title'] or video_id

            freshness = self._check_data_freshness(video_id)
            now = datetime.now(timezone.utc)
            stream_alerts = []

            for source, last_time in freshness.items():
                state_key = f"{video_id}:{source}"

                if last_time is None:
                    # No data at all for this source
                    minutes_stale = None
                    is_stale = True
                else:
                    delta = now - last_time
                    minutes_stale = delta.total_seconds() / 60
                    is_stale = minutes_stale > threshold_minutes

                if is_stale:
                    if state_key not in alert_state:
                        # New alert
                        stream_alerts.append({
                            'source': source,
                            'minutes_stale': round(minutes_stale, 1) if minutes_stale is not None else None,
                            'last_data_at': last_time.isoformat() if last_time else None,
                        })
                        alert_state[state_key] = now.isoformat()
                else:
                    if state_key in alert_state:
                        # Recovery
                        recoveries.append({
                            'video_id': video_id,
                            'title': title,
                            'source': source,
                            'alerted_at': alert_state[state_key],
                        })
                        del alert_state[state_key]

            if stream_alerts:
                new_alerts.append({
                    'video_id': video_id,
                    'title': title,
                    'alerts': stream_alerts,
                })

        # Send notifications
        alerts_sent = 0
        recoveries_sent = 0

        if new_alerts:
            if self._send_discord_alert(new_alerts, webhook_url, threshold_minutes):
                alerts_sent = sum(len(a['alerts']) for a in new_alerts)

        if recoveries:
            if self._send_discord_recovery(recoveries, webhook_url):
                recoveries_sent = len(recoveries)

        # Save alert state
        self._set_alert_state(alert_state)

        result = {
            'status': 'completed',
            'streams_checked': len(active_streams),
            'alerts_sent': alerts_sent,
            'recoveries_sent': recoveries_sent,
        }
        logger.info(f"Collector monitor completed: {result}")
        return result

    def _get_active_streams(self) -> List[Dict[str, Any]]:
        """查詢目前正在直播的 streams"""
        engine = self.get_engine()

        # First get youtube_url from system_settings to know which stream to monitor
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT value FROM system_settings WHERE key = 'youtube_url'")
            ).fetchone()

        if not result or not result[0]:
            logger.info("No youtube_url configured in system_settings")
            return []

        video_id = self._extract_video_id(result[0])
        if not video_id:
            logger.warning(f"Could not extract video_id from URL: {result[0]}")
            return []

        # Check if this stream is live
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT video_id, title, live_broadcast_content
                    FROM live_streams
                    WHERE video_id = :video_id
                      AND live_broadcast_content = 'live'
                """),
                {"video_id": video_id}
            ).fetchall()

        return [
            {'video_id': row[0], 'title': row[1], 'live_broadcast_content': row[2]}
            for row in rows
        ]

    @staticmethod
    def _extract_video_id(url: str) -> Optional[str]:
        """從 YouTube URL 提取 video ID"""
        match = re.search(r'(?:v=|/)([a-zA-Z0-9_-]{11})', url)
        return match.group(1) if match else None

    def _check_data_freshness(self, video_id: str) -> Dict[str, Optional[datetime]]:
        """
        檢查指定直播的資料新鮮度

        Returns:
            {'chat_messages': last_time_or_None, 'stream_stats': last_time_or_None}
        """
        engine = self.get_engine()
        result = {}

        with engine.connect() as conn:
            # Check chat_messages
            row = conn.execute(
                text("""
                    SELECT MAX(created_at) FROM chat_messages
                    WHERE live_stream_id = :video_id
                """),
                {"video_id": video_id}
            ).fetchone()
            result['chat_messages'] = row[0] if row and row[0] else None

            # Check stream_stats
            row = conn.execute(
                text("""
                    SELECT MAX(collected_at) FROM stream_stats
                    WHERE live_stream_id = :video_id
                """),
                {"video_id": video_id}
            ).fetchone()
            result['stream_stats'] = row[0] if row and row[0] else None

        # Ensure timestamps are timezone-aware (UTC)
        for key, val in result.items():
            if val is not None and val.tzinfo is None:
                result[key] = val.replace(tzinfo=timezone.utc)

        return result

    def _send_discord_alert(
        self,
        alerts: List[Dict[str, Any]],
        webhook_url: str,
        threshold_minutes: int,
    ) -> bool:
        """發送 Discord 告警"""
        embeds = []
        for alert_group in alerts:
            fields = []
            for alert in alert_group['alerts']:
                source_label = (
                    '聊天訊息 (chat_messages)' if alert['source'] == 'chat_messages'
                    else '統計資料 (stream_stats)'
                )
                if alert['minutes_stale'] is not None:
                    value = f"已 {alert['minutes_stale']} 分鐘無新資料\n最後資料：{alert['last_data_at']}"
                else:
                    value = "完全無資料"
                fields.append({
                    'name': source_label,
                    'value': value,
                    'inline': False,
                })

            embeds.append({
                'title': '⚠️ Collector 資料中斷告警',
                'description': (
                    f"**直播**：{alert_group['title']}\n"
                    f"**Video ID**：`{alert_group['video_id']}`\n"
                    f"**閾值**：{threshold_minutes} 分鐘"
                ),
                'color': 0xFF0000,  # Red
                'fields': fields,
                'timestamp': datetime.now(timezone.utc).isoformat(),
            })

        return self._post_discord(webhook_url, embeds)

    def _send_discord_recovery(
        self,
        recoveries: List[Dict[str, Any]],
        webhook_url: str,
    ) -> bool:
        """發送 Discord 恢復通知"""
        embeds = []
        for recovery in recoveries:
            source_label = (
                '聊天訊息 (chat_messages)' if recovery['source'] == 'chat_messages'
                else '統計資料 (stream_stats)'
            )
            embeds.append({
                'title': '✅ Collector 資料恢復',
                'description': (
                    f"**直播**：{recovery['title']}\n"
                    f"**Video ID**：`{recovery['video_id']}`\n"
                    f"**恢復來源**：{source_label}"
                ),
                'color': 0x00FF00,  # Green
                'timestamp': datetime.now(timezone.utc).isoformat(),
            })

        return self._post_discord(webhook_url, embeds)

    @staticmethod
    def _post_discord(webhook_url: str, embeds: List[Dict]) -> bool:
        """POST embeds to Discord webhook"""
        try:
            payload = {'embeds': embeds}
            resp = requests.post(
                webhook_url,
                json=payload,
                timeout=10,
            )
            if resp.status_code in (200, 204):
                logger.info(f"Discord notification sent ({len(embeds)} embeds)")
                return True
            else:
                logger.error(f"Discord webhook failed: {resp.status_code} {resp.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to send Discord notification: {e}")
            return False

    def _get_alert_state(self) -> Dict[str, str]:
        """Read alert state from etl_settings"""
        raw = ETLConfig.get(ALERT_STATE_KEY, '{}')
        try:
            state = json.loads(raw) if isinstance(raw, str) else raw
            return state if isinstance(state, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def _set_alert_state(self, state: Dict[str, str]) -> None:
        """Write alert state to etl_settings"""
        ETLConfig.set(ALERT_STATE_KEY, json.dumps(state), 'string')
