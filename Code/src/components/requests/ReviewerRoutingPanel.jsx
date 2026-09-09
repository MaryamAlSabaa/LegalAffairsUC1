import { useState } from "react";

function ReviewerRoutingPanel({ request, canRouteRequest, onRouteRequest }) {
  const [commentText, setCommentText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!request || !canRouteRequest) return null;

  async function routeRequest(destination) {
    if (!commentText.trim() || isSaving) {
      setErrorMessage("Add a message explaining this routing decision.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const saved = await onRouteRequest(destination, commentText.trim());
      if (saved === false) return;
      setCommentText("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not route this request.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold text-slate-900">Reviewer Routing</h3>
      <p className="mt-1 text-sm text-slate-500">
        Ask the requester for missing information, move the completed review to a
        Legal Manager, or route it to the matching Department Approver.
      </p>

      <label className="mt-4 block text-sm font-semibold text-slate-700">
        Message
        <textarea
          className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-900"
          value={commentText}
          onChange={(event) => setCommentText(event.target.value)}
          placeholder="Explain what information is needed or what requires manager review."
          disabled={isSaving}
        />
      </label>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          className="rounded-lg border border-orange-300 px-4 py-3 font-semibold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={() => routeRequest("requester")}
        >
          Return to Requester
        </button>
        <button
          type="button"
          className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={() => routeRequest("legal_manager")}
        >
          Move to Legal Manager Review Queue
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={() => routeRequest("department_approver")}
        >
          Move to Department Approver Queue
        </button>
      </div>

      {errorMessage && (
        <p className="mt-3 text-sm text-red-700">{errorMessage}</p>
      )}
    </section>
  );
}

export default ReviewerRoutingPanel;

/*
BEGINNER DOCUMENTATION:

1. Why is a message required?
A routing decision changes the request workflow. Requiring a message gives the requester or Legal Manager clear context and creates a saved reviewer comment.

2. What is a textarea?
<textarea> is an HTML form control for longer, multi-line text. It is useful here because a reviewer may need to explain missing documents or a legal concern in detail.

3. Why use async/await and isSaving?
Routing is saved through the API and can take time. async/await waits for that operation, while isSaving disables buttons so a double click cannot create two routing actions.

4. Why does the component return null?
Returning null renders nothing. The Request Details page shows this panel to Legal Reviewers and Owners; other roles do not receive reviewer routing controls.
*/
