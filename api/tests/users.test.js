const request = require("supertest");
const app = require("../src/app");

jest.mock("../src/db", () => ({ query: jest.fn() }));
const pool = require("../src/db");

// Silenciar la salida de console.error del handler de Express 500
// para mantener limpia la salida de tests
beforeAll(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterAll(() => console.error.mockRestore());

const USER = {
  id: 1,
  name: "Ana García",
  email: "ana@example.com",
  phone: "555-1234",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/users", () => {
  it("should create a user and return 201 with the new record", async () => {
    pool.query.mockResolvedValueOnce({ rows: [USER] });

    const res = await request(app)
      .post("/api/users")
      .send({ name: "Ana García", email: "ana@example.com", phone: "555-1234" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, name: "Ana García", email: "ana@example.com" });
  });

  it("should return 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ email: "ana@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it("should return 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "Ana García" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("should return 400 when both name and email are missing", async () => {
    const res = await request(app).post("/api/users").send({});

    expect(res.status).toBe(400);
  });

  it("should return 400 when email format is invalid", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "Ana García", email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("should return 409 when email already exists", async () => {
    const duplicateError = new Error("duplicate key");
    duplicateError.code = "23505";
    pool.query.mockRejectedValueOnce(duplicateError);

    const res = await request(app)
      .post("/api/users")
      .send({ name: "Ana García", email: "ana@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });

  it("should return 500 when an unexpected database error occurs", async () => {
    pool.query.mockRejectedValueOnce(new Error("DB is down"));

    const res = await request(app)
      .post("/api/users")
      .send({ name: "Ana García", email: "ana@example.com" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });
});

describe("GET /api/users", () => {
  it("should return 500 when the database fails", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection lost"));

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });

  it("should return 200 with an array of users", async () => {
    pool.query.mockResolvedValueOnce({ rows: [USER] });

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ email: "ana@example.com" });
  });

  it("should return 200 with an empty array when no users exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/users/:id", () => {
  it("should return 500 when the database fails", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection lost"));

    const res = await request(app).get("/api/users/1");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/error interno/i);
  });

  it("should return 200 with the user when found", async () => {
    pool.query.mockResolvedValueOnce({ rows: [USER] });

    const res = await request(app).get("/api/users/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, email: "ana@example.com" });
  });

  it("should return 404 when the user does not exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/users/999");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/usuario/i);
  });
});
