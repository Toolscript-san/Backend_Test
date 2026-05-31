const express = require("express");
const usersRouter = require("./routes/users");

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rutas principales de la API
app.use("/api/users", usersRouter);

// Manejo de rutas no encontradas
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Manejo global de errores
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Error interno del servidor" });
});

module.exports = app;
