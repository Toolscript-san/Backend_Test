#!/usr/bin/env sh
# Runner principal de tests — se ejecuta dentro del contenedor de tests.
# Ejecuta tests unitarios de ambos servicios y luego el flujo de integración.
set -eu

API_URL="${API_URL:-http://api:3000}"
PAYMENT_URL="${PAYMENT_URL:-http://payment-service:8000}"

PASS=0
FAIL=0
ERRORS=""

header()  { echo; echo "======================================"; echo "  $*"; echo "======================================"; }
ok()      { echo "  [PASS] $*"; PASS=$((PASS + 1)); }
fail()    { echo "  [FAIL] $*"; FAIL=$((FAIL + 1)); ERRORS="$ERRORS\n    - $*"; }

assert_status() {
    label="$1" actual="$2" expected="$3"
    if [ "$actual" -eq "$expected" ]; then ok "$label — HTTP $actual"
    else fail "$label — expected HTTP $expected, got HTTP $actual"
    fi
}

# ---------------------------------------------------------------------------
# 1. Tests unitarios de Node.js
# ---------------------------------------------------------------------------
header "Tests unitarios de Node.js (Jest)"
cd /tests/api
if npx jest --runInBand --forceExit; then
    ok "Todos los tests de Jest pasaron"
else
    fail "Tests de Jest fallaron"
fi
cd /tests

# ---------------------------------------------------------------------------
# 2. Tests unitarios de Python
# ---------------------------------------------------------------------------
header "Tests unitarios de Python (pytest)"
cd /tests/payment-service
if python3 -m pytest tests/ -q; then
    ok "Todos los tests de pytest pasaron"
else
    fail "Tests de pytest fallaron"
fi
cd /tests

# ---------------------------------------------------------------------------
# 3. Tests de integración (contra contenedores reales)
# ---------------------------------------------------------------------------
header "Tests de integración (stack real)"

SUFFIX=$(date +%s)

# Crear usuario
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/users" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Integration Test\",\"email\":\"test-${SUFFIX}@example.com\",\"phone\":\"555-0000\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Crear usuario" "$HTTP_CODE" 201
USER_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

# Registrar tarjeta
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/cards" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":$USER_ID,\"card_number\":\"4111111111111234\",\"cardholder\":\"INTEGRATION TEST\",\"expiration_date\":\"12/28\",\"cvv\":\"123\",\"type\":\"credit\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Registrar tarjeta" "$HTTP_CODE" 201
CARD_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

# Crear pago
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/payments" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":$USER_ID,\"card_id\":$CARD_ID,\"amount\":99.99,\"currency\":\"USD\"}")
assert_status "Crear pago" "$HTTP_CODE" 201

# Historial de pagos
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/payments/user/$USER_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Obtener historial de pagos" "$HTTP_CODE" 200
if echo "$BODY" | grep -q '"id"'; then ok "El historial de pagos tiene registros"
else fail "El historial de pagos está vacío"
fi

# Validación de campos faltantes
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/users" \
    -H "Content-Type: application/json" -d "{}")
assert_status "Rechazar usuario con campos faltantes" "$HTTP_CODE" 400

# Recurso no encontrado
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/users/999999")
assert_status "Retornar 404 para usuario desconocido" "$HTTP_CODE" 404

# Verificaciones de salud
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
assert_status "Salud API Node" "$HTTP_CODE" 200
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PAYMENT_URL/health")
assert_status "Salud FastAPI" "$HTTP_CODE" 200

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
header "Resultados"
echo "  Pasaron : $PASS"
echo "  Fallaron: $FAIL"

if [ $FAIL -gt 0 ]; then
    echo
    echo "  Fallos:"
    printf "%b\n" "$ERRORS"
    echo
    echo "ALGUNOS TESTS FALLARON"
    exit 1
fi

echo
echo "TODOS LOS TESTS PASARON"
