import { useEffect, useState } from "react";

function RequestComments({ initialComments, currentUser, onAddComment }) {
  const [comments, setComments] = useState(initialComments || []);
  const [newComment, setNewComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setComments(initialComments || []);
  }, [initialComments]);

  async function addComment() {
    if (!newComment.trim()) return;

    const commentToAdd = {
      authorName: currentUser?.name || "Current User",
      authorRole: currentUser?.role || "User",
      text: newComment.trim(),
    };

    setIsSaving(true);
    setErrorMessage("");

    try {
      if (onAddComment) {
        const saved = await onAddComment(commentToAdd.text);
        if (saved === false) return;
      }

      setComments([...comments, commentToAdd]);
      setNewComment("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save comment.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-bold text-slate-900">Request Comments</h3>
      <p className="text-sm text-slate-500 mt-1">
        Requesters, Legal Reviewers, Legal Managers, and Department Approvers can
        add comments. Each comment shows the author name and role.
      </p>

      <div className="mt-4 space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-500">No comments yet.</p>
        ) : (
          comments.map((comment, index) => {
            const commentText =
              typeof comment === "string" ? comment : comment.text;
            const authorName =
              typeof comment === "string"
                ? currentUser?.name || "User"
                : comment.authorName || comment.reviewerName || "User";
            const authorRole =
              typeof comment === "string"
                ? currentUser?.role || "User"
                : comment.authorRole || "Legal Reviewer";

            return (
              <div
                key={`${commentText}-${index}`}
                className="bg-slate-50 rounded-xl p-3 text-slate-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    {authorName}
                  </p>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700">
                    {authorRole}
                  </span>
                </div>
                <p className="mt-2">{commentText}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-4 py-3"
          value={newComment}
          onChange={(event) => setNewComment(event.target.value)}
          placeholder={`Add a comment as ${currentUser?.name || "current user"}`}
        />
        <button
          className="bg-slate-900 text-white rounded-lg px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-70"
          type="button"
          onClick={addComment}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Add Comment"}
        </button>
      </div>

      {errorMessage && (
        <p className="mt-3 text-sm font-semibold text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}

export default RequestComments;

/*
BEGINNER DOCUMENTATION:

1. Why did this change from reviewer-only comments?
The workflow needs comments from multiple roles: requester, reviewer, legal manager, and department approver.

2. Why show role beside the name?
A comment from a requester means something different from a comment from Legal Affairs, so the role helps readers understand context.

3. Why keep local state if comments are saved to PostgreSQL?
Local state updates the screen immediately after saving, so the user sees their new comment without reloading the page.
*/
