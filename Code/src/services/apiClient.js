export const apiBaseUrl = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

function csrfToken() {
  const cookie = document.cookie.split("; ").find((item) => item.startsWith("ku_legal_csrf="));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

export function apiAssetUrl(relativeUrl) {
  if (!relativeUrl || /^(https?:|blob:)/.test(relativeUrl)) return relativeUrl;
  if (apiBaseUrl === "/api" && relativeUrl.startsWith("/api/")) return relativeUrl;
  if (relativeUrl.startsWith("/api/")) return `${apiBaseUrl.slice(0, -4)}${relativeUrl}`;
  return `${apiBaseUrl}/${relativeUrl.replace(/^\//, "")}`;
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  const bodyIsForm = options.body instanceof FormData;

  if (options.body && !bodyIsForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      method,
      headers,
      credentials: "include",
      body: bodyIsForm || typeof options.body === "string" ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (_error) {
    throw new Error(`Could not reach the KU Legal Affairs server at ${apiBaseUrl}. Confirm the API is running and reachable from this device.`);
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === "object" ? payload.error || payload.message : payload;
    const error = new Error(message || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function checkApiHealth() {
  return apiRequest("/health");
}
