import { isAiReviewableDocument } from "./documentTypes.js";
import { getRequestStatusLabel } from "./requestStatus.js";

const finalStatuses = new Set(["Approved", "Closed", "Archived"]);
const aiStatuses = new Set(["AI Review Pending", "AI Review Queued", "AI Review Processing", "AI Review Failed"]);
const managerStatuses = new Set(["Sent for Internal Approval", "Sent for Legal Manager Review"]);
const initialStatuses = new Set(["New", "Submitted", "AI Review Complete", "Assigned to Legal Reviewer", ...aiStatuses]);

function recorded(value) {
  return typeof value === "string" && value.trim() && !/^(not assigned|not recorded|not completed)$/i.test(value.trim());
}

function displayDate(value) {
  if (!recorded(value)) return "";
  // API display dates are already localized; parsing them again swaps day/month.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-AE", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** A view of the current workflow, not an inferred audit history. */
export function getRequestProgress(request = {}) {
  const status = request.status || "New";
  const statusLabel = getRequestStatusLabel(status);
  const isFinal = finalStatuses.has(status);
  const job = request.aiReviewJob;
  const documents = request.documents || [];
  const currentDocuments = documents.some((document) => document.isCurrent)
    ? documents.filter((document) => document.isCurrent)
    : documents;
  const hasReviewableDocument = currentDocuments.some((document) => isAiReviewableDocument(typeof document === "string" ? { name: document } : document));
  const hasAi = status.startsWith("AI Review") || hasReviewableDocument || (documents.length === 0 && Boolean(job || request.aiReviewResult));
  const hasReviewer = Boolean(request.assignedReviewerIds?.length || request.assignedReviewerId || request.assignedReviewers?.length || recorded(request.assignedReviewer));
  const hasDepartmentApprover = Boolean(request.assignedDepartmentApproverId || recorded(request.assignedDepartmentApprover));
  const awaitingRequester = ["Waiting for More Information", "Returned to Requester"].includes(status);
  const needsRevision = status === "Returned for Revision";
  const sentToManager = managerStatuses.has(status);
  const workflowAction = request.workflowAction || request.lastAction || "";
  // Approvers are assigned at submission, so assignment is not evidence of routing.
  const inDepartmentReview = status === "Under Review" && /(?:rout|move|sent).*department approver/i.test(workflowAction);
  // Stored decisions survive resubmission/reopening. They cannot advance an earlier status.
  // A later direct route can also reach manager review while retaining an old approval.
  const hasRecordedDepartmentApproval = request.departmentDecision === "Department Approved";
  const departmentApproved = hasRecordedDepartmentApproval && (sentToManager || isFinal) && /^Department Approved(?:\s*:|$)/i.test(workflowAction);
  const hasDepartmentReview = hasDepartmentApprover || inDepartmentReview || needsRevision || (hasRecordedDepartmentApproval && (sentToManager || isFinal));
  const aiIsRestarting = aiStatuses.has(status);
  const aiCompleted = !aiIsRestarting && (status === "AI Review Complete" || job?.status === "completed" || (!job && Boolean(request.aiReviewResult)));

  let currentStepId = "legal-review";
  let description = "Legal Affairs is reviewing the request and its supporting documents.";
  let needsAttention = false;

  if (isFinal) {
    currentStepId = "completion";
    description = status === "Approved"
      ? "The Legal Manager approved the response and completed the request."
      : status === "Archived"
        ? "The request is archived."
        : "The request is closed. Closure does not by itself mean the legal response was approved.";
  } else if (aiStatuses.has(status) || (["New", "Submitted"].includes(status) && hasAi && ["queued", "processing", "failed"].includes(job?.status))) {
    currentStepId = "ai-review";
    needsAttention = status === "AI Review Failed" || job?.status === "failed";
    description = needsAttention
      ? "AI review could not finish. Legal Affairs can arrange a retry or continue the review manually."
      : job?.status === "processing" || status === "AI Review Processing"
        ? `AI review is processing the document${job?.currentStep ? `: ${job.currentStep}` : "."}`
        : `The document is queued for AI review${job?.priorityQueuePosition || job?.queuePosition ? ` (position ${job.priorityQueuePosition || job.queuePosition})` : ""}.`;
  } else if (awaitingRequester) {
    currentStepId = "requester-update";
    needsAttention = true;
    description = "Waiting for the requester to provide the requested information or updated documents. Legal review will resume afterward.";
  } else if (needsRevision) {
    needsAttention = true;
    description = "The department requested revisions. Legal Affairs must revise the request before approval can continue.";
  } else if (sentToManager) {
    currentStepId = "manager-review";
    description = "The request is in the Legal Manager review queue, awaiting a decision.";
  } else if (inDepartmentReview) {
    currentStepId = "department-review";
    description = "The request was routed to the Department Approver for review.";
  } else if (["New", "Submitted", "AI Review Complete"].includes(status)) {
    currentStepId = hasReviewer ? "legal-review" : "assignment";
    description = hasReviewer
      ? "Reviewers are assigned and can continue the legal review."
      : status === "AI Review Complete"
        ? "AI review is complete. The Legal Manager can assign reviewers."
        : "The request has been submitted and is awaiting reviewer assignment.";
  } else if (status === "Assigned to Legal Reviewer") {
    description = "The request has been assigned for legal review.";
  } else if (status === "Draft Response Prepared") {
    description = "A draft response is prepared and can be routed for approval.";
  } else if (status === "Under Review" && request.managerDecision === "Escalated by Legal Manager" && (!workflowAction || /^Escalated by Legal Manager$/i.test(workflowAction))) {
    needsAttention = true;
    description = "The Legal Manager flagged the request for escalation. It remains open and under review.";
  } else if (status !== "Under Review") {
    currentStepId = "current-status";
    description = `The request is currently marked ${statusLabel}.`;
  }

  const steps = [{ id: "submitted", label: "Submitted" }];
  if (hasAi) steps.push({ id: "ai-review", label: "AI review" });
  steps.push({ id: "assignment", label: "Reviewer assignment" });
  if (awaitingRequester) steps.push({ id: "requester-update", label: "Requester update" });
  steps.push({ id: "legal-review", label: needsRevision ? "Legal revisions" : "Legal review" });
  if (hasDepartmentReview) steps.push({ id: "department-review", label: "Department review" });
  steps.push({ id: "manager-review", label: "Manager review" });
  if (currentStepId === "current-status") steps.push({ id: "current-status", label: statusLabel });
  steps.push({ id: "completion", label: isFinal ? status : "Completed" });

  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  const responseApproved = status === "Approved" || (status === "Archived" && request.managerDecision === "Response Approved by Legal Manager");
  const legalReviewCompleted = sentToManager || inDepartmentReview || responseApproved;

  const resolvedSteps = steps.map((step, index) => {
    let state = index < currentIndex ? "completed" : "upcoming";
    let detail = state === "completed" ? "Completed" : "Upcoming";
    if (index === currentIndex) {
      state = "current";
      detail = isFinal ? "Complete" : needsAttention ? "Needs attention" : "Current";
    } else if (step.id === "assignment" && hasReviewer) {
      state = "completed";
      detail = "Assigned";
    } else if (step.id === "ai-review" && aiCompleted) {
      state = "completed";
      detail = "Completed";
    } else if (step.id === "department-review" && departmentApproved) {
      state = "completed";
      detail = "Approved";
    } else if (index < currentIndex) {
      const unconfirmed = (step.id === "ai-review" && !aiCompleted)
        || (step.id === "assignment" && !hasReviewer)
        || (step.id === "legal-review" && !legalReviewCompleted)
        || (step.id === "department-review" && !departmentApproved)
        || (step.id === "manager-review" && !responseApproved);
      if (unconfirmed) {
        state = "unconfirmed";
        detail = step.id === "ai-review" && job?.status === "failed" ? "Not completed" : "Not recorded";
        if (step.id === "ai-review" && ["queued", "processing"].includes(job?.status)) detail = job.status === "queued" ? "Queued" : "Processing";
        if (step.id === "department-review") detail = hasRecordedDepartmentApproval ? "Previous approval" : "Approval not recorded";
      }
    }
    // A prior department decision is not a completed stage in a fresh review cycle.
    if (step.id === "department-review" && initialStatuses.has(status)) {
      state = "upcoming";
      detail = "If required";
    } else if (step.id === "department-review" && state === "upcoming") {
      detail = "If required";
    }
    return { ...step, state, detail };
  });

  return {
    steps: resolvedSteps,
    currentStepId,
    statusLabel,
    description,
    isComplete: isFinal,
    needsAttention,
    latestAction: {
      text: recorded(request.lastAction) ? request.lastAction : `Status: ${statusLabel}`,
      by: recorded(request.lastActionBy) ? request.lastActionBy : "",
      at: displayDate(request.lastActionAt) || displayDate(request.updatedAt) || displayDate(request.updatedAtIso) || displayDate(request.submittedAt) || displayDate(request.submittedAtIso),
    },
  };
}
