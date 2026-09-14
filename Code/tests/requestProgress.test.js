import assert from "node:assert/strict";
import test from "node:test";
import { getRequestProgress } from "../src/utils/requestProgress.js";

const pdf = { name: "agreement.pdf", type: "application/pdf", isCurrent: true };
const office = { name: "agreement.docx", isCurrent: true };
const assigned = { assignedReviewerIds: ["reviewer-1"], assignedReviewer: "Legal Reviewer" };
const department = { assignedDepartmentApproverId: "approver-1" };
const step = (progress, id) => progress.steps.find((item) => item.id === id);

test("a new Word request starts at assignment without an invented AI stage", () => {
  const progress = getRequestProgress({ status: "New", documents: [office] });
  assert.equal(progress.currentStepId, "assignment");
  assert.equal(step(progress, "submitted").state, "completed");
  assert.equal(step(progress, "ai-review"), undefined);
  assert.equal(step(progress, "department-review"), undefined);
  assert.equal(step(progress, "completion").state, "upcoming");
});

test("queued, processing and failed AI work reports the current operation", () => {
  for (const [jobStatus, expected, attention] of [
    ["queued", /queued.*position 3/i, false],
    ["processing", /processing.*Extracting pages/i, false],
    ["failed", /could not finish/i, true],
  ]) {
    const progress = getRequestProgress({
      status: jobStatus === "failed" ? "AI Review Failed" : "AI Review Pending",
      documents: [pdf],
      aiReviewJob: { status: jobStatus, priorityQueuePosition: 3, currentStep: "Extracting pages" },
    });
    assert.equal(progress.currentStepId, "ai-review");
    assert.match(progress.description, expected);
    assert.equal(progress.needsAttention, attention);
    assert.equal(step(progress, "ai-review").state, "current");
  }
});

test("AI completion proceeds to assignment or directly to assigned reviewers", () => {
  const waiting = getRequestProgress({ status: "AI Review Complete", documents: [pdf] });
  assert.equal(waiting.currentStepId, "assignment");
  assert.equal(step(waiting, "ai-review").state, "completed");
  const reviewing = getRequestProgress({ status: "Assigned to Legal Reviewer", ...assigned, documents: [pdf], aiReviewJob: { status: "completed" } });
  assert.equal(reviewing.currentStepId, "legal-review");
  assert.equal(step(reviewing, "assignment").state, "completed");
  assert.equal(step(reviewing, "ai-review").state, "completed");
});

test("manual review after an AI failure never marks AI completed", () => {
  const progress = getRequestProgress({ status: "Under Review", ...assigned, documents: [pdf], aiReviewJob: { status: "failed" } });
  assert.equal(progress.currentStepId, "legal-review");
  assert.equal(step(progress, "ai-review").state, "unconfirmed");
  assert.equal(step(progress, "ai-review").detail, "Not completed");
});

test("returning to the requester pauses the legal review in either status spelling", () => {
  for (const status of ["Waiting for More Information", "Returned to Requester"]) {
    const progress = getRequestProgress({ status, ...assigned, documents: [office] });
    assert.equal(progress.statusLabel, "Returned to Requester");
    assert.equal(progress.currentStepId, "requester-update");
    assert.equal(step(progress, "legal-review").state, "upcoming");
    assert.equal(step(progress, "manager-review").state, "upcoming");
    assert.match(progress.description, /requester.*updated documents/);
  }
});

test("a resubmitted PDF restarts AI and disregards the previous approval decisions", () => {
  const progress = getRequestProgress({
    status: "AI Review Pending", ...assigned, ...department, documents: [pdf],
    aiReviewJob: { status: "queued" }, previousAiReviewResult: { reviewed: true },
    aiReviewResult: { reviewed: true }, departmentDecision: "Department Approved",
    managerDecision: "Response Approved by Legal Manager", completedAt: "10/09/2026, 12:00",
    workflowAction: "Sent request to Department Approver: Review this",
  });
  assert.equal(progress.currentStepId, "ai-review");
  assert.equal(progress.isComplete, false);
  assert.equal(step(progress, "ai-review").state, "current");
  assert.equal(step(progress, "department-review").state, "upcoming");
  assert.equal(step(progress, "manager-review").state, "upcoming");
  assert.equal(step(progress, "completion").state, "upcoming");
});

test("Word resubmission omits AI from an older superseded PDF", () => {
  const progress = getRequestProgress({
    status: "Assigned to Legal Reviewer", ...assigned,
    documents: [{ ...pdf, isCurrent: false }, office],
    aiReviewJob: { status: "completed" }, departmentDecision: "Department Approved",
    managerDecision: "Closed by Legal Manager",
  });
  assert.equal(progress.currentStepId, "legal-review");
  assert.equal(step(progress, "ai-review"), undefined);
  assert.equal(progress.isComplete, false);
});

test("current Excel workbooks expose queued, processing and failed AI stages", () => {
  for (const name of ["budget.xls", "budget.xlsx"]) {
    for (const [jobStatus, expected, attention] of [
      ["queued", /document is queued.*position 2/i, false],
      ["processing", /processing the document.*Reading spreadsheet cells/i, false],
      ["failed", /could not finish/i, true],
    ]) {
      const progress = getRequestProgress({
        status: "New", documents: [{ name, isCurrent: true }],
        aiReviewJob: { status: jobStatus, queuePosition: 2, currentStep: "Reading spreadsheet cells" },
      });
      assert.equal(progress.currentStepId, "ai-review");
      assert.equal(step(progress, "ai-review").state, "current");
      assert.equal(progress.needsAttention, attention);
      assert.match(progress.description, expected);
      assert.doesNotMatch(progress.description, /PDF/);
    }
  }
});

test("completed Excel AI work advances to legal review without losing the review stage", () => {
  const progress = getRequestProgress({
    status: "Assigned to Legal Reviewer", ...assigned,
    documents: [{ name: "terms.xlsx", isCurrent: true }], aiReviewJob: { status: "completed" },
  });
  assert.equal(progress.currentStepId, "legal-review");
  assert.equal(step(progress, "ai-review").state, "completed");
  assert.equal(step(progress, "assignment").state, "completed");
});

test("Excel resubmission restarts AI while a later Word replacement drops historical AI", () => {
  const spreadsheet = { name: "terms.xlsx", isCurrent: true };
  const progress = getRequestProgress({
    status: "AI Review Pending", ...assigned, documents: [{ ...pdf, isCurrent: false }, spreadsheet],
    aiReviewJob: { status: "queued" }, aiReviewResult: { reviewed: true },
    departmentDecision: "Department Approved", managerDecision: "Response Approved by Legal Manager",
  });
  assert.equal(progress.currentStepId, "ai-review");
  assert.equal(step(progress, "ai-review").state, "current");
  assert.equal(step(progress, "manager-review").state, "upcoming");
  const wordReplacement = getRequestProgress({
    status: "Assigned to Legal Reviewer", ...assigned,
    documents: [{ ...spreadsheet, isCurrent: false }, office], aiReviewJob: { status: "completed" }, aiReviewResult: { reviewed: true },
  });
  assert.equal(wordReplacement.currentStepId, "legal-review");
  assert.equal(step(wordReplacement, "ai-review"), undefined);
});

test("department preassignment does not imply routing or approval", () => {
  const progress = getRequestProgress({ status: "Under Review", ...assigned, ...department });
  assert.equal(progress.currentStepId, "legal-review");
  assert.equal(step(progress, "department-review").state, "upcoming");
  assert.equal(step(progress, "department-review").detail, "If required");
});

test("department routing stays current when a newer comment changes lastAction", () => {
  const progress = getRequestProgress({
    status: "Under Review", ...assigned, ...department,
    workflowAction: "Sent request to Department Approver: Confirm the terms",
    lastAction: "Added a reviewer comment", lastActionAt: "14/09/2026, 11:30",
    lastActionBy: "A. Reviewer",
  });
  assert.equal(progress.currentStepId, "department-review");
  assert.equal(step(progress, "legal-review").state, "completed");
  assert.equal(progress.latestAction.text, "Added a reviewer comment");
  assert.equal(progress.latestAction.at, "14/09/2026, 11:30");
  assert.equal(progress.latestAction.by, "A. Reviewer");
});

test("department revisions move back to legal work and reopen future approvals", () => {
  const progress = getRequestProgress({
    status: "Returned for Revision", ...assigned, ...department,
    departmentDecision: "Department Requested Revision", managerDecision: "Response Approved by Legal Manager",
  });
  assert.equal(progress.currentStepId, "legal-review");
  assert.equal(step(progress, "legal-review").label, "Legal revisions");
  assert.equal(step(progress, "department-review").state, "upcoming");
  assert.equal(step(progress, "manager-review").state, "upcoming");
  assert.equal(progress.needsAttention, true);
});

test("manager routing does not fabricate a bypassed department approval", () => {
  for (const status of ["Sent for Internal Approval", "Sent for Legal Manager Review"]) {
    const direct = getRequestProgress({ status, ...assigned, ...department, departmentDecision: "Pending Department Review" });
    assert.equal(direct.currentStepId, "manager-review");
    assert.equal(step(direct, "department-review").state, "unconfirmed");
    assert.equal(step(direct, "legal-review").state, "completed");
    const approved = getRequestProgress({ status, ...assigned, ...department, departmentDecision: "Department Approved", workflowAction: "Department Approved: The terms are agreed" });
    assert.equal(step(approved, "department-review").state, "completed");
    assert.equal(step(approved, "department-review").detail, "Approved");
  }
});

test("a retained department approval does not complete a later review cycle routed directly to the manager", () => {
  const retained = {
    ...assigned, ...department, documents: [pdf], departmentDecision: "Department Approved",
    managerDecision: "Response Approved by Legal Manager",
  };
  for (const [status, workflowAction] of [
    ["Waiting for More Information", "Sent request to Requester: Please replace the PDF"],
    ["AI Review Pending", "Sent request to Requester: Please replace the PDF"],
    ["Assigned to Legal Reviewer", "Sent request to Requester: Please replace the PDF"],
    ["Sent for Internal Approval", "Sent request to Legal Manager: Review the new document"],
    ["Approved", "Response Approved by Legal Manager"],
  ]) {
    const progress = getRequestProgress({ ...retained, status, workflowAction });
    assert.notEqual(step(progress, "department-review").state, "completed", status);
    if (["Sent for Internal Approval", "Approved"].includes(status)) {
      assert.equal(step(progress, "department-review").detail, "Previous approval", status);
    }
  }
});

test("a stored department decision without a supporting workflow action remains historical", () => {
  const progress = getRequestProgress({ status: "Sent for Internal Approval", ...assigned, departmentDecision: "Department Approved" });
  assert.equal(step(progress, "department-review").state, "unconfirmed");
  assert.equal(step(progress, "department-review").detail, "Previous approval");
});

test("approval completes the workflow without inventing an AI result", () => {
  const progress = getRequestProgress({ status: "Approved", ...assigned, documents: [pdf] });
  assert.equal(progress.currentStepId, "completion");
  assert.equal(progress.isComplete, true);
  assert.equal(step(progress, "manager-review").state, "completed");
  assert.equal(step(progress, "ai-review").state, "unconfirmed");
  assert.equal(step(progress, "completion").label, "Approved");
});

test("closing or archiving a request does not imply response approval", () => {
  for (const status of ["Closed", "Archived"]) {
    const progress = getRequestProgress({ status, documents: [office], managerDecision: "Closed by Legal Manager" });
    assert.equal(progress.isComplete, true);
    assert.equal(progress.currentStepId, "completion");
    assert.equal(step(progress, "manager-review").state, "unconfirmed");
    assert.equal(step(progress, "legal-review").state, "unconfirmed");
    assert.equal(step(progress, "completion").label, status);
  }
});

test("reopening an approved request uses the current status instead of old completion fields", () => {
  const progress = getRequestProgress({
    status: "Under Review", ...assigned, ...department,
    departmentDecision: "Department Approved", managerDecision: "Response Approved by Legal Manager",
    completedAt: "10/09/2026, 12:00", legalDepartmentStatus: "C", endUserStatus: "C",
  });
  assert.equal(progress.currentStepId, "legal-review");
  assert.equal(progress.isComplete, false);
  assert.equal(step(progress, "department-review").state, "upcoming");
  assert.equal(step(progress, "manager-review").state, "upcoming");
  assert.equal(step(progress, "completion").state, "upcoming");
});

test("an escalation remains under legal review and unknown statuses remain visible", () => {
  const escalation = getRequestProgress({ status: "Under Review", managerDecision: "Escalated by Legal Manager" });
  assert.equal(escalation.currentStepId, "legal-review");
  assert.equal(escalation.needsAttention, true);
  assert.match(escalation.description, /escalation/);
  const unknown = getRequestProgress({ status: "Awaiting signature" });
  assert.equal(unknown.currentStepId, "current-status");
  assert.equal(step(unknown, "current-status").label, "Awaiting signature");
  assert.equal(unknown.isComplete, false);
});

test("current routing supersedes a stale escalation decision while comments do not clear a current escalation", () => {
  const retained = { status: "Under Review", ...assigned, ...department, managerDecision: "Escalated by Legal Manager" };
  const routed = getRequestProgress({ ...retained, workflowAction: "Sent request to Department Approver: Confirm the terms" });
  assert.equal(routed.currentStepId, "department-review");
  assert.equal(routed.needsAttention, false);
  assert.doesNotMatch(routed.description, /escalation/);
  const revised = getRequestProgress({ ...retained, workflowAction: "Department Requested Revision: Revise the terms" });
  assert.doesNotMatch(revised.description, /escalation/);
  const escalated = getRequestProgress({ ...retained, workflowAction: "Escalated by Legal Manager", lastAction: "Added a reviewer comment" });
  assert.equal(escalated.currentStepId, "legal-review");
  assert.equal(escalated.needsAttention, true);
  assert.match(escalated.description, /escalation/);
});

test("each workflow branch exposes exactly one current step without mutating the request", () => {
  for (const status of ["New", "AI Review Pending", "AI Review Failed", "AI Review Complete", "Assigned to Legal Reviewer", "Under Review", "Draft Response Prepared", "Waiting for More Information", "Returned for Revision", "Sent for Internal Approval", "Approved", "Closed", "Archived"]) {
    const request = { status, ...assigned, ...department, documents: [pdf] };
    const before = structuredClone(request);
    const progress = getRequestProgress(request);
    assert.equal(progress.steps.filter((item) => item.state === "current").length, 1, status);
    assert.deepEqual(request, before);
  }
});
