# Script de tests de integración — levanta el stack completo via Docker Compose,
# ejecuta un flujo de pago end-to-end, y luego desmonta todo.
# Requisitos: Docker Desktop corriendo.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$PASS = 0
$FAIL = 0

function Write-Header($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK($msg)     { Write-Host "  [PASS] $msg" -ForegroundColor Green; $script:PASS++ }
function Write-FAIL($msg)   { Write-Host "  [FAIL] $msg" -ForegroundColor Red;   $script:FAIL++ }

function Assert-Status($label, $response, $expected) {
    if ($response.StatusCode -eq $expected) {
        Write-OK "$label — HTTP $($response.StatusCode)"
    } else {
        Write-FAIL "$label — expected HTTP $expected, got HTTP $($response.StatusCode)`n    Body: $($response.Content)"
    }
}

function Invoke-Api($method, $url, $body = $null) {
    $params = @{ Method = $method; Uri = $url; ErrorAction = "SilentlyContinue" }
    if ($body) {
        $params.Body        = ($body | ConvertTo-Json)
        $params.ContentType = "application/json"
    }
    try { Invoke-WebRequest @params } catch { $_.Exception.Response }
}

function Wait-ForHealthy($service, $maxSeconds = 60) {
    Write-Host "  Esperando que $service esté saludable..." -NoNewline
    $deadline = (Get-Date).AddSeconds($maxSeconds)
    while ((Get-Date) -lt $deadline) {
        $status = docker inspect --format "{{.State.Health.Status}}" $service 2>$null
        if ($status -eq "healthy") { Write-Host " listo." -ForegroundColor Green; return }
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 3
    }
    Write-Host " tiempo agotado!" -ForegroundColor Red
    throw "El servicio $service no alcanzó estado saludable en ${maxSeconds}s"
}

function Stop-Stack {
    Write-Header "Desmontando"
    Set-Location $ROOT
    docker compose down --remove-orphans --volumes | Out-Null
    Write-Host "Listo." -ForegroundColor Cyan
}

try {
    Set-Location $ROOT

    # -----------------------------------------------------------------------
    # 1. Construir e iniciar el stack completo
    # -----------------------------------------------------------------------
    Write-Header "Construyendo e iniciando todos los servicios"
    docker compose up --build -d
    Wait-ForHealthy "pagos_db"
    Wait-ForHealthy "pagos_payment"
    Wait-ForHealthy "pagos_api"

    # -----------------------------------------------------------------------
    # 2. Flujo de pago end-to-end
    # -----------------------------------------------------------------------
    Write-Header "Ejecutando flujo de pago end-to-end"

    # Crear usuario
    $r = Invoke-Api POST "http://localhost:3000/api/users" @{
        name  = "Integration Test"
        email = "integration-$(Get-Random)@test.com"
        phone = "555-9999"
    }
    Assert-Status "Crear usuario" $r 201
    $userId = ($r.Content | ConvertFrom-Json).id

    # Registrar tarjeta
    $r = Invoke-Api POST "http://localhost:3000/api/cards" @{
        user_id         = $userId
        card_number     = "4111111111111234"
        cardholder      = "INTEGRATION TEST"
        expiration_date = "12/28"
        cvv             = "123"
        type            = "credit"
    }
    Assert-Status "Registrar tarjeta" $r 201
    $cardId = ($r.Content | ConvertFrom-Json).id

    # Crear pago
    $r = Invoke-Api POST "http://localhost:3000/api/payments" @{
        user_id  = $userId
        card_id  = $cardId
        amount   = 99.99
        currency = "USD"
    }
    Assert-Status "Crear pago" $r 201

    # Obtener historial de pagos
    $r = Invoke-Api GET "http://localhost:3000/api/payments/user/$userId"
    Assert-Status "Obtener historial de pagos" $r 200
    $payments = $r.Content | ConvertFrom-Json
    if ($payments.Count -ge 1) { Write-OK "El historial de pagos tiene al menos un registro" }
    else                        { Write-FAIL "El historial de pagos está vacío" }

    # Verificaciones de salud
    Assert-Status "Salud API Node"  (Invoke-Api GET "http://localhost:3000/health") 200
    Assert-Status "Salud FastAPI"   (Invoke-Api GET "http://localhost:8000/health") 200

} finally {
    Stop-Stack
}

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
Write-Header "Resultados"
Write-Host "  Pasaron: $PASS" -ForegroundColor Green
Write-Host "  Fallaron: $FAIL" -ForegroundColor $(if ($FAIL -gt 0) { "Red" } else { "Green" })
if ($FAIL -gt 0) { exit 1 }
