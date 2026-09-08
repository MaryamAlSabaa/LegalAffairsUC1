import Icon from "../common/Icon";

function AuditLog({ logs }) {
  return (
    <section className="audit-page">
      <div className="page-heading">
        <div><p className="page-kicker">Governance & assurance</p><h2>Audit log</h2><p>A traceable record of material actions across confidential legal matters.</p></div>
        <div className="record-count"><span>{logs.length}</span><div><strong>events</strong><small>recorded</small></div></div>
      </div>

      <div className="audit-layout">
        <div className="audit-assurance">
          <span><Icon name="shield" size={20} /></span>
          <div><strong>Integrity-protected activity</strong><p>Events are retained to support accountability, access review, and institutional governance.</p></div>
        </div>
        <div className="audit-list">
          {logs.length === 0 ? (
            <div className="audit-empty"><Icon name="activity" size={24} /><strong>No audit events available</strong><p>Material user actions will appear here.</p></div>
          ) : logs.map((log, index) => (
            <article className="audit-event" key={log.id}>
              <div className="audit-timeline"><span><Icon name={index === 0 ? "activity" : "check"} size={15} /></span>{index < logs.length - 1 && <i />}</div>
              <div className="audit-event-copy"><strong>{log.action}</strong><p><span>{log.requestId}</span> by {log.user}</p></div>
              <time>{log.time}</time>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AuditLog;
