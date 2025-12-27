-- Table: hourly_message_stats
-- Purpose: 存储每小时的聊天消息统计数据

CREATE TABLE IF NOT EXISTS hourly_message_stats (
    id SERIAL PRIMARY KEY,
    live_stream_id VARCHAR(255) NOT NULL,
    hour_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,  -- 该小时的起始时间，例如: 2025-10-06 14:00:00+00
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- 唯一约束：同一个直播在同一小时只能有一条记录
    CONSTRAINT unique_stream_hour UNIQUE (live_stream_id, hour_timestamp)
);

-- 索引：提升查询性能
CREATE INDEX IF NOT EXISTS idx_hourly_stats_stream_id
    ON hourly_message_stats(live_stream_id);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_timestamp
    ON hourly_message_stats(hour_timestamp);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_stream_timestamp
    ON hourly_message_stats(live_stream_id, hour_timestamp DESC);

-- 注释
COMMENT ON TABLE hourly_message_stats IS '每小时聊天消息统计表';
COMMENT ON COLUMN hourly_message_stats.id IS '主键ID';
COMMENT ON COLUMN hourly_message_stats.live_stream_id IS 'YouTube直播ID';
COMMENT ON COLUMN hourly_message_stats.hour_timestamp IS '统计小时的起始时间戳（截断到小时）';
COMMENT ON COLUMN hourly_message_stats.message_count IS '该小时内的消息总数';
COMMENT ON COLUMN hourly_message_stats.created_at IS '记录创建时间';
COMMENT ON COLUMN hourly_message_stats.updated_at IS '记录最后更新时间';
