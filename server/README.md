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

The default model is `gemini-3.6-flash`, using the existing `generateContent` API. See [Google's generateContent API documentation](https://ai.google.dev/api/generate-content). An explicit `GEMINI_MODEL` setting overrides this default.

For Railway production, open the API application service's **Variables**, set `GEMINI_MODEL=gemini-3.6-flash`, and deploy the pending changes. Keep `GEMINI_API_KEY` configured and `USE_MOCK_AI_REVIEW=false` in that same service. The local `server/.env` file is not deployed to Railway; changing the code default does not override a model already set in Railway's Variables.

## Shared/LAN access

The API listens on `0.0.0.0:4000`. Other authorized users can open `http://SERVER_IP:4000` after the React production build exists. Only port 4000 needs to be reachable; PostgreSQL port 5432 should remain private to the server.
