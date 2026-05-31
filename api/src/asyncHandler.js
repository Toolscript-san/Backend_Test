// Envuelve una ruta async para que cualquier promesa rechazada se reenvíe
// al middleware de errores de Express en lugar de quedar como rechazo no manejado (Express 4).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
