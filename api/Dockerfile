FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero (capa separada para aprovechar caché en re-builds)
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código fuente
COPY src/ ./src/

EXPOSE 3000

CMD ["node", "src/index.js"]
