-- Add partial index for ticker_paid_message_item to match existing idx_chat_messages_paid
-- This ensures queries using PAID_MESSAGE_TYPES ('paid_message', 'ticker_paid_message_item')
-- can efficiently use indexes for both message types.
-- Uses CONCURRENTLY to avoid blocking writes on chat_messages during creation.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_ticker_paid
    ON chat_messages(live_stream_id, published_at)
    WHERE message_type = 'ticker_paid_message_item';
