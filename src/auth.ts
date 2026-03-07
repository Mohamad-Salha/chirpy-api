import argon2 from "argon2";
import jwt from "jsonwebtoken";

export function hashPassword(password: string): Promise<string> {
	return argon2.hash(password);
}

export function checkPasswordHash(password: string, hash: string): Promise<boolean> {
	return argon2.verify(hash, password);
}

export function makeJWT(userID: string, expiresIn: number, secret: string): string {
	return jwt.sign({ userID }, secret, { expiresIn });
}