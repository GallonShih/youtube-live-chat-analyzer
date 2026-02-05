def test_get_pending_replace_words_empty(client):
    response = client.get("/api/admin/pending-replace-words")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0

def test_get_pending_replace_words_with_data(client, sample_pending_replace_words):
    response = client.get("/api/admin/pending-replace-words")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5
    assert data["total"] == 5

def test_get_pending_replace_words_sort_by_occurrence(client, sample_pending_replace_words):
    response = client.get("/api/admin/pending-replace-words?sort_by=occurrence&order=desc")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5

def test_get_pending_special_words_empty(client):
    response = client.get("/api/admin/pending-special-words")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0

def test_get_pending_special_words_with_data(client, sample_pending_special_words):
    response = client.get("/api/admin/pending-special-words")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5

def test_validate_replace_word_valid(client):
    response = client.post("/api/admin/validate-replace-word", json={
        "source_word": "新錯字",
        "target_word": "新正字"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] == True
    assert data["conflicts"] == []

def test_validate_replace_word_same_word(client):
    response = client.post("/api/admin/validate-replace-word", json={
        "source_word": "相同",
        "target_word": "相同"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] == False
    assert len(data["conflicts"]) > 0

def test_validate_replace_word_conflict_with_special(client, sample_special_words):
    response = client.post("/api/admin/validate-replace-word", json={
        "source_word": "特殊詞1",
        "target_word": "目標"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] == False

def test_validate_special_word_valid(client):
    response = client.post("/api/admin/validate-special-word", json={
        "word": "新特殊詞"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] == True

def test_validate_special_word_conflict_with_replace(client, sample_replace_words):
    response = client.post("/api/admin/validate-special-word", json={
        "word": "錯字1"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] == False

def test_approve_replace_word(admin_client, sample_pending_replace_words):
    word_id = sample_pending_replace_words[0].id
    response = admin_client.post(f"/api/admin/approve-replace-word/{word_id}", json={
        "reviewed_by": "test_admin",
        "notes": "Test approval"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_approve_replace_word_not_found(admin_client):
    response = admin_client.post("/api/admin/approve-replace-word/99999", json={
        "reviewed_by": "admin"
    })
    assert response.status_code == 404

def test_reject_replace_word(admin_client, sample_pending_replace_words):
    word_id = sample_pending_replace_words[0].id
    response = admin_client.post(f"/api/admin/reject-replace-word/{word_id}", json={
        "reviewed_by": "test_admin",
        "notes": "Test rejection"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_approve_special_word(admin_client, sample_pending_special_words):
    word_id = sample_pending_special_words[0].id
    response = admin_client.post(f"/api/admin/approve-special-word/{word_id}", json={
        "reviewed_by": "test_admin"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_reject_special_word(admin_client, sample_pending_special_words):
    word_id = sample_pending_special_words[0].id
    response = admin_client.post(f"/api/admin/reject-special-word/{word_id}", json={
        "reviewed_by": "test_admin"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_batch_approve_replace_words(admin_client, sample_pending_replace_words):
    ids = [w.id for w in sample_pending_replace_words[:2]]
    response = admin_client.post("/api/admin/batch-approve-replace-words", json={
        "ids": ids,
        "reviewed_by": "test_admin"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["approved"] == 2

def test_batch_reject_replace_words(admin_client, sample_pending_replace_words):
    ids = [w.id for w in sample_pending_replace_words[:2]]
    response = admin_client.post("/api/admin/batch-reject-replace-words", json={
        "ids": ids,
        "reviewed_by": "test_admin"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["rejected"] == 2

def test_batch_approve_special_words(admin_client, sample_pending_special_words):
    ids = [w.id for w in sample_pending_special_words[:2]]
    response = admin_client.post("/api/admin/batch-approve-special-words", json={
        "ids": ids,
        "reviewed_by": "test_admin"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_batch_reject_special_words(admin_client, sample_pending_special_words):
    ids = [w.id for w in sample_pending_special_words[:2]]
    response = admin_client.post("/api/admin/batch-reject-special-words", json={
        "ids": ids,
        "reviewed_by": "test_admin"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_get_statistics(client, sample_pending_replace_words, sample_pending_special_words,
                        sample_replace_words, sample_special_words):
    response = client.get("/api/admin/statistics")
    assert response.status_code == 200
    data = response.json()
    assert data["pending_replace_words"] == 5
    assert data["pending_special_words"] == 5
    assert data["total_replace_words"] == 2
    assert data["total_special_words"] == 2

def test_add_replace_word(admin_client):
    response = admin_client.post("/api/admin/add-replace-word", json={
        "source_word": "手動錯字",
        "target_word": "手動正字"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_add_replace_word_duplicate(admin_client, sample_replace_words):
    response = admin_client.post("/api/admin/add-replace-word", json={
        "source_word": "錯字1",
        "target_word": "正字1"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == False

def test_add_special_word(admin_client):
    response = admin_client.post("/api/admin/add-special-word", json={
        "word": "手動特殊詞"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True

def test_add_special_word_duplicate(admin_client, sample_special_words):
    response = admin_client.post("/api/admin/add-special-word", json={
        "word": "特殊詞1"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == False

def test_clear_pending_replace_words(admin_client, client, sample_pending_replace_words):
    response = admin_client.post("/api/admin/clear-pending-replace-words", json={
        "reviewed_by": "test_admin",
        "notes": "Cleared all"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["count"] == 5

    # Verify all are rejected
    response = client.get("/api/admin/pending-replace-words")
    data = response.json()
    assert data["total"] == 0

def test_clear_pending_special_words(admin_client, client, sample_pending_special_words):
    response = admin_client.post("/api/admin/clear-pending-special-words", json={
        "reviewed_by": "test_admin",
        "notes": "Cleared all"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["count"] == 5

    # Verify all are rejected
    response = client.get("/api/admin/pending-special-words")
    data = response.json()
    assert data["total"] == 0
