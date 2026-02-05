def test_get_currency_rates_empty(client):
    response = client.get("/api/admin/currency-rates")
    assert response.status_code == 200
    data = response.json()
    assert data["rates"] == []

def test_get_currency_rates_with_data(client, sample_currency_rates):
    response = client.get("/api/admin/currency-rates")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rates"]) == 3
    currencies = [r["currency"] for r in data["rates"]]
    assert "USD" in currencies
    assert "JPY" in currencies
    assert "TWD" in currencies

def test_upsert_currency_rate_create(admin_client):
    response = admin_client.post("/api/admin/currency-rates", json={
        "currency": "EUR",
        "rate_to_twd": 35.5,
        "notes": "歐元"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["currency"] == "EUR"
    assert data["rate_to_twd"] == 35.5

def test_upsert_currency_rate_update(admin_client, sample_currency_rates):
    response = admin_client.post("/api/admin/currency-rates", json={
        "currency": "USD",
        "rate_to_twd": 32.0,
        "notes": "美元更新"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert "updated" in data["message"]

def test_upsert_currency_rate_invalid_currency(admin_client):
    response = admin_client.post("/api/admin/currency-rates", json={
        "currency": "VERYLONGCURRENCY",
        "rate_to_twd": 1.0
    })
    assert response.status_code == 400

def test_upsert_currency_rate_negative_rate(admin_client):
    response = admin_client.post("/api/admin/currency-rates", json={
        "currency": "TEST",
        "rate_to_twd": -1.0
    })
    assert response.status_code == 400

def test_upsert_currency_rate_uppercase(admin_client):
    response = admin_client.post("/api/admin/currency-rates", json={
        "currency": "gbp",
        "rate_to_twd": 40.0
    })
    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "GBP"

def test_get_unknown_currencies_empty(client):
    response = client.get("/api/admin/currency-rates/unknown")
    assert response.status_code == 200
    data = response.json()
    assert data["unknown_currencies"] == []
    assert data["total"] == 0
