"""Tests for active dictionary browsing endpoints."""


# --- Active Replace Words ---

def test_get_active_replace_words_empty(client):
    response = client.get("/api/admin/active-replace-words")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["limit"] == 20
    assert data["offset"] == 0


def test_get_active_replace_words_with_data(client, sample_replace_words):
    response = client.get("/api/admin/active-replace-words")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 2
    # Verify fields
    item = data["items"][0]
    assert "id" in item
    assert "source_word" in item
    assert "target_word" in item
    assert "created_at" in item


def test_get_active_replace_words_search_source(client, sample_replace_words):
    response = client.get("/api/admin/active-replace-words?search=錯字1")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["source_word"] == "錯字1"


def test_get_active_replace_words_search_target(client, sample_replace_words):
    response = client.get("/api/admin/active-replace-words?search=正字2")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["target_word"] == "正字2"


def test_get_active_replace_words_search_no_match(client, sample_replace_words):
    response = client.get("/api/admin/active-replace-words?search=不存在")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_get_active_replace_words_pagination(client, db):
    from app.models import ReplaceWord
    words = [
        ReplaceWord(source_word=f"src_{i}", target_word=f"tgt_{i}")
        for i in range(5)
    ]
    db.add_all(words)
    db.flush()

    response = client.get("/api/admin/active-replace-words?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5

    response = client.get("/api/admin/active-replace-words?limit=2&offset=4")
    data = response.json()
    assert len(data["items"]) == 1


# --- Active Special Words ---

def test_get_active_special_words_empty(client):
    response = client.get("/api/admin/active-special-words")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_get_active_special_words_with_data(client, sample_special_words):
    response = client.get("/api/admin/active-special-words")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 2
    item = data["items"][0]
    assert "id" in item
    assert "word" in item
    assert "created_at" in item


def test_get_active_special_words_search(client, sample_special_words):
    response = client.get("/api/admin/active-special-words?search=特殊詞1")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["word"] == "特殊詞1"


def test_get_active_special_words_search_no_match(client, sample_special_words):
    response = client.get("/api/admin/active-special-words?search=不存在")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_get_active_special_words_pagination(client, db):
    from app.models import SpecialWord
    words = [SpecialWord(word=f"word_{i}") for i in range(5)]
    db.add_all(words)
    db.flush()

    response = client.get("/api/admin/active-special-words?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5

    response = client.get("/api/admin/active-special-words?limit=2&offset=4")
    data = response.json()
    assert len(data["items"]) == 1


# --- Delete active words ---

def test_delete_active_replace_word_success(admin_client, db, sample_replace_words):
    word_id = sample_replace_words[0].id

    response = admin_client.delete(f"/api/admin/active-replace-words/{word_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["id"] == word_id

    remaining = db.query(type(sample_replace_words[0])).filter_by(id=word_id).first()
    assert remaining is None


def test_delete_active_replace_word_not_found(admin_client):
    response = admin_client.delete("/api/admin/active-replace-words/999999")
    assert response.status_code == 404


def test_delete_active_special_word_success(admin_client, db, sample_special_words):
    word_id = sample_special_words[0].id

    response = admin_client.delete(f"/api/admin/active-special-words/{word_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["id"] == word_id

    remaining = db.query(type(sample_special_words[0])).filter_by(id=word_id).first()
    assert remaining is None


def test_delete_active_special_word_not_found(admin_client):
    response = admin_client.delete("/api/admin/active-special-words/999999")
    assert response.status_code == 404


def test_delete_active_replace_word_requires_admin(client, db, sample_replace_words):
    word_id = sample_replace_words[0].id
    response = client.delete(f"/api/admin/active-replace-words/{word_id}")
    assert response.status_code == 401


def test_delete_active_replace_word_forbidden_for_non_admin(client, db, sample_replace_words):
    from app.core.security import create_access_token
    token = create_access_token({"role": "user"})
    headers = {"Authorization": f"Bearer {token}"}
    word_id = sample_replace_words[0].id

    response = client.delete(f"/api/admin/active-replace-words/{word_id}", headers=headers)
    assert response.status_code == 403


def test_delete_active_special_word_requires_admin(client, db, sample_special_words):
    word_id = sample_special_words[0].id
    response = client.delete(f"/api/admin/active-special-words/{word_id}")
    assert response.status_code == 401


def test_delete_active_special_word_forbidden_for_non_admin(client, db, sample_special_words):
    from app.core.security import create_access_token
    token = create_access_token({"role": "user"})
    headers = {"Authorization": f"Bearer {token}"}
    word_id = sample_special_words[0].id

    response = client.delete(f"/api/admin/active-special-words/{word_id}", headers=headers)
    assert response.status_code == 403


# --- Query validation ---

def test_active_replace_words_invalid_limit(client):
    response = client.get("/api/admin/active-replace-words?limit=0")
    assert response.status_code == 422

    response = client.get("/api/admin/active-replace-words?limit=201")
    assert response.status_code == 422


def test_active_replace_words_invalid_offset(client):
    response = client.get("/api/admin/active-replace-words?offset=-1")
    assert response.status_code == 422


def test_active_special_words_invalid_limit(client):
    response = client.get("/api/admin/active-special-words?limit=-5")
    assert response.status_code == 422


def test_active_special_words_invalid_offset(client):
    response = client.get("/api/admin/active-special-words?offset=-1")
    assert response.status_code == 422
