import { restrictReview } from "./reviewVisibility.js";
import { query } from "../db.js";

function accessFilter(user, startIndex = 1) {
  if (["Owner", "Legal Manager", "Legal Reviewer"].includes(user.role)) return { sql: "true", values: [] };
  if (user.role === "Department Approver") {
    return {
      sql: `(lr.assigned_department_approver_id = $${startIndex} or lr.department_id = $${startIndex + 1})`,
      values: [user.id, user.departmentId],
    };
  }
  if (user.role === "Requester") return { sql: `lr.requester_id = $${startIndex}`, values: [user.id] };
  return { sql: "false", values: [] };
}

export async function canAccessRequest(user, requestId) {
  const access = accessFilter(user, 2);
  const result = await query(`select 1 from legal_requests lr where lr.id = $1 and ${access.sql}`, [requestId, ...access.values]);
  return result.rowCount === 1;
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const value = row[key];
    groups[value] ||= [];
    groups[value].push(row);
    return groups;
  }, {});
}

async function listReviewerAssignments(requestIds) {
  if (requestIds.length === 0) return {};
  const result = await query(
    `select a.request_id,a.reviewer_id,a.assigned_at,
            u.full_name as reviewer_name,u.username as reviewer_username,u.email as reviewer_email
     from request_reviewer_assignments a
     join users u on u.id=a.reviewer_id
     where a.request_id=any($1::text[])
     order by a.assigned_at,u.full_name`,
    [requestIds],
  );
  return groupBy(result.rows, "request_id");
}

function mapReviewerAssignments(rows = [], currentUserId) {
  const assignedReviewers = rows.map((row) => ({
    id: row.reviewer_id,
    name: row.reviewer_name,
    username: row.reviewer_username,
    email: row.reviewer_email,
    assignedAt: row.assigned_at,
  }));
  const assignedReviewerIds = assignedReviewers.map((reviewer) => reviewer.id);
  return {
    assignedReviewers,
    assignedReviewerIds,
    assignedReviewer: assignedReviewers.map((reviewer) => reviewer.name).join(", ") || "Not Assigned",
    assignedReviewerId: assignedReviewerIds[0] || null,
    isAssignedToCurrentUser: assignedReviewerIds.includes(currentUserId),
  };
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-AE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function listRequests(user) {
  const access = accessFilter(user);
  const requestsResult = await query(
    `select lr.*, c.name as category_name, d.name as department_name,
            requester.full_name as requester_name, requester.username as requester_username,
            manager.full_name as manager_name,
            approver.full_name as approver_name
     from legal_requests lr
     join legal_categories c on c.code = lr.category_code
     join departments d on d.id = lr.department_id
     join users requester on requester.id = lr.requester_id
     left join users manager on manager.id = lr.assigned_manager_id
     left join users approver on approver.id = lr.assigned_department_approver_id
     where ${access.sql}
     order by lr.submitted_at desc`,
    access.values,
  );

  if (requestsResult.rowCount === 0) return [];
  const requestIds = requestsResult.rows.map((row) => row.id);

  const [documentsResult, checklistResult, suggestionsResult, commentsResult, jobsResult, reviewerAssignments, latestActionsResult] = await Promise.all([
    query("select * from request_documents where request_id = any($1::text[]) order by is_current desc, created_at desc", [requestIds]),
    query(`select ci.*, c.criteria, c.sort_order from request_checklist_items ci join legal_review_criteria c on c.id = ci.criteria_id where ci.request_id = any($1::text[]) order by c.sort_order`, [requestIds]),
    query(`select s.* from document_ai_suggestions s join request_documents d on d.id = s.document_id where d.request_id = any($1::text[]) order by s.created_at`, [requestIds]),
    query(`select rc.*, u.full_name as author_name, r.name as author_role from reviewer_comments rc join users u on u.id = rc.reviewer_id join roles r on r.id = u.role_id where rc.request_id = any($1::text[]) order by rc.created_at`, [requestIds]),
    query("select * from ai_review_jobs where request_id = any($1::text[]) order by created_at desc", [requestIds]),
    listReviewerAssignments(requestIds),
    query(`select distinct on (request_id) request_id,action,actor_name,created_at
           from audit_logs where request_id=any($1::text[])
           order by request_id,created_at desc`, [requestIds]),
  ]);

  const documentsByRequest = groupBy(documentsResult.rows, "request_id");
  const checklistByDocument = groupBy(checklistResult.rows, "document_id");
  const suggestionsByDocument = groupBy(suggestionsResult.rows, "document_id");
  const commentsByRequest = groupBy(commentsResult.rows, "request_id");
  const jobsByRequest = groupBy(jobsResult.rows, "request_id");
  const latestActionByRequest = Object.fromEntries(latestActionsResult.rows.map((action) => [action.request_id, action]));

  const priorityRank = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
  const activeJobs = jobsResult.rows
    .filter((job) => ["queued", "processing"].includes(job.status))
    .sort((a, b) => {
      const requestA = requestsResult.rows.find((row) => row.id === a.request_id);
      const requestB = requestsResult.rows.find((row) => row.id === b.request_id);
      return (priorityRank[requestA?.priority] || 5) - (priorityRank[requestB?.priority] || 5) || Number(a.queue_order) - Number(b.queue_order);
    });
  const queuePosition = Object.fromEntries(activeJobs.map((job, index) => [job.id, index + 1]));

  return requestsResult.rows.map((row) => ({
    id: row.id,
    trackingNumber: row.id,
    title: row.title,
    partyName: row.party_name || "Not recorded",
    endUser: row.end_user_name && row.end_user_name !== "Not recorded" ? row.end_user_name : row.requester_name,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    department: row.department_name,
    requester: row.requester_name,
    requesterUsername: row.requester_username,
    ...mapReviewerAssignments(reviewerAssignments[row.id], user.id),
    assignedManager: row.manager_name || "Not Assigned",
    assignedManagerId: row.assigned_manager_id,
    assignedDepartmentApprover: row.approver_name || "Not Assigned",
    assignedDepartmentApproverId: row.assigned_department_approver_id,
    priority: row.priority,
    riskLevel: row.risk_level,
    status: row.status,
    deadline: row.deadline ? new Date(row.deadline).toISOString().slice(0, 10) : "No deadline selected",
    submittedAt: formatDateTime(row.submitted_at),
    submittedAtIso: new Date(row.submitted_at).toISOString(),
    updatedAt: formatDateTime(row.updated_at),
    updatedAtIso: new Date(row.updated_at).toISOString(),
    lastAction: latestActionByRequest[row.id]?.action || row.manager_decision || row.status,
    lastActionBy: latestActionByRequest[row.id]?.actor_name || "System",
    lastActionAt: formatDateTime(latestActionByRequest[row.id]?.created_at || row.updated_at),
    legalDepartmentStatus: row.legal_department_status || (["Approved", "Closed", "Archived"].includes(row.status) ? "C" : "O"),
    endUserStatus: row.end_user_status || (["Approved", "Closed", "Archived"].includes(row.status) ? "C" : "O"),
    completedAt: row.completed_at ? formatDateTime(row.completed_at) : "Not completed",
    anaSignSignature: row.anasign_signature || "Not signed",
    description: row.description,
    documents: (documentsByRequest[row.id] || []).map((document) => ({
      id: document.id,
      name: document.file_name,
      type: document.mime_type,
      url: `/api/documents/${document.id}/file`,
      isCurrent: document.is_current,
      aiReviewResult: document.ai_review_result,
      checklist: (checklistByDocument[document.id] || []).map((item) => ({ id: item.id, criteria: item.criteria, page: item.page, checked: item.checked, note: item.note })),
      aiSuggestions: (suggestionsByDocument[document.id] || []).map((item) => ({ page: item.page, type: item.suggestion_type, text: item.suggestion_text })),
    })),
    reviewReferences: row.review_references,
    sharedResponse: row.shared_response,
    aiSummary: row.ai_summary,
    aiReviewResult: row.ai_review_result,
    previousDocumentId: row.previous_document_id,
    previousAiSummary: row.previous_ai_summary,
    previousAiReviewResult: row.previous_ai_review_result,
    managerDecision: row.manager_decision,
    departmentDecision: row.department_decision,
    reviewerComments: (commentsByRequest[row.id] || []).map((comment) => ({ authorName: comment.author_name, authorRole: comment.author_role, reviewerName: comment.author_name, text: comment.comment_text, createdAt: formatDateTime(comment.created_at) })),
    aiReviewJob: jobsByRequest[row.id]?.[0] ? {
      id: jobsByRequest[row.id][0].id,
      status: jobsByRequest[row.id][0].status,
      queueOrder: Number(jobsByRequest[row.id][0].queue_order),
      queuePosition: queuePosition[jobsByRequest[row.id][0].id] || null,
      priorityQueuePosition: queuePosition[jobsByRequest[row.id][0].id] || null,
      attemptCount: jobsByRequest[row.id][0].attempt_count,
      lastError: jobsByRequest[row.id][0].last_error,
      currentStep: jobsByRequest[row.id][0].current_step,
      operationalTrace: jobsByRequest[row.id][0].operational_trace || [],
      lockedAt: formatDateTime(jobsByRequest[row.id][0].locked_at),
      startedAt: formatDateTime(jobsByRequest[row.id][0].started_at),
      completedAt: formatDateTime(jobsByRequest[row.id][0].completed_at),
      createdAt: formatDateTime(jobsByRequest[row.id][0].created_at),
      updatedAt: formatDateTime(jobsByRequest[row.id][0].updated_at),
    } : null,
  })).map((request) => restrictReview(request, user));
}

export async function getDocumentForUser(user, documentId) {
  const access = accessFilter(user, 2);
  const result = await query(
    `select d.* from request_documents d join legal_requests lr on lr.id = d.request_id where d.id = $1 and ${access.sql}`,
    [documentId, ...access.values],
  );
  return result.rows[0] || null;
}

// A compact metadata-only register is retained for dashboards that do not need
// documents, comments, or AI output. Legal Reviewers now receive the complete
// request collection from listRequests so they can cover colleagues' matters.
export async function listRequestOverview(user) {
  const result = await query(
    `select lr.id,lr.title,lr.description,lr.party_name,lr.end_user_name,lr.priority,lr.risk_level,lr.status,
            lr.deadline,lr.submitted_at,lr.updated_at,lr.legal_department_status,lr.end_user_status,
            lr.completed_at,lr.anasign_signature,
            c.code as category_code,c.name as category_name,d.name as department_name,
            requester.full_name as requester_name,requester.username as requester_username,
            latest_job.status as job_status,latest_job.current_step as job_current_step
     from legal_requests lr
     join legal_categories c on c.code=lr.category_code
     join departments d on d.id=lr.department_id
     join users requester on requester.id=lr.requester_id
     left join lateral (
       select j.status,j.current_step
       from ai_review_jobs j
       where j.request_id=lr.id
       order by j.created_at desc
       limit 1
     ) latest_job on true
     order by lr.submitted_at desc`,
  );

  const reviewerAssignments = await listReviewerAssignments(result.rows.map((row) => row.id));

  return result.rows.map((row) => ({
    id: row.id,
    trackingNumber: row.id,
    title: row.title,
    description: row.description,
    partyName: row.party_name || "Not recorded",
    endUser: row.end_user_name && row.end_user_name !== "Not recorded" ? row.end_user_name : row.requester_name,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    department: row.department_name,
    requester: row.requester_name,
    requesterUsername: row.requester_username,
    ...mapReviewerAssignments(reviewerAssignments[row.id], user.id),
    priority: row.priority,
    riskLevel: row.risk_level,
    status: row.status,
    deadline: row.deadline ? new Date(row.deadline).toISOString().slice(0, 10) : "No deadline selected",
    submittedAt: formatDateTime(row.submitted_at),
    submittedAtIso: new Date(row.submitted_at).toISOString(),
    updatedAt: formatDateTime(row.updated_at),
    updatedAtIso: new Date(row.updated_at).toISOString(),
    lastAction: row.status,
    lastActionBy: "System",
    lastActionAt: formatDateTime(row.updated_at),
    legalDepartmentStatus: row.legal_department_status || (["Approved", "Closed", "Archived"].includes(row.status) ? "C" : "O"),
    endUserStatus: row.end_user_status || (["Approved", "Closed", "Archived"].includes(row.status) ? "C" : "O"),
    completedAt: row.completed_at ? formatDateTime(row.completed_at) : "Not completed",
    anaSignSignature: row.anasign_signature || "Not signed",
    aiReviewJob: row.job_status ? { status: row.job_status, currentStep: row.job_current_step } : null,
  })).map((request) => restrictReview(request, user));
}
