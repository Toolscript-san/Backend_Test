# Sistema de Pagos

Sistema básico de pagos con API RESTful que integra Node.js, PostgreSQL y Python.

## Arquitectura

```
┌──────────────┐       ┌─────────────────┐       ┌──────────────┐
│   Cliente    │──────▶│  API Node.js    │──────▶│  Servicio    │
│  (Postman)   │◀──────│  (Express)      │◀──────│  Python      │
│              │       │  Puerto 3000    │       │  (FastAPI)   │
└──────────────┘       └────────┬────────┘       │  Puerto 8000 │
                                │                └──────────────┘
                                │
                       ┌────────▼────────┐
                       │   PostgreSQL    │
                       │   Puerto 5432   │
                       └─────────────────┘
```

- **API REST (Node.js/Express):** Expone endpoints para gestionar usuarios, tarjetas y pagos.
- **Servicio de procesamiento (Python/FastAPI):** Simula la aprobación/rechazo de pagos (80% aprobado, 20% rechazado).
- **Base de datos (PostgreSQL):** Almacena usuarios, tarjetas y pagos.

---

## Requisitos previos

### Con Docker (recomendado)
- [Docker Desktop](https://www.docker.com/) con Docker Compose

### Sin Docker
- [Node.js](https://nodejs.org/) v20 o superior
- [Python](https://www.python.org/) 3.12 o superior
- PostgreSQL 16 instalado localmente

---

## Opción A — Con Docker (recomendado)

Todo corre dentro de contenedores. No necesitas Node, Python ni PostgreSQL instalados en tu máquina.

### Levantar el stack completo

```bash
docker compose up -d
```

Los tres servicios quedan disponibles en:

| Servicio | URL |
|---|---|
| API Node.js | http://localhost:3000 |
| Servicio Python | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

### Verificar que todo está corriendo

```bash
docker compose ps
```

Los tres contenedores deben mostrar estado `healthy`.

### Detener el stack

```bash
docker compose down
```

Para también borrar los datos de la base de datos:

```bash
docker compose down --volumes
```

---

## Opción B — Sin Docker

### 1. Levantar PostgreSQL localmente

Si ya tienes PostgreSQL instalado, ejecuta con el usuario `postgres`:

```bash
psql -U postgres -c "CREATE USER pagos_user WITH PASSWORD 'pagos_pass'"
psql -U postgres -c "CREATE DATABASE pagos_db OWNER pagos_user"
psql -U postgres -d pagos_db -f database/init.sql
```

### 2. Iniciar el servicio Python

```bash
cd payment-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Iniciar la API Node.js

En otra terminal:

```bash
cd api
cp .env.example .env   # ajusta las variables si tu PostgreSQL usa credenciales distintas
npm install
npm start
```

---

## Tests

### Con Docker — forma recomendada

Construir las imágenes una sola vez (o cuando cambien dependencias):

```bash
docker compose --profile test build
```

Ejecutar todos los tests (unit + integración) en un solo comando:

```bash
docker compose --profile test up --abort-on-container-exit --exit-code-from tests
```

Esto:
1. Levanta PostgreSQL, la API y el servicio Python
2. Espera a que los tres estén sanos (`healthy`)
3. Ejecuta el contenedor de tests que corre:
   - Tests unitarios de Node.js (Jest + Supertest, con mocks)
   - Tests unitarios de Python (pytest + TestClient, con mocks)
   - Tests de integración contra el stack real (flujo completo vía curl)
4. Apaga y limpia todo al terminar
5. Sale con código `0` si todos pasaron, `1` si alguno falló

> Solo necesitas volver a ejecutar `build` si modificaste `package.json` o `requirements.txt`.
> Para cualquier otro cambio (código, tests) basta con el segundo comando.

### Sin Docker — durante desarrollo

Tests unitarios de Node.js:

```bash
cd api
npm test
```

Tests unitarios de Python:

```bash
cd payment-service
python -m pytest tests/ -v
```

> Los tests unitarios usan mocks para la base de datos y el servicio de pagos,
> por lo que no necesitan ningún servicio corriendo.

---

## Endpoints

### Health Checks

| Método | URL | Descripción |
|---|---|---|
| GET | `http://localhost:3000/health` | Estado de la API |
| GET | `http://localhost:8000/health` | Estado del servicio Python |
| GET | `http://localhost:8000/docs` | Documentación interactiva FastAPI |

### Usuarios

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/users` | Crear usuario |
| GET | `/api/users` | Listar todos los usuarios |
| GET | `/api/users/:id` | Obtener usuario por ID |

**POST /api/users** — Body:
```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+5491112345678"
}
```

### Tarjetas

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/cards` | Registrar tarjeta |
| GET | `/api/cards/user/:user_id` | Listar tarjetas de un usuario |

**POST /api/cards** — Body:
```json
{
  "user_id": 1,
  "card_number": "4111111111111111",
  "cardholder": "Juan Pérez",
  "expiration_date": "12/28",
  "cvv": "123",
  "type": "credit"
}
```

> El número `4111111111111111` es un número de prueba estándar. Los números de tarjeta nunca se devuelven en claro — siempre aparecen enmascarados (`****-****-****-1111`).

### Pagos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/payments` | Crear un pago |
| GET | `/api/payments/user/:user_id` | Historial de pagos de un usuario |

**POST /api/payments** — Body:
```json
{
  "user_id": 1,
  "card_id": 1,
  "amount": 150.00,
  "currency": "USD",
  "description": "Compra de prueba"
}
```

**Respuesta:**
```json
{
  "payment": {
    "id": 1,
    "user_id": 1,
    "card_id": 1,
    "amount": "150.00",
    "currency": "USD",
    "status": "approved",
    "reference": "AUTH-123456",
    "description": "Compra de prueba",
    "created_at": "2026-05-28T..."
  },
  "processing": {
    "approved": true,
    "message": "Pago aprobado"
  }
}
```

### Códigos de respuesta

| Código | Significado |
|---|---|
| 201 | Recurso creado correctamente |
| 200 | Consulta exitosa |
| 400 | Datos inválidos o faltantes |
| 404 | Recurso no encontrado |
| 409 | Email duplicado |
| 502 | Servicio de pagos no disponible |
| 500 | Error interno del servidor |

---

## Colección de Postman

Importar `postman/Sistema_Pagos.postman_collection.json` en Postman.

Orden recomendado: crear usuario → registrar tarjeta → crear pago → consultar historial.

---

## Estructura del proyecto

```
Backend_Test/
├── api/                          # API REST (Node.js/Express)
│   ├── src/
│   │   ├── app.js                # Express app (sin listen, importable en tests)
│   │   ├── index.js              # Punto de entrada (listen)
│   │   ├── asyncHandler.js       # Wrapper para manejo de errores async
│   │   ├── db.js                 # Pool de conexión PostgreSQL
│   │   └── routes/
│   │       ├── users.js
│   │       ├── cards.js
│   │       └── payments.js
│   ├── tests/
│   │   ├── users.test.js
│   │   ├── cards.test.js
│   │   └── payments.test.js
│   ├── Dockerfile
│   ├── .dockerignore
│   └── package.json
├── payment-service/              # Servicio de procesamiento (Python/FastAPI)
│   ├── main.py
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── Dockerfile
│   ├── .dockerignore
│   └── tests/
│       ├── conftest.py
│       ├── test_main.py
│       └── requirements-test.txt
├── tests/                        # Contenedor de tests (Docker)
│   ├── Dockerfile
│   └── run-tests.sh              # Runner: Jest + pytest + integración
├── database/
│   └── init.sql                  # Schema PostgreSQL
├── scripts/
│   ├── test-integration.ps1      # Tests de integración (PowerShell, sin Docker)
│   └── test-integration.sh       # Tests de integración (Bash, sin Docker)
├── postman/
│   └── Sistema_Pagos.postman_collection.json
├── docker-compose.yml            # Stack completo + perfil de tests
├── .dockerignore
└── README.md
```

---

## Base de datos

```
usuarios              tarjetas                    pagos
┌──────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│ id (PK)      │◄──┐ │ id (PK)            │◄──┐ │ id (PK)             │
│ name         │   └─│ user_id (FK)       │   └─│ card_id (FK)        │
│ email (UQ)   │     │ card_number        │     │ user_id (FK)        │
│ phone        │     │ cardholder         │     │ amount              │
│ created_at   │     │ expiration_date    │     │ currency            │
└──────────────┘     │ cvv                │     │ status              │
                     │ type               │     │ reference           │
                     │ created_at         │     │ description         │
                     └────────────────────┘     │ created_at          │
                                                └─────────────────────┘
```
