"""
Editor Leader/Follower Analysis
================================
For each @garenaaovtw message, classify whether the editor was:
  - Leader    (ratio < 1.5): Editor introduced the topic
  - Amplifier (ratio 1.5~3): Topic was just emerging, editor pushed it
  - Follower  (ratio > 3):   Topic was already trending before editor posted

Algorithm:
  pre_freq  = token occurrences in [-60s, -5s] before editor's message
  base_freq = token occurrences in [-10min, -60s] before editor's message
  ratio     = pre_freq / (base_freq + ε)  [normalized per-second rate]
"""

import psycopg2
import os
from collections import Counter

DB_URL = os.environ.get("DATABASE_URL", "postgresql://hermes:hermes@localhost:5432/hermes")

AUTHOR_ID = "UCeMjhoCCvujpObnt6yeZeNg"

# Stopword tokens to exclude from ratio calculation
SKIP_TOKENS = {"!", "~", "～", "。", "，", "？", "！", "、", "...", "…", " "}

PRE_WINDOW_START = 60   # seconds before editor post
PRE_WINDOW_END   = 5    # seconds before editor post (exclude near-simultaneous)
BASE_WINDOW_START = 600  # 10 minutes
BASE_WINDOW_END   = 60   # 60 seconds

FOLLOWER_THRESHOLD   = 3.0
AMPLIFIER_THRESHOLD  = 1.5


def classify(ratio: float) -> str:
    if ratio >= FOLLOWER_THRESHOLD:
        return "Follower"
    elif ratio >= AMPLIFIER_THRESHOLD:
        return "Amplifier"
    else:
        return "Leader"


def get_token_freq(cur, tokens: list[str], t_str: str, window_start: int, window_end: int) -> dict[str, float]:
    """Return per-second frequency of each token in the given time window."""
    duration = window_start - window_end
    if not tokens or duration <= 0:
        return {}

    cur.execute("""
        SELECT unnest(tokens) as token, COUNT(*) as cnt
        FROM processed_chat_messages
        WHERE published_at BETWEEN (%s::timestamptz - INTERVAL '1 second' * %s)
                                AND (%s::timestamptz - INTERVAL '1 second' * %s)
          AND tokens && %s::text[]
        GROUP BY token
    """, (t_str, window_start, t_str, window_end, tokens))

    freq = {}
    for row in cur.fetchall():
        freq[row[0]] = row[1] / duration
    return freq


def analyze():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get all editor messages with tokens
    cur.execute("""
        SELECT cm.message_id, cm.message, cm.published_at, pcm.tokens
        FROM chat_messages cm
        JOIN processed_chat_messages pcm ON cm.message_id = pcm.message_id
        WHERE cm.author_id = %s
        ORDER BY cm.published_at
    """, (AUTHOR_ID,))

    editor_messages = cur.fetchall()
    print(f"Total editor messages: {len(editor_messages)}\n")
    print(f"{'Time (UTC+8)':<20} {'Label':<12} {'MaxRatio':>8}  {'Key Token':<15}  Message")
    print("-" * 100)

    label_counts = Counter()

    for msg_id, message, pub_at, tokens in editor_messages:
        # Filter out skip tokens and empty
        meaningful = [t for t in (tokens or []) if t not in SKIP_TOKENS and len(t) > 1]

        if not meaningful:
            label = "Follower"  # emoji-only or punctuation-only → joining the atmosphere
            print(f"{str(pub_at + __import__('datetime').timedelta(hours=8))[:19]:<20} {'Follower':<12} {'N/A':>8}  {'(no tokens)':<15}  {message[:40]}")
            label_counts["Follower"] += 1
            continue

        t_str = pub_at.isoformat()

        pre_freq  = get_token_freq(cur, meaningful, t_str, PRE_WINDOW_START, PRE_WINDOW_END)
        base_freq = get_token_freq(cur, meaningful, t_str, BASE_WINDOW_START, BASE_WINDOW_END)

        # Calculate ratio per token
        token_ratios = {}
        for token in meaningful:
            pf = pre_freq.get(token, 0)
            bf = base_freq.get(token, 0)
            epsilon = 0.001  # avoid divide-by-zero; small baseline = possibly new word
            token_ratios[token] = pf / (bf + epsilon)

        max_token = max(token_ratios, key=token_ratios.get)
        max_ratio = token_ratios[max_token]
        label = classify(max_ratio)
        label_counts[label] += 1

        local_time = pub_at + __import__('datetime').timedelta(hours=8)
        print(f"{str(local_time)[:19]:<20} {label:<12} {max_ratio:>8.1f}  {max_token:<15}  {message[:40]}")

    print("\n" + "=" * 60)
    print("Summary:")
    total = sum(label_counts.values())
    for label in ["Leader", "Amplifier", "Follower"]:
        count = label_counts.get(label, 0)
        pct = count / total * 100 if total else 0
        print(f"  {label:<12}: {count:>4} ({pct:.1f}%)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    analyze()
