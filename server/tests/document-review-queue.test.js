import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import * as XLSX from "xlsx";

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-review-queue-tests-"));
process.env.DOTENV_CONFIG_PATH = path.join(storageRoot, "nonexistent.env");
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/document_review_tests";
process.env.DATABASE_SSL = "false";
process.env.PDF_STORAGE_PATH = storageRoot;
process.env.USE_MOCK_AI_REVIEW = "false";
process.env.GEMINI_API_KEY = "test-key-never-sent";
const { pool } = await import("../db.js");
const { config } = await import("../config.js");
const { default: apiRoutes } = await import("../routes/apiRoutes.js");
const nativeFetch = globalThis.fetch;
const mime = { pdf: "application/pdf", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", doc: "application/msword" };
const pdfBytes = Buffer.from("%PDF-1.7\nRegression test PDF\n%%EOF");
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Term", "Content"], ["Liability", "Liability is unlimited"]]), "Terms");
const fileBytes = { pdf: pdfBytes, xlsx: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), xls: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "biff8" })) };
const ownerId = "requester-a";
const requestA = "LA-TEST-00001";
const requestB = "LA-TEST-00002";
const documentIds = { pdf: "11111111-1111-4111-8111-111111111111", xlsx: "22222222-2222-4222-8222-222222222222", foreign: "33333333-3333-4333-8333-333333333333", old: "44444444-4444-4444-8444-444444444444", word: "55555555-5555-4555-8555-555555555555", xls: "66666666-6666-4666-8666-666666666666" };
const result = (rows = []) => ({ rows, rowCount: rows.length });
let state;
let httpServer;
let baseUrl;
let queryCount;
let referenceReadCount;

const approvedReference = { id: "77777777-7777-4777-8777-777777777777", title: "Approved services template v2", text: "APPROVED_REFERENCE_EVIDENCE: Liability is capped at the annual fees.", approved: true };
const draftReference = { id: "88888888-8888-4888-8888-888888888888", title: "Unapproved draft", text: "UNAPPROVED_REFERENCE_EVIDENCE: This draft must not be used.", approved: false };

function requestRow(id, requester_id = ownerId) {
  return { id, requester_id, title: "Test matter", description: "Test scope", status: "AI Review Pending", category_code: "LEG-C", priority: "High", submitted_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

function queueJob(target, document, events = []) {
  let job = target.jobs.find((item) => item.document_id === document.id);
  if (job?.status === "processing") return null;
  if (!job) {
    job = { id: crypto.randomUUID(), request_id: document.request_id, document_id: document.id, created_at: "2026-01-01T00:00:00Z", queue_order: target.jobs.length + 1, operational_trace: [] };
    target.jobs.push(job);
  }
  job.status = "queued";
  job.operational_trace = [...(job.operational_trace || []), ...events];
  return job;
}

// The transport implements the selected SQL operations over fixtures, including
// transaction copies. HTTP assertions inspect saved documents, jobs, and results;
// no database or provider connection is ever opened.
async function databaseQuery(target, text, values = []) {
  queryCount += 1;
  const sql = text.replace(/\s+/g, " ").trim();
  if (sql.includes("nextval(")) return result([{ number: 3 }]);
  if (sql.startsWith("select 1 from legal_requests")) return result(target.requests.has(values[0]) ? [{ id: values[0] }] : []);
  if (sql.startsWith("select * from legal_requests")) {
    const request = target.requests.get(values[0]);
    return result(request?.requester_id === values[1] ? [request] : []);
  }
  if (sql.startsWith("select lr.*")) return result([...target.requests.values()]);
  if (sql.startsWith("select * from request_documents")) return result([...target.documents.values()]);
  if (sql.startsWith("select * from ai_review_jobs")) return result(target.jobs);
  if (sql.startsWith("select title,description,category_code")) return result([target.requests.get(values[0])]);
  if (sql.startsWith("select review_references from legal_requests")) {
    referenceReadCount += 1;
    return result(target.requests.has(values[0]) ? [{ review_references: target.requests.get(values[0]).review_references }] : []);
  }
  if (sql.startsWith("with recent_cases as materialized")) return result();
  if (sql.startsWith("select id,criteria from legal_review_criteria")) return result([{ id: "criterion-1", criteria: "Liability" }]);
  if (sql.startsWith("select code,name from legal_categories")) return result([{ code: "LEG-C", name: "Contract" }]);
  if (sql.startsWith("select id from departments")) return result([{ id: "department-1" }]);
  if (sql.startsWith("select code from legal_categories")) return result([{ code: "LEG-C" }]);
  if (sql.startsWith("select is_running")) return result([{ is_running: true }]);

  if (sql.startsWith("insert into legal_requests")) {
    target.requests.set(values[0], { ...requestRow(values[0], values[5]), title: values[1], status: values[12], ai_summary: values[14] });
    return result();
  }
  if (sql.startsWith("insert into request_documents")) {
    const document = { id: crypto.randomUUID(), request_id: values[0], file_name: values[1], mime_type: values[2], storage_path: values[3], is_current: true };
    target.documents.set(document.id, document);
    return result([{ id: document.id }]);
  }
  if (sql.startsWith("insert into ai_review_jobs")) {
    if (sql.includes("select request_id,id")) {
      const selected = [...target.documents.values()].filter((document) => document.request_id === values[0]
        && (!sql.includes("is_current=true") || document.is_current)
        && sql.includes(`'${document.mime_type}'`)
        && (!sql.includes("id=$2") || !values[1] || document.id === values[1]));
      return result(selected.map((document) => queueJob(target, document, values[2] ? JSON.parse(values[2]) : [])).filter(Boolean).map((job) => ({ id: job.id })));
    }
    return result([queueJob(target, target.documents.get(values[1]), values[3] ? JSON.parse(values[3]) : [])]);
  }
  if (sql.startsWith("select j.*")) {
    const candidates = target.jobs.filter((job) => {
      const document = target.documents.get(job.document_id);
      const request = target.requests.get(job.request_id);
      return job.status === "queued" && document && request
        && (!sql.includes("d.is_current=true") || document.is_current)
        && sql.includes(`'${document.mime_type}'`)
        && (!sql.includes("lr.requester_id=$2") || values[0] !== "Requester" || request.requester_id === values[1])
        && (!sql.includes("j.request_id=$3") || !values[2] || job.request_id === values[2])
        && (!sql.includes("j.document_id=$4") || !values[3] || job.document_id === values[3]);
    });
    const selected = candidates[0];
    return result(selected ? [{ ...target.documents.get(selected.document_id), ...selected }] : []);
  }
  if (sql.startsWith("update ai_review_jobs")) {
    const failed = sql.includes("set status='failed'");
    const job = target.jobs.find((item) => item.id === values[failed ? 2 : 1]);
    if (job) {
      job.status = failed ? "failed" : sql.includes("set status='completed'") ? "completed" : "processing";
      job.operational_trace = [...(job.operational_trace || []), ...JSON.parse(values[failed ? 1 : 0] || "[]")];
    }
    return result();
  }
  if (sql.startsWith("update request_documents set ai_review_result")) {
    target.documents.get(values[1]).ai_review_result = JSON.parse(values[0]);
    return result();
  }
  if (sql.startsWith("insert into request_checklist_items")) {
    target.checklist.push({ requestId: values[0], documentId: values[1], checked: values[4], note: values[5] });
    return result();
  }
  if (sql.startsWith("select id from request_documents")) return result([...target.documents.values()].filter((document) => document.request_id === values[0] && document.is_current).slice(0, 1));
  if (sql.startsWith("update request_documents set is_current")) {
    for (const document of target.documents.values()) if (document.request_id === values[0]) document.is_current = false;
    return result();
  }
  if (sql.startsWith("update legal_requests")) {
    if (sql.includes("previous_document_id=")) {
      target.requests.get(values[3]).status = values[2] ? "AI Review Pending" : "New";
    } else if (sql.includes("ai_summary=$2")) {
      const request = target.requests.get(values[3]);
      request.ai_review_result = JSON.parse(values[2]);
      if (["New", "AI Review Pending", "AI Review Failed", "AI Review Complete", "Assigned to Legal Reviewer"].includes(request.status)) request.status = "AI Review Complete";
    } else if (sql.includes("AI Review Failed")) {
      const request = target.requests.get(values[0]);
      const guarded = sql.includes("status in (") || sql.includes("status not in (");
      if (!guarded || ["New", "AI Review Pending", "AI Review Failed", "AI Review Complete", "Assigned to Legal Reviewer"].includes(request.status)) request.status = "AI Review Failed";
    } else throw new Error(`Unexpected request update: ${sql}`);
    return result();
  }
  if (/^(insert into (audit_logs|ai_engine_events|document_ai_suggestions)|delete from document_ai_suggestions)/.test(sql)) return result();
  if (sql.startsWith("select") && /from (users|legal_review_criteria|request_reviewer_assignments|audit_logs|reviewer_comments|request_checklist_items|document_ai_suggestions|legal_requests lr)/.test(sql)) return result();
  throw new Error(`Unexpected query: ${sql}`);
}

before(async () => {
  pool.query = (sql, values) => databaseQuery(state, sql, values);
  pool.connect = async () => {
    let pending;
    return { async query(sql, values) {
      if (sql === "begin") { pending = structuredClone(state); return result(); }
      if (sql === "commit") { state = pending; return result(); }
      if (sql === "rollback") return result();
      return databaseQuery(pending, sql, values);
    }, release() {} };
  };
  globalThis.fetch = async () => { throw new Error("External provider calls are forbidden in route tests"); };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.get("X-Test-Role") !== "anonymous") req.user = { id: ownerId, role: req.get("X-Test-Role") || "Legal Reviewer", name: "Test user" };
    next();
  });
  app.use("/api", apiRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  await new Promise((resolve) => { httpServer = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}/api`;
});

beforeEach(async () => {
  config.useMockAiReview = false;
  globalThis.fetch = async () => { throw new Error("External provider calls are forbidden in route tests"); };
  queryCount = 0;
  referenceReadCount = 0;
  state = { requests: new Map([[requestA, requestRow(requestA)], [requestB, requestRow(requestB, "requester-b")]]), documents: new Map(), jobs: [], checklist: [] };
  for (const [key, id] of Object.entries(documentIds)) {
    const extension = key === "pdf" ? "pdf" : key === "xls" ? "xls" : key === "word" ? "doc" : "xlsx";
    const storagePath = `${id}.${extension}`;
    await fs.writeFile(path.join(storageRoot, storagePath), fileBytes[extension] || Buffer.from("Word fixture"));
    state.documents.set(id, { id, request_id: key === "foreign" ? requestB : requestA, file_name: `${key}.${extension}`, mime_type: mime[extension], storage_path: storagePath, is_current: key !== "old" });
  }
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  await pool.end();
  assert.equal(path.dirname(path.resolve(storageRoot)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(storageRoot).startsWith("legal-review-queue-tests-"));
  await fs.rm(storageRoot, { recursive: true, force: true });
});

async function post(endpoint, body, role = "Legal Reviewer") {
  return nativeFetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Role": role }, body: JSON.stringify(body) });
}

function recordGeminiRequests({ failures = 0 } = {}) {
  const prompts = [];
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
    const request = JSON.parse(options.body);
    prompts.push(request.contents[0].parts[0].text);
    if (failures > 0) {
      failures -= 1;
      return new Response("Temporary provider failure", { status: 503 });
    }
    const review = {
      request_category: "LEG-C", document_summary: "A services agreement with a liability clause.",
      draft_response: "Please confirm the liability provisions.", draft_review_note: "Review the liability provisions.",
      template_comparisons: [
        { template_id: approvedReference.id, template_name: approvedReference.title, match_score: 0.4, deviations: ["Liability differs."] },
        { template_id: draftReference.id, template_name: draftReference.title, match_score: 0.7, deviations: ["Unapproved assertion."] },
      ],
      related_precedents: [{ source_id: "invented-case", title: "Unverified old matter" }],
      review_checklist: [{ criteria: "Liability", checked: false, page: "N/A", note: "Review manually." }],
    };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }] }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  return prompts;
}

for (const extension of ["xlsx", "xls", "pdf"]) {
  test(`uploading ${extension} stores the attachment and queues its own AI review`, async () => {
    const form = new FormData();
    form.set("attachment", new Blob([fileBytes[extension]], { type: mime[extension] }), `agreement.${extension}`);
    form.set("metadata", JSON.stringify({ title: "Agreement", description: "Review scope", partyName: "Party", priority: "Low", department: "Test", categoryCode: "LEG-C" }));
    const response = await nativeFetch(`${baseUrl}/requests`, { method: "POST", headers: { "X-Test-Role": "Requester" }, body: form });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const saved = await response.json();
    assert.equal(saved.status, "AI Review Pending");
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0].document_id, saved.documents[0].id);
    const stored = state.documents.get(saved.documents[0].id);
    assert.equal(stored.mime_type, mime[extension]);
    assert.deepEqual(await fs.readFile(path.join(storageRoot, stored.storage_path)), fileBytes[extension]);
  });
}

test("replacement Excel files become current and start their own review", async () => {
  state.requests.get(requestA).status = "Waiting for More Information";
  const form = new FormData();
  form.set("files", new Blob([fileBytes.xlsx], { type: mime.xlsx }), "revised.xlsx");
  form.set("metadata", JSON.stringify({ removeDocumentIds: [] }));
  const response = await nativeFetch(`${baseUrl}/requests/${requestA}/documents`, { method: "PATCH", headers: { "X-Test-Role": "Requester" }, body: form });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const [documentId] = await response.json();
  assert.equal(state.documents.get(documentId).is_current, true);
  assert.equal(state.documents.get(documentIds.xlsx).is_current, false);
  assert.equal(state.jobs[0].document_id, documentId);
  assert.equal(state.requests.get(requestA).status, "AI Review Pending");
});

test("queue-review selects only the requested current attachment", async () => {
  const response = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { queued: 1 });
  assert.deepEqual(state.jobs.map((job) => job.document_id), [documentIds.xlsx]);
});

test("queue-review without a selection retains whole-request PDF and Excel queueing", async () => {
  const response = await post(`/requests/${requestA}/queue-review`, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { queued: 3 });
  assert.deepEqual(state.jobs.map((job) => job.document_id).sort(), [documentIds.pdf, documentIds.xlsx, documentIds.xls].sort());
});

test("queue-review does not replace a selected job already processing", async () => {
  state.requests.get(requestA).review_references = [structuredClone(approvedReference)];
  const originalTrace = [{ step: "queued", reviewOptions: { useApprovedTemplates: false } }, { step: "processing" }];
  queueJob(state, state.documents.get(documentIds.xlsx), originalTrace).status = "processing";
  const response = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx, useApprovedTemplates: true });
  assert.equal(response.status, 409);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].status, "processing");
  assert.deepEqual(state.jobs[0].operational_trace, originalTrace);
});

test("default review excludes saved templates without deleting them or requiring source validation", async () => {
  const references = [structuredClone(approvedReference), structuredClone(draftReference)];
  state.requests.get(requestA).review_references = references;
  const prompts = recordGeminiRequests();
  const queued = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx });
  assert.equal(queued.status, 200);
  assert.equal(referenceReadCount, 0);
  assert.equal(state.jobs[0].operational_trace.at(-1).reviewOptions.useApprovedTemplates, false);
  const response = await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(prompts.length, 1);
  assert.doesNotMatch(prompts[0], /APPROVED_REFERENCE_EVIDENCE|UNAPPROVED_REFERENCE_EVIDENCE/);
  const saved = state.documents.get(documentIds.xlsx).ai_review_result;
  assert.deepEqual(saved.template_comparisons, []);
  assert.deepEqual(saved.reference_sources, []);
  assert.deepEqual(saved.related_precedents, []);
  assert.deepEqual(saved.review_basis, {
    mode: "gemini_general_knowledge", template_count: 0, past_case_count: 0,
    template_comparison_status: "not_provided", past_case_status: "not_available",
  });
  assert.deepEqual(state.requests.get(requestA).review_references, references);
  assert.equal(state.jobs[0].operational_trace.findLast((event) => event.step === "queued").reviewOptions.useApprovedTemplates, false);
});

test("explicit template comparison includes only approved sources and preserves all saved references", async () => {
  const references = [structuredClone(approvedReference), structuredClone(draftReference)];
  state.requests.get(requestA).review_references = references;
  const prompts = recordGeminiRequests();
  const queued = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx, useApprovedTemplates: true });
  assert.equal(queued.status, 200);
  assert.equal(referenceReadCount, 1);
  const response = await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.match(prompts[0], /APPROVED_REFERENCE_EVIDENCE/);
  assert.doesNotMatch(prompts[0], /UNAPPROVED_REFERENCE_EVIDENCE/);
  const saved = state.documents.get(documentIds.xlsx).ai_review_result;
  assert.equal(saved.template_comparisons.length, 1);
  assert.equal(saved.template_comparisons[0].template_name, approvedReference.title);
  assert.deepEqual(saved.reference_sources.map((source) => source.id), [approvedReference.id]);
  assert.deepEqual(saved.review_basis, {
    mode: "gemini_general_knowledge", template_count: 1, past_case_count: 0,
    template_comparison_status: "available", past_case_status: "not_available",
  });
  assert.deepEqual(state.requests.get(requestA).review_references, references);
  assert.equal(state.jobs[0].operational_trace.findLast((event) => event.step === "queued").reviewOptions.useApprovedTemplates, true);
});

test("template comparison requires an actual complete approved reference but default analysis does not", async () => {
  for (const references of [[], [draftReference], [{ ...approvedReference, title: " " }], [{ ...approvedReference, text: " " }]]) {
    state.requests.get(requestA).review_references = structuredClone(references);
    const response = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx, useApprovedTemplates: true });
    assert.equal(response.status, 400);
    assert.deepEqual(state.jobs, []);
    assert.deepEqual(state.requests.get(requestA).review_references, references);
  }
  const general = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx, useApprovedTemplates: false });
  assert.equal(general.status, 200);
});

for (const value of ["true", "false", "", 0, 1, [], {}]) {
  test(`queue-review rejects invalid template flag ${JSON.stringify(value)} before querying`, async () => {
    const response = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx, useApprovedTemplates: value });
    assert.equal(response.status, 400);
    assert.equal(queryCount, 0);
    assert.deepEqual(state.jobs, []);
  });
}

test("approved-template choice survives failed processing and an explicitly requested retry", async () => {
  state.requests.get(requestA).review_references = [structuredClone(approvedReference)];
  const prompts = recordGeminiRequests({ failures: 1 });
  const options = { documentId: documentIds.xlsx, useApprovedTemplates: true };
  assert.equal((await post(`/requests/${requestA}/queue-review`, options)).status, 200);
  const failed = await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx });
  assert.equal(failed.status, 502);
  assert.equal(state.jobs[0].status, "failed");
  assert.equal(state.jobs[0].operational_trace.findLast((event) => event.step === "queued").reviewOptions.useApprovedTemplates, true);
  assert.equal((await post(`/requests/${requestA}/queue-review`, options)).status, 200);
  assert.equal((await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx })).status, 200);
  assert.equal(state.jobs[0].status, "completed");
  assert.equal(prompts.length, 2);
  assert.ok(prompts.every((prompt) => prompt.includes(approvedReference.text)));
  assert.equal(state.jobs[0].operational_trace.filter((event) => event.step === "queued").length, 2);
});

test("a later default run replaces the earlier template option without changing saved sources", async () => {
  state.requests.get(requestA).review_references = [structuredClone(approvedReference)];
  const prompts = recordGeminiRequests();
  assert.equal((await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx, useApprovedTemplates: true })).status, 200);
  assert.equal((await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx })).status, 200);
  assert.equal((await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx })).status, 200);
  assert.equal((await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx })).status, 200);
  assert.match(prompts[0], /APPROVED_REFERENCE_EVIDENCE/);
  assert.doesNotMatch(prompts[1], /APPROVED_REFERENCE_EVIDENCE/);
  assert.deepEqual(state.jobs[0].operational_trace.filter((event) => event.step === "queued").map((event) => event.reviewOptions.useApprovedTemplates), [true, false]);
  assert.deepEqual(state.requests.get(requestA).review_references, [approvedReference]);
  assert.deepEqual(state.documents.get(documentIds.xlsx).ai_review_result.template_comparisons, []);
  assert.equal(state.documents.get(documentIds.xlsx).ai_review_result.review_basis.template_comparison_status, "not_provided");
});

for (const key of ["foreign", "old", "word"]) {
  test(`queue-review rejects a ${key} attachment without queueing another file`, async () => {
    const response = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds[key] });
    assert.equal(response.status, 409);
    await response.json();
    assert.deepEqual(state.jobs, []);
  });
}

for (const endpoint of [`/requests/${requestA}/queue-review`, "/ai/process-next"]) {
  for (const documentId of ["not-a-uuid", "", 0, false, { id: documentIds.xlsx }]) {
    test(`${endpoint} rejects invalid document id ${JSON.stringify(documentId)} before querying`, async () => {
      const response = await post(endpoint, { requestId: requestA, documentId });
      assert.equal(response.status, 400);
      await response.json();
      assert.equal(queryCount, 0);
    });
  }
}

test("document-specific processing requires a request identifier", async () => {
  const response = await post("/ai/process-next", { documentId: documentIds.xlsx });
  assert.equal(response.status, 400);
  assert.equal(queryCount, 0);
});

for (const role of ["Requester", "Department Approver", "Admin User", "Owner", "anonymous"]) {
  test(`${role} cannot explicitly queue internal document analysis`, async () => {
    const response = await post(`/requests/${requestA}/queue-review`, { documentId: documentIds.xlsx }, role);
    assert.equal(response.status, role === "anonymous" ? 401 : 403);
    assert.equal(queryCount, 0);
  });
}
for (const role of ["Department Approver", "anonymous"]) {
  test(`${role} cannot invoke document processing`, async () => {
    const response = await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx }, role);
    assert.equal(response.status, role === "anonymous" ? 401 : 403);
    assert.equal(queryCount, 0);
  });
}

for (const key of ["xlsx", "xls", "pdf"]) {
  test(`process-next reviews only selected ${key} and saves results against that document`, async () => {
    config.useMockAiReview = true;
    for (const document of state.documents.values()) queueJob(state, document);
    const response = await post("/ai/process-next", { requestId: requestA, documentId: documentIds[key] });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const saved = await response.json();
    assert.equal(saved.processed, true);
    assert.equal(saved.requestId, requestA);
    assert.equal(saved.aiMode, "mock");
    assert.deepEqual(state.jobs.filter((job) => job.status === "completed").map((job) => job.document_id), [documentIds[key]]);
    assert.deepEqual([...state.documents.values()].filter((document) => document.ai_review_result).map((document) => document.id), [documentIds[key]]);
    assert.deepEqual(state.checklist.map((item) => item.documentId), [documentIds[key]]);
    if (key !== "pdf") assert.ok(state.documents.get(documentIds[key]).ai_review_result.review_scope);
  });
}

for (const key of ["foreign", "old", "word"]) {
  test(`process-next cannot fall back to another job for a ${key} selection`, async () => {
    config.useMockAiReview = true;
    for (const document of state.documents.values()) queueJob(state, document);
    const response = await post("/ai/process-next", { requestId: requestA, documentId: documentIds[key] });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).processed, false);
    assert.ok(state.jobs.every((job) => job.status === "queued"));
  });
}

test("a requester cannot process another request's selected attachment", async () => {
  config.useMockAiReview = true;
  for (const document of state.documents.values()) queueJob(state, document);
  const response = await post("/ai/process-next", { requestId: requestB, documentId: documentIds.foreign }, "Requester");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).processed, false);
  assert.ok(state.jobs.every((job) => job.status === "queued"));
});

test("a failed workbook review does not reopen a closed legal matter", async () => {
  config.useMockAiReview = true;
  state.requests.get(requestA).status = "Closed";
  queueJob(state, state.documents.get(documentIds.xlsx));
  await fs.writeFile(path.join(storageRoot, state.documents.get(documentIds.xlsx).storage_path), "broken workbook");
  const response = await post("/ai/process-next", { requestId: requestA, documentId: documentIds.xlsx });
  assert.equal(response.status, 422);
  await response.json();
  assert.equal(state.jobs[0].status, "failed");
  assert.equal(state.requests.get(requestA).status, "Closed");
});
