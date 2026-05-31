FROM python:3.12-alpine

WORKDIR /app

# Instalar dependencias primero (capa separada para aprovechar caché en re-builds)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY main.py ./

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
