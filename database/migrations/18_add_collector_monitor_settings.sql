-- Add Collector Monitor settings to etl_settings
-- 新增 Collector 監控相關設定

INSERT INTO etl_settings (key, value, value_type, description, category, is_sensitive) VALUES
('DISCORD_WEBHOOK_URL', '', 'string', 'Discord Webhook URL（用於 Collector 監控告警）', 'monitor', true),
('MONITOR_ENABLED', 'true', 'boolean', '啟用 Collector 監控', 'monitor', false),
('MONITOR_NO_DATA_THRESHOLD_MINUTES', '10', 'integer', '無新資料告警閾值（分鐘）', 'monitor', false),
('MONITOR_ALERT_STATE', '{}', 'string', 'Collector 監控告警狀態（系統內部使用）', 'monitor', true)
ON CONFLICT (key) DO NOTHING;
