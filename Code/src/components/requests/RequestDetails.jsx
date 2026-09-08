import { useEffect, useState } from "react";
import AiLegalReviewPanel from "../review/AiLegalReviewPanel";

import ContractChecklist from "../review/ContractChecklist";
import ReviewerComments from "../review/ReviewerComments";
import ReviewerRoutingPanel from "./ReviewerRoutingPanel";
import DepartmentApprovalPanel from "./DepartmentApprovalPanel";
import ManagerActions from "./ManagerActions";
import PdfReviewModal from "./PdfReviewModal";
import RequestPdfResubmissionPanel from "./RequestPdfResubmissionPanel";
import Icon from "../common/Icon";
import { getDocumentTypeLabel, isPdfDocument } from "../../utils/documentTypes";

function ReviewStatusCard({
  request,
  document,
  canManageReview,
  canManageManagerActions,
  canManageDepartmentApproval,
  showChecklistProgress,
}) {
  const checklistItems = document?.checklist || [];
  const completedItems = checklistItems.filter((item) => item.checked).length;
  const totalItems = checklistItems.length;
  const departmentDecision = request.departmentDecision;
  const managerDecision = request.managerDecision;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-bold text-slate-900">Review Status</h3>
      <p className="text-sm text-slate-500 mt-1">
        This card summarizes who can act on this request and what is still
        pending.
      </p>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-slate-500">Current Request Status</p>
          <p className="mt-1 font-bold text-slate-900">{request.status}</p>
        </div>
        {request.aiReviewJob &&
          request.aiReviewJob.status !== "completed" &&
          request.status !== "AI Review Complete" && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-slate-500">AI Review</p>
              <p className="mt-1 font-bold text-slate-900">
                {request.aiReviewJob.status === "processing"
                  ? `Processing${request.aiReviewJob.currentStep ? ` — ${request.aiReviewJob.currentStep}` : ""}`
                  : request.aiReviewJob.status === "queued"
                    ? `Queued${request.aiReviewJob.priorityQueuePosition ? ` — position #${request.aiReviewJob.priorityQueuePosition}` : ""}`
                    : request.aiReviewJob.status}
              </p>
            </div>
          )}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-slate-500">Legal Reviewer</p>
          <p className="mt-1 font-bold text-slate-900">
            {request.assignedReviewer || "Not assigned"}
          </p>
        </div>
        {showChecklistProgress && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-slate-500">Review Checklist Progress</p>
            <p className="mt-1 font-bold text-slate-900">
              {totalItems === 0
                ? "No document checklist yet"
                : `${completedItems} of ${totalItems} AI-selected`}
            </p>
          </div>
        )}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-slate-500">Assigned Department Approver</p>
          <p className="mt-1 font-bold text-slate-900">
            {request.assignedDepartmentApprover || "Not assigned"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-slate-500">Department Review</p>
          <p className="mt-1 font-bold text-slate-900">{departmentDecision}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-slate-500">Legal Manager Review</p>
          <p className="mt-1 font-bold text-slate-900">{managerDecision}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-slate-500">Your Access on This Page</p>
          <p className="mt-1 font-bold text-slate-900">
            {canManageReview
              ? "Legal Reviewer actions enabled"
              : canManageManagerActions
                ? "Legal Manager actions enabled"
                : canManageDepartmentApproval
                  ? "Department actions enabled"
                  : "View-only"}
          </p>
        </div>
      </div>
    </div>
  );
}



function RequestDetails({
  request,
  currentUser,
  canManageReview,
  canManageManagerActions,
  canManageDepartmentApproval,
  onAddComment,
  onManagerDecisionChange,
  onDepartmentDecisionChange,
  onChecklistItemToggle,
  users,
  onAssignReviewer,
  onRouteRequest,
  onDeleteRequest,
  onUpdateDocuments,
}) {
  // selectedDocument stores the PDF the user clicked, so we can show it in the popup.
  const [selectedDocument, setSelectedDocument] = useState(null);

  // These two pieces of state make the status card update immediately after workflow saves.
  const [managerDecision, setManagerDecision] = useState(
    "Pending Legal Manager Review",
  );
  const [departmentDecision, setDepartmentDecision] = useState(
    "Pending Department Review",
  );

  useEffect(() => {
    if (!request) return;

    setManagerDecision(
      request.managerDecision || "Pending Legal Manager Review",
    );
    setDepartmentDecision(
      request.departmentDecision || "Pending Department Review",
    );
  }, [request]);

  if (!request) {
    return (
      <section className="workspace-panel p-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Request Details</h2>
        <p className="text-slate-500 mt-2">
          Select a legal request from the Legal Requests page to view details.
        </p>
      </section>
    );
  }

  const firstDocument = request.documents[0];
  const isRequester = currentUser?.role === "Requester";
  const departmentReviewers = users.filter(
    (user) =>
      user.role === "Legal Reviewer" &&
      user.department === currentUser?.department,
  );

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="page-kicker">Matter workspace</p>
          <h2>Request details</h2>
          <p>Review the source record, document analysis, decisions, and assigned actions.</p>
        </div>
        <div className="matter-reference"><span>{request.trackingNumber || request.id}</span><small>Tracking number · Confidential matter</small></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="matter-overview-card">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="page-kicker">{request.categoryCode} · {request.department}</p>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {request.title}
                </h3>
                <p className="text-slate-600 mt-3">{request.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="status-badge status-info">
                  {request.status}
                </span>
                {onDeleteRequest && (
                  <button
                    type="button"
                    className="rounded-lg bg-red-700 px-3 py-1 text-sm font-semibold text-white hover:bg-red-800"
                    onClick={() => {
                      if (window.confirm(`Delete ${request.id}? This cannot be undone.`)) onDeleteRequest();
                    }}
                  >
                    Delete Request
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Category:</span>{" "}
                {request.categoryCode} - {request.categoryName}
              </p>
              <p>
                <span className="font-semibold">Department:</span>{" "}
                {request.department}
              </p>
              <p>
                <span className="font-semibold">Requester:</span>{" "}
                {request.requester}
              </p>
              <p>
                <span className="font-semibold">Assigned Reviewer:</span>{" "}
                {request.assignedReviewer}
              </p>
              <p>
                <span className="font-semibold">Priority:</span>{" "}
                {request.priority}
              </p>
              <p>
                <span className="font-semibold">Risk Level:</span>{" "}
                {request.riskLevel}
              </p>
              <p>
                <span className="font-semibold">Deadline:</span>{" "}
                {request.deadline}
              </p>
              <p>
                <span className="font-semibold">Sent Time:</span>{" "}
                {request.submittedAt || "Not recorded"}
              </p>
            </div>

            <div className="mt-6">
              <h4 className="font-semibold text-slate-900">Supporting Documents</h4>
              <p className="text-sm text-slate-500 mt-1">
                PDFs open in the secure review workspace. Word and Excel files download through the authenticated server.
              </p>
              <ul className="mt-3 space-y-2">
                {request.documents.length === 0 ? (
                  <li className="text-sm text-slate-500">No supporting document uploaded.</li>
                ) : (
                  request.documents.map((document) => {
                    const documentName = document.name || document;
                    const isPdf = isPdfDocument(document);
                    const content = (
                      <>
                        <span className="document-row-icon"><Icon name="file" size={19} /></span>
                        <span className="document-row-copy"><strong>{documentName}</strong><small>{isPdf ? "Open secure PDF review" : `Download secure ${getDocumentTypeLabel(document)} document`}</small></span>
                        {document.isCurrent && request.previousDocumentId && (
                          <span className="ml-2 rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">Current</span>
                        )}
                        <Icon className="document-row-arrow" name="chevronRight" size={17} />
                      </>
                    );

                    return (
                      <li key={documentName}>
                        {isPdf ? (
                          <button type="button" className="document-row" onClick={() => setSelectedDocument(document)}>{content}</button>
                        ) : (
                          <a className="document-row" href={document.url} target="_blank" rel="noreferrer">{content}</a>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>


          {isRequester && request.status === "Waiting for More Information" && (
            <RequestPdfResubmissionPanel
              documents={request.documents}
              onUpdateDocuments={onUpdateDocuments}
            />
          )}
          {request.previousAiReviewResult && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-bold text-slate-900">Previous PDF AI Review</h3>
              <p className="mt-1 text-sm text-slate-600">The previous PDF result is kept for comparison while the new PDF is reviewed.</p>
              <p className="mt-3 text-sm text-slate-700">{request.previousAiSummary || request.previousAiReviewResult.draft_review_note || "Previous AI review result archived."}</p>
            </div>
          )}
          <AiLegalReviewPanel review={request.aiReviewResult} />
          <ReviewStatusCard
            request={{ ...request, managerDecision, departmentDecision }}
            document={firstDocument}
            canManageReview={canManageReview}
            canManageManagerActions={canManageManagerActions}
            canManageDepartmentApproval={canManageDepartmentApproval}
            showChecklistProgress={!isRequester}
          />
          {canManageManagerActions && (
            <ManagerActions
              request={request}
              canManageManagerActions={canManageManagerActions}
              reviewers={departmentReviewers}
              onAssignReviewer={onAssignReviewer}
              onManagerDecisionChange={async (nextDecision) => {
                const savedDecision = await onManagerDecisionChange(nextDecision);
                setManagerDecision(savedDecision.managerDecision);
              }}
            />
          )}
          {canManageReview &&
            (request.assignedReviewer === currentUser.name || currentUser?.role === "Owner") && (
            <ReviewerRoutingPanel
              request={request}
              canRouteRequest
              onRouteRequest={onRouteRequest}
            />
          )}
          {canManageDepartmentApproval && (
            <DepartmentApprovalPanel
              request={request}
              canManageDepartmentApproval={canManageDepartmentApproval}
              decision={departmentDecision}
              onDecisionChange={async (nextDecision, commentText) => {
                const savedDecision = await onDepartmentDecisionChange(
                  nextDecision,
                  commentText,
                );
                setDepartmentDecision(savedDecision.departmentDecision);
              }}
            />
          )}
          <ReviewerComments
            initialComments={request.reviewerComments}
            currentUser={currentUser}
            onAddComment={onAddComment}
          />
        </div>

        {!isRequester && (
          <ContractChecklist
            requestId={request.id}
            document={firstDocument}
            canManageReview={canManageReview}
            onChecklistItemToggle={onChecklistItemToggle}
          />
        )}
      </div>

      {selectedDocument && (
        <PdfReviewModal
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}

    </section>
  );
}

export default RequestDetails;

/*
BEGINNER DOCUMENTATION:

1. What is early return?
If no request is selected, we return a simple message before rendering the full details page.

2. What is component composition?
RequestDetails uses smaller components inside it: AiSummaryBox, ReviewerComments, ContractChecklist, and PdfReviewModal.

3. What is role-specific rendering?
Some panels only appear for the role that can act on them. Legal Manager actions are visible only to Legal Managers, and Department Approval is visible only to Department Approvers.

4. What is responsive layout?
Tailwind classes like grid-cols-1 and xl:grid-cols-3 change the layout depending on screen size.

5. Why click the PDF instead of always showing it?
Opening the PDF in a popup keeps the details page clean and gives reviewers a focused document-review workspace.
*/
