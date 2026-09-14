import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import express from "express";

// Exercise the real request routes without workstation credentials or a live DB.
process.env.DOTENV_CONFIG_PATH = path.join(os.tmpdir(), `workflow-${crypto.randomUUID()}.env`);
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/workflow_tests";
process.env.DATABASE_SSL = "false";
const { pool } = await import("../db.js");
const { default: apiRoutes } = await import("../routes/apiRoutes.js");
const { listRequests } = await import("../services/requestService.js");

const actor = { id: "test-reviewer", role: "Legal Reviewer", name: "Test reviewer" };
const requestId = "LA-TEST-00001";
let state;
let rejectAudit;
let httpServer;
let baseUrl;
const result = (rows = []) => ({ rows, rowCount: rows.length });

function appendAudit(target, values) {
  const [request_id, action, actor_id, actor_name] = values;
  target.audit.push({ request_id, action, actor_id, actor_name, id: target.audit.length + 1, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, target.audit.length)) });
  return result();
}

before(async () => {
  pool.query = async (sql, values = []) => {
    if (sql.includes("select lr.*")) return result([state.request]);
    if (sql.startsWith("select 1 from legal_requests")) return result(values[0] === requestId ? [{ id: requestId }] : []);
    if (sql.includes("from reviewer_comments")) return result(state.comments);
    if (sql.includes("from audit_logs")) {
      let audit = state.audit.filter((entry) => values[0].includes(entry.request_id));
      if (sql.includes("action=any($2::text[])")) {
        assert.match(sql, /or action like any\(\$3::text\[\]\)/);
        const [, actions, patterns] = values;
        audit = audit.filter((entry) => actions.includes(entry.action) || patterns.some((pattern) => entry.action.startsWith(pattern.slice(0, -1))));
      }
      return result(audit.slice(-1));
    }
    if (sql.startsWith("insert into audit_logs")) return appendAudit(state, values);
    if (/from (request_documents|request_checklist_items|document_ai_suggestions|reviewer_comments|ai_review_jobs|request_reviewer_assignments)/.test(sql)) return result();
    throw new Error(`Unexpected query: ${sql}`);
  };
  pool.connect = async () => {
    let pending;
    return {
      async query(sql, values = []) {
        if (sql === "begin") { pending = structuredClone(state); return result(); }
        if (sql === "commit") { state = pending; return result(); }
        if (sql === "rollback") return result();
        if (sql.trimStart().startsWith("update legal_requests")) {
          pending.request.status = sql.includes("set status=$1") ? values[0] : values[1];
          if (sql.includes("set manager_decision=$1")) pending.request.manager_decision = values[0];
          if (sql.includes("set department_decision=$1")) pending.request.department_decision = values[0];
          return result([{ id: requestId }]);
        }
        if (sql.startsWith("insert into audit_logs")) {
          if (rejectAudit) throw new Error("Simulated workflow history failure");
          return appendAudit(pending, values);
        }
        if (sql.startsWith("insert into reviewer_comments")) {
          pending.comments.push({ request_id: values[0], reviewer_id: values[1], comment_text: values[2], author_name: actor.name, author_role: actor.role, created_at: "2026-01-01T00:00:00Z" });
          return result();
        }
        if (/^insert into (manager_actions|department_approvals)/.test(sql)) return result();
        if (sql.includes("select lr.id,lr.title")) return result();
        throw new Error(`Unexpected transaction query: ${sql}`);
      },
      release() {},
    };
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { ...actor, role: req.get("X-Test-Role") || actor.role, departmentId: "test-department" };
    next();
  });
  app.use("/api", apiRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: "Request failed." }));
  await new Promise((resolve) => { httpServer = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}/api`;
});

beforeEach(() => {
  rejectAudit = false;
  state = {
    request: { id: requestId, status: "Assigned to Legal Reviewer", submitted_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    audit: [],
    comments: [],
  };
});

after(async () => {
  await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

async function post(endpoint, body, role = actor.role) {
  return fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Role": role }, body: JSON.stringify(body) });
}

const workflows = [
  { endpoint: "route", body: { destination: "requester", commentText: "Please clarify" }, role: "Legal Reviewer", status: "Waiting for More Information", action: "Sent request to Requester: Please clarify" },
  { endpoint: "route", body: { destination: "legal_manager", commentText: "Ready for approval" }, role: "Legal Reviewer", status: "Sent for Internal Approval", action: "Sent request to Legal Manager: Ready for approval" },
  { endpoint: "route", body: { destination: "department_approver", commentText: "Confirm scope" }, role: "Legal Reviewer", status: "Under Review", action: "Sent request to Department Approver: Confirm scope" },
  ...[
    ["Escalated by Legal Manager", "Under Review"],
    ["Response Approved by Legal Manager", "Approved"],
    ["Closed by Legal Manager", "Closed"],
    ["Reviewer Assignment Started", "Assigned to Legal Reviewer"],
  ].map(([decision, status]) => ({ endpoint: "manager-action", body: { decision }, role: "Legal Manager", status, action: decision })),
  { endpoint: "department-approval", body: { decision: "Department Approved", commentText: "Confirmed" }, role: "Department Approver", status: "Sent for Internal Approval", action: "Department Approved: Confirmed" },
  { endpoint: "department-approval", body: { decision: "Department Requested Revision" }, role: "Department Approver", status: "Returned for Revision", action: "Department Requested Revision" },
];

for (const workflow of workflows) {
  test(`${workflow.action} persists with its status and survives later comments`, async () => {
    const response = await post(`/requests/${requestId}/${workflow.endpoint}`, workflow.body, workflow.role);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).workflowAction, workflow.action);
    assert.equal(state.request.status, workflow.status);
    assert.equal(state.audit.length, 1, "The server records history without a browser audit request");
    assert.equal(state.audit[0].action, workflow.action);

    const comment = "Comment added: Sent request to Department Approver: mentioned in discussion only";
    assert.equal((await post("/audit", { requestId, action: comment })).status, 201);
    const [reloaded] = await listRequests(actor);
    assert.equal(reloaded.status, workflow.status);
    assert.equal(reloaded.lastAction, comment);
    assert.equal(reloaded.workflowAction, workflow.action);
  });
}

test("a newer routing action replaces an older escalation", async () => {
  await post(`/requests/${requestId}/manager-action`, { decision: "Escalated by Legal Manager" }, "Legal Manager");
  await post(`/requests/${requestId}/route`, { destination: "department_approver" });
  const [reloaded] = await listRequests(actor);
  assert.equal(reloaded.workflowAction, "Sent request to Department Approver: ");
  assert.equal(reloaded.managerDecision, "Escalated by Legal Manager");
  assert.equal(reloaded.status, "Under Review");
});

test("requests without routing history retain an empty workflow action", async () => {
  await post("/audit", { requestId, action: "Checklist updated" });
  const [reloaded] = await listRequests(actor);
  assert.equal(reloaded.lastAction, "Checklist updated");
  assert.equal(reloaded.workflowAction, "");
});

test("a saved comment remains the latest action after reload without changing the routing stage", async () => {
  await post(`/requests/${requestId}/route`, { destination: "department_approver", commentText: "Confirm the terms" });
  const response = await post(`/requests/${requestId}/comments`, { commentText: "Scope is now confirmed" });
  assert.equal(response.status, 201);
  await response.json();
  const [reloaded] = await listRequests(actor);
  assert.equal(reloaded.lastAction, "Comment added");
  assert.equal(reloaded.lastActionBy, actor.name);
  assert.equal(reloaded.workflowAction, "Sent request to Department Approver: Confirm the terms");
  assert.equal(reloaded.reviewerComments.at(-1).text, "Scope is now confirmed");
});

test("a comment rolls back if its audit event cannot be stored", async () => {
  rejectAudit = true;
  const response = await post(`/requests/${requestId}/comments`, { commentText: "This must not be partially saved" });
  assert.equal(response.status, 500);
  await response.json();
  assert.deepEqual(state.comments, []);
  assert.deepEqual(state.audit, []);
});

for (const endpoint of ["route", "manager-action", "department-approval"]) {
  test(`${endpoint} rolls back the status if its workflow history cannot be stored`, async () => {
    const workflow = workflows.find((item) => item.endpoint === endpoint);
    rejectAudit = true;
    const response = await post(`/requests/${requestId}/${endpoint}`, workflow.body, workflow.role);
    assert.equal(response.status, 500);
    await response.json();
    assert.equal(state.request.status, "Assigned to Legal Reviewer");
    assert.deepEqual(state.audit, []);
  });
}
