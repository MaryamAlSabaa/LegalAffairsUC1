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

## Internal AI review and requester responses

Legal Reviewers and Legal Managers have an Internal legal review workspace on request details. Draft classifications, summaries, clauses, risks, checklists, template comparisons, review notes and first-draft responses are restricted in both the API and UI. Other roles do not receive internal AI fields, including document-level and previous review results.

For existing databases, apply `server/db/review-workflow.sql` before starting the updated server (the changes are also included in `npm run db:init`). The local database migration was applied during development.

To perform actual analysis, configure `GEMINI_API_KEY` and set `USE_MOCK_AI_REVIEW=false` in `server/.env` or the deployed API service's environment, then restart the backend. `Code/.env` configures the frontend only. The backend loads `server/.env` regardless of its launch directory; existing process environment variables take precedence, and `DOTENV_CONFIG_PATH` can select a different file. Changes to `.env` require a backend restart even when using `npm run dev`. Review supports PDFs; Office attachments remain available for manual review. Mock mode does not perform legal analysis, and Run AI review reports configuration requirements instead of presenting mock output as real analysis.

Under Approved templates for comparison, legal staff can supply up to five approved template texts with title/version and explicitly confirm their approval. These references are scoped to the request and passed to Gemini with request context and the available classification categories. No template comparison is claimed without supplied reference content. Classification is a suggestion and does not overwrite the submitted category. Each PDF result is retained separately. There is no automatically populated institutional template or precedent library.

Legal staff edit the Response to requester draft preview, confirm the exact text, and choose Confirm and share response. Only that text becomes requester-visible; internal findings are never automatically published. Sharing stores an immutable publication record, updates the displayed response, creates an audit entry and an in-app notification. Subsequent AI reviews do not change the previously shared response. No email is sent by this sharing action.

Validation: `node --test server/tests/review-workflow.test.js`, `npm run check` in server, and `npm run build` in Code.
