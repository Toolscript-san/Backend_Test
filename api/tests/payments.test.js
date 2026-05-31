const request = require("supertest");
const app = require("../src/app");

jest.mock("../src/db", () => ({ query: jest.fn() }));
const pool = require("../src/db");

const PAYMENT = {
  id: 100,
  user_id: 1,
  card_id: 10,
  amount: "150.00",
  currency: "USD",
  status: "approved",
  reference: "AUTH-123456",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const PAYMENT_WITH_CARD = {
  ...PAYMENT,
  masked_number: "****-****-****-1234",
};

const VALID_BODY = { user_id: 1, card_id: 10, amount: 150 };

// Utilidad para simular la respuesta del servicio de pagos
const mockFetch = (payload, ok = true) => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(payload),
  });
};

// Silenciar console.error y limpiar mocks entre cada test
beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe("POST /api/payments", () => {
  it("should create an approved payment and return 201", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [PAYMENT] });
    mockFetch({ approved: true, message: "Pago aprobado", amount: 150, authorization_code: "AUTH-123456" });

    const res = await request(app).post("/api/payments").send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ status: "approved", reference: "AUTH-123456" });
    expect(res.body.processing.approved).toBe(true);
  });

  it("should create a rejected payment and return 201 with status rejected", async () => {
    const rejectedPayment = { ...PAYMENT, status: "rejected", reference: null };
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [rejectedPayment] });
    mockFetch({ approved: false, message: "Pago rechazado por el procesador", amount: 150, authorization_code: null });

    const res = await request(app).post("/api/payments").send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.processing.approved).toBe(false);
  });

  it("should return 400 when user_id is missing", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({ card_id: 10, amount: 150 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatorios/i);
  });

  it("should return 400 when card_id is missing", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({ user_id: 1, amount: 150 });

    expect(res.status).toBe(400);
  });

  it("should return 400 when amount is missing", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({ user_id: 1, card_id: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatorios/i);
  });

  it("should return 400 when amount is zero with correct error message", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({ ...VALID_BODY, amount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positivo/i);
  });

  it("should return 400 when amount is negative", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({ ...VALID_BODY, amount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positivo/i);
  });

  it("should return 400 when amount is a string", async () => {
    const res = await request(app)
      .post("/api/payments")
      .send({ ...VALID_BODY, amount: "cien" });

    expect(res.status).toBe(400);
  });

  it("should return 404 when the card does not belong to the user", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/api/payments").send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/tarjeta/i);
  });

  it("should return 500 when the card lookup query fails unexpectedly", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection reset"));

    const res = await request(app).post("/api/payments").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });

  it("should return 500 when the INSERT query fails after payment is approved", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockRejectedValueOnce(new Error("disk full"));
    mockFetch({ approved: true, message: "Pago aprobado", amount: 150, authorization_code: "AUTH-999" });

    const res = await request(app).post("/api/payments").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });

  it("should return 502 when the payment service is unreachable", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] });
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).post("/api/payments").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/servicio/i);
  });
});

describe("GET /api/payments/user/:user_id", () => {
  it("should return 500 when the database fails", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection lost"));

    const res = await request(app).get("/api/payments/user/1");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });

  it("should return 200 with the user's payment history", async () => {
    pool.query.mockResolvedValueOnce({ rows: [PAYMENT_WITH_CARD] });

    const res = await request(app).get("/api/payments/user/1");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ status: "approved", masked_number: "****-****-****-1234" });
  });

  it("should return 200 with empty array when user has no payments", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/payments/user/999");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
