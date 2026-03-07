import type { MigrationConfig } from "drizzle-orm/migrator";

process.loadEnvFile();

function envOrThrow(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Environment variable ${key} is required but not set.`);
	}
	return value;
}

type APIConfig = {
	fileserverHits: number;
	platform: string;
};

type DBConfig = {
	url: string;
	migrationConfig: MigrationConfig;
};

export const config: { api: APIConfig; db: DBConfig } = {
	api: {
		fileserverHits: 0,
		platform: envOrThrow("PLATFORM"),
	},
	db: {
		url: envOrThrow("DB_URL"),
		migrationConfig: {
			migrationsFolder: "./src/db/migrations",
		},
	},
};