# KU Legal Affairs deployment

## 1. Choose the host

For a pilot, one KU-managed Windows PC can host the API, PostgreSQL, and protected documents. For production, use a managed KU server or VM with a stable DNS name, monitoring, disk redundancy, and scheduled backups. If the host is offline, all users lose access.

The shared components are:

- PostgreSQL: workflow records, accounts, sessions, and audit history.
- `server/storage/pdfs`: the default central document repository (the environment variable name is retained for compatibility).
- Express on port 4000: the only service browsers should reach.

Do not expose PostgreSQL port 5432 to end users or the public internet.

## 2. Configure PostgreSQL and the API

From the repository root:

```powershell
cd server
Copy-Item .env.example .env
```

Edit `server/.env` and set at least:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/ku_legal_affairs
HOST=0.0.0.0
PORT=4000
PDF_STORAGE_PATH=./storage/pdfs
```

If your password contains URL-reserved characters, percent-encode it in `DATABASE_URL`. The PostgreSQL account must be allowed to create the database during first-time initialization. Alternatively, create `ku_legal_affairs` manually and run the initializer afterward.

Install and initialize:

```powershell
npm install
npm run db:init
```

For demonstration data only:

```powershell
npm run db:seed
```

Never commit `server/.env`. Replace demonstration passwords before connecting real users.

## 3. Development access

Start the API:

```powershell
cd server
npm run dev
```

In another PowerShell window, start the UI:

```powershell
cd Code
npm install
npm run dev
```

The local operator opens `http://localhost:5173`. A LAN user can open `http://SERVER_IP:5173` while both development processes are running. Development mode accepts LAN origins; do not use this relaxed mode as the permanent production setup.

## 4. Production or shared pilot

Build the React UI:

```powershell
cd Code
npm run build
```

The API automatically serves `Code/dist`, so only one address is needed. Configure `server/.env` with the final address:

```dotenv
NODE_ENV=production
PUBLIC_APP_URL=https://legal-affairs.ku.ac.ae
ALLOWED_ORIGINS=https://legal-affairs.ku.ac.ae
SECURE_COOKIES=true
```

Then run:

```powershell
cd server
npm start
```

Use an IT-managed reverse proxy (for example IIS or Nginx) and a KU TLS certificate in front of port 4000. HTTPS protects passwords, session cookies, request data, and PDFs in transit.

For a temporary HTTP-only LAN pilot, set `PUBLIC_APP_URL` and `ALLOWED_ORIGINS` to `http://SERVER_IP:4000` and set `SECURE_COOKIES=false`. Do not use HTTP for sensitive production data.

Allow inbound TCP port 4000 only on the required Domain/Private firewall profile, or expose only the reverse proxy's HTTPS port. Ask KU IT to use a stable hostname instead of relying on a changing workstation IP address.

For an approved LAN pilot, an administrator can create a scoped Windows Firewall rule from an elevated PowerShell window:

```powershell
New-NetFirewallRule -DisplayName "KU Legal Affairs API" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Domain,Private
```

Run the API as a managed Windows service under a dedicated, least-privilege service account for continuous availability. Do not rely on a user's open terminal for production.

## 5. Shared document storage

Every PDF, Word (`.doc/.docx`), or Excel (`.xls/.xlsx`) upload is stored on the host configured by `PDF_STORAGE_PATH`, with metadata and a SHA-256 digest in PostgreSQL. Users receive documents only through an authenticated API endpoint after a role/assignment check. PDFs can open in the review workspace; Office documents are downloaded for manual review.

For production, point `PDF_STORAGE_PATH` to a dedicated encrypted volume or a service-account-protected network share. The account running the Node server needs read/write access; ordinary users do not. Do not place uploaded documents in `Code/public` or OneDrive-synced frontend assets.

## 6. Backups and recovery

Back up these two resources as one recovery set:

1. PostgreSQL with `pg_dump`.
2. The entire directory configured by `PDF_STORAGE_PATH`.

A database-only backup leaves document records without files; a file-only backup loses permissions and workflow history. Schedule both, encrypt backup media, restrict access, and periodically test restoration on a separate host.

## 7. Email and password reset

Set the SMTP values in `server/.env` to send reset links:

```dotenv
SMTP_HOST=smtp.example.edu
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=service-account
SMTP_PASSWORD=CHANGE_ME
SMTP_FROM=KU Legal Affairs <legal-affairs@example.edu>
```

Without SMTP, development mode prints the reset link in the server console. Production should use an approved KU mail relay.

## 8. Optional AI provider

The default `USE_MOCK_AI_REVIEW=true` keeps PDFs on the KU host and generates a clearly labelled placeholder for the human-review workflow. It does not perform substantive document analysis.

Only after KU information-security and data-governance approval, configure the server-side provider:

```dotenv
USE_MOCK_AI_REVIEW=false
GEMINI_API_KEY=YOUR_SERVER_SIDE_KEY
GEMINI_MODEL=YOUR_APPROVED_MODEL
```

The browser never receives the provider key. The server sends only the claimed PDF and an isolated legal-review prompt, validates the JSON response, writes the checklist and suggestions to PostgreSQL, and still requires human Legal Affairs review.

## 9. Verification checklist

- `http://localhost:4000/api/health` reports `database: connected` on the host.
- Registration and login work without any browser database credentials.
- A requester sees only their requests.
- A reviewer sees only assigned requests and can open authorized PDFs.
- A department approver sees only assigned or same-department requests.
- Admin/Owner user-management actions are enforced by the API.
- Another device can open the HTTPS/LAN URL and sees the same records and authorized documents.
- PostgreSQL 5432 is not exposed to user devices.
- PostgreSQL and document-storage backups complete and can be restored together.
