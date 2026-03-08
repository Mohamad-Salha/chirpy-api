import { describe, it, expect, beforeAll } from "vitest";
import { checkPasswordHash, hashPassword, makeJWT, validateJWT } from "./auth";

describe("Password Hashing", () => {
  const password1 = "correctPassword123!";
  const password2 = "anotherPassword456!";
  let hash1: string;
  let hash2: string;

  beforeAll(async () => {
    hash1 = await hashPassword(password1);
    hash2 = await hashPassword(password2);
  });

  it("should return true for the correct password", async () => {
    const result = await checkPasswordHash(password1, hash1);
    expect(result).toBe(true);
  });
});

describe("JWT Functions", () => {
  const userID = "test-user-id";
  const secret = "test-secret";
  const expiresIn = 3600; // 1 hour
  let token: string;

  beforeAll(() => {
    token = makeJWT(userID, expiresIn, secret);
  });

  it("should create a valid JWT", () => {
    expect(token).toBeTypeOf("string");
  });

  it("should validate a valid JWT", () => {
    const result = validateJWT(token, secret);
    expect(result).toBe(userID);
  });
});