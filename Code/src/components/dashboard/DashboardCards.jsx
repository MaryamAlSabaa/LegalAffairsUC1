import { useEffect, useState } from "react";
import Icon from "../common/Icon";
import { getRequestStatusLabel } from "../../utils/requestStatus";

const completedStatuses = new Set(["Approved", "Closed", "Archived"]);

function deadlinePosition(value) {
  if (!value || value === "No deadline selected") return null;
  const deadline = new Date(`${value}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
}

function deadlineLabel(request) {
  const days = deadlinePosition(request.deadline);
  if (days === null) return "No deadline";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function RequestListModal({ title, description, requests, onClose, onSelectRequest }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dashboard-list-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-list-title">
        <header className="dashboard-list-modal-header">
          <div>
            <p className="page-kicker">Request follow-up</p>
            <h2 id="dashboard-list-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="dashboard-modal-close" onClick={onClose} aria-label="Close request list">&times;</button>
        </header>

        <div className="dashboard-list-modal-count"><strong>{requests.length}</strong> request{requests.length === 1 ? "" : "s"}</div>
        <div className="dashboard-modal-request-list">
          {requests.length === 0 ? (
            <div className="dashboard-modal-empty"><Icon name="inbox" size={24} /><strong>No requests in this list</strong><p>There is nothing requiring follow-up in this category.</p></div>
          ) : requests.map((request) => (
            <article className="dashboard-modal-request" key={request.id}>
              <span className="recent-file-icon"><Icon name="file" size={18} /></span>
              <div className="dashboard-modal-request-copy">
                <strong>{request.title}</strong>
                <p>{request.id} · {request.requester} · {getRequestStatusLabel(request.status)}</p>
                <span>{request.deadline ? deadlineLabel(request) : "No deadline"}</span>
              </div>
              <button type="button" onClick={() => { onClose(); onSelectRequest(request.id); }}>Open <Icon name="chevronRight" size={15} /></button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DashboardCards({ requests, allRequests = requests, notifications = [], onMarkNotificationRead, onSelectFilter, onSelectRequest, currentUser, activeFilter = "all" }) {
  const [openList, setOpenList] = useState(null);
  const isReviewer = currentUser?.role === "Legal Reviewer";
  const isManager = currentUser?.role === "Legal Manager";
  const isRequester = currentUser?.role === "Requester";
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((request) => !completedStatuses.has(request.status)).length;
  const inProgress = requests.filter((request) => !completedStatuses.has(request.status) && request.status !== "Waiting for More Information").length;
  const returnedToRequester = requests.filter((request) => request.status === "Waiting for More Information").length;
  const completedRequests = requests.filter((request) => completedStatuses.has(request.status));
  const dueSoonOrOverdueRequests = requests.filter((request) => {
    const days = deadlinePosition(request.deadline);
    return !completedStatuses.has(request.status) && days !== null && days <= 7;
  });
  const unassignedRequests = allRequests.filter((request) => {
    const reviewerIds = request.assignedReviewerIds || [request.assignedReviewerId].filter(Boolean);
    return reviewerIds.length === 0 && !completedStatuses.has(request.status);
  });

  const cards = [
    {
      label: isReviewer ? "My assigned requests" : "Total requests",
      value: isReviewer ? totalRequests : allRequests.length,
      icon: "inbox",
      tone: "blue",
      filter: "all",
      context: isReviewer ? `${totalRequests} of ${allRequests.length} total submitted` : "All submitted requests",
    },
    { label: "Requests in progress", value: inProgress, icon: "clipboard", tone: "indigo", filter: "under-review", context: `${pendingRequests} open requests` },
    { label: "Returned to Requester", value: returnedToRequester, icon: "clock", tone: "amber", filter: "returned-to-requester", context: "Awaiting requester response" },
    { label: "Due soon / overdue", value: dueSoonOrOverdueRequests.length, icon: "warning", tone: "rose", filter: "due", context: "Due within 7 days or overdue" },
    { label: "Completed requests", value: completedRequests.length, icon: "archive", tone: "green", filter: "completed", context: "Approved, closed, or archived" },
  ];
  const firstName = currentUser?.name?.split(" ")[0] || "colleague";

  return (
    <section className="dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <p className="page-kicker">Legal operations centre</p>
          <h2>Good day, {firstName}</h2>
          <p>{isReviewer ? "Your assigned workload is shown below, with access to the complete request register." : "Here is the current position of the legal requests in your workspace."}</p>
        </div>
        <div className="dashboard-summary-actions">
          {isManager && (
            <button type="button" className={`unassigned-requests-badge ${activeFilter === "unassigned" ? "is-active" : ""}`} aria-pressed={activeFilter === "unassigned"} onClick={() => { onSelectFilter("unassigned"); setOpenList("unassigned"); }}>
              <span><Icon name="warning" size={17} /></span>
              <div><strong>{unassignedRequests.length} unassigned</strong><small>Open request list</small></div>
              <Icon name="chevronRight" size={16} />
            </button>
          )}
          <div className="dashboard-date"><Icon name="calendar" size={18} /><div><span>Today</span><strong>{new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</strong></div></div>
        </div>
      </div>

      <div className="metric-grid">
        {cards.map((card) => (
          <button key={card.label} type="button" aria-pressed={activeFilter === card.filter} onClick={() => { onSelectFilter(card.filter); if (card.list) setOpenList(card.list); }} className={`metric-card metric-${card.tone} ${activeFilter === card.filter ? "is-active" : ""}`}>
            <div className="metric-card-top"><span className="metric-icon"><Icon name={card.icon} size={20} /></span></div>
            <p>{card.label}</p>
            <strong>{String(card.value).padStart(2, "0")}</strong>
            <div className="metric-context"><span>{card.context}</span><Icon name="arrowRight" size={16} /></div>
          </button>
        ))}
      </div>

      {isRequester && (
        <section className="requester-activity-card">
          <header>
            <div><p className="page-kicker">Request notifications</p><h3>Updates to your requests</h3></div>
            <span>{notifications.filter((notification) => !notification.isRead).length} unread</span>
          </header>
          <div className="requester-activity-list">
            {notifications.length === 0 ? (
              <div className="requester-activity-empty"><Icon name="bell" size={22} /><div><strong>No updates yet</strong><p>Reviewer comments, routing decisions, approvals, and other changes will appear here.</p></div></div>
            ) : notifications.slice(0, 6).map((notification) => (
              <button
                type="button"
                className={notification.isRead ? "" : "is-unread"}
                key={notification.id}
                onClick={async () => {
                  if (!notification.isRead) await onMarkNotificationRead(notification.id);
                  if (notification.requestId) onSelectRequest(notification.requestId);
                }}
              >
                <span><Icon name="file" size={17} /></span>
                <div><strong>{notification.title}</strong><p>{notification.message}</p><time>{notification.createdAtLabel}</time></div>
                {!notification.isRead && <i aria-label="Unread" />}
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>
        </section>
      )}

      {openList === "unassigned" && (
        <RequestListModal
          title="Unassigned requests"
          description="Open requests that do not yet have a Legal Reviewer assigned."
          requests={unassignedRequests}
          onClose={() => setOpenList(null)}
          onSelectRequest={onSelectRequest}
        />
      )}
    </section>
  );
}

export default DashboardCards;
