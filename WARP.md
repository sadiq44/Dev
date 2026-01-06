# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Core commands

- Install dependencies: `npm install`
- Start the development server with file watching: `npm run dev`
  - Runs `node --watch src/index.js`, which imports `src/server.js` to start the Express app.
- Lint the codebase: `npm run lint`
- Auto-fix lint issues: `npm run lint:fix`
- Format the code with Prettier (uses `.prettierrc`): `npm run format`

### Database / Drizzle

- Generate Drizzle migrations from the schema in `src/models/*.js`:
  - `npm run db:generate`
- Apply migrations to the Postgres database specified by `DATABASE_URL`:
  - `npm run db:migrate`
- Open Drizzle Studio for inspecting the database:
  - `npm run db:studio`

### Testing

- There is currently no `test` script defined in `package.json` and no test files (e.g. `*.test.js`).
- If you introduce a test runner, prefer exposing it via `npm test` and document here how to run the full suite and a single test file.

## Environment & configuration

- This is a Node.js ESM project (`"type": "module"` in `package.json`); use `import`/`export` syntax and include `.js` extensions in local imports.
- Module path aliases are defined via `imports` in `package.json`:
  - `#config/*` → `./src/config/*`
  - `#controllers/*` → `./src/controllers/*`
  - `#middleware/*` → `./src/middleware/*`
  - `#models/*` → `./src/models/*`
  - `#routes/*` → `./src/routes/*`
  - `#services/*` → `./src/services/*`
  - `#utils/*` → `./src/utils/*`
  - `#validations/*` → `./src/validations/*`
- Environment variables (typically provided via `.env` and loaded through `dotenv`):
  - `PORT` (optional) – port the HTTP server listens on; defaults to `3000`.
  - `NODE_ENV` – controls console logging and cookie security flags.
  - `JWT_SECRET` – secret key for signing and verifying JWTs in `src/utils/jwt.js`.
  - `DATABASE_URL` – Postgres connection string used by `@neondatabase/serverless` and Drizzle in `src/config/database.js` and `drizzle.config.js`.
  - `INFO_LEVEL` – log level used by the Winston logger in `src/config/logger.js` (note: this is read as `INFO_LEVEL`, not `LOG_LEVEL`).
- Drizzle configuration is in `drizzle.config.js` (schema: `src/models/*.js`, output: `drizzle/`, dialect: `postgresql`).
- Prettier configuration is in `.prettierrc`, with `.prettierignore` excluding generated and log artifacts (e.g. `node_modules/`, `logs/`, `drizzle/`).

## Architecture overview

### Runtime entrypoints

- `src/index.js`
  - Imports `dotenv/config` to load environment variables.
  - Imports `./server.js` to start the HTTP server.
- `src/server.js`
  - Imports the Express app from `./app.js`.
  - Determines `PORT` from `process.env.PORT` (default `3000`).
  - Calls `app.listen(PORT, ...)` to start the server.
- `src/app.js`
  - Creates the Express application.
  - Attaches global middleware:
    - `helmet` for security headers.
    - `cors` for CORS handling.
    - `express.json` and `express.urlencoded` for body parsing.
    - `cookie-parser` for reading cookies from requests.
    - `morgan` HTTP logger configured to write through the shared Winston logger.
  - Defines basic routes:
    - `GET /` – simple health/info endpoint that logs and returns a plain-text response.
    - `GET /health` – JSON health check including status, timestamp, and process uptime.
    - `GET /api` – simple JSON "API is running" response.
  - Mounts the authentication router at `'/api/auth'`.

### HTTP layer & routing

- `src/routes/auth.routes.js`
  - Creates an Express router.
  - `POST /api/auth/sign-up` → `signup` controller in `src/controllers/auth.controller.js`.
  - `POST /api/auth/sign-in` and `POST /api/auth/sign-out` are currently stubs returning static responses.

### Request validation & controllers

- `src/validations/auth.validation.js`
  - Uses `zod` to define schemas:
    - `signupSchema` – validates `name`, `email`, `password`, and `role` (enum `['user', 'admin']`).
    - `signinSchema` – validates `email` and `password`.
- `src/utils/format.js`
  - `formatValidationError(errors)` – converts Zod errors (or unexpected values) into a user-facing string.
- `src/controllers/auth.controller.js`
  - `signup(req, res, next)` flow:
    - Validates `req.body` with `signupSchema.safeParse`.
    - On validation failure, returns HTTP 400 with a structured error and formatted details.
    - On success, extracts `name`, `email`, `password`, and `role` from the validated data.
    - Delegates user creation to `createUser` in `src/services/auth.service.js`.
    - Generates a JWT token via `jwttoken.sign` from `src/utils/jwt.js`.
    - Sets a `token` cookie on the response using the `cookies` utility from `src/utils/cookies.js`.
    - Logs a success message through the shared Winston logger.
    - Returns HTTP 201 with basic user information (id, name, email, role).
    - On errors, logs via logger; if a duplicate-email condition is detected, responds with HTTP 409, otherwise delegates to Express error handling via `next(error)`.

### Services, models & database access

- `src/config/database.js`
  - Creates a Neon HTTP client via `neon(process.env.DATABASE_URL)` from `@neondatabase/serverless`.
  - Wraps it in a Drizzle ORM instance via `drizzle(sql)`.
  - Exports both `db` and `sql` for use elsewhere.
- `src/models/user.model.js`
  - Defines a Drizzle `pgTable('users', ...)` with columns:
    - `id` – serial primary key.
    - `name` – non-null `varchar(255)`.
    - `email` – unique `varchar(255)` (nullable at the DB level but treated as unique).
    - `password` – non-null `varchar(255)`.
    - `role` – non-null `varchar(50)` with default `'user'`.
    - `created_at` / `updated_at` – non-null timestamps with `now()` defaults.
  - This schema is the source for Drizzle migrations via `drizzle.config.js`.
- `src/services/auth.service.js`
  - `hashPassword(password)` – hashes a password with `bcrypt` (salt rounds: 10), logging any errors before throwing.
  - `createUser({ name, email, password, role = 'user' })`:
    - Checks for an existing user with the same email using Drizzle's query builder (`db.select().from(users).where(eq(users.email, email)).limit(1)`).
    - If a user exists, throws an error to signal a conflict.
    - Hashes the password, inserts the new user record, and returns a subset of columns (id, name, email, role, created_at).
    - Logs both success and failure events via the shared logger.

### Auth & cookies utilities

- `src/utils/jwt.js`
  - Wraps the `jsonwebtoken` library behind a `jwttoken` object with:
    - `sign(payload)` – signs a JWT using `JWT_SECRET` and a fixed expiration of `1d`; logs and throws on failure.
    - `verify(token)` – verifies a JWT using `JWT_SECRET`; logs and throws on failure.
- `src/utils/cookies.js`
  - Centralizes cookie behavior for auth/session cookies:
    - `getOptions()` – default cookie options (`httpOnly`, `sameSite: 'strict'`, `secure` when `NODE_ENV === 'production'`, and a default max age).
    - `set(res, name, value, options = {})` – sets a cookie on the response with merged default and custom options.
    - `clear(res, name, options = {})` – clears a cookie on the response using the same option pattern.
    - `get(req, name)` – returns a cookie value from the incoming request.

### Logging

- `src/config/logger.js`
  - Configures a shared Winston logger for the service:
    - Uses `INFO_LEVEL` (defaulting to `info`) as the log level.
    - Applies combined formatting: timestamps, stack traces for errors, and JSON output.
    - Writes error-level logs to `logs/error.log`.
    - Writes info-and-above logs to `logs/combined.log`.
    - In non-production (`NODE_ENV !== 'production'`), also logs to the console with colorized, human-readable output.
  - This logger is used across the app (controllers, services, and HTTP logging via Morgan).

### Extending the API

A typical feature follows this flow: **model → service → controller → route**.

1. **Define or extend a model**
   - Add or update a table in `src/models/*.js` using Drizzle's `pgTable` helpers.
   - Run `npm run db:generate` and then `npm run db:migrate` to sync the database schema.

2. **Add service functions**
   - Implement database-facing logic in a new or existing service under `src/services/`.
   - Import `db` and relevant tables via their aliases, e.g. `#config/database.js` and `#models/user.model.js`.
   - Keep services focused on data access and domain rules; they should not depend on Express `req`/`res`.

3. **Wire up a controller**
   - Create or extend a controller in `src/controllers/`.
   - Validate incoming data with Zod schemas in `src/validations/` (e.g. follow the `signupSchema` pattern).
   - Call into the service layer, handle known domain errors (e.g. duplicates), log via the shared logger, and shape the HTTP response.
   - Reuse `formatValidationError` for consistent validation error payloads and `cookies`/`jwttoken` utilities when dealing with auth.

4. **Expose a route**
   - Register the controller in a router under `src/routes/` (for example, `auth.routes.js`).
   - Mount the router in `src/app.js` under an appropriate base path (similar to how `/api/auth` is wired).

5. **Update docs and migrations metadata**
   - If the feature changes database schema, ensure Drizzle migrations are up to date and committed.
   - Optionally document new endpoints (paths, methods, expected payloads) alongside the codebase's existing routes.

### Data & migrations

- Drizzle migration metadata is stored under `drizzle/meta/` (e.g. `0000_snapshot.json`, `_journal.json`), reflecting the current state of the `users` table and migration history.
- When updating models in `src/models`, regenerate and apply migrations using the Drizzle commands noted above.
