# Chirpy API

A RESTful JSON API server for a Twitter-like social platform. Built with Node.js, Express, TypeScript, PostgreSQL, and Drizzle ORM. Implements full JWT-based authentication with refresh tokens, webhook handling, and role-based access control.

## Tech Stack

- **Runtime**: Node.js (ESM)
- **Framework**: Express 5
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Auth**: JWT (jsonwebtoken) + Argon2 password hashing
- **Migrations**: Drizzle Kit

## Features

- User registration and login
- JWT access tokens (1-hour expiry) + refresh tokens (60-day expiry)
- Token revocation
- Create, read, and delete chirps (posts ≤ 140 characters)
- Profanity filter on chirp content
- Users can update their own email and password
- Filter and sort chirps by author or date
- Chirpy Red membership via Polka webhook integration
- API key authentication for webhook endpoints

## Prerequisites

- Node.js 18+
- PostgreSQL running locally

## Setup

1. **Clone and install dependencies**

   ```bash
   git clone https://github.com/YOUR_USERNAME/chirpy-api
   cd chirpy-api
   npm install
   ```

2. **Create a `.env` file** in the project root:

   ```env
   DB_URL="postgres://postgres:postgres@localhost:5432/chirpy?sslmode=disable"
   PLATFORM="dev"
   jwt_secret=YOUR_SECRET_HERE
   POLKA_KEY=YOUR_POLKA_KEY_HERE
   ```

   Generate a JWT secret with:
   ```bash
   openssl rand -base64 64
   ```

3. **Run database migrations**

   ```bash
   npm run migrate
   ```

4. **Start the server**

   ```bash
   # Development (auto-reloads on file changes)
   npm run watch

   # Production
   npm run build && npm start
   ```

   Server runs at `http://localhost:8080`.

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/users` | None | Register a new user |
| POST | `/api/login` | None | Login, returns access + refresh token |
| POST | `/api/refresh` | Refresh token | Get a new access token |
| POST | `/api/revoke` | Refresh token | Revoke a refresh token (logout) |
| PUT | `/api/users` | Access token | Update own email and password |

### Chirps

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/chirps` | None | Get all chirps |
| GET | `/api/chirps?authorId=UUID` | None | Get chirps by a specific author |
| GET | `/api/chirps?sort=asc\|desc` | None | Sort chirps by date |
| GET | `/api/chirps/:id` | None | Get a single chirp |
| POST | `/api/chirps` | Access token | Create a chirp |
| DELETE | `/api/chirps/:id` | Access token | Delete own chirp |

### Webhooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/polka/webhooks` | API key | Handle Polka payment events |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/admin/metrics` | View request hit count |
| POST | `/admin/reset` | Reset DB (dev only) |

## Authentication

Protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The Polka webhook endpoint uses API key authentication:

```
Authorization: ApiKey <api_key>
```

## Scripts

```bash
npm run watch      # Dev server with hot reload
npm run build      # Compile TypeScript
npm start          # Run compiled output
npm test           # Run tests
npm run generate   # Generate a new DB migration
npm run migrate    # Apply pending migrations
```
