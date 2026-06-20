# GDE TORT Platform

Production-style rewrite of the original single-file invoice generator.

## Stack

- Backend: NestJS, MongoDB, Mongoose, JWT auth
- Frontend: Next.js, React, browser print/PDF
- Storage: MongoDB replaces localStorage and Google Drive JSON files

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start MongoDB:

   ```bash
   docker compose up -d mongo
   ```

3. Copy environment files:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

4. Start the backend and frontend in separate terminals:

   ```bash
   npm run dev:api
   npm run dev:web
   ```

Default seeded admin from `apps/api/.env.example`:

- Email: `admin@gdetort.local`
- Password: `ChangeMe123!`

Change these before real deployment.

## Docker Setup

Copy the Docker environment template and adjust secrets if needed:

```bash
cp .env.docker.example .env
```

Start the full stack:

```bash
npm run docker:up
```

Docker services:

- Web: `http://localhost:3000`
- API: `http://localhost:4010/api`
- MongoDB: `localhost:27017`

Default Docker login uses the values from `.env`:

- Email: `admin@gdetort.local`
- Password: `ChangeMe123!`

Stop the stack:

```bash
npm run docker:down
```

If you change `API_PORT`, also set `NEXT_PUBLIC_API_URL` before rebuilding the web image because browser-facing Next.js public env values are compiled into the client bundle.
