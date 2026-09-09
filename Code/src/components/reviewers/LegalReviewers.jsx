import { useEffect, useState } from "react";
import { isAvailableLegalReviewer } from "../../config/reviewTeam";
import { getRequestStatusLabel } from "../../utils/requestStatus";

function getPriorityStyle(priority) {
  if (priority === "Urgent") return "bg-red-100 text-red-700";
  if (priority === "High") return "bg-orange-100 text-orange-700";
  if (priority === "Medium") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

function getReviewerRequests(reviewer, requests) {
  return requests.filter(
    (request) => (request.assignedReviewerIds || [request.assignedReviewerId].filter(Boolean)).includes(reviewer.id),
  );
}

function LegalReviewers({
  users,
  requests,
  activeUserIds,
  onSelectRequest,
}) {
  // selectedReviewerId controls which reviewer details appear on the right side.
  const legalReviewers = users.filter(isAvailableLegalReviewer);
  const [selectedReviewerId, setSelectedReviewerId] = useState(
    legalReviewers[0]?.id || "",
  );

  const selectedReviewer = legalReviewers.find(
    (reviewer) => reviewer.id === selectedReviewerId,
  );
  const selectedReviewerRequests = selectedReviewer
    ? getReviewerRequests(selectedReviewer, requests)
    : [];

  useEffect(() => {
    if (!legalReviewers.some((reviewer) => reviewer.id === selectedReviewerId)) {
      setSelectedReviewerId(legalReviewers[0]?.id || "");
    }
  }, [legalReviewers, selectedReviewerId]);

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Legal Reviewers</h2>
        <p className="text-slate-500 mt-1">
          Legal Managers can monitor reviewer workload and see which requests
          each Legal Reviewer has reviewed or is reviewing.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-4">
          {legalReviewers.map((reviewer) => {
            const reviewerRequests = getReviewerRequests(reviewer, requests);
            const underReviewCount = reviewerRequests.filter(
              (request) => request.status === "Under Review",
            ).length;
            const highRiskCount = reviewerRequests.filter(
              (request) => request.riskLevel === "High",
            ).length;
            const isSelected = reviewer.id === selectedReviewerId;
            const isActive = activeUserIds.includes(reviewer.id);

            return (
              <button
                key={reviewer.id}
                type="button"
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  isSelected
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                onClick={() => setSelectedReviewerId(reviewer.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-900">{reviewer.name}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  @{reviewer.username} • {reviewer.department}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white/70 p-2">
                    <p className="font-bold text-slate-900">
                      {reviewerRequests.length}
                    </p>
                    <p className="text-slate-500">Assigned</p>
                  </div>
                  <div className="rounded-xl bg-white/70 p-2">
                    <p className="font-bold text-slate-900">
                      {underReviewCount}
                    </p>
                    <p className="text-slate-500">Reviewing</p>
                  </div>
                  <div className="rounded-xl bg-white/70 p-2">
                    <p className="font-bold text-slate-900">{highRiskCount}</p>
                    <p className="text-slate-500">High Risk</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedReviewer ? (
            <p className="text-slate-500">No legal reviewer selected.</p>
          ) : (
            <>
              <div className="mb-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Reviewer Activity
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedReviewer.name}
                  </h3>
                  {activeUserIds.includes(selectedReviewer.id) ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Requests currently assigned to this reviewer.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-4 text-left font-semibold">Request</th>
                        <th className="p-4 text-left font-semibold">
                          Sent Time
                        </th>
                        <th className="p-4 text-left font-semibold">
                          Requester
                        </th>
                        <th className="p-4 text-left font-semibold">
                          Request Type
                        </th>
                        <th className="p-4 text-left font-semibold">
                          Department
                        </th>
                        <th className="p-4 text-left font-semibold">
                          Priority
                        </th>
                        <th className="p-4 text-left font-semibold">Status</th>
                        <th className="p-4 text-left font-semibold">
                          Reviewers
                        </th>
                        <th className="p-4 text-left font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReviewerRequests.length === 0 ? (
                        <tr>
                          <td
                            className="p-6 text-center text-slate-500"
                            colSpan={9}
                          >
                            This reviewer has no assigned requests yet.
                          </td>
                        </tr>
                      ) : (
                        selectedReviewerRequests.map((request) => (
                          <tr
                            key={request.id}
                            className="border-t border-slate-100 hover:bg-slate-50"
                          >
                            <td className="p-4 text-slate-700">
                              <p className="font-semibold text-slate-900">
                                {request.title}
                              </p>
                              <p className="text-xs text-slate-500">
                                {request.id} • Due {request.deadline}
                              </p>
                            </td>
                            <td className="p-4 text-slate-700">
                              {request.submittedAt || "Not recorded"}
                            </td>
                            <td className="p-4 text-slate-700">
                              {request.requester}
                            </td>
                            <td className="p-4 text-slate-700">
                              <p>{request.categoryName}</p>
                              <p className="text-xs text-slate-500">
                                {request.categoryCode}
                              </p>
                            </td>
                            <td className="p-4 text-slate-700">
                              {request.department}
                            </td>
                            <td className="p-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityStyle(
                                  request.priority,
                                )}`}
                              >
                                {request.priority}
                              </span>
                            </td>
                            <td className="p-4 text-slate-700">
                              {getRequestStatusLabel(request.status)}
                            </td>
                            <td className="p-4 text-slate-700">
                              {request.assignedReviewer}
                            </td>
                            <td className="p-4">
                              <button
                                type="button"
                                className="font-semibold text-blue-700 hover:underline"
                                onClick={() => onSelectRequest(request.id)}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default LegalReviewers;

/*
BEGINNER DOCUMENTATION:

1. Why does Legal Manager have this page?
The Legal Manager supervises Legal Reviewers, so this page shows reviewer workload and assigned requests.

2. What is derived data?
Counts like Assigned, Reviewing, and High Risk are calculated from the request list instead of typed manually.

3. Why does reviewer activity use a table?
It matches the Legal Requests page, so Legal Managers see requests in a familiar format.

4. Is this reviewer assignment management?
This page is workload monitoring. Graham Cowan manages one-or-more reviewer assignments from each request's details page.
*/
