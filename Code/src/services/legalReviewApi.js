import { apiRequest } from "./apiClient";

export async function triggerAiReviewQueue({ staleAfterMinutes = 2 } = {}) {
  return apiRequest("/ai/process-next", { method: "POST", body: { staleAfterMinutes } });
}
