import { useEffect, useMemo, useRef, useState } from "react";
import { getRequestStatusLabel } from "../../utils/requestStatus";

const priorityOrder = ["Urgent", "High", "Medium", "Low"];

function formatTraceMessage(entry) {
  if (!entry) return "Unknown engine event";
  const at = entry.at ? new Date(entry.at).toLocaleString() : "Time unknown";
  return `${at} — ${entry.step || "step"}: ${entry.message || "No message"}`;
}

function EngineControlCard({
  engineState,
  errorCount,
  onToggleRunning,
  onProcessNext,
  onRebuildQueue,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const isRunning = engineState?.isRunning;

  async function handleToggle(nextValue) {
    setIsSaving(true);
    try {
      await onToggleRunning(nextValue);
      if (nextValue) await onProcessNext();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Engine Controls</h3>
          <p className="mt-1 text-sm text-slate-500">
            Start or stop the Legal Affair Engine. Queue ordering can only be
            edited while the engine is stopped.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            isRunning
              ? "bg-emerald-100 text-emerald-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {isRunning ? "Running" : "Stopped"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Last Changed By</p>
          <p className="mt-1 font-bold text-slate-900">
            {engineState?.updatedBy || "Not recorded"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Last Changed At</p>
          <p className="mt-1 font-bold text-slate-900">
            {engineState?.updatedAt || "Not recorded"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Queue Policy</p>
          <p className="mt-1 font-bold text-slate-900">
            Urgent → High → Medium → Low
          </p>
        </div>
        <div className={`rounded-xl border p-3 text-sm ${
          errorCount > 0
            ? "border-red-200 bg-red-50"
            : "border-slate-200 bg-slate-50"
        }`}>
          <p className={errorCount > 0 ? "text-red-700" : "text-slate-500"}>
            AI Processing Errors
          </p>
          <p className={`mt-1 font-bold ${
            errorCount > 0 ? "text-red-800" : "text-slate-900"
          }`}>
            {errorCount}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isSaving || isRunning}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleToggle(true)}
        >
          Start Engine
        </button>
        <button
          type="button"
          disabled={isSaving || !isRunning}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleToggle(false)}
        >
          Stop Engine
        </button>
        <button
          type="button"
          disabled={isSaving || !isRunning}
          className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onProcessNext}
        >
          Process Next Queued Request
        </button>
        <button
          type="button"
          disabled={isSaving}
          className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onRebuildQueue}
        >
          Rebuild Pending AI Queue
        </button>
      </div>
    </div>
  );
}

function QueueRequestRow({
  request,
  priorityRequests,
  canEditOrder,
  onQueuePositionChange,
}) {
  const job = request.aiReviewJob;
  const [nextPosition, setNextPosition] = useState(
    job?.priorityQueuePosition || 1,
  );

  async function savePosition() {
    await onQueuePositionChange(request, priorityRequests, nextPosition);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-bold text-slate-900">
            {request.id} — {request.title}
          </p>
          <p className="mt-1 text-slate-500">
            Status: {getRequestStatusLabel(request.status)} · Queue: {job?.status || "none"} · Global
            position: {job?.queuePosition ? `#${job.queuePosition}` : "N/A"} ·
            Priority position: {job?.priorityQueuePosition ? `#${job.priorityQueuePosition}` : "N/A"}
          </p>
          <p className="mt-1 text-slate-500">
            Current step: {job?.currentStep || "Not recorded"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">
            Position
            <input
              type="number"
              min="1"
              max={priorityRequests.length}
              className="ml-2 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
              value={nextPosition}
              disabled={!canEditOrder || job?.status !== "queued"}
              onChange={(event) => setNextPosition(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!canEditOrder || job?.status !== "queued"}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={savePosition}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function PriorityQueueCard({
  priority,
  requests,
  canEditOrder,
  onQueuePositionChange,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-slate-900">{priority} Priority Queue</h4>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
          {requests.length} active
        </span>
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            No queued or processing {priority.toLowerCase()} priority requests.
          </p>
        ) : (
          requests.map((request) => (
            <QueueRequestRow
              key={request.id}
              request={request}
              priorityRequests={requests}
              canEditOrder={canEditOrder}
              onQueuePositionChange={onQueuePositionChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

function isStaleProcessingJob(request) {
  const job = request.aiReviewJob;
  if (job?.status !== "processing" || !job.startedAtRaw) return false;
  return Date.now() - new Date(job.startedAtRaw).getTime() > 2 * 60 * 1000;
}

function EngineTerminalCard({ requestsWithJobs, engineEvents }) {
  const [clearedAt, setClearedAt] = useState(null);
  const currentlyProcessing = requestsWithJobs.find(
    (request) => request.aiReviewJob?.status === "processing",
  );
  const failedRequests = requestsWithJobs.filter(
    (request) =>
      request.aiReviewJob?.status === "failed" ||
      request.aiReviewJob?.lastError ||
      isStaleProcessingJob(request),
  );
  const terminalRef = useRef(null);
  const jobTerminalLines = requestsWithJobs.flatMap((request) => {
      const job = request.aiReviewJob;
      const traceLines = (job?.operationalTrace || []).map((entry) => ({
        at: entry.at || job.updatedAt,
        level: "info",
        requestId: request.id,
        title: request.title,
        text: `${entry.step || "step"}: ${entry.message || "No message"}`,
      }));

      const statusLine = job
        ? [
            {
              at: job.updatedAt,
              level: job.status === "failed" ? "error" : "status",
              requestId: request.id,
              title: request.title,
              text: `job ${job.status} — ${job.currentStep || "No current step"}`,
            },
          ]
        : [];

      const errorLine = job?.lastError
        ? [
            {
              at: job.updatedAtRaw || job.updatedAt,
              level: "error",
              requestId: request.id,
              title: request.title,
              text: job.lastError,
            },
          ]
        : [];

      const staleLine = isStaleProcessingJob(request)
        ? [
            {
              at: new Date().toISOString(),
              level: "error",
              requestId: request.id,
              title: request.title,
              text:
                "Job has been stuck in processing for more than 2 minutes. Click Process Next Queued Request to reclaim/retry it, or restart the Edge Function.",
            },
          ]
        : [];

      return [...traceLines, ...statusLine, ...errorLine, ...staleLine];
    });

  const engineTerminalLines = (engineEvents || []).map((event) => ({
    at: event.createdAt,
    level: event.level || "info",
    requestId: event.requestId || "ENGINE",
    title: event.eventType || "engine_event",
    text: event.message,
  }));

  const terminalLines = [...jobTerminalLines, ...engineTerminalLines]
    .filter((line) => !clearedAt || new Date(line.at || 0) > clearedAt)
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
    .slice(-250);

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines.length]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Live Engine Terminal</h3>
          <p className="mt-1 text-sm text-slate-400">
            Latest backend-saved AI events, queue steps, and errors. Newest lines
            appear at the bottom.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setClearedAt(new Date())} className="rounded-lg border border-slate-600 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800">Clear Terminal</button>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
            Live from ai_review_jobs
          </span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-300">
            Currently Processing
          </p>
          {currentlyProcessing ? (
            <p className="mt-1 text-sm font-semibold text-blue-100">
              {currentlyProcessing.id} — {currentlyProcessing.title}
              <span className="block text-xs font-normal text-blue-300">
                {currentlyProcessing.priority} · {currentlyProcessing.aiReviewJob?.currentStep || "Processing"} · Attempt {currentlyProcessing.aiReviewJob?.attemptCount || 1}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-blue-200">No active processing job.</p>
          )}
        </div>

        <div className={`rounded-xl border p-3 ${
          failedRequests.length > 0
            ? "border-red-500/30 bg-red-500/10"
            : "border-emerald-500/30 bg-emerald-500/10"
        }`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${
            failedRequests.length > 0 ? "text-red-300" : "text-emerald-300"
          }`}>
            AI Processing Errors
          </p>
          <p className={`mt-1 text-sm font-semibold ${
            failedRequests.length > 0 ? "text-red-100" : "text-emerald-100"
          }`}>
            {failedRequests.length} error{failedRequests.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {failedRequests.length > 0 && (
        <div className="mb-4 space-y-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3">
          {failedRequests.map((request) => (
            <p key={`terminal-error-${request.id}`} className="text-sm text-red-200">
              <span className="font-bold text-red-100">{request.id}</span> — {request.aiReviewJob?.lastError || (isStaleProcessingJob(request) ? "Job is stuck in processing for more than 2 minutes." : "AI review failed without a recorded error message.")}
            </p>
          ))}
        </div>
      )}

      <div
        ref={terminalRef}
        className="h-[34rem] overflow-y-auto rounded-xl border border-slate-800 bg-black p-4 font-mono text-xs leading-6"
      >
        {terminalLines.length === 0 ? (
          <p className="text-slate-500">
            $ waiting for AI queue activity...
          </p>
        ) : (
          terminalLines.map((line, index) => {
            const color =
              line.level === "error"
                ? "text-red-300"
                : line.level === "status"
                  ? "text-blue-300"
                  : "text-emerald-300";
            const time = line.at ? new Date(line.at).toLocaleTimeString() : "--:--:--";

            return (
              <div key={`${line.requestId}-${index}`} className={color}>
                <span className="text-slate-500">[{time}]</span>{" "}
                <span className="text-amber-300">{line.requestId}</span>{" "}
                <span className="text-slate-400">{line.title}</span>{" "}
                <span>→ {line.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EngineOutputsCard({ activeRequests }) {
  const currentlyProcessing = activeRequests.find(
    (request) => request.aiReviewJob?.status === "processing",
  );
  const failedRequests = activeRequests.filter(
    (request) => request.aiReviewJob?.status === "failed" || request.aiReviewJob?.lastError,
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Engine Outputs & Safe Trace</h3>
      <p className="mt-1 text-sm text-slate-500">
        This shows observable processing events and stored AI draft outputs. It
        does not expose hidden AI chain-of-thought.
      </p>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
          Currently Processing
        </p>
        {currentlyProcessing ? (
          <div className="mt-2">
            <p className="font-bold text-blue-950">
              {currentlyProcessing.id} — {currentlyProcessing.title}
            </p>
            <p className="mt-1 text-sm text-blue-800">
              Priority: {currentlyProcessing.priority} · Step: {currentlyProcessing.aiReviewJob?.currentStep || "Processing"} · Attempt {currentlyProcessing.aiReviewJob?.attemptCount || 1}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-blue-800">
            No request is currently marked as processing. The engine may be idle,
            stopped, or waiting for the next invocation.
          </p>
        )}
      </div>

      {failedRequests.length > 0 && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            AI Processing Errors
          </p>
          <div className="mt-3 space-y-2">
            {failedRequests.map((request) => (
              <div key={`error-${request.id}`} className="rounded-xl bg-white p-3 text-sm">
                <p className="font-bold text-red-900">
                  {request.id} — {request.title}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-red-700">
                  {request.aiReviewJob?.lastError || "AI review failed without a recorded error message."}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 max-h-[34rem] space-y-4 overflow-y-auto pr-1">
        {activeRequests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No AI review jobs found.
          </p>
        ) : (
          activeRequests.map((request) => {
            const job = request.aiReviewJob;
            return (
              <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-bold text-slate-900">
                      {request.id} — {request.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {request.priority} · job {job?.status || "none"} · {job?.currentStep || "No current step"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {getRequestStatusLabel(request.status)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-700">Latest AI Draft Output</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">
                    {request.aiSummary || "No AI draft output yet."}
                  </p>
                </div>

                <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-700">Operational Trace</p>
                  <ul className="mt-2 space-y-1 text-slate-600">
                    {(job?.operationalTrace || []).length === 0 ? (
                      <li>No trace events recorded yet.</li>
                    ) : (
                      job.operationalTrace.map((entry, index) => (
                        <li key={`${request.id}-${index}`}>• {formatTraceMessage(entry)}</li>
                      ))
                    )}
                  </ul>
                  {job?.lastError && (
                    <p className="mt-3 rounded-lg bg-red-50 p-2 text-red-700">
                      Last error: {job.lastError}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function LegalAffairEngine({
  requests,
  engineEvents,
  engineState,
  onToggleRunning,
  onProcessNext,
  onQueuePositionChange,
  onRebuildQueue,
}) {
  const requestsWithJobs = useMemo(
    () => requests.filter((request) => request.aiReviewJob),
    [requests],
  );
  const activeQueueRequests = useMemo(
    () =>
      requestsWithJobs
        .filter((request) => ["queued", "processing"].includes(request.aiReviewJob?.status))
        .sort(
          (a, b) =>
            (a.aiReviewJob?.queuePosition || 999999) -
            (b.aiReviewJob?.queuePosition || 999999),
        ),
    [requestsWithJobs],
  );
  const canEditOrder = !engineState?.isRunning;
  const errorCount = requestsWithJobs.filter(
    (request) =>
      request.aiReviewJob?.status === "failed" ||
      request.aiReviewJob?.lastError ||
      isStaleProcessingJob(request),
  ).length;

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Legal Affair Engine</h2>
        <p className="mt-1 text-slate-500">
          Admin dashboard for AI review queue controls, priority ordering,
          operational trace, and AI draft outputs.
        </p>
      </div>

      <div className="space-y-6">
        <EngineControlCard
          engineState={engineState}
          errorCount={errorCount}
          onToggleRunning={onToggleRunning}
          onProcessNext={onProcessNext}
          onRebuildQueue={onRebuildQueue}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-900">Priority Queues</h3>
            <p className="mt-1 text-sm text-slate-500">
              The engine always processes Urgent first, then High, Medium, and
              Low. Ordering numbers only affect requests inside the same priority
              queue and can only be edited while the engine is stopped.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {priorityOrder.map((priority) => (
              <PriorityQueueCard
                key={priority}
                priority={priority}
                requests={activeQueueRequests
                  .filter((request) => request.priority === priority)
                  .sort(
                    (a, b) =>
                      (a.aiReviewJob?.priorityQueuePosition || 999999) -
                      (b.aiReviewJob?.priorityQueuePosition || 999999),
                  )}
                canEditOrder={canEditOrder}
                onQueuePositionChange={onQueuePositionChange}
              />
            ))}
          </div>
        </div>

        <EngineTerminalCard
          requestsWithJobs={requestsWithJobs}
          engineEvents={engineEvents}
        />
      </div>
    </section>
  );
}

export default LegalAffairEngine;

/*
BEGINNER DOCUMENTATION:

1. Why not show AI chain-of-thought?
The app should show safe operational trace and final draft outputs, not hidden model reasoning. The trace explains what the engine did without exposing private reasoning.

2. Why stop the engine before reordering?
If the engine is actively claiming jobs while an admin edits ordering, the selected next request could change mid-edit. Stopping creates a safe maintenance window.

3. Why separate queues by priority?
Urgent legal work should be reviewed before lower-priority work. Queue order only decides the order inside the same priority group.
*/
