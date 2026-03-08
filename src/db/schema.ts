import { pgTable, timestamp, varchar, uuid, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
	email: varchar("email", { length: 256 }).unique().notNull(),
	hashed_password: varchar("hashed_password", { length: 256 }).notNull().default("unset"),
	isChirpyRed: boolean("is_chirpy_red").notNull().default(false),
});

export const chirps = pgTable("chirps", {
	id: uuid("id").primaryKey().defaultRandom(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
	body: varchar("body", { length: 280 }).notNull(),
	userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const refresh_tokens = pgTable("refresh_tokens", {
	token: varchar("token", { length: 512 }).primaryKey(),
	created_at: timestamp("created_at").notNull().defaultNow(),
	updated_at: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
	user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	expires_at: timestamp("expires_at").notNull(),
	revoked_at: timestamp("revoked_at"),
});

export type NewUser = typeof users.$inferInsert;
export type NewChirp = typeof chirps.$inferInsert;
export type NewRefreshToken = typeof refresh_tokens.$inferInsert;