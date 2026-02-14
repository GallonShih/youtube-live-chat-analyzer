-- Migration: Lowercase all text analysis data for case-insensitive processing
-- This is idempotent - safe to run multiple times.

-- 1. Lowercase replace_words (handle dedup conflicts - keep lowest ID)
DELETE FROM replace_words a
USING replace_words b
WHERE a.id > b.id
  AND lower(a.source_word) = lower(b.source_word);

UPDATE replace_words
SET source_word = lower(source_word),
    target_word = lower(target_word),
    updated_at = NOW()
WHERE source_word != lower(source_word)
   OR target_word != lower(target_word);

-- 2. Lowercase special_words (handle dedup)
DELETE FROM special_words a
USING special_words b
WHERE a.id > b.id
  AND lower(a.word) = lower(b.word);

UPDATE special_words
SET word = lower(word),
    updated_at = NOW()
WHERE word != lower(word);

-- 3. Lowercase meaningless_words (handle dedup)
DELETE FROM meaningless_words a
USING meaningless_words b
WHERE a.id > b.id
  AND lower(a.word) = lower(b.word);

UPDATE meaningless_words
SET word = lower(word),
    updated_at = NOW()
WHERE word != lower(word);

-- 4. Lowercase tokens in processed_chat_messages
UPDATE processed_chat_messages
SET tokens = (
    SELECT array_agg(lower(t))
    FROM unnest(tokens) AS t
),
    processed_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM unnest(tokens) AS t WHERE t != lower(t)
);

-- 5. Lowercase pending tables
UPDATE pending_replace_words
SET source_word = lower(source_word),
    target_word = lower(target_word)
WHERE source_word != lower(source_word)
   OR target_word != lower(target_word);

DELETE FROM pending_special_words a
USING pending_special_words b
WHERE a.id > b.id
  AND lower(a.word) = lower(b.word);

UPDATE pending_special_words
SET word = lower(word)
WHERE word != lower(word);
