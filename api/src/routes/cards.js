// Rutas para la gestión de tarjetas
const { Router } = require("express");
const pool = require("../db");
const asyncHandler = require("../asyncHandler");

const router = Router();

// Registrar una nueva tarjeta
router.post("/", asyncHandler(async (req, res) => {
  const { user_id, card_number, cardholder, expiration_date, cvv, type } = req.body;

  if (!user_id || !card_number || !cardholder || !expiration_date || !cvv) {
    return res.status(400).json({
      error: "Campos obligatorios: user_id, card_number, cardholder, expiration_date, cvv",
    });
  }

  if (String(card_number).length !== 16 || !/^\d+$/.test(card_number)) {
    return res
      .status(400)
      .json({ error: "El número de tarjeta debe tener 16 dígitos" });
  }

  if (!/^\d{2}\/\d{2}$/.test(expiration_date)) {
    return res
      .status(400)
      .json({ error: "La fecha de expiración debe tener formato MM/YY" });
  }

  // Validar que el mes esté entre 01 y 12
  const month = parseInt(expiration_date.split("/")[0], 10);
  if (month < 1 || month > 12) {
    return res
      .status(400)
      .json({ error: "El mes de expiración debe estar entre 01 y 12" });
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    return res
      .status(400)
      .json({ error: "El CVV debe tener 3 o 4 dígitos" });
  }

  // Validar tipo de tarjeta
  const cardType = type || "credit";
  if (!["credit", "debit"].includes(cardType)) {
    return res
      .status(400)
      .json({ error: "El tipo de tarjeta debe ser 'credit' o 'debit'" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tarjetas (user_id, card_number, cardholder, expiration_date, cvv, type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id,
                 CONCAT('****-****-****-', RIGHT(card_number, 4)) AS masked_number,
                 cardholder, expiration_date, type, created_at`,
      [user_id, card_number, cardholder, expiration_date, cvv, cardType]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23503") {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    throw err;
  }
}));

// Listar tarjetas de un usuario
router.get("/user/:user_id", asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  const result = await pool.query(
    `SELECT id, user_id,
            CONCAT('****-****-****-', RIGHT(card_number, 4)) AS masked_number,
            cardholder, expiration_date, type, created_at
     FROM tarjetas WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  res.json(result.rows);
}));

module.exports = router;
