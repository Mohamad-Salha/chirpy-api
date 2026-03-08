import express, { NextFunction } from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "./config.js";
import { createUser, deleteAllUsers, getUserByEmail, updateUser, upgradeUserToChirpyRed } from "./db/queries/users.js";
import { createChirp, getAllChirps, getChirpById, deleteChirpById } from "./db/queries/chirps.js";
import { hashPassword, checkPasswordHash, makeJWT, validateJWT, getBearerToken, makeRefreshToken } from "./auth.js";
import { createRefreshToken, getUserFromRefreshToken, revokeRefreshToken } from "./db/queries/refresh_tokens.js";



const migrationClient = postgres(config.db.url, { max: 1 });
await migrate(drizzle(migrationClient), config.db.migrationConfig);

const app = express();
const PORT = 8080;

const handlerReadiness = (req: express.Request, res: express.Response) => {
	res.setHeader("Content-Type", "text/plain");
	res.status(200).send("OK");
};

const handlerHits = (req: express.Request, res: express.Response) => {
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.status(200).send(`
	<html>
  		<body>
    		<h1>Welcome, Chirpy Admin</h1>
    		<p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  		</body>
	</html>`);
}

const handlerRest = async (req: express.Request, res: express.Response) => {
	if (config.api.platform !== "dev") {
		res.status(403).json({ error: "Forbidden" });
		return;
	}
	config.api.fileserverHits = 0;
	await deleteAllUsers();
	res.setHeader("Content-Type", "text/plain");
	res.status(200).send("Hits reset to 0");
}

const profaneWords = ["kerfuffle", "sharbert", "fornax"];

async function createChirpApi(req: express.Request, res: express.Response, next: express.NextFunction) {
	// Step 1: Authenticate — extract the JWT from the Authorization header
	let userId: string;
	try {
		const token = getBearerToken(req); // throws if header is missing
		userId = validateJWT(token, config.api.jwtSecret); // throws if token is invalid/expired
	} catch (err) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	// Step 2: Validate the chirp body
	const { body } = req.body;
	if (typeof body !== "string" || body.trim() === "") {
		res.status(400).json({ error: "Invalid chirp. Please provide a non-empty string." });
		return;
	}
	if (body.length > 140) {
		res.status(400).json({ error: "Chirp is too long. Max length is 140" });
		return;
	}
	const cleanedBody = body
		.split(" ")
		.map((word: string) => (profaneWords.includes(word.toLowerCase()) ? "****" : word))
		.join(" ");
	try {
		const chirp = await createChirp({ body: cleanedBody, userId });
		res.status(201).json(chirp);
	} catch (err) {
		next(err);
	}
}

app.get("/api/chirps", async (req: express.Request, res: express.Response) => {
	const chirps = await getAllChirps();
	res.status(200).json(chirps);
});

app.get("/api/chirps/:id", async (req: express.Request, res: express.Response) => {
	const { id } = req.params;
	const chirp = await getChirpById(id.toString());
	if (!chirp) {
		res.status(404).json({ error: "Chirp not found" });
		return;
	}
	res.status(200).json(chirp);
});

app.delete("/api/chirps/:chirpId", async (req: express.Request, res: express.Response) => {
	// 1. Authenticate — get the user ID from the JWT
	let userId: string;
	try {
		const token = getBearerToken(req);
		userId = validateJWT(token, config.api.jwtSecret);
	} catch {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	// 2. Find the chirp
	const chirp = await getChirpById(req.params.chirpId.toString());
	if (!chirp) {
		res.status(404).json({ error: "Chirp not found" });
		return;
	}

	// 3. Authorize — only the author can delete their own chirp
	if (chirp.userId !== userId) {
		res.status(403).json({ error: "Forbidden" });
		return;
	}

	// 4. Delete and respond with 204 (success, no body)
	await deleteChirpById(chirp.id);
	res.status(204).send();
});


function middlewareLogResponses(req: express.Request, res: express.Response, next: express.NextFunction) {
	res.on("finish", () => {
		if (res.statusCode !== 200) {
			console.log(`[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`);
		}
	});
	next();
}

function middlewareMetricsInc(req: express.Request, res: express.Response, next: express.NextFunction) {
	config.api.fileserverHits += 1;
	next();
}

function errorHandler(
	err: Error,
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) {
	console.error("An error occurred:", err);
	res.status(400).json({ error: err.message || "An unexpected error occurred." });
}

async function createUserApi(req: express.Request, res: express.Response, next: express.NextFunction) {
	const { password, email } = req.body;
	if (typeof email !== "string" || email.trim() === "") {
		res.status(400).json({ error: "Invalid email. Please provide a non-empty string." });
		return;
	}
	if (typeof password !== "string" || password.trim() === "") {
		res.status(400).json({ error: "Invalid password. Please provide a non-empty string." });
		return;
	}
	try {
		const hashedPassword = await hashPassword(password);
		const user = await createUser({ email, hashed_password: hashedPassword });
		const { hashed_password: _, ...userResponse } = user;
		res.status(201).json(userResponse);
	} catch (err) {
		next(err);
	}
}

async function loginHandler(req: express.Request, res: express.Response) {
	const { email, password } = req.body;
	const unauthorized = () => res.status(401).json({ error: "Incorrect email or password." });

	if (typeof email !== "string" || typeof password !== "string") {
		return unauthorized();
	}
	try {
		const user = await getUserByEmail(email);
		if (!user) return unauthorized();

		const isValid = await checkPasswordHash(password, user.hashed_password);
		if (!isValid) return unauthorized();

		// Access token: short-lived (1 hour). Used to authenticate API requests.
		const ONE_HOUR = 3600;
		const token = makeJWT(user.id, ONE_HOUR, config.api.jwtSecret);

		// Refresh token: long-lived (60 days). Used only to get a new access token.
		const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
		const refreshToken = makeRefreshToken();
		await createRefreshToken({
			token: refreshToken,
			user_id: user.id,
			expires_at: new Date(Date.now() + SIXTY_DAYS_MS),
		});

		const { hashed_password: _, ...userResponse } = user;
		res.status(200).json({ ...userResponse, token, refreshToken });
	} catch {
		return unauthorized();
	}
}

app.use(express.json());
app.use(middlewareLogResponses);

app.use("/app", middlewareMetricsInc);

app.use("/app", express.static("./src/app"));

app.get("/api/healthz", handlerReadiness);
app.post("/api/users", createUserApi);
app.post("/api/chirps", createChirpApi);
app.post("/api/login", loginHandler);

// POST /api/refresh
// Client sends their refresh token; server responds with a brand-new access token.
// This lets users stay logged in without re-entering their password.
app.post("/api/refresh", async (req: express.Request, res: express.Response) => {
	try {
		const refreshToken = getBearerToken(req);
		const user = await getUserFromRefreshToken(refreshToken);
		if (!user) {
			res.status(401).json({ error: "Unauthorized" });
			return;
		}
		const token = makeJWT(user.id, 3600, config.api.jwtSecret);
		res.status(200).json({ token });
	} catch {
		res.status(401).json({ error: "Unauthorized" });
	}
});

// POST /api/revoke
// Client sends their refresh token; server marks it as revoked in the database.
// After this, the token can never be used again — this is how "log out" works.
app.post("/api/revoke", async (req: express.Request, res: express.Response) => {
	try {
		const refreshToken = getBearerToken(req);
		await revokeRefreshToken(refreshToken);
		res.status(204).send();
	} catch {
		res.status(401).json({ error: "Unauthorized" });
	}
});

// PUT /api/users
// Authenticated users can update their own email and password.
// The user's identity comes from the JWT — they can only update themselves.
app.put("/api/users", async (req: express.Request, res: express.Response) => {
	// 1. Authenticate: verify the access token in the Authorization header
	let userId: string;
	try {
		const token = getBearerToken(req);
		userId = validateJWT(token, config.api.jwtSecret);
	} catch {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	// 2. Validate the request body
	const { email, password } = req.body;
	if (typeof email !== "string" || typeof password !== "string") {
		res.status(400).json({ error: "email and password are required" });
		return;
	}

	// 3. Hash the new password, then update the database row for THIS user
	const hashed_password = await hashPassword(password);
	const updated = await updateUser(userId, { email, hashed_password });

	const { hashed_password: _, ...userResponse } = updated;
	res.status(200).json(userResponse);
});

app.get("/admin/metrics", handlerHits);
app.post("/admin/reset", handlerRest);

// POST /api/polka/webhooks
// Polka (our payment provider) calls this every time a payment event occurs.
// We only care about "user.upgraded" — everything else we acknowledge and ignore.
app.post("/api/polka/webhooks", async (req: express.Request, res: express.Response) => {
	const { event, data } = req.body;

	// Idempotent: if we don't know this event type, just say "OK, got it" and move on.
	// Returning 204 prevents Polka from retrying the request endlessly.
	if (event !== "user.upgraded") {
		res.status(204).send();
		return;
	}

	const user = await upgradeUserToChirpyRed(data?.userId);
	if (!user) {
		res.status(404).json({ error: "User not found" });
		return;
	}

	res.status(204).send();
});

app.use(errorHandler);

app.listen(PORT, () => {
	console.log(`Server is running at http://localhost:${PORT}`);
});