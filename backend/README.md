# Backend Boilerplate

![Node](https://img.shields.io/badge/node-%3E=20.19-green)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)
![Prisma](https://img.shields.io/badge/prisma-postgresql-brightgreen)

A production-ready Node.js backend boilerplate built with Express, TypeScript, Prisma, and JWT authentication.

## Features

- ✅ **Express.js** - Fast, unopinionated web framework
- ✅ **TypeScript** - Type-safe JavaScript
- ✅ **Prisma ORM** - Modern database toolkit with PostgreSQL
- ✅ **JWT Authentication** - Short-lived access tokens + rotating refresh tokens
- ✅ **Password Hashing** - Bcrypt for secure password storage
- ✅ **Request Validation** - Zod schemas on every route that accepts a body
- ✅ **Centralized Error Handling** - Single global error handler, no per-route try/catch
- ✅ **Rate Limiting** - Auth endpoints limited to slow down brute-force attempts
- ✅ **Security Headers** - Helmet enabled by default
- ✅ **Env Validation** - Fails fast on boot if required env vars are missing/invalid
- ✅ **CORS Support** - Configurable cross-origin resource sharing
- ✅ **Docker** - Multi-stage Dockerfile + docker-compose (app + Postgres)
- ✅ **Hot Reload** - Development server with auto-reload

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v20.19+, v22.12+, or v24+ — required by Prisma 7) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **PostgreSQL** (v12 or higher) - [Download](https://www.postgresql.org/download/)
- **Git** - [Download](https://git-scm.com/downloads)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/kunalBrahma/backend-boilerplate.git
cd backend-boilerplate
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
JWT_ACCESS_SECRET=<random 64-char hex string>
JWT_REFRESH_SECRET=<a different random 64-char hex string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN_DAYS=30
CORS_ORIGIN=*
```

Generate a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 4. Set up the database

Create a PostgreSQL database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE database_name;

# Exit
\q
```

### 5. Run database migrations

```bash
npm run migrate
```

This will:
- Create the database schema
- Run all pending migrations
- Generate Prisma Client

### 6. Start the development server

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## Quick Start with Docker (recommended when reusing this boilerplate)

Skip steps 4-6 above entirely and use Docker instead — this is the fastest path when starting a new project from this boilerplate:

```bash
# from the repo root, not this backend/ folder
cp backend/.env.example backend/.env
```

Fill in a real `JWT_ACCESS_SECRET` in `backend/.env` (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). The `DATABASE_URL` in that file doesn't matter for Docker — `docker-compose.yml` overrides it to point at the `postgres` service.

```bash
docker compose up --build
```

This single command builds the image, starts Postgres, applies all pending Prisma migrations (via a one-shot `migrate` service that runs before `backend` is allowed to start), and starts the API on `http://localhost:3000`. It's safe to re-run — `migrate` just reports "no pending migrations" if the database is already up to date.

**Running more than one reused copy of this boilerplate at once?** Every copy defaults to host ports 5432 (Postgres) and 3000 (backend), which will collide with each other or with a local Postgres install. Copy the root `.env.example` to `.env` and set `POSTGRES_PORT` / `BACKEND_PORT` to free ports for that project (this root `.env` only affects host port mapping — it's separate from `backend/.env`).

## Project Structure

```
backend-boilerplate/
├── src/
│   ├── config/
│   │   └── prisma.ts          # Prisma Client configuration
│   ├── controllers/
│   │   ├── auth.controller.ts # Authentication controllers
│   │   └── user.controller.ts # User controllers
│   ├── middleware/
│   │   └── auth.middleware.ts # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.routes.ts     # Authentication routes
│   │   └── user.routes.ts     # User routes
│   ├── utils/
│   │   ├── jwt.ts             # JWT token utilities
│   │   └── password.ts        # Password hashing utilities
│   └── server.ts              # Application entry point
├── prisma/
│   ├── migrations/            # Database migrations
│   └── schema.prisma          # Prisma schema definition
├── dist/                      # Compiled JavaScript (generated)
├── .env                       # Environment variables (not in git)
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── package.json               # Project dependencies
├── prisma.config.ts           # Prisma configuration
└── tsconfig.json              # TypeScript configuration
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the project (compile TypeScript to JavaScript)
- `npm start` - Start production server (requires build first)
- `npm run migrate` - Run database migrations
- `npm run generate` - Generate Prisma Client
- `npm run prisma` - Run Prisma CLI

## API Documentation

### Base URL

```
http://localhost:3000/api
```

### Authentication Endpoints

#### Register User

Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-01-05T..."
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3..."
}
```

#### Login

Authenticate and get access token.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-01-05T..."
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3..."
}
```

#### Refresh Token

Exchange a refresh token for a new access/refresh pair. The old refresh token is deleted (rotation) — reusing it fails.

**Endpoint:** `POST /api/auth/refresh`

**Request Body:**
```json
{ "refreshToken": "a1b2c3..." }
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "d4e5f6..."
}
```

#### Logout

Revokes a refresh token (deletes it from the database).

**Endpoint:** `POST /api/auth/logout`

**Request Body:**
```json
{ "refreshToken": "a1b2c3..." }
```

#### Forgot Password

Requests a password reset. Always returns the same message regardless of whether the email is registered, to avoid leaking which emails exist. In development, the reset token is logged to the console (no email provider is wired up — see `src/utils/mailer.ts`).

**Endpoint:** `POST /api/auth/forgot-password`

**Request Body:**
```json
{ "email": "user@example.com" }
```

#### Reset Password

Resets the password using a valid, unexpired reset token, and revokes every existing session (refresh token) for that user.

**Endpoint:** `POST /api/auth/reset-password`

**Request Body:**
```json
{ "token": "reset-token-from-email", "password": "newpassword123" }
```

#### Get Current User

Get authenticated user's information.

**Endpoint:** `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-01-05T...",
    "updatedAt": "2025-01-05T..."
  }
}
```

### User Endpoints

#### Get All Users

Get list of all users (requires authentication).

**Endpoint:** `GET /api/users`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-01-05T...",
    "updatedAt": "2025-01-05T..."
  }
]
```

## Authentication

This API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header for protected routes:

```
Authorization: Bearer <your-token-here>
```

Access tokens expire after 15 minutes by default (configurable via `JWT_ACCESS_EXPIRES_IN`). When an access token expires, call `POST /api/auth/refresh` with the refresh token to get a new pair — the old refresh token is invalidated (rotation), so store the new one it returns. Refresh tokens expire after 30 days by default (`JWT_REFRESH_EXPIRES_IN_DAYS`).

## CORS Configuration

CORS is configured to allow cross-origin requests. Configure allowed origins in your `.env` file:

- **Development:** Set `CORS_ORIGIN=*` to allow all origins
- **Production:** Set `CORS_ORIGIN=https://yourdomain.com` to restrict to specific domains

For multiple origins:
```
CORS_ORIGIN=https://app.example.com,https://admin.example.com
```

## Dependencies

### Production Dependencies

- `@prisma/adapter-pg` - Prisma PostgreSQL adapter
- `@prisma/client` - Prisma Client for database access
- `bcryptjs` - Password hashing
- `cors` - CORS middleware
- `dotenv` - Environment variable management
- `express` - Web framework
- `jsonwebtoken` - JWT token generation and verification
- `pg` - PostgreSQL client

### Development Dependencies

- `@types/bcryptjs` - TypeScript types for bcryptjs
- `@types/cors` - TypeScript types for cors
- `@types/express` - TypeScript types for express
- `@types/jsonwebtoken` - TypeScript types for jsonwebtoken
- `@types/node` - TypeScript types for Node.js
- `@types/pg` - TypeScript types for pg
- `prisma` - Prisma CLI
- `ts-node-dev` - TypeScript development server with hot reload
- `typescript` - TypeScript compiler

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment name | `development` | No |
| `PORT` | Server port | `3000` | No |
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `JWT_ACCESS_SECRET` | Secret key for signing access tokens (min 16 chars) | - | Yes |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiration | `15m` | No |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | Refresh token lifetime, in days | `30` | No |
| `CORS_ORIGIN` | Allowed CORS origins | `*` | No |

All environment variables are validated at boot via Zod (`src/config/env.ts`) — the process exits immediately with a clear error if any required variable is missing or malformed.

## Database Schema

### User Model

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Production Deployment

**With Docker (recommended):** `docker compose up --build -d` from the repo root handles the build, migrations, and startup — see "Quick Start with Docker" above. Just make sure `backend/.env` has production values (strong `JWT_ACCESS_SECRET`, restricted `CORS_ORIGIN`) before deploying.

**Without Docker:**

### 1. Build the project

```bash
npm run build
```

### 2. Set production environment variables

Ensure your `.env` file has production values:
- Strong `JWT_ACCESS_SECRET`
- Production `DATABASE_URL`
- Restricted `CORS_ORIGIN`

### 3. Run migrations

```bash
npm run migrate
```

### 4. Start the server

```bash
npm start
```

## Troubleshooting

### Port Already in Use

If you get an error that port 3000 is already in use:

1. Change the `PORT` in your `.env` file
2. Or kill the process using the port:
   ```bash
   # Find process
   lsof -ti:3000
   
   # Kill process
   kill -9 <PID>
   ```

### Database Connection Error

- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env` is correct
- Ensure the database exists
- Verify user credentials

### Prisma Client Not Generated

If you see errors about Prisma Client:

```bash
npm run generate
```

### Migration Issues

If migrations fail:

```bash
# Check migration status
npx prisma migrate status

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### JWT Token Errors

- Ensure `JWT_ACCESS_SECRET` is set in `.env`
- Verify token is included in `Authorization` header
- Check the access token hasn't expired (15 min by default) — call `/api/auth/refresh` to get a new one
- Ensure header format: `Bearer <token>`

## Testing with Postman

### 1. Register a User

```
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123",
  "name": "Test User"
}
```

### 2. Login

```
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123"
}
```

### 3. Use Protected Routes

```
GET http://localhost:3000/api/users
Authorization: Bearer <your-token-here>
```

## License

MIT

## Author

Kunal Brahma

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

