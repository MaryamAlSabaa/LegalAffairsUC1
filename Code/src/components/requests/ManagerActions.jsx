import { useState } from "react";

function ManagerActions({
  request,
  canManageManagerActions,
  onManagerDecisionChange,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  if (!request) return null;

  const disabledButtonClasses = "cursor-not-allowed opacity-60";
  const actionsDisabled = !canManageManagerActions || isSaving;
  async function updateManagerDecision(nextDecision) {
    if (!canManageManagerActions || isSaving) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      await onManagerDecisionChange(nextDecision);
      if (nextDecision === "Closed by Legal Manager") setShowCloseConfirmation(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save manager action.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-bold text-slate-900">Legal Manager Actions</h3>
      <p className="text-sm text-slate-500 mt-1">
        Record the Legal Manager's final workflow decision. Each action explains its effect below.
      </p>

      {!canManageManagerActions && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          View-only: this card is visible for transparency, but only the Legal
          Manager can use these manager actions.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <button
            className={`w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:hover:bg-blue-700 ${
              actionsDisabled ? disabledButtonClasses : ""
            }`}
            type="button"
            disabled={actionsDisabled}
            onClick={() =>
              updateManagerDecision("Response Approved by Legal Manager")
            }
          >
            Approve Response &amp; Complete
          </button>
          <p className="mt-2 text-xs leading-5 text-blue-900">
            Confirms the final legal response is approved and marks the request, Legal Department status, and End User status as completed.
          </p>
        </div>

        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <button
            className={`w-full rounded-lg border border-orange-400 bg-white px-4 py-3 font-semibold text-orange-800 hover:bg-orange-100 disabled:hover:bg-white ${
              actionsDisabled ? disabledButtonClasses : ""
            }`}
            type="button"
            disabled={actionsDisabled}
            onClick={() => updateManagerDecision("Escalated by Legal Manager")}
          >
            Flag as Escalated
          </button>
          <p className="mt-2 text-xs leading-5 text-orange-900">
            No escalation recipient is configured yet. This records the escalation and keeps the request open and under review.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border-2 border-red-300 bg-red-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-red-800">Important action</p>
        <p className="mt-1 text-xs leading-5 text-red-800">
          Close the request without approving a final legal response. A confirmation is required.
        </p>
        <button
          className={`mt-3 w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-800 disabled:hover:bg-red-700 ${
            actionsDisabled ? disabledButtonClasses : ""
          }`}
          type="button"
          disabled={actionsDisabled}
          onClick={() => setShowCloseConfirmation(true)}
        >
          Close Request
        </button>
      </div>

      {showCloseConfirmation && (
        <div className="mt-4 rounded-xl border-2 border-red-400 bg-white p-4" role="alertdialog" aria-labelledby="close-request-confirmation-title">
          <h4 className="font-bold text-red-900" id="close-request-confirmation-title">Confirm request closure</h4>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Close <strong>{request.trackingNumber || request.id}</strong>? This ends the active workflow, records the completion date, and changes both C/O statuses to C.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={isSaving}
              onClick={() => setShowCloseConfirmation(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={isSaving}
              onClick={() => updateManagerDecision("Closed by Legal Manager")}
            >
              {isSaving ? "Closing request…" : "Yes, close request"}
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
