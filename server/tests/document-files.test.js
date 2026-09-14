import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";

const pdf = Buffer.from("%PDF-1.7\nA document used only by the HTTP regression tests.\n%%EOF");
const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-document-tests-"));
// The real router is exercised with an in-process database transport. Never
// load workstation credentials or connect to a live database from these tests.
process.env.DOTENV_CONFIG_PATH = path.join(storageRoot, "nonexistent.env");
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/document_tests";
process.env.DATABASE_SSL = "false";
process.env.PDF_STORAGE_PATH = storageRoot;
const { pool } = await import("../db.js");
const { default: apiRoutes } = await import("../routes/apiRoutes.js");

let databaseQuery;
let transactionQuery;
let httpServer;
let baseUrl;
const documents = new Map();
const ownerId = "1c35c9f0-1b0c-4478-8dbf-222222222222";

before(async () => {
  pool.query = (sql, values) => databaseQuery(sql, values);
  pool.connect = async () => ({ query: (sql, values) => transactionQuery(sql, values), release() {} });
  const app = express();
  app.use((req, res, next) => {
    if (req.get("X-Test-User") !== "anonymous") {
      req.user = { id: req.get("X-Test-User") || ownerId, role: req.get("X-Test-Role") || "Requester", name: "Test requester" };
    }
    if (req.get("X-Test-Delete-Before-Send")) {
      const sendFile = res.sendFile.bind(res);
      res.sendFile = (filePath, callback) => {
        fs.unlink(filePath).then(() => sendFile(filePath, callback), callback);
        return res;
      };
    }
    if (req.get("X-Test-Fail-Response")) {
      const json = res.json.bind(res);
      res.json = (body) => {
        if (Array.isArray(body)) throw new Error("Simulated response failure");
        return json(body);
      };
    }
    next();
  });
  app.use("/api", apiRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: "Request failed." }));
  await new Promise((resolve) => { httpServer = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}/api`;
});

beforeEach(() => {
  documents.clear();
  databaseQuery = async (sql, values) => {
    assert.match(sql, /select d\.\* from request_documents/);
    assert.match(sql, /lr\.requester_id = \$2/);
    const document = documents.get(values[0]);
    const rows = document && values[1] === ownerId ? [document] : [];
    return { rows, rowCount: rows.length };
  };
  transactionQuery = async () => { throw new Error("Unexpected transaction"); };
});

after(async () => {
  if (httpServer) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  await pool.end();
  assert.ok(path.resolve(storageRoot).startsWith(`${path.resolve(os.tmpdir())}${path.sep}legal-document-tests-`));
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function documentFixture({ present = true, storagePath, name = "agreement.pdf", mimeType = "application/pdf" } = {}) {
  const id = crypto.randomUUID();
  const document = { id, storage_path: storagePath || `${id}.pdf`, file_name: name, mime_type: mimeType };
  if (present) await fs.writeFile(path.join(storageRoot, document.storage_path), pdf);
  documents.set(id, document);
  return { document, url: `${baseUrl}/documents/${id}/file` };
}

test("authorized PDF returns the stored bytes inline with private caching", async () => {
  const { url } = await documentFixture();
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="agreement.pdf"');
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
});

for (const role of ["Legal Manager", "Legal Reviewer"]) {
  test(`${role} can explicitly download the attached PDF`, async () => {
    const { url, document } = await documentFixture();
    databaseQuery = async (sql, values) => {
      assert.match(sql, /select d\.\* from request_documents/);
      assert.match(sql, /and true$/);
      assert.deepEqual(values, [document.id]);
      return { rows: [document], rowCount: 1 };
    };
    const response = await fetch(`${url}?download=1`, { headers: { "X-Test-Role": role } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="agreement.pdf"');
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  });
}

test("explicit downloads keep authentication and document access checks", async () => {
  const { url } = await documentFixture();
  const anonymous = await fetch(`${url}?download=1`, { headers: { "X-Test-User": "anonymous" } });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("content-disposition"), null);
  await anonymous.json();
  const inaccessible = await fetch(`${url}?download=1`, { headers: { "X-Test-User": crypto.randomUUID() } });
  assert.equal(inaccessible.status, 404);
  assert.equal(inaccessible.headers.get("content-disposition"), null);
  assert.equal((await inaccessible.json()).code, "DOCUMENT_NOT_FOUND");
});

test("international filenames are preserved in preview and download headers", async () => {
  const name = "اتفاقية البحث.pdf";
  const { url } = await documentFixture({ name });
  for (const download of [false, true]) {
    const response = await fetch(download ? `${url}?download=1` : url);
    assert.equal(response.status, 200);
    const disposition = response.headers.get("content-disposition");
    assert.ok(disposition.startsWith(download ? "attachment;" : "inline;"));
    assert.ok(disposition.includes(`filename*=UTF-8''${encodeURIComponent(name)}`));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  }
});

test("PDF byte ranges continue to work for PDF.js", async () => {
  const { url } = await documentFixture();
  const response = await fetch(url, { headers: { Range: "bytes=0-4" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 0-4/${pdf.length}`);
  assert.equal(await response.text(), "%PDF-");
});

test("Office documents retain attachment disposition", async () => {
  for (const [extension, mimeType] of [
    ["doc", "application/msword"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["xls", "application/vnd.ms-excel"],
    ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ]) {
    const name = `terms.${extension}`;
    const { url } = await documentFixture({ name, mimeType });
    for (const download of [false, true]) {
      const response = await fetch(download ? `${url}?download=1` : url);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), mimeType);
      assert.equal(response.headers.get("content-disposition"), `attachment; filename="${name}"`);
      await response.arrayBuffer();
    }
  }
});

test("missing stored bytes return a specific JSON code without revealing paths", async () => {
  const { url } = await documentFixture({ present: false });
  const response = await fetch(url);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await response.json(), { code: "DOCUMENT_FILE_MISSING", error: "The document is missing from server storage." });
});

test("a file removed between the access check and sendFile returns the same JSON error", async () => {
  const { url } = await documentFixture();
  const response = await fetch(url, { headers: { "X-Test-Delete-Before-Send": "true" } });
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("content-disposition"), null);
  assert.equal((await response.json()).code, "DOCUMENT_FILE_MISSING");
});

test("unknown and inaccessible documents have identical 404 responses", async () => {
  const { url } = await documentFixture();
  const inaccessible = await fetch(url, { headers: { "X-Test-User": crypto.randomUUID() } });
  const unknown = await fetch(`${baseUrl}/documents/${crypto.randomUUID()}/file`);
  assert.equal(inaccessible.status, 404);
  assert.equal(unknown.status, 404);
  const body = await inaccessible.json();
  assert.equal(body.code, "DOCUMENT_NOT_FOUND");
  assert.deepEqual(await unknown.json(), body);
});

test("document routes still require authentication", async () => {
  const { url } = await documentFixture();
  const response = await fetch(url, { headers: { "X-Test-User": "anonymous" } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Authentication required.");
});

test("storage traversal is rejected before sending any bytes", async () => {
  const { url } = await documentFixture({ present: false, storagePath: "../outside.pdf" });
  const response = await fetch(url);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Request failed." });
});

function uploadDatabase({ replacement = false, rejectTransaction = false } = {}) {
  const state = { committed: false, rolledBack: false, storedPath: null };
  const requestId = `LA-${new Date().getFullYear()}-00001`;
  databaseQuery = async (sql) => {
    if (sql.includes("nextval")) return { rows: [{ number: 1 }] };
    if (replacement && sql.startsWith("select * from legal_requests")) return { rows: [{ status: "Waiting for More Information" }] };
    if (sql.includes("select lr.*")) throw new Error("Simulated read failure after commit");
    throw new Error(`Unexpected query: ${sql}`);
  };
  transactionQuery = async (sql, values) => {
    if (sql === "begin") return {};
    if (sql === "commit") { state.committed = true; return {}; }
    if (sql === "rollback") { state.rolledBack = true; return {}; }
    if (sql.includes("insert into request_documents")) {
      state.storedPath = values[3];
      if (rejectTransaction) throw new Error("Simulated document insert failure");
      return { rows: [{ id: crypto.randomUUID() }] };
    }
    if (sql.includes("select id from departments")) return { rows: [{ id: "test-department" }] };
    if (sql.includes("select code from legal_categories")) return { rows: [{ code: "LEG-C" }] };
    if (sql.trimStart().startsWith("select") || sql.trimStart().startsWith("insert") || sql.trimStart().startsWith("update")) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected transaction query: ${sql}`);
  };
  const form = new FormData();
  form.set(replacement ? "files" : "attachment", new Blob([pdf], { type: "application/pdf" }), "agreement.pdf");
  form.set("metadata", JSON.stringify({ title: "Test agreement", description: "Test request", partyName: "Test party", priority: "Low", department: "Test department", categoryCode: "LEG-C" }));
  return { state, form, url: replacement ? `${baseUrl}/requests/${requestId}/documents` : `${baseUrl}/requests` };
}

test("a response read failure after request commit preserves the uploaded PDF", async () => {
  const { state, form, url } = uploadDatabase();
  const response = await fetch(url, { method: "POST", body: form });
  assert.equal(response.status, 500);
  await response.json();
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
  assert.deepEqual(await fs.readFile(path.join(storageRoot, state.storedPath)), pdf);
});

test("a response failure after replacement commit preserves the uploaded PDF", async () => {
  const { state, form, url } = uploadDatabase({ replacement: true });
  const response = await fetch(url, { method: "PATCH", body: form, headers: { "X-Test-Fail-Response": "true" } });
  assert.equal(response.status, 500);
  await response.json();
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
  assert.deepEqual(await fs.readFile(path.join(storageRoot, state.storedPath)), pdf);
});

for (const replacement of [false, true]) {
  test(`${replacement ? "replacement" : "new request"} rollback removes only its uncommitted upload`, async () => {
    const { state, form, url } = uploadDatabase({ replacement, rejectTransaction: true });
    const response = await fetch(url, { method: replacement ? "PATCH" : "POST", body: form });
    assert.equal(response.status, 500);
    await response.json();
    assert.equal(state.committed, false);
    assert.equal(state.rolledBack, true);
    await assert.rejects(fs.access(path.join(storageRoot, state.storedPath)), { code: "ENOENT" });
  });
}
