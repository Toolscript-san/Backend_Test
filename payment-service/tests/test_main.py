import re
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Verificación de salud
# ---------------------------------------------------------------------------

def test_health_returns_ok(client):
    res = client.get("/health")

    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /process-payment — ruta de aprobación
# ---------------------------------------------------------------------------

def test_approved_payment_returns_expected_shape(client):
    # Forzar random para que siempre apruebe
    with patch("random.random", return_value=0.1):  # 0.1 < 0.8 → aprobado
        res = client.post("/process-payment", json={"amount": 250.0})

    assert res.status_code == 200
    body = res.json()
    assert body["approved"] is True
    assert body["amount"] == 250.0
    assert body["message"] == "Pago aprobado"
    assert re.match(r"AUTH-\d{6}", body["authorization_code"])


def test_approved_payment_generates_unique_auth_codes(client):
    # random.random (aprobación) y random.randint (código) están completamente
    # controlados, por lo que este test es determinista
    codes = []
    with patch("random.random", return_value=0.1), \
         patch("random.randint", side_effect=[111111, 222222]):
        for _ in range(2):
            res = client.post("/process-payment", json={"amount": 10.0})
            codes.append(res.json()["authorization_code"])

    assert codes[0] != codes[1]
    assert codes[0] == "AUTH-111111"
    assert codes[1] == "AUTH-222222"


# ---------------------------------------------------------------------------
# POST /process-payment — ruta de rechazo
# ---------------------------------------------------------------------------

def test_rejected_payment_has_no_auth_code(client):
    # Forzar random para que siempre rechace
    with patch("random.random", return_value=0.9):  # 0.9 >= 0.8 → rechazado
        res = client.post("/process-payment", json={"amount": 99.99})

    assert res.status_code == 200
    body = res.json()
    assert body["approved"] is False
    assert body["authorization_code"] is None
    assert body["amount"] == 99.99
    assert "rechazado" in body["message"].lower()


# ---------------------------------------------------------------------------
# POST /process-payment — errores de validación
# ---------------------------------------------------------------------------

def test_zero_amount_is_rejected(client):
    res = client.post("/process-payment", json={"amount": 0})

    assert res.status_code == 422


def test_negative_amount_is_rejected(client):
    res = client.post("/process-payment", json={"amount": -50.0})

    assert res.status_code == 422


def test_missing_amount_is_rejected(client):
    res = client.post("/process-payment", json={})

    assert res.status_code == 422


def test_non_numeric_amount_is_rejected(client):
    res = client.post("/process-payment", json={"amount": "mucho"})

    assert res.status_code == 422


def test_amount_is_echoed_back_in_response(client):
    with patch("random.random", return_value=0.1):
        res = client.post("/process-payment", json={"amount": 123.45})

    assert res.json()["amount"] == 123.45
