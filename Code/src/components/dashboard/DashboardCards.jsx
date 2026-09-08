import Icon from "../common/Icon";
import InfoButton from "../common/InfoButton";
import RequestTable from "../requests/RequestTable";

function statusTone(status = "") {
  if (status.includes("Approved") || status === "Closed") return "success";
  if (status.includes("Waiting")) return "warning";
  if (status.includes("Review")) return "info";
  return "neutral";
}

function DashboardCards({ requests, allRequests = requests, onSelectFilter, onSelectRequest, currentUser }) {
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((request) => !["Closed", "Archived", "Approved"].includes(request.status)).length;
  const underReview = requests.filter((request) => !["Closed", "Archived", "Approved", "Waiting for More Information"].includes(request.status)).length;
  const highRisk = requests.filter((request) => request.riskLevel === "High").length;
  const awaitingInput = requests.filter((request) => request.status === "Waiting for More Information").length;

  const cards = [
    { label: "Total matters", value: totalRequests, icon: "inbox", tone: "blue", info: "All legal requests available to your current role.", filter: "all", context: "Current portfolio" },
    { label: "Active review", value: underReview, icon: "clipboard", tone: "indigo", info: "Matters currently moving through AI, reviewer, manager, or department review.", filter: "under-review", context: `${pendingRequests} open matters` },
    { label: "Awaiting input", value: awaitingInput, icon: "clock", tone: "amber", info: "Requests paused while Legal Affairs waits for additional information.", filter: "pending", context: "Action may be required" },
    { label: "High risk", value: highRisk, icon: "warning", tone: "rose", info: "Requests currently carrying a High risk classification.", filter: "high-risk", context: "Priority attention" },
  ];

  const workflowStages = [
    { label: "AI assessment", count: requests.filter((request) => request.status?.includes("AI Review")).length, tone: "blue" },
    { label: "Legal review", count: requests.filter((request) => request.status === "Under Review").length, tone: "indigo" },
    { label: "Internal approval", count: requests.filter((request) => request.status?.includes("Approval")).length, tone: "amber" },
    { label: "Completed", count: requests.filter((request) => ["Approved", "Closed", "Archived"].includes(request.status)).length, tone: "green" },
  ];
  const largestStage = Math.max(1, ...workflowStages.map((stage) => stage.count));
  const recentRequests = [...requests]
    .sort((first, second) => (Date.parse(second.submittedAt || "") || 0) - (Date.parse(first.submittedAt || "") || 0))
    .slice(0, 4);

  const firstName = currentUser?.name?.split(" ")[0] || "colleague";

  return (
    <section className="dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <p className="page-kicker">Legal operations centre</p>
          <h2>Good day, {firstName}</h2>
          <p>Here is the current position of the legal matters in your workspace.</p>
        </div>
        <div className="dashboard-date"><Icon name="calendar" size={18} /><div><span>Today</span><strong>{new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</strong></div></div>
      </div>

      <div className="metric-grid">
        {cards.map((card) => (
          <button key={card.label} type="button" onClick={() => onSelectFilter(card.filter)} className={`metric-card metric-${card.tone}`}>
            <div className="metric-card-top"><span className="metric-icon"><Icon name={card.icon} size={20} /></span><InfoButton label={`${card.label} information`} description={card.info} /></div>
            <p>{card.label}</p>
            <strong>{String(card.value).padStart(2, "0")}</strong>
            <div className="metric-context"><span>{card.context}</span><Icon name="arrowRight" size={16} /></div>
          </button>
        ))}
      </div>

      <div className="dashboard-detail-grid">
        <article className="workspace-panel workflow-panel">
          <div className="panel-heading"><div><p className="page-kicker">Live workload</p><h3>Review pipeline</h3></div><span className="panel-badge">{pendingRequests} active</span></div>
          <div className="workflow-list">
            {workflowStages.map((stage) => (
              <div className="workflow-row" key={stage.label}>
                <div><span>{stage.label}</span><strong>{stage.count}</strong></div>
                <div className="workflow-track"><span className={`workflow-fill workflow-${stage.tone}`} style={{ width: `${Math.max(stage.count ? 8 : 0, (stage.count / largestStage) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="panel-footnote"><Icon name="activity" size={15} /> Pipeline values reflect your role-based access.</p>
        </article>

        <article className="workspace-panel recent-panel">
          <div className="panel-heading"><div><p className="page-kicker">Latest activity</p><h3>Recent matters</h3></div><button type="button" onClick={() => onSelectFilter("all")}>View all <Icon name="arrowRight" size={15} /></button></div>
          <div className="recent-matter-list">
            {recentRequests.length === 0 ? (
              <div className="empty-compact"><Icon name="inbox" size={22} /><span>No matters are available yet.</span></div>
            ) : recentRequests.map((request) => (
              <div className="recent-matter" key={request.id}>
                <span className="recent-file-icon"><Icon name="file" size={18} /></span>
                <div><strong>{request.title}</strong><p>{request.id} · {request.department}</p></div>
                <span className={`status-dot-label status-${statusTone(request.status)}`}><i />{request.status}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      {currentUser?.role === "Legal Reviewer" && (
        <div className="dashboard-request-register">
          <RequestTable
            requests={allRequests}
            onSelectRequest={onSelectRequest}
            canOpenDetails={true}
            canOpenRequest={(request) => request.assignedReviewerId === currentUser.id}
            currentUserId={currentUser.id}
            kicker="Institutional request register"
            title="All legal requests"
            description="Search and filter the complete request portfolio. Detailed documents and reviewer actions remain limited to matters assigned to you."
          />
        </div>
      )}
    </section>
  );
}

export default DashboardCards;
