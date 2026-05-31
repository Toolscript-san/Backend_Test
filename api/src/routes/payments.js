// Rutas para la gestión de pagos
const { Router } = require("express");
const pool = require("../db");
const asyncHandler = require("../asyncHandler");

const router = Router();

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:8000";

// Crear un nuevo pago
router.post("/", asyncHandler(async (req, res) => {
  const { user_id, card_id, amount, currency, description } = req.body;

  // Verificar campos obligatorios (amount == null atrapa undefined y null sin atrapar 0)
  if (!user_id || !card_id || amount == null) {
    return res.status(400).json({
      error: "Campos obligatorios: user_id, card_id, amount",
    });
  }

  if (typeof amount !== "number" || amount <= 0) {
    return res
      .status(400)
      .json({ error: "El monto debe ser un número positivo" });
  }

  const card = await pool.query(
    "SELECT id FROM tarjetas WHERE id = $1 AND user_id = $2",
    [card_id, user_id]
  );
  if (card.rows.length === 0) {
    return res.status(404).json({
      error: "Tarjeta no encontrada o no pertenece al usuario",
    });
  }

  let processing;
  try {
    const response = await fetch(`${PAYMENT_SERVICE_URL}/process-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    if (!response.ok) {
      return res.status(502).json({
        error: "El servicio de procesamiento respondió con un error",
      });
    }
    processing = await response.json();
  } catch {
    return res.status(502).json({
      error: "No se pudo conectar con el servicio de procesamiento de pagos",
    });
  }

  const status = processing.approved ? "approved" : "rejected";
  const reference = processing.authorization_code || null;

  const result = await pool.query(
    `INSERT INTO pagos (user_id, card_id, amount, currency, status, reference, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, card_id, amount, currency, status, reference, description, created_at`,
    [
      user_id,
      card_id,
      amount,
      currency || "USD",
      status,
      reference,
      description || null,
    ]
  );

  res.status(201).json({
    payment: result.rows[0],
    processing: {
      approved: processing.approved,
      message: processing.message,
    },
  });
}));

// Listar historial de pagos de un usuario
router.get("/user/:user_id", asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  const result = await pool.query(
    `SELECT p.id, p.user_id, p.card_id, p.amount, p.currency, p.status,
            p.reference, p.description, p.created_at,
            CONCAT('****-****-****-', RIGHT(t.card_number, 4)) AS masked_number
     FROM pagos p
     JOIN tarjetas t ON t.id = p.card_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );

  res.json(result.rows);
}));

module.exports = router;
