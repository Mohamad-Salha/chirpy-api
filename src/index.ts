import express, { NextFunction } from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "./config.js";
import { createUser, deleteAllUsers, getUserByEmail } from "./db/queries/users.js";
import { createChirp, getAllChirps, getChirpById } from "./db/queries/chirps.js";
import { hashPassword, checkPasswordHash } from "./auth.js";



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
	const { body, userId } = req.body;
	if (typeof body !== "string" || body.trim() === "") {
		res.status(400).json({ error: "Invalid chirp. Please provide a non-empty string." });
		return;
	}
	if (body.length > 140) {
		res.status(400).json({ error: "Chirp is too long. Max length is 140" });
		return;
	}
	if (typeof userId !== "string" || userId.trim() === "") {
		res.status(400).json({ error: "Invalid userId. Please provide a non-empty string." });
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

		const { hashed_password: _, ...userResponse } = user;
		res.status(200).json(userResponse);
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

app.get("/admin/metrics", handlerHits);
app.post("/admin/reset", handlerRest);

app.use(errorHandler);

app.listen(PORT, () => {
	console.log(`Server is running at http://localhost:${PORT}`);
});