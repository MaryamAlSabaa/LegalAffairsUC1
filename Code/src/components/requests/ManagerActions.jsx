import { useState } from "react";

function ManagerActions({
  request,
  canManageManagerActions,
  reviewers,
  onManagerDecisionChange,
  onAssignReviewer,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showAssignment, setShowAssignment] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");

  if (!request) return null;

  const disabledButtonClasses = "cursor-not-allowed opacity-60";
  const actionsDisabled = !canManageManagerActions || isSaving;
  const selectedReviewer = reviewers.find(
    (reviewer) => reviewer.id === selectedReviewerId,
  );

  async function updateManagerDecision(nextDecision) {
    if (!canManageManagerActions || isSaving) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      await onManagerDecisionChange(nextDecision);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save manager action.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmReviewerAssignment() {
    if (!selectedReviewer || actionsDisabled) {
      setErrorMessage("Select a Legal Reviewer before confirming assignment.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      await onAssignReviewer(selectedReviewer.id);
      setShowAssignment(false);
      setSelectedReviewerId("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not assign the reviewer.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-bold text-slate-900">Legal Manager Actions</h3>
      <p className="text-sm text-slate-500 mt-1">
        Approve, close, escalate, or assign this request to a Legal Reviewer in
        your department.
      </p>

      {!canManageManagerActions && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          View-only: this card is visible for transparency, but only the Legal
          Manager can use these manager actions.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          className={`rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:hover:bg-blue-700 ${
            actionsDisabled ? disabledButtonClasses : ""
          }`}
          type="button"
          disabled={actionsDisabled}
          onClick={() =>
            updateManagerDecision("Response Approved by Legal Manager")
          }
        >
          Approve Response
        </button>
        <button
          className={`rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:hover:bg-white ${
            actionsDisabled ? disabledButtonClasses : ""
          }`}
          type="button"
          disabled={actionsDisabled}
          onClick={() => updateManagerDecision("Closed by Legal Manager")}
        >
          Close Request
        </button>
        <button
          className={`rounded-lg border border-orange-300 px-4 py-3 font-semibold text-orange-700 hover:bg-orange-50 disabled:hover:bg-white ${
            actionsDisabled ? disabledButtonClasses : ""
          }`}
          type="button"
          disabled={actionsDisabled}
          onClick={() => updateManagerDecision("Escalated by Legal Manager")}
        >
          Escalate Request
        </button>
        <button
          className={`rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:hover:bg-white ${
            actionsDisabled ? disabledButtonClasses : ""
          }`}
          type="button"
          disabled={actionsDisabled}
          onClick={() => setShowAssignment(true)}
        >
          Assign Reviewer
        </button>
      </div>

      {showAssignment && (
        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <label className="block text-sm font-semibold text-slate-800">
            Legal Reviewers in your department
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900"
              value={selectedReviewerId}
              onChange={(event) => setSelectedReviewerId(event.target.value)}
              disabled={actionsDisabled || reviewers.length === 0}
            >
              <option value="">Select a reviewer</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.name} (@{reviewer.username})
                </option>
              ))}
            </select>
          </label>

          {reviewers.length === 0 && (
            <p className="mt-3 text-sm text-orange-700">
              No Legal Reviewers are configured for your department.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionsDisabled || !selectedReviewer}
              onClick={confirmReviewerAssignment}
            >
              Confirm Assignment
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-white"
              disabled={isSaving}
              onClick={() => setShowAssignment(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isSaving && (
        <p className="mt-4 text-xs font-semibold text-blue-700">
          Saving manager action to the shared record...
        </p>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

export default ManagerActions;

/*
BEGINNER DOCUMENTATION:

1. Why does Legal Manager have different actions?
The PDF says Legal Managers assign reviewers, approve responses, monitor dashboard, and close or escalate requests.

2. Why do these buttons save through the API?
Manager decisions affect workflow state, so they are persisted in manager_actions and legal_requests instead of staying only in browser state.
*/
