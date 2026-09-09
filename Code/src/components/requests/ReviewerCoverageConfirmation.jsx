import { useEffect, useRef } from "react";
import Icon from "../common/Icon";

function initials(name = "User") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ReviewerCoverageConfirmation({ confirmation, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className="modal-backdrop coverage-confirmation-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="coverage-confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="coverage-confirmation-title" aria-describedby="coverage-confirmation-description">
        <header className="coverage-confirmation-header">
          <span><Icon name="warning" size={23} /></span>
          <div>
            <p className="page-kicker">Coverage safeguard</p>
            <h2 id="coverage-confirmation-title">You are not assigned to this request</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel this action">&times;</button>
        </header>

        <div className="coverage-confirmation-body">
          <div className="coverage-request-reference">
            <span><Icon name="file" size={18} /></span>
            <div><strong>{confirmation.requestTitle}</strong><p>{confirmation.requestId}</p></div>
          </div>

          <p className="coverage-action-copy" id="coverage-confirmation-description">
            You are about to <strong>{confirmation.actionDescription}</strong>. You may continue to provide colleague coverage, but the action will be recorded under your name.
          </p>

          <div className="coverage-notification-notice">
            <span><Icon name="bell" size={19} /></span>
            <div><strong>The following people will be notified</strong><p>They will receive an alert identifying you, the request, and the action taken.</p></div>
          </div>

          <div className="coverage-recipient-list">
            {confirmation.recipients.map((recipient) => (
              <div className="coverage-recipient" key={`${recipient.role}-${recipient.name}`}>
                <span>{initials(recipient.name)}</span>
                <div><strong>{recipient.name}</strong><p>{recipient.role}</p></div>
                <Icon name="check" size={16} />
              </div>
            ))}
          </div>
        </div>

        <footer className="coverage-confirmation-footer">
          <button ref={cancelButtonRef} type="button" className="coverage-cancel-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="coverage-confirm-button" onClick={onConfirm}><Icon name="bell" size={16} /> Continue and notify</button>
        </footer>
      </section>
    </div>
  );
}

export default ReviewerCoverageConfirmation;
