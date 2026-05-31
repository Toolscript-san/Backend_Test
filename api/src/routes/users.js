// Rutas para la gestión de usuarios
const { Router } = require("express");
const pool = require("../db");
const asyncHandler = require("../asyncHandler");

const router = Router();

// Crear un nuevo usuario
router.post("/", asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res
      .status(400)
      .json({ error: "Los campos 'name' y 'email' son obligatorios" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json({ error: "El formato de email es inválido" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO usuarios (name, email, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, phone, created_at`,
      [name, email, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "Ya existe un usuario con ese email" });
    }
    throw err;
  }
}));

// Listar todos los usuarios
router.get("/", asyncHandler(async (_req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, phone, created_at FROM usuarios ORDER BY created_at DESC"
  );
  res.json(result.rows);
}));

// Obtener un usuario por su ID
router.get("/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  const result = await pool.query(
    "SELECT id, name, email, phone, created_at FROM usuarios WHERE id = $1",
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  res.json(result.rows[0]);
}));

module.exports = router;
