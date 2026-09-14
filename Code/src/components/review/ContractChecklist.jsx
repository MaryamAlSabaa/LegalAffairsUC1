import { useEffect, useState } from "react";
import { contractChecklistItems } from "../../data/mockData";

function buildChecklistItems(document) {
  if (document?.checklist?.length) {
    return document.checklist;
  }

  return contractChecklistItems.map((item) => ({
    criteria: item,
    page: "Not reviewed yet",
    note: "This document has not been compared against this criterion yet.",
    checked: false,
  }));
}

function ContractChecklist({
  requestId,
  document,
  canManageReview,
  onChecklistItemToggle,
  locationForItem,
  onLocateItem,
}) {
  const checklistItems = buildChecklistItems(document);

  // checkedCriteria starts from the AI draft results, then legal staff can adjust it manually.
  const [checkedCriteria, setCheckedCriteria] = useState(() =>
    checklistItems.filter((item) => item.checked).map((item) => item.criteria),
  );
  const [savingCriteria, setSavingCriteria] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setCheckedCriteria(
      checklistItems
        .filter((item) => item.checked)
        .map((item) => item.criteria),
    );
  }, [document]);

  async function toggleCriteria(item) {
    if (!canManageReview || savingCriteria) return;

    if (!item.id) {
      setErrorMessage(
        "Run the document review before updating its checklist.",
      );
      return;
    }

    const isAlreadyChecked = checkedCriteria.includes(item.criteria);
    const nextChecked = !isAlreadyChecked;
    const previousCheckedCriteria = checkedCriteria;
    const nextCheckedCriteria = nextChecked
      ? [...checkedCriteria, item.criteria]
      : checkedCriteria.filter((checkedItem) => checkedItem !== item.criteria);

    setCheckedCriteria(nextCheckedCriteria);
    setSavingCriteria(item.criteria);
    setErrorMessage("");

    try {
      const saved = await onChecklistItemToggle({
        requestId,
        documentId: document.id,
        checklistItemId: item.id,
        criteria: item.criteria,
        checked: nextChecked,
      });
      if (saved === false) setCheckedCriteria(previousCheckedCriteria);
    } catch (error) {
      setCheckedCriteria(previousCheckedCriteria);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save checklist change.",
      );
    } finally {
      setSavingCriteria("");
    }
  }

  return (
    <div className="contract-checklist-panel bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-bold text-slate-900">Contract Review Checklist</h3>
      <p className="text-sm text-slate-500 mt-1">
        Compare each criterion against this document. Legal reviewers can
        confirm or correct the AI draft selections.
      </p>

      {!canManageReview && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          View-only: you can see review progress, but only the Legal Reviewer
          can change checklist items.
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="contract-checklist-scroll mt-4 space-y-3">
        {checklistItems.map((item) => {
          const isChecked = checkedCriteria.includes(item.criteria);
          const location = locationForItem?.(item);

          return (
            <div
              key={`${item.criteria}-${item.page}`}
              className={`block rounded-xl border p-3 ${
                isChecked
                  ? "border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-950/40"
                  : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
              } ${
                canManageReview
                  ? "cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700"
                  : "cursor-not-allowed"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  className="mt-1 accent-blue-700 disabled:opacity-80"
                  type="checkbox"
                  checked={isChecked}
                  aria-label={item.criteria}
                  disabled={!canManageReview || Boolean(savingCriteria) || !item.id}
                  onChange={() => toggleCriteria(item)}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 break-words">
                      {item.criteria}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        isChecked
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200"
                      }`}
                    >
                      {isChecked ? "Selected" : "Needs Review"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 break-words">
                    {item.note}
                  </p>

                  {location && onLocateItem ? <button type="button" onClick={() => onLocateItem(location)} className="mt-3 inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                    {location.page ? `View page ${location.page}` : `View ${location.sheet}!${location.cell}`}
                  </button> : <span className="mt-3 inline-flex text-xs text-slate-500">{!item.page || /^(N\/A|Not reviewed yet)$/i.test(item.page) ? "No confirmed source location" : item.page}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContractChecklist;

/*
BEGINNER DOCUMENTATION:

1. Why is the checklist checked automatically at first?
The AI draft can mark criteria it found in the PDF. That gives reviewers a starting point.

2. Why can legal reviewers change it?
AI is not final. Legal Affairs reviewers need to confirm or correct the checklist manually.

3. Why are some roles blocked from editing it?
Requesters, Legal Managers, and Department Approvers should see the review status, but only Legal Reviewer manages checklist review work.

4. What does disabled mean on a checkbox?
disabled makes a form control visible but not editable.
*/
