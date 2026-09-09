import { getRequestStatusLabel } from "./requestStatus";

const completedStatuses = new Set(["Approved", "Closed", "Archived"]);

export const legalTrackerHeaders = [
  "Date Received",
  "Deadline",
  "Party Name",
  "End User",
  "Matter Type",
  "Responsible Lawyer (reviewer)",
  "Comments / Notes",
  "Last Update / Actions Taken",
  "Legal Department Status (C/O)",
  "End User Status (C/O)",
  "Date of Completion / AnaSign Signature",
];

function commentsAndNotes(request) {
  const comments = request.reviewerComments || [];
  if (comments.length === 0) return "No comments recorded";
  return comments
    .map((comment) => `${comment.authorName || comment.reviewerName || "Legal Affairs"}: ${comment.text}`)
    .join(" | ");
}

export function getLegalTrackerRecord(request) {
  const isCompleted = completedStatuses.has(request.status);
  const lastAction = request.lastAction || `Status updated to ${getRequestStatusLabel(request.status)}`;
  const lastActionAt = request.lastActionAt || request.updatedAt || request.submittedAt || "Not recorded";
  const lastActionBy = request.lastActionBy && request.lastActionBy !== "System" ? ` by ${request.lastActionBy}` : "";
  const completedAt = request.completedAt && request.completedAt !== "Not completed"
    ? request.completedAt
    : isCompleted
      ? request.updatedAt || "Completion date not recorded"
      : "Not completed";
  const signature = request.anaSignSignature || "Not signed";

  return {
    dateReceived: request.submittedAt || "Not recorded",
    deadline: request.deadline && request.deadline !== "No deadline selected" ? request.deadline : "No deadline",
    partyName: request.partyName || "Not recorded",
    endUser: request.endUser || request.requester || "Not recorded",
    matterType: request.matterType || request.categoryName || request.categoryCode || "Not recorded",
    responsibleLawyer: request.assignedReviewer && request.assignedReviewer.toLowerCase() !== "not assigned" ? request.assignedReviewer : "Pending assignment",
    commentsNotes: commentsAndNotes(request),
    lastUpdateActionsTaken: `${lastActionAt} — ${lastAction}${lastActionBy}`,
    legalDepartmentStatus: request.legalDepartmentStatus || (isCompleted ? "C" : "O"),
    endUserStatus: request.endUserStatus || (isCompleted ? "C" : "O"),
    completionAnaSign: `${completedAt} / ${signature}`,
  };
}

function csvCell(value) {
  const safeValue = /^[=+@-]/.test(String(value ?? "")) ? `'${value}` : value;
  return `"${String(safeValue ?? "").replaceAll('"', '""')}"`;
}

export function exportLegalTrackerCsv(requests) {
  const rows = requests.map((request) => {
    const record = getLegalTrackerRecord(request);
    return [
      record.dateReceived,
      record.deadline,
      record.partyName,
      record.endUser,
      record.matterType,
      record.responsibleLawyer,
      record.commentsNotes,
      record.lastUpdateActionsTaken,
      record.legalDepartmentStatus,
      record.endUserStatus,
      record.completionAnaSign,
    ];
  });
  const csv = [legalTrackerHeaders, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `legal-requests-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
