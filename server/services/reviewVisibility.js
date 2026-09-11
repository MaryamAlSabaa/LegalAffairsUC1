export const canViewInternalReview = (user) => ["Legal Reviewer", "Legal Manager"].includes(user.role);

export function restrictReview(request, user) {
  if (canViewInternalReview(user)) return request;
  const { aiSummary, aiReviewResult, previousAiSummary, previousAiReviewResult,
    aiReviewJob, reviewReferences, ...visible } = request;
  return { ...visible, riskLevel: "Not Classified", documents: (visible.documents || []).map(
    ({ checklist, aiSuggestions, aiReviewResult, ...document }) => ({ ...document, checklist: [], aiSuggestions: [] })) };
}
