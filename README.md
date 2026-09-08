# KU Legal Affairs Platform

A shared legal-matter workflow for Khalifa University. The React interface connects to a dedicated Express API, a standard PostgreSQL database, and a central protected document repository.

## Architecture

```text
KU user browser
      |
      | HTTP(S), port 4000
      v
Express API + built React UI
      |--------------------|
      v                    v
PostgreSQL           Central document folder
```

Users never connect directly to PostgreSQL and cannot browse the document directory. The API checks their authenticated role and request assignment before returning data or serving a PDF, Word, or Excel document.

## Run locally for development

Open PowerShell window 1:

```powershell
cd server
Copy-Item .env.example .env
# Edit .env and replace CHANGE_ME with your PostgreSQL password.
npm install
npm run db:init
npm run db:seed
npm run dev
```

Open PowerShell window 2:

```powershell
cd Code
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite development server forwards `/api` requests to the API on port 4000.

The optional seed command creates six local demo accounts. Their usernames are `requester`, `reviewer`, `manager`, `approver`, `admin`, and `owner`; the development-only password is `password123`. Change or remove these accounts before any real deployment.

## Make it usable by other users

Build the UI once, then serve the UI and API from the same PC/server:

```powershell
cd Code
npm run build
cd ..\server
npm start
```

Other authorized users can then open `http://SERVER_IP:4000`. The host PC must remain powered on and connected, and Windows Firewall must permit inbound TCP port 4000 on the appropriate KU network profile. Keep PostgreSQL port 5432 private; browser users need only port 4000.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for secure network configuration, HTTPS, backups, and production operation.
