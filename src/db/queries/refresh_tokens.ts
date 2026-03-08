import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { refresh_tokens, NewRefreshToken, users } from "../schema.js";

// Store a new refresh token in the database.
// Called once at login — we insert the token, its owner, and its expiry.
export async function createRefreshToken(data: NewRefreshToken) {
	const [result] = await db
		.insert(refresh_tokens)
		.values(data)
		.returning();
	return result;
}

// Look up a refresh token and join the user row so we can return the user's id.
// Returns null if the token doesn't exist, is expired, or has been revoked.
export async function getUserFromRefreshToken(token: string) {
	const now = new Date();
	const [result] = await db
		.select({ user: users })
		.from(refresh_tokens)
		.innerJoin(users, eq(refresh_tokens.user_id, users.id))
		.where(eq(refresh_tokens.token, token));

	if (!result) return null;

	// We do the expiry/revoke check in application code so it's crystal clear
	const row = await db
		.select()
		.from(refresh_tokens)
		.where(eq(refresh_tokens.token, token))
		.then((r) => r[0]);

	if (!row) return null;
	if (row.expires_at < now) return null;    // expired
	if (row.revoked_at !== null) return null; // revoked

	return result.user;
}

// Mark a refresh token as revoked and update its updated_at timestamp.
// Called by POST /api/revoke.
export async function revokeRefreshToken(token: string) {
	const now = new Date();
	await db
		.update(refresh_tokens)
		.set({ revoked_at: now, updated_at: now })
		.where(eq(refresh_tokens.token, token));
}
