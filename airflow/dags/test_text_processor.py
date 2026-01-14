"""
Text Processor Unit Tests
測試文字處理模組的核心邏輯
"""

import sys
from text_processor import (
    apply_replace_words,
    extract_unicode_emojis,
    extract_youtube_emotes,
    remove_emojis,
    remove_youtube_emotes,
    tokenize_text,
    process_message,
    process_messages_batch
)


def run_test_case(name: str, test_func):
    """執行單個測試案例"""
    print(f"\n{'='*60}")
    print(f"測試案例: {name}")
    print('='*60)
    try:
        test_func()
        print(f"✅ 測試通過: {name}")
        return True
    except AssertionError as e:
        print(f"❌ 測試失敗: {name}")
        print(f"   錯誤: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ 測試錯誤: {name}")
        print(f"   異常: {str(e)}")
        return False


def test_apply_replace_words():
    """測試替換詞彙功能"""
    replace_dict = {
        "眉姊姊": "眉姐姐",
        "甄環": "甄嬛",
        "隨風搖GG": "隨風搖雞雞"
    }

    # 測試基本替換
    text = "眉姊姊好美"
    result = apply_replace_words(text, replace_dict)
    assert result == "眉姐姐好美", f"Expected '眉姐姐好美', got '{result}'"

    # 測試多個替換
    text = "眉姊姊和甄環"
    result = apply_replace_words(text, replace_dict)
    assert result == "眉姐姐和甄嬛", f"Expected '眉姐姐和甄嬛', got '{result}'"

    # 測試無匹配
    text = "沒有要替換的"
    result = apply_replace_words(text, replace_dict)
    assert result == "沒有要替換的", f"Expected '沒有要替換的', got '{result}'"

    print("  - 基本替換: OK")
    print("  - 多個替換: OK")
    print("  - 無匹配: OK")


def test_extract_unicode_emojis():
    """測試 Unicode emoji 提取"""
    # 測試基本 emoji
    text = "好開心😀🎉"
    result = extract_unicode_emojis(text)
    assert result == ['😀', '🎉'], f"Expected ['😀', '🎉'], got {result}"

    # 測試無 emoji
    text = "沒有emoji"
    result = extract_unicode_emojis(text)
    assert result == [], f"Expected [], got {result}"

    # 測試混合文字
    text = "我❤️甄嬛"
    result = extract_unicode_emojis(text)
    assert '❤️' in ''.join(result) or '❤' in result, f"Expected heart emoji, got {result}"

    print("  - 基本 emoji: OK")
    print("  - 無 emoji: OK")
    print("  - 混合文字: OK")


def test_extract_youtube_emotes():
    """測試 YouTube emotes 提取"""
    # 測試正常格式
    emotes = [
        {"name": ":happy:", "images": [{"url": "https://example.com/happy.png"}]},
        {"name": ":sad:", "images": [{"url": "https://example.com/sad.png"}]}
    ]
    result = extract_youtube_emotes(emotes)
    assert len(result) == 2
    assert result[0]['name'] == ':happy:'
    assert result[0]['url'] == 'https://example.com/happy.png'

    # 測試空值
    result = extract_youtube_emotes(None)
    assert result == []

    result = extract_youtube_emotes([])
    assert result == []

    print("  - 正常格式: OK")
    print("  - 空值處理: OK")


def test_remove_emojis():
    """測試移除 emoji"""
    text = "好開心😀🎉太棒了"
    result = remove_emojis(text)
    assert '😀' not in result and '🎉' not in result
    assert '好開心' in result and '太棒了' in result

    print("  - 移除 emoji: OK")


def test_remove_youtube_emotes():
    """測試移除 YouTube emotes"""
    text = "我很:happy:開心:sad:"
    emotes = [
        {"name": ":happy:"},
        {"name": ":sad:"}
    ]
    result = remove_youtube_emotes(text, emotes)
    assert ':happy:' not in result and ':sad:' not in result
    assert '我很' in result and '開心' in result

    # 測試空 emotes
    result = remove_youtube_emotes("test", None)
    assert result == "test"

    print("  - 移除 emotes: OK")
    print("  - 空 emotes: OK")


def test_tokenize_text():
    """測試 jieba 斷詞"""
    text = "甄嬛好美"
    special_words = ["甄嬛"]
    result = tokenize_text(text, special_words)

    assert "甄嬛" in result, f"Expected '甄嬛' in tokens, got {result}"
    assert len(result) > 0

    print(f"  - 斷詞結果: {result}")
    print("  - 斷詞功能: OK")


def test_process_message():
    """測試完整處理流程"""
    message = "眉姊姊好美😀:happy:"
    emotes = [{"name": ":happy:", "images": [{"url": "https://example.com/happy.png"}]}]
    replace_dict = {"眉姊姊": "眉姐姐"}
    special_words = ["眉姐姐"]

    processed, tokens, unicode_emojis, youtube_emotes = process_message(
        message, emotes, replace_dict, special_words
    )

    # 驗證替換
    assert "眉姐姐" in processed, f"Expected '眉姐姐' in processed, got '{processed}'"

    # 驗證 emoji 被移除
    assert '😀' not in processed
    assert ':happy:' not in processed

    # 驗證 emoji 被提取
    assert '😀' in unicode_emojis

    # 驗證 emotes 被提取
    assert len(youtube_emotes) == 1
    assert youtube_emotes[0]['name'] == ':happy:'

    # 驗證斷詞
    assert len(tokens) > 0

    print(f"  - 處理後: {processed}")
    print(f"  - 斷詞: {tokens}")
    print(f"  - Unicode emoji: {unicode_emojis}")
    print(f"  - YouTube emotes: {youtube_emotes}")
    print("  - 完整處理: OK")


def test_process_messages_batch():
    """測試批次處理"""
    messages = [
        {
            'message_id': 'msg1',
            'live_stream_id': 'stream1',
            'message': '甄嬛好美😀',
            'emotes': None,
            'author_name': 'user1',
            'author_id': 'id1',
            'published_at': '2025-01-13T00:00:00'
        },
        {
            'message_id': 'msg2',
            'live_stream_id': 'stream1',
            'message': '眉姊姊加油',
            'emotes': None,
            'author_name': 'user2',
            'author_id': 'id2',
            'published_at': '2025-01-13T00:01:00'
        }
    ]
    replace_dict = {"眉姊姊": "眉姐姐"}
    special_words = ["甄嬛", "眉姐姐"]

    results = process_messages_batch(messages, replace_dict, special_words)

    assert len(results) == 2
    assert results[0]['message_id'] == 'msg1'
    assert results[1]['processed_message'] == '眉姐姐加油'

    print(f"  - 批次處理結果數: {len(results)}")
    print("  - 批次處理: OK")


def main():
    """執行所有測試"""
    print("\n" + "="*60)
    print("開始執行 Text Processor 測試")
    print("="*60)

    test_cases = [
        ("替換詞彙功能", test_apply_replace_words),
        ("Unicode emoji 提取", test_extract_unicode_emojis),
        ("YouTube emotes 提取", test_extract_youtube_emotes),
        ("移除 emoji", test_remove_emojis),
        ("移除 YouTube emotes", test_remove_youtube_emotes),
        ("Jieba 斷詞", test_tokenize_text),
        ("完整處理流程", test_process_message),
        ("批次處理", test_process_messages_batch),
    ]

    results = []
    for name, test_func in test_cases:
        results.append(run_test_case(name, test_func))

    # 總結
    print("\n" + "="*60)
    print("測試總結")
    print("="*60)
    passed = sum(results)
    total = len(results)
    print(f"通過: {passed}/{total}")
    print(f"失敗: {total - passed}/{total}")

    if passed == total:
        print("\n🎉 所有測試通過！")
        return 0
    else:
        print(f"\n❌ 有 {total - passed} 個測試失敗")
        return 1


if __name__ == '__main__':
    sys.exit(main())
