import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { Request } from "express";
import crypto from "crypto";

// We only care about these four standard JWT fields
type Payload = Pick<JwtPayload, "iss" | "sub" | "iat" | "exp">;

export function hashPassword(password: string): Promise<string> {
	return argon2.hash(password);
}

export function checkPasswordHash(password: string, hash: string): Promise<boolean> {
	return argon2.verify(hash, password);
}

export function makeJWT(userID: string, expiresIn: number, secret: string): string {
	const iat = Math.floor(Date.now() / 1000); // current time in seconds (Unix timestamp)

	const payload: Payload = {
		iss: "chirpy",       // issuer: who created this token
		sub: userID,         // subject: who this token is about (the user)
		iat,                 // issued at: when the token was created
		exp: iat + expiresIn, // expiration: iat + duration in seconds
	};

	// jwt.sign() encodes & signs the payload — no expiresIn option needed
	// because we're setting exp manually inside the payload itself
	return jwt.sign(payload, secret);
}

export function validateJWT(tokenString: string, secret: string): string {
	// jwt.verify() does two things at once:
	//   1. Validates the signature (was this token signed with our secret?)
	//   2. Checks the exp field (has the token expired?)
	// If either check fails, it throws an error automatically.
	const decoded = jwt.verify(tokenString, secret) as JwtPayload;

	if (!decoded.sub) {
		throw new Error("Invalid JWT: token is missing a subject (user ID)");
	}

	return decoded.sub; // return the user's ID
}

export function getBearerToken(req: Request): string {
	const authHeader = req.get("Authorization") ?? "";
	// The header value must look like:  "Bearer eyJhbGci..."
	// We split on the first space and take the second part
	const parts = authHeader.split(" ");
	if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
		throw new Error("Authorization header is missing or not in Bearer format");
	}
	return parts[1].trim(); // the raw JWT string
}

// Generates a cryptographically random 256-bit (32-byte) token as a hex string.
// This is used as a refresh token — it's NOT a JWT, just a random secret string
// that we store in the database and hand to the client.
export function makeRefreshToken(): string {
	return crypto.randomBytes(32).toString("hex");
}