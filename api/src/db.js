// Configuración del pool de conexiones a PostgreSQL
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "pagos_user",
  password: process.env.DB_PASSWORD || "pagos_pass",
  database: process.env.DB_NAME || "pagos_db",
});

module.exports = pool;
