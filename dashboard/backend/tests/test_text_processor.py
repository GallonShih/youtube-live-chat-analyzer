import pytest
from unittest.mock import patch, MagicMock
from app.etl.processors.text_processor import (
    load_stopwords, fullwidth_to_halfwidth, normalize_text,
    apply_replace_words, extract_unicode_emojis, extract_youtube_emotes,
    remove_emojis, remove_youtube_emotes, tokenize_text, process_message,
    clear_stopwords_cache
)

@pytest.fixture(autouse=True)
def cleanup_stopwords_cache():
    clear_stopwords_cache()
    yield
    clear_stopwords_cache()

def test_load_stopwords(tmp_path):
    """Test loading stopwords from file."""
    # Create temporary stopwords file
    stopwords_file = tmp_path / "stopwords.txt"
    stopwords_file.write_text("the\nis\nat", encoding="utf-8")
    
    # Test loading
    stopwords = load_stopwords(stopwords_file)
    assert "the" in stopwords
    assert "is" in stopwords
    assert "at" in stopwords
    assert len(stopwords) == 3
    
    # Test caching (should return same set object)
    stopwords2 = load_stopwords(stopwords_file)
    assert stopwords2 is stopwords


def test_fullwidth_to_halfwidth():
    """Test fullwidth to halfwidth conversion."""
    text = "Ｈｅｌｌｏ，　Ｗｏｒｌｄ！１２３"
    expected = "Hello, World!123"
    assert fullwidth_to_halfwidth(text) == expected


def test_normalize_text():
    """Test text normalization."""
    text = "  Ｈｅｌｌｏ   Ｗｏｒｌｄ  "
    # Fullwidth -> Halfwidth: "  Hello   World  "
    # Regex replace space: " Hello World "
    # Strip: "Hello World"
    # Wait, implementation:
    # 1. Fullwidth to halfwidth
    # 2. re.sub(r'\s+', ' ', text)
    # 3. text.strip()
    
    assert normalize_text(text) == "Hello World"
    assert normalize_text(None) == ""


def test_apply_replace_words():
    """Test replacing words (now lowercases input)."""
    replace_dict = {
        "kusa": "草",
        "lol": "笑"
    }
    text = "This is kusa lol"
    assert apply_replace_words(text, replace_dict) == "this is 草 笑"

    # Test overlapping replacements (longest match first)
    replace_dict = {
        "apple pie": "food",
        "apple": "fruit"
    }
    text = "I like apple pie"
    # Should replace "apple pie" not "apple"
    assert apply_replace_words(text, replace_dict) == "i like food"


def test_extract_unicode_emojis():
    """Test extracting unicode emojis."""
    text = "Hello 😀 world 🌍"
    emojis = extract_unicode_emojis(text)
    assert "😀" in emojis
    assert "🌍" in emojis
    assert len(emojis) == 2


def test_extract_youtube_emotes():
    """Test extracting YouTube emotes."""
    emotes_json = [
        {
            "name": ":test_emote:",
            "id": "123",
            "images": [{"url": "http://example.com/emote.png"}]
        }
    ]
    emotes = extract_youtube_emotes(emotes_json)
    assert len(emotes) == 1
    assert emotes[0]["name"] == ":test_emote:"
    assert emotes[0]["url"] == "http://example.com/emote.png"
    
    assert extract_youtube_emotes(None) == []


def test_remove_emojis():
    """Test removing emojis."""
    text = "Hello 😀 world 🌍"
    assert remove_emojis(text) == "Hello  world "


def test_remove_youtube_emotes():
    """Test removing YouTube emotes."""
    text = "Hello :test_emote: world"
    emotes_json = [{"name": ":test_emote:"}]
    assert remove_youtube_emotes(text, emotes_json) == "Hello  world"
    assert remove_youtube_emotes(text, None) == text


def test_remove_youtube_emotes_case_insensitive_and_normalized():
    """Should remove emotes even when message/emote case or width differs."""
    text = " :_gtvemojirrr: and :test_emote: "
    emotes_json = [{"name": ":_gtvemojiRRR:"}, {"name": "：TEST_EMOTE："}]
    assert remove_youtube_emotes(text, emotes_json) == "  and  "


def test_remove_youtube_emotes_overlapping_names_longest_first():
    """Longer emote names should be removed first to avoid partial leftovers."""
    text = " :abcde: :abc: "
    emotes_json = [{"name": ":abc:"}, {"name": ":abcde:"}]
    assert remove_youtube_emotes(text, emotes_json) == "   "


def test_remove_youtube_emotes_escapes_regex_chars():
    """Regex metacharacters in emote names must be treated as literals."""
    text = " :a+b?: end"
    emotes_json = [{"name": ":a+b?:"}]
    assert remove_youtube_emotes(text, emotes_json) == "  end"


def test_tokenize_text():
    """Test tokenization using jieba."""
    text = "我愛hololive"
    special_words = ["hololive"]
    stopwords = {"我"}
    
    tokens = tokenize_text(text, special_words, stopwords)
    assert "hololive" in tokens
    assert "愛" in tokens
    assert "我" not in tokens


@patch('app.etl.processors.text_processor.load_stopwords')
def test_process_message(mock_load_stopwords):
    """Test full message processing flow (now with normalize-before-replace and lowercasing)."""
    mock_load_stopwords.return_value = {"is", "the"}

    message = "  This is :kusa: 😀  "
    emotes_json = [{"name": ":kusa:", "images": [{"url": "url"}]}]
    replace_dict = {"this": "that"}
    special_words = ["that"]

    processed, tokens, unicode_emojis, youtube_emotes = process_message(
        message, emotes_json, replace_dict, special_words
    )

    # 1. Extract emojis: 😀
    assert "😀" in unicode_emojis

    # 2. Extract emotes: :kusa:
    assert youtube_emotes[0]["name"] == ":kusa:"

    # Pipeline: normalize -> replace (lowercases) -> remove emoji/emotes -> clean whitespace
    # normalize("  This is :kusa: 😀  ") => "This is :kusa: 😀"
    # apply_replace_words("This is :kusa: 😀", {"this": "that"}) => "that is :kusa: 😀"
    # remove_emojis => "that is :kusa: "
    # remove_youtube_emotes => "that is  "
    # clean whitespace => "that is"
    assert processed == "that is"

    # Tokenize: "that" (is is stopword), tokens are also lowercased
    assert "that" in tokens
    assert "is" not in tokens


class TestApplyReplaceWords:
    def test_case_insensitive_replace(self):
        """Replace words should match regardless of case."""
        replace_dict = {"die": "死"}
        assert apply_replace_words("Die in chat", replace_dict) == "死 in chat"
        assert apply_replace_words("DIE in chat", replace_dict) == "死 in chat"
        assert apply_replace_words("die in chat", replace_dict) == "死 in chat"

    def test_mixed_case_chinese_english(self):
        """Mixed Chinese-English words should match case-insensitively."""
        replace_dict = {"竹c辣寶貝": "竹息辣寶貝"}
        assert apply_replace_words("竹C辣寶貝", replace_dict) == "竹息辣寶貝"
        assert apply_replace_words("竹c辣寶貝", replace_dict) == "竹息辣寶貝"

    def test_longer_match_takes_priority(self):
        """Longer matches should still be applied first."""
        replace_dict = {"ab": "X", "abc": "Y"}
        assert apply_replace_words("abc", replace_dict) == "Y"

    def test_empty_dict(self):
        """Empty dict should return original text (lowered)."""
        assert apply_replace_words("Hello World", {}) == "hello world"


class TestTokenizeText:
    def test_tokens_are_lowercase(self):
        """All tokens should be lowercased."""
        tokens = tokenize_text("Hello WORLD", [], None)
        for t in tokens:
            assert t == t.lower(), f"Token '{t}' is not lowercase"

    def test_special_words_lowered(self):
        """Special words should work regardless of input case."""
        tokens = tokenize_text("i love hololive", ["hololive"], None)
        assert "hololive" in tokens


class TestProcessMessage:
    @patch('app.etl.processors.text_processor.load_stopwords')
    def test_full_pipeline_case_insensitive(self, mock_load_stopwords):
        """Full pipeline should produce lowercase tokens with case-insensitive replacement."""
        mock_load_stopwords.return_value = set()
        replace_dict = {"kusa": "草"}
        special_words = ["hololive"]

        processed, tokens, emojis, emotes = process_message(
            message="KUSA hololive",
            emotes_json=None,
            replace_dict=replace_dict,
            special_words=special_words,
        )

        assert "草" in processed
        assert "hololive" in tokens

    @patch('app.etl.processors.text_processor.load_stopwords')
    def test_normalize_before_replace(self, mock_load_stopwords):
        """Fullwidth chars should be normalized before replacement."""
        mock_load_stopwords.return_value = set()
        # Ｋ is fullwidth K (U+FF2B)
        replace_dict = {"kusa": "草"}
        processed, tokens, _, _ = process_message(
            message="\uff2busa test",
            emotes_json=None,
            replace_dict=replace_dict,
            special_words=[],
        )
        assert "草" in processed

    @patch('app.etl.processors.text_processor.load_stopwords')
    def test_remove_youtube_emotes_case_insensitive_after_lower(self, mock_load_stopwords):
        """Emote removal should still work after lowercase transformation."""
        mock_load_stopwords.return_value = set()
        processed, _, _, emotes = process_message(
            message=":_gtvemojiRRR: hello",
            emotes_json=[{"name": ":_gtvemojiRRR:", "images": [{"url": "u"}]}],
            replace_dict={},
            special_words=[],
        )
        assert emotes[0]["name"] == ":_gtvemojiRRR:"
        assert processed == "hello"

    @patch('app.etl.processors.text_processor.load_stopwords')
    def test_remove_youtube_emotes_fullwidth_and_case_mixed(self, mock_load_stopwords):
        """Fullwidth + mixed-case emotes should be removed in process pipeline."""
        mock_load_stopwords.return_value = set()
        processed, _, _, _ = process_message(
            message="：TeSt_EmOtE： HELLO",
            emotes_json=[{"name": ":test_emote:", "images": [{"url": "u"}]}],
            replace_dict={},
            special_words=[],
        )
        assert processed == "hello"

    @patch('app.etl.processors.text_processor.load_stopwords')
    def test_keep_time_format_when_message_has_emojis(self, mock_load_stopwords):
        """Time-like text (e.g. 12:01) should remain after emoji/emote cleanup."""
        mock_load_stopwords.return_value = set()
        processed, _, unicode_emojis, emotes = process_message(
            message="12:01 :_gtvemojiRRR: 😀 開始",
            emotes_json=[{"name": ":_gtvemojiRRR:", "images": [{"url": "u"}]}],
            replace_dict={},
            special_words=[],
        )
        assert "😀" in unicode_emojis
        assert emotes[0]["name"] == ":_gtvemojiRRR:"
        assert "12:01" in processed
        assert ":_gtvemoji" not in processed
