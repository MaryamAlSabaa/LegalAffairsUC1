# KU Legal Affairs PostgreSQL server

This is the shared application backend. Browsers call this API; they never connect directly to PostgreSQL.

## First-time setup

1. Copy `.env.example` to `.env` and set the PostgreSQL password in `DATABASE_URL`.
2. Install dependencies with `npm install`.
3. Run `npm run db:init` to create/initialize the database.
4. Optional: run `npm run db:seed` for local demonstration accounts.
5. Run `npm run dev`.

PDFs are stored under `storage/pdfs` by default. Put this directory on a backed-up server disk for production. Do not put it inside the React `public` directory.

AI review defaults to a local, clearly labelled placeholder, so documents are not sent to an external provider. After institutional approval, set `USE_MOCK_AI_REVIEW=false` and configure `GEMINI_API_KEY` and `GEMINI_MODEL` to run the isolated PDF review from this server.

## Shared/LAN access

The API listens on `0.0.0.0:4000`. Other authorized users can open `http://SERVER_IP:4000` after the React production build exists. Only port 4000 needs to be reachable; PostgreSQL port 5432 should remain private to the server.
