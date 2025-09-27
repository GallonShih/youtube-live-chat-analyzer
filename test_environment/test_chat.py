#!/usr/bin/env python3
"""
Test script to explore chat-downloader data format
"""

from chat_downloader import ChatDownloader
import json
import sys

def test_chat_downloader(url, max_messages=10):
    """Test chat-downloader and analyze data format"""

    print(f"Testing chat-downloader with URL: {url}")
    print(f"Collecting first {max_messages} messages...")
    print("-" * 50)

    try:
        chat = ChatDownloader().get_chat(url)

        message_count = 0
        for message in chat:
            message_count += 1

            print(f"\n=== Message {message_count} ===")
            print(json.dumps(message, indent=2, ensure_ascii=False))

            if message_count >= max_messages:
                break

        print(f"\n--- Collected {message_count} messages ---")

    except Exception as e:
        print(f"Error: {e}")
        return False

    return True

if __name__ == "__main__":
    # YouTube live stream URL
    url = "https://www.youtube.com/watch?v=jfKfPfyJRdk"

    # Test with first 5 messages to understand format
    success = test_chat_downloader(url, max_messages=5)

    if not success:
        print("Failed to collect chat messages")
        sys.exit(1)

    print("\nTest completed successfully!")