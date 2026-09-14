import { useEffect, useId, useRef } from "react";
import { getRequestProgress } from "../../utils/requestProgress.js";
import "./requestProgressTimeline.css";

export default function RequestProgressTimeline({ request }) {
  const headingId = useId();
  const scrollRef = useRef(null);
  const currentStepRef = useRef(null);
  const progress = getRequestProgress(request);

  useEffect(() => {
    const container = scrollRef.current;
    const current = currentStepRef.current;
    if (!container || !current || container.scrollWidth <= container.clientWidth) return;
    const offset = current.getBoundingClientRect().left - container.getBoundingClientRect().left;
    if (offset < 0 || offset + current.offsetWidth > container.clientWidth) {
      container.scrollLeft += offset - (container.clientWidth - current.offsetWidth) / 2;
    }
  }, [request?.id, progress.currentStepId, progress.steps.length]);

  return (
    <section className="request-progress" aria-labelledby={headingId}>
      <header className="request-progress-header">
        <h3 id={headingId}>Request progress</h3>
        <span className={`request-progress-status${progress.isComplete ? " is-complete" : progress.needsAttention ? " needs-attention" : ""}`}>
          {progress.statusLabel}
        </span>
      </header>
      <div className="request-progress-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Request workflow stages; scroll horizontally to see all stages">
        <ol className="request-progress-steps">
          {progress.steps.map((step, index) => (
            <li
              className={`request-progress-step is-${step.state}${step.state === "current" && progress.isComplete ? " is-final" : ""}`}
              key={step.id}
              aria-current={step.state === "current" ? "step" : undefined}
              ref={step.state === "current" ? currentStepRef : undefined}
            >
              <span className="request-progress-marker" aria-hidden="true">
                {step.state === "completed" || (step.state === "current" && progress.isComplete) ? (
                  <svg viewBox="0 0 20 20" fill="none"><path d="m5 10 3.2 3.2L15 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : step.state === "unconfirmed" ? "–" : index + 1}
              </span>
              <span className="request-progress-label">{step.label}</span>
              <span className="request-progress-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="request-progress-description" role="status" aria-live="polite" aria-atomic="true">{progress.description}</p>
      <p className="request-progress-latest">
        <strong>Latest action:</strong> {progress.latestAction.text}
        {progress.latestAction.by && <> · {progress.latestAction.by}</>}
        {progress.latestAction.at && <> · {progress.latestAction.at}</>}
      </p>
    </section>
  );
}
