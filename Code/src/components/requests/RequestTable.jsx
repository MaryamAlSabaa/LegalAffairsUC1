import { useEffect, useMemo, useState } from "react";
import Icon from "../common/Icon";
import { exportLegalTrackerCsv, getLegalTrackerRecord } from "../../utils/legalTracker";
import { getRequestStatusLabel } from "../../utils/requestStatus";

const completedStatuses = new Set(["Approved", "Closed", "Archived"]);
const emptyFilters = {
  status: "all",
  priority: "all",
  risk: "all",
  department: "all",
  category: "all",
  reviewer: "all",
  requester: "all",
  due: "all",
};

function getPriorityStyle(priority) {
  if (priority === "Urgent") return "priority-urgent";
  if (priority === "High") return "priority-high";
  if (priority === "Medium") return "priority-medium";
  return "priority-low";
}

function getStatusStyle(status = "") {
  if (["Approved", "Closed"].includes(status)) return "status-success";
  if (status.includes("Waiting") || status.includes("Approval")) return "status-warning";
  if (status.includes("Review") || status === "Under Review") return "status-info";
  return "status-neutral";
}

function getRiskStyle(riskLevel) {
  if (riskLevel === "High") return "priority-high";
  if (riskLevel === "Medium") return "priority-medium";
  if (riskLevel === "Low") return "priority-low";
  return "risk-neutral";
}

function matchesStatusFilter(request, statusFilter, assignedReviewerIds) {
  if (statusFilter === "all") return true;
  if (statusFilter === "completed") return completedStatuses.has(request.status);
  if (statusFilter === "reviewer-review") {
    return assignedReviewerIds.length > 0
      && ["Assigned to Legal Reviewer", "Under Review"].includes(request.status);
  }
  if (statusFilter === "pending-reviewer-assignment") {
    return assignedReviewerIds.length === 0
      && !completedStatuses.has(request.status)
      && request.status !== "Waiting for More Information";
  }
  if (statusFilter === "returned-to-requester") {
    return request.status === "Waiting for More Information";
  }
  return true;
}

function uniqueValues(requests, field) {
  return [...new Set(requests.map((request) => request[field]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" }),
  );
}

function parseDeadline(value) {
  if (!value || value === "No deadline selected") return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesDueFilter(request, dueFilter) {
  if (dueFilter === "all") return true;
  const deadline = parseDeadline(request.deadline);
  if (dueFilter === "none") return !deadline;
  if (!deadline) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);

  if (dueFilter === "overdue") return daysUntilDue < 0 && !completedStatuses.has(request.status);
  if (dueFilter === "next-7") return daysUntilDue >= 0 && daysUntilDue <= 7;
  if (dueFilter === "next-30") return daysUntilDue >= 0 && daysUntilDue <= 30;
  return true;
}

function SortButton({ label, column, sortConfig, onSort }) {
  const isActive = sortConfig.column === column;
  return (
    <button type="button" className={`table-sort ${isActive ? "is-sorted" : ""}`} onClick={() => onSort(column)}>
      <span>{label}</span>
      {isActive && <span aria-label={`Sorted ${sortConfig.direction}`}>{sortConfig.direction === "ascending" ? "↑" : "↓"}</span>}
    </button>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="advanced-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function RequestTable({
  requests,
  onSelectRequest,
  canOpenDetails,
  canOpenRequest,
  title,
  description,
  kicker = "Matter management",
  tabs = [],
  activeTab,
  onTabChange,
  legalTrackerMode = false,
}) {
  const [sortConfig, setSortConfig] = useState({ column: "submittedAt", direction: "descending" });
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const options = useMemo(() => ({
    priorities: uniqueValues(requests, "priority"),
    risks: uniqueValues(requests, "riskLevel"),
    departments: uniqueValues(requests, "department"),
    categories: [...new Map(requests.filter((request) => request.categoryCode).map((request) => [request.categoryCode, request.categoryName])).entries()],
    reviewers: [...new Set(requests.flatMap((request) =>
      request.assignedReviewers?.length
        ? request.assignedReviewers.map((reviewer) => reviewer.name)
        : request.assignedReviewer && request.assignedReviewer !== "Not Assigned"
          ? [request.assignedReviewer]
          : [],
    ))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    requesters: uniqueValues(requests, "requester"),
  }), [requests]);

  const activeFilterCount = Object.values(filters).filter((value) => value !== "all").length + (searchTerm.trim() ? 1 : 0);

  const filteredRequests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = requests.filter((request) => {
      const searchable = [
        request.id,
        request.title,
        request.description,
        request.requester,
        request.requesterUsername,
        request.department,
        request.categoryName,
        request.categoryCode,
        request.priority,
        request.riskLevel,
        request.status,
        getRequestStatusLabel(request.status),
        request.assignedReviewer,
        request.partyName,
        request.endUser,
        request.lastAction,
        ...(request.reviewerComments || []).flatMap((comment) => [comment.authorName, comment.text]),
        request.deadline,
        request.submittedAt,
      ].filter(Boolean).join(" ").toLowerCase();

      const assignedReviewerIds = request.assignedReviewerIds || [request.assignedReviewerId].filter(Boolean);
      const assignedReviewerNames = request.assignedReviewers?.length
        ? request.assignedReviewers.map((reviewer) => reviewer.name)
        : request.assignedReviewer && request.assignedReviewer !== "Not Assigned"
          ? [request.assignedReviewer]
          : [];
      return (!query || searchable.includes(query))
        && matchesStatusFilter(request, filters.status, assignedReviewerIds)
        && (filters.priority === "all" || request.priority === filters.priority)
        && (filters.risk === "all" || request.riskLevel === filters.risk)
        && (filters.department === "all" || request.department === filters.department)
        && (filters.category === "all" || request.categoryCode === filters.category)
        && (filters.reviewer === "all" || assignedReviewerNames.includes(filters.reviewer))
        && (filters.requester === "all" || request.requester === filters.requester)
        && matchesDueFilter(request, filters.due);
    });

    const priorityRank = { Low: 1, Medium: 2, High: 3, Urgent: 4 };
    const riskRank = { "Not Classified": 0, Low: 1, Medium: 2, High: 3 };
    filtered.sort((first, second) => {
      let firstValue = first[sortConfig.column];
      let secondValue = second[sortConfig.column];
      if (sortConfig.column === "submittedAt") {
        firstValue = Date.parse(first.submittedAtIso || first.submittedAt || "") || 0;
        secondValue = Date.parse(second.submittedAtIso || second.submittedAt || "") || 0;
      } else if (sortConfig.column === "deadline") {
        firstValue = parseDeadline(first.deadline)?.getTime() || Number.MAX_SAFE_INTEGER;
        secondValue = parseDeadline(second.deadline)?.getTime() || Number.MAX_SAFE_INTEGER;
      } else if (sortConfig.column === "priority") {
        firstValue = priorityRank[first.priority] || 0;
        secondValue = priorityRank[second.priority] || 0;
      } else if (sortConfig.column === "riskLevel") {
        firstValue = riskRank[first.riskLevel] || 0;
        secondValue = riskRank[second.riskLevel] || 0;
      }

      const comparison = typeof firstValue === "number"
        ? firstValue - secondValue
        : String(firstValue || "").localeCompare(String(secondValue || ""), undefined, { sensitivity: "base" });
      return sortConfig.direction === "ascending" ? comparison : -comparison;
    });
    return filtered;
  }, [requests, searchTerm, filters, sortConfig]);

  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [searchTerm, filters, sortConfig, pageSize]);
  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function resetFilters() {
    setSearchTerm("");
    setFilters(emptyFilters);
  }

  function handleSort(column) {
    setSortConfig((current) => ({
      column,
      direction: current.column === column && current.direction === "ascending" ? "descending" : "ascending",
    }));
  }

  return (
    <section className="requests-page">
      <div className="page-heading table-page-heading">
        <div><p className="page-kicker">{kicker}</p><h2>{title}</h2><p>{description}</p></div>
        <div className="record-count"><span>{filteredRequests.length}</span><div><strong>records</strong><small>matching filters</small></div></div>
      </div>

      <div className="table-panel">
        {tabs.length > 0 && (
          <div className="request-scope-tabs" role="tablist" aria-label="Request table scope">
            {tabs.map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "is-active" : ""}
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
              >
                <span>{tab.label}</span>
                <strong>{tab.count}</strong>
              </button>
            ))}
          </div>
        )}
        <div className="table-toolbar">
          <label className="table-search"><Icon name="search" size={18} /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Filter this request table" /></label>
          <div className="table-toolbar-actions">
            {legalTrackerMode && (
              <button
                type="button"
                className="table-export-button"
                onClick={() => exportLegalTrackerCsv(filteredRequests)}
                disabled={filteredRequests.length === 0}
                title="Export all requests matching the current filters"
              >
                <Icon name="download" size={15} />
                Export CSV
              </button>
            )}
            <button type="button" className={`filter-toggle ${filtersExpanded ? "is-open" : ""}`} onClick={() => setFiltersExpanded((value) => !value)} aria-expanded={filtersExpanded} aria-controls="request-table-filters">
              <Icon name="filter" size={15} />
              <span>{filtersExpanded ? "Hide filters" : "Show filters"}</span>
              {activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}
              <Icon name="chevronDown" size={15} />
            </button>
            <button type="button" className="filter-reset" onClick={resetFilters} disabled={activeFilterCount === 0}>Clear all</button>
          </div>
        </div>

        {filtersExpanded && <div className="table-filter-grid" id="request-table-filters">
          <FilterSelect label="Status" value={filters.status} onChange={(value) => updateFilter("status", value)}>
            <option value="all">All request statuses</option>
            <option value="completed">Completed</option>
            <option value="reviewer-review">Under review by reviewer</option>
            <option value="pending-reviewer-assignment">Pending assignment to reviewer</option>
            <option value="returned-to-requester">Returned to requester</option>
          </FilterSelect>
          <FilterSelect label="Priority" value={filters.priority} onChange={(value) => updateFilter("priority", value)}><option value="all">All priorities</option>{options.priorities.map((value) => <option value={value} key={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Risk" value={filters.risk} onChange={(value) => updateFilter("risk", value)}><option value="all">All risk levels</option>{options.risks.map((value) => <option value={value} key={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Department" value={filters.department} onChange={(value) => updateFilter("department", value)}><option value="all">All departments</option>{options.departments.map((value) => <option value={value} key={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Category" value={filters.category} onChange={(value) => updateFilter("category", value)}><option value="all">All categories</option>{options.categories.map(([code, name]) => <option value={code} key={code}>{code} - {name}</option>)}</FilterSelect>
          <FilterSelect label="Reviewers" value={filters.reviewer} onChange={(value) => updateFilter("reviewer", value)}><option value="all">All reviewers</option>{options.reviewers.map((value) => <option value={value} key={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Requester" value={filters.requester} onChange={(value) => updateFilter("requester", value)}><option value="all">All requesters</option>{options.requesters.map((value) => <option value={value} key={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Due date" value={filters.due} onChange={(value) => updateFilter("due", value)}><option value="all">Any due date</option><option value="overdue">Overdue</option><option value="next-7">Due in 7 days</option><option value="next-30">Due in 30 days</option><option value="none">No deadline</option></FilterSelect>
        </div>}

        <div className="overflow-x-auto">
          <table className={`professional-table request-register-table ${legalTrackerMode ? "legal-tracker-table" : ""}`}>
            <thead><tr>
              <th><SortButton label="Matter" column="title" sortConfig={sortConfig} onSort={handleSort} /></th>
              {legalTrackerMode ? (
                <>
                  <th><SortButton label="Date Received" column="submittedAt" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Deadline" column="deadline" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th>Party Name</th>
                  <th>End User</th>
                  <th><SortButton label="Matter Type" column="categoryName" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Responsible Lawyer (reviewer)" column="assignedReviewer" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th>Comments / Notes</th>
                  <th>Last Update / Actions Taken</th>
                  <th>Legal Department Status (C/O)</th>
                  <th>End User Status (C/O)</th>
                  <th>Date of Completion / AnaSign Signature</th>
                </>
              ) : (
                <>
                  <th><SortButton label="Submitted" column="submittedAt" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Requester" column="requester" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Department" column="department" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Category" column="categoryName" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Priority" column="priority" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Risk" column="riskLevel" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Status" column="status" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Reviewers" column="assignedReviewer" sortConfig={sortConfig} onSort={handleSort} /></th>
                  <th><SortButton label="Due" column="deadline" sortConfig={sortConfig} onSort={handleSort} /></th>
                </>
              )}
              {canOpenDetails && <th aria-label="Actions" />}
            </tr></thead>
            <tbody>
              {pageRequests.length === 0 ? (
                <tr><td className="table-empty" colSpan={(legalTrackerMode ? 12 : 10) + (canOpenDetails ? 1 : 0)}><span><Icon name="search" size={23} /></span><strong>No matching matters</strong><p>Adjust or clear the filters to see more results.</p></td></tr>
              ) : pageRequests.map((request) => {
                const mayOpen = canOpenDetails && (!canOpenRequest || canOpenRequest(request));
                const tracker = getLegalTrackerRecord(request);
                return (
                  <tr key={request.id} className={request.status === "Closed" ? "is-closed" : ""}>
                    <td><div className="matter-cell"><span className="matter-file"><Icon name="file" size={18} /></span><div><strong>{request.title}</strong><p>Tracking {request.trackingNumber || request.id}</p></div></div></td>
                    {legalTrackerMode ? (
                      <>
                        <td><span className="date-cell">{tracker.dateReceived}</span></td>
                        <td><span>{tracker.deadline}</span></td>
                        <td><span>{tracker.partyName}</span></td>
                        <td><span>{tracker.endUser}</span></td>
                        <td><span>{tracker.matterType}</span><small>{request.categoryCode}</small></td>
                        <td><span>{tracker.responsibleLawyer}</span></td>
                        <td className="tracker-long-text"><span>{tracker.commentsNotes}</span></td>
                        <td className="tracker-long-text"><span>{tracker.lastUpdateActionsTaken}</span></td>
                        <td><span className={`tracker-co-badge ${tracker.legalDepartmentStatus === "C" ? "is-closed" : "is-open"}`}>{tracker.legalDepartmentStatus}</span></td>
                        <td><span className={`tracker-co-badge ${tracker.endUserStatus === "C" ? "is-closed" : "is-open"}`}>{tracker.endUserStatus}</span></td>
                        <td className="tracker-long-text"><span>{tracker.completionAnaSign}</span></td>
                      </>
                    ) : (
                      <>
                        <td><span className="date-cell">{request.submittedAt || "Not recorded"}</span></td>
                        <td><strong className="requester-name">{request.requester}</strong><small>@{request.requesterUsername}</small></td>
                        <td><span>{request.department}</span></td>
                        <td><span>{request.categoryName}</span><small>{request.categoryCode}</small></td>
                        <td><span className={`priority-badge ${getPriorityStyle(request.priority)}`}><i />{request.priority}</span></td>
                        <td><span className={`risk-label ${getRiskStyle(request.riskLevel)}`}>{request.riskLevel || "Not Classified"}</span></td>
                        <td><span className={`status-badge ${getStatusStyle(request.status)}`}>{getRequestStatusLabel(request.status)}</span>{request.aiReviewJob?.status === "processing" && <small className="processing-label">Processing - {request.aiReviewJob.currentStep || "AI review"}</small>}</td>
                        <td><span>{request.assignedReviewer || "Not assigned"}</span></td>
                        <td><span>{request.deadline || "No deadline"}</span></td>
                      </>
                    )}
                    {canOpenDetails && <td><button className="row-action" type="button" disabled={!mayOpen} onClick={() => mayOpen && onSelectRequest(request.id)} title={mayOpen ? "Open request" : "Request details are available to the assigned reviewer"} aria-label={mayOpen ? `Open ${request.title}` : `${request.title} is assigned to another reviewer`}><Icon name={mayOpen ? "chevronRight" : "lock"} size={17} /></button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-footer table-pagination">
          <span>Showing {filteredRequests.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredRequests.length)} of {filteredRequests.length} matching matters ({requests.length} total)</span>
          <div className="pagination-controls">
            <label>Rows <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={15}>15</option><option value={25}>25</option><option value={50}>50</option></select></label>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button>
            <span>Page {currentPage} of {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Next</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default RequestTable;
