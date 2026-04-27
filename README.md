# Full Stack Internship Demo — Config Driven App Generator

This repository implements a **mini app generator runtime** that reads JSON config and dynamically renders:
- frontend UI (forms, table, dashboard),
- backend CRUD APIs,
- PostgreSQL table structure,
- authentication and user-scoped data.

## Tech Stack
- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **DB:** PostgreSQL
- **Validation:** Zod
- **Auth:** JWT (email/password + guest login)

## Implemented Mandatory Feature Set (3+ integrated)
1. **Multi-language localization** (EN/ES switch from runtime config)
2. **CSV import system** (paste/upload CSV text → map by config labels → store)
3. **Event notifications + email mock** (record events + mock transactional email logs)
4. **Responsive UI / mobile-ready layout**
5. **Multiple login methods** (email/password + guest)

## How the dynamic runtime works
1. `config/app-config.json` defines entities, fields, views, auth methods, localization, notification events.
2. Backend validates and tolerates incomplete config with defaults.
3. On startup, backend creates/updates entity tables (`entity_<name>`) with typed columns + JSONB `data` for mismatch tolerance.
4. Backend mounts generic endpoints:
   - `GET /api/metadata`
   - `GET/POST/PUT/DELETE /api/:entity`
   - `POST /api/:entity/import-csv`
5. Frontend loads metadata at runtime and renders entity form/table/dashboard dynamically.

## Run locally

### 1) Start database
```bash
docker compose up -d
```

### 2) Install dependencies
```bash
npm run install:all
```

### 3) Configure backend env
```bash
cp .env.example backend/.env
```

### 4) Start backend and frontend
```bash
npm run dev -w backend
npm run dev -w frontend
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

## Deployment guide (mandatory submission requirement)
- **Backend deploy (Render/Railway/Fly):**
  - build: `npm ci && npm run build -w backend`
  - start: `npm run start -w backend`
  - set env: `DATABASE_URL`, `JWT_SECRET`, `PORT`
- **Frontend deploy (Vercel/Netlify):**
  - build: `npm run build -w frontend`
  - output: `frontend/dist`
  - env: `VITE_API_URL=<deployed-backend-url>`

## Edge-case handling
- Unknown/missing field types fallback to string.
- Unknown component types can be ignored/fallback without crash.
- Optional fields are nullable in DB and optional in validation.
- Invalid CSV rows are skipped while valid rows import.
- User-scoped records are filtered by JWT user identity.

## Submission checklist
- [ ] Live URL (frontend + backend)
- [ ] GitHub repository URL
- [ ] Loom video 5-10 mins showing architecture, edge cases, and trade-offs
