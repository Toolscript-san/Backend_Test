#!/usr/bin/env bash
# Script de tests de integración — levanta el stack completo via Docker Compose,
# ejecuta un flujo de pago end-to-end, y luego desmonta todo.
# Requisitos: Docker corriendo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

header() { echo; echo "=== $* ==="; }
ok()     { echo "  [PASS] $*"; ((PASS++)); }
fail()   { echo "  [FAIL] $*"; ((FAIL++)); }

assert_status() {
    local label="$1" actual="$2" expected="$3"
    if [[ "$actual" -eq "$expected" ]]; then ok "$label — HTTP $actual"
    else fail "$label — expected HTTP $expected, got HTTP $actual"
    fi
}

wait_for_healthy() {
    local container="$1" max="${2:-60}"
    printf "  Esperando que %s esté saludable" "$container"
    local deadline=$(( $(date +%s) + max ))
    while [[ $(date +%s) -lt $deadline ]]; do
        status=$(docker inspect --format "{{.State.Health.Status}}" "$container" 2>/dev/null || echo "")
        if [[ "$status" == "healthy" ]]; then echo " listo."; return 0; fi
        printf "."
        sleep 3
    done
    echo " tiempo agotado!"
    return 1
}

teardown() {
    header "Desmontando"
    cd "$ROOT"
    docker compose down --remove-orphans --volumes > /dev/null 2>&1 || true
    echo "Listo."
}
trap teardown EXIT

cd "$ROOT"

# ---------------------------------------------------------------------------
# 1. Construir e iniciar el stack completo
# ---------------------------------------------------------------------------
header "Construyendo e iniciando todos los servicios"
docker compose up --build -d
wait_for_healthy pagos_db
wait_for_healthy pagos_payment
wait_for_healthy pagos_api

# ---------------------------------------------------------------------------
# 2. Flujo de pago end-to-end
# ---------------------------------------------------------------------------
header "Ejecutando flujo de pago end-to-end"

SUFFIX=$(date +%s)

# Crear usuario
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/users \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Integration Test\",\"email\":\"integration-${SUFFIX}@test.com\",\"phone\":\"555-9999\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Crear usuario" "$HTTP_CODE" 201
USER_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

# Registrar tarjeta
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/cards \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":$USER_ID,\"card_number\":\"4111111111111234\",\"cardholder\":\"INTEGRATION TEST\",\"expiration_date\":\"12/28\",\"cvv\":\"123\",\"type\":\"credit\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Registrar tarjeta" "$HTTP_CODE" 201
CARD_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

# Crear pago
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/payments \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":$USER_ID,\"card_id\":$CARD_ID,\"amount\":99.99,\"currency\":\"USD\"}")
assert_status "Crear pago" "$HTTP_CODE" 201

# Obtener historial de pagos
RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/payments/user/$USER_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status "Obtener historial de pagos" "$HTTP_CODE" 200
if echo "$BODY" | grep -q '"id"'; then ok "El historial de pagos tiene al menos un registro"
else fail "El historial de pagos está vacío"
fi

# Verificaciones de salud
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
assert_status "Salud API Node" "$HTTP_CODE" 200
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health)
assert_status "Salud FastAPI" "$HTTP_CODE" 200

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
header "Resultados"
echo "  Pasaron: $PASS"
echo "  Fallaron: $FAIL"
[[ $FAIL -eq 0 ]] || exit 1
