const request = require("supertest");
const app = require("../src/app");

jest.mock("../src/db", () => ({ query: jest.fn() }));
const pool = require("../src/db");

// Silenciar console.error del handler de errores de Express
beforeAll(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterAll(() => console.error.mockRestore());

const CARD = {
  id: 10,
  user_id: 1,
  masked_number: "****-****-****-1234",
  cardholder: "ANA GARCIA",
  expiration_date: "12/28",
  type: "credit",
  created_at: "2026-01-01T00:00:00.000Z",
};

const VALID_BODY = {
  user_id: 1,
  card_number: "4111111111111234",
  cardholder: "ANA GARCIA",
  expiration_date: "12/28",
  cvv: "123",
  type: "credit",
};

describe("POST /api/cards", () => {
  it("should register a card and return 201 with masked number", async () => {
    pool.query.mockResolvedValueOnce({ rows: [CARD] });

    const res = await request(app).post("/api/cards").send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.masked_number).toBe("****-****-****-1234");
    expect(res.body).not.toHaveProperty("cvv");
  });

  it("should return 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ user_id: 1, card_number: "4111111111111234" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatorios/i);
  });

  it("should return 400 when card number is not 16 digits", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, card_number: "411111111111" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/16 dígitos/i);
  });

  it("should return 400 when card number contains non-digits", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, card_number: "411111111111ABCD" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/16 dígitos/i);
  });

  it("should return 400 when expiration_date format is wrong", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, expiration_date: "1228" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MM\/YY/i);
  });

  it("should return 400 when expiration month is out of range", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, expiration_date: "13/28" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mes/i);
  });

  it("should return 400 when CVV has wrong length", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, cvv: "12" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CVV/i);
  });

  it("should accept a 4-digit CVV", async () => {
    pool.query.mockResolvedValueOnce({ rows: [CARD] });

    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, cvv: "1234" });

    expect(res.status).toBe(201);
  });

  it("should return 400 when card type is invalid", async () => {
    const res = await request(app)
      .post("/api/cards")
      .send({ ...VALID_BODY, type: "banana" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tipo/i);
  });

  it("should return 404 when user does not exist (FK violation)", async () => {
    pool.query.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "23503" }));

    const res = await request(app).post("/api/cards").send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/usuario/i);
  });

  it("should return 500 when an unexpected database error occurs on insert", async () => {
    pool.query.mockRejectedValueOnce(new Error("disk full"));

    const res = await request(app).post("/api/cards").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });
});

describe("GET /api/cards/user/:user_id", () => {
  it("should return 200 with the user's cards", async () => {
    pool.query.mockResolvedValueOnce({ rows: [CARD] });

    const res = await request(app).get("/api/cards/user/1");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].masked_number).toBe("****-****-****-1234");
  });

  it("should return 200 with an empty array when the user has no cards", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/cards/user/99");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("should return 500 when the database fails", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection lost"));

    const res = await request(app).get("/api/cards/user/1");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });
});
