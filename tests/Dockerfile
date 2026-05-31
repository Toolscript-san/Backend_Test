FROM python:3.12-alpine

# Instalar Node.js + curl (alpine usa apk, sin restricciones de pip del sistema)
RUN apk add --no-cache nodejs npm curl

WORKDIR /tests

# Instalar dependencias de tests de Node
COPY api/package*.json ./api/
RUN cd api && npm ci

# Instalar dependencias de tests de Python
COPY payment-service/requirements.txt ./payment-service/
COPY payment-service/tests/requirements-test.txt ./payment-service/
RUN pip install --no-cache-dir \
    -r payment-service/requirements.txt \
    -r payment-service/requirements-test.txt

# Copiar código fuente y tests
COPY api/src/                         ./api/src/
COPY api/tests/                       ./api/tests/

COPY payment-service/main.py          ./payment-service/
COPY payment-service/tests/           ./payment-service/tests/
COPY payment-service/pytest.ini       ./payment-service/

COPY tests/run-tests.sh ./run-tests.sh
RUN sed -i 's/\r$//' run-tests.sh && chmod +x run-tests.sh

CMD ["./run-tests.sh"]
