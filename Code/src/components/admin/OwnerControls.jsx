import { useState } from "react";

function describeOwnerActionError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = error.message || error.details || error.hint || error.error;
    if (message) return String(message);
  }
  return "Owner action failed. Check the API connection and apply the latest PostgreSQL schema.";
}

function OwnerControls({ onResetAiResults, onDeleteClosedRequests }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  async function confirmAction() {
    if (!pendingAction || isSaving) return;
    setIsSaving(true);
    setMessage("");

    try {
      const count = await pendingAction.action();
      setMessage(`${count} request${count === 1 ? " was" : "s were"} updated.`);
    } catch (error) {
      setMessage(describeOwnerActionError(error));
    } finally {
      setPendingAction(null);
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-bold text-slate-900">Owner Controls</h2>
      <p className="mt-1 text-slate-500">Restricted maintenance actions that are unavailable to Admin Users.</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-bold text-amber-950">Reset AI Results</h3>
          <p className="mt-2 text-sm text-amber-900">Clears stored AI results, suggestions, checklists, and jobs. Queueable active requests return to pending AI review.</p>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setPendingAction({
              title: "Reset AI results?",
              description: "This clears AI results, suggestions, checklist output, and queue jobs across active requests. Human workflow decisions remain.",
              confirmLabel: "Confirm AI Reset",
              action: onResetAiResults,
              tone: "amber",
            })}
            className="mt-4 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            Reset AI Results
          </button>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h3 className="font-bold text-red-950">Delete All Closed Requests</h3>
          <p className="mt-2 text-sm text-red-900">Permanently removes every request whose status is Closed. This cannot be undone.</p>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setPendingAction({
              title: "Delete all closed requests?",
              description: "Every closed request and its related database records will be permanently removed. This cannot be undone.",
              confirmLabel: "Confirm Delete Closed Requests",
              action: onDeleteClosedRequests,
              tone: "red",
            })}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            Delete Closed Requests
          </button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">{pendingAction.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{pendingAction.description}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setPendingAction(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={confirmAction}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${pendingAction.tone === "red" ? "bg-red-700 hover:bg-red-800" : "bg-amber-700 hover:bg-amber-800"}`}
              >
                {isSaving ? "Applying action..." : pendingAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default OwnerControls;
