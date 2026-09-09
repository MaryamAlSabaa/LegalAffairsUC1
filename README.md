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

Users never connect directly to PostgreSQL and cannot browse the document directory. The API checks their authenticated role before returning data or serving a PDF, Word, or Excel document. Legal Reviewers can access the global Legal Affairs portfolio for colleague coverage; requester and department access remains scoped.

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

to remove demo data:
cd server
npm run db:clear-demo

Open `http://localhost:5173`. The Vite development server forwards `/api` requests to the API on port 4000.

The optional seed command creates the six generic local demo accounts plus the KU Legal Affairs review team below. The development-only password is `password123` for every seeded account. Change or remove these accounts before any real deployment.

- Assignment manager: `graham.cowan@ku.ac.ae`
- Legal Reviewers: `omar.elkayal@ku.ac.ae`, `khalid.malali@ku.ac.ae`, `antigoni.filippopoulou@ku.ac.ae`, and `mohamed.almaazmi@ku.ac.ae`

New requests are not automatically assigned. Only Graham Cowan can add or change reviewer assignments, and a request may be assigned to multiple reviewers.

To populate the dashboards and request tables with clearly labelled temporary data, run `npm run db:seed-demo` in `server`. It creates IDs beginning with `DEMO-LA-` and dummy requester usernames beginning with `dummy.`. Remove only that demonstration dataset later with `npm run db:clear-demo`.

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
