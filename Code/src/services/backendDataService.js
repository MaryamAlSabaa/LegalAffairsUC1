import { apiAssetUrl, apiRequest, checkApiHealth } from "./apiClient";

function withDocumentUrls(requests) {
  return requests.map((request) => ({
    ...request,
    documents: (request.documents || []).map((document) => ({ ...document, url: apiAssetUrl(document.url) })),
  }));
}

export async function recordCurrentUserActivity() {
  await apiRequest("/activity", { method: "POST" });
}

export async function checkBackendConnection() {
  const result = await checkApiHealth();
  return Boolean(result.ok);
}

export async function fetchBackendUsers() {
  return apiRequest("/users");
}

export async function fetchBackendAuditLogs() {
  return apiRequest("/audit");
}

export async function fetchBackendRequests() {
  return withDocumentUrls(await apiRequest("/requests"));
}

export async function fetchRequestOverview() {
  return apiRequest("/requests/overview");
}

export async function createBackendRequest(newRequest) {
  const { uploadFile, ...metadata } = newRequest;
  const serializableMetadata = {
    ...metadata,
    documents: (metadata.documents || []).map(({ url: _url, ...document }) => document),
  };
  const body = new FormData();
  body.append("metadata", JSON.stringify(serializableMetadata));
  body.append("attachment", uploadFile, uploadFile.name);
  const saved = await apiRequest("/requests", { method: "POST", body });
  return withDocumentUrls([saved])[0];
}

export async function updateRequesterDocuments({ requestId, files, removeDocumentIds }) {
  const body = new FormData();
  body.append("metadata", JSON.stringify({ removeDocumentIds }));
  files.forEach((file) => body.append("files", file, file.name));
  return apiRequest(`/requests/${encodeURIComponent(requestId)}/documents`, { method: "PATCH", body });
}

export async function assignReviewerAsManager({ requestId, reviewerId }) {
  return apiRequest(`/requests/${encodeURIComponent(requestId)}/assign-reviewer`, { method: "POST", body: { reviewerId } });
}

export async function routeRequestAsReviewer({ requestId, destination, commentText }) {
  return apiRequest(`/requests/${encodeURIComponent(requestId)}/route`, { method: "POST", body: { destination, commentText } });
}

export async function fetchLegalAffairEngineEvents() {
  return apiRequest("/engine/events");
}

export async function createLegalAffairEngineEvent({ eventType, level = "info", message, requestId = null, jobId = null, metadata = {} }) {
  await apiRequest("/engine/events", { method: "POST", body: { eventType, level, message, requestId, jobId, metadata } });
}

export async function fetchLegalAffairEngineState() {
  return apiRequest("/engine/state");
}

export async function setLegalAffairEngineRunning(isRunning) {
  return apiRequest("/engine/state", { method: "PATCH", body: { isRunning } });
}

export async function rebuildAiReviewQueue() {
  const result = await apiRequest("/engine/rebuild", { method: "POST" });
  return result.count || 0;
}

export async function ownerResetAiResults() {
  const result = await apiRequest("/owner/reset-ai", { method: "POST" });
  return result.count || 0;
}

export async function ownerDeleteClosedRequests() {
  const result = await apiRequest("/owner/closed", { method: "DELETE" });
  return result.count || 0;
}

export async function deleteRequestAsOwner(requestId) {
  await apiRequest(`/requests/${encodeURIComponent(requestId)}`, { method: "DELETE" });
}

export async function updateAiReviewJobQueueOrder(jobId, queueOrder) {
  await apiRequest(`/ai-jobs/${encodeURIComponent(jobId)}/order`, { method: "PATCH", body: { queueOrder } });
}

export async function createBackendRequestComment({ requestId, commentText }) {
  await apiRequest(`/requests/${encodeURIComponent(requestId)}/comments`, { method: "POST", body: { commentText } });
}

export async function createBackendAuditLog(action, _currentUser, requestId = "System") {
  await apiRequest("/audit", { method: "POST", body: { action, requestId } });
}

export async function createBackendManagerAction({ requestId, decision }) {
  return apiRequest(`/requests/${encodeURIComponent(requestId)}/manager-action`, { method: "POST", body: { decision } });
}

export async function createBackendDepartmentApproval({ requestId, decision, commentText }) {
  return apiRequest(`/requests/${encodeURIComponent(requestId)}/department-approval`, { method: "POST", body: { decision, commentText } });
}

export async function updateBackendChecklistItem({ checklistItemId, checked }) {
  await apiRequest(`/checklist/${encodeURIComponent(checklistItemId)}`, { method: "PATCH", body: { checked } });
}

export async function updateBackendUserRole({ userId, roleName }) {
  await apiRequest(`/users/${encodeURIComponent(userId)}/role`, { method: "PATCH", body: { roleName } });
}

export async function updateBackendUserDepartment({ userId, departmentName }) {
  await apiRequest(`/users/${encodeURIComponent(userId)}/department`, { method: "PATCH", body: { departmentName } });
}
