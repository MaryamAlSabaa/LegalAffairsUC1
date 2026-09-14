/** The latest queued event records the options for that run, including retries. */
export function getJobReviewOptions(job) {
  const trace = Array.isArray(job?.operational_trace) ? job.operational_trace : [];
  const queued = trace.findLast(event => event?.step === "queued");
  return { useApprovedTemplates: queued?.reviewOptions?.useApprovedTemplates === true };
}

export function reviewQueuedEvent(useApprovedTemplates = false) {
  return {
    at: new Date().toISOString(), step: "queued",
    message: useApprovedTemplates ? "Gemini review with approved template comparison queued." : "Gemini general review queued; templates are optional.",
    reviewOptions: { useApprovedTemplates: useApprovedTemplates === true },
  };
}
