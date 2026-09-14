class DocumentDownloadError extends Error {}

const retrievalError = "The document could not be downloaded. Try again. If the problem continues, contact Legal Affairs.";

function responseError(status, payload) {
  if (status === 401) return "Your session has expired. Sign in again, then download the document.";
  if (status === 403) return "You do not have permission to download this document. Contact Legal Affairs for access.";
  if (status === 404 && payload?.code === "DOCUMENT_FILE_MISSING") {
    return "The uploaded file is missing. Contact Legal Affairs to restore it or arrange another upload.";
  }
  if (status === 404 && payload?.code === "DOCUMENT_NOT_FOUND") {
    return "This document could not be found or is unavailable to you. Refresh the request and try again.";
  }
  if (status >= 500) return "The document service is temporarily unavailable. Try again in a moment.";
  return retrievalError;
}

export async function fetchDocumentDownload(url, { signal, fetchImpl = fetch } = {}) {
  signal?.throwIfAborted();
  if (!url) throw new DocumentDownloadError("No file is available to download. Refresh the request and try again.");

  try {
    const downloadUrl = new URL(url, globalThis.location?.href || "http://localhost");
    if (["http:", "https:"].includes(downloadUrl.protocol)) downloadUrl.searchParams.set("download", "1");
    const response = await fetchImpl(downloadUrl.href, { credentials: "include", signal });
    signal?.throwIfAborted();

    if (!response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        signal?.throwIfAborted();
        if (error?.name === "AbortError") throw error;
      }
      signal?.throwIfAborted();
      throw new DocumentDownloadError(responseError(response.status, payload));
    }

    const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (["text/html", "application/json", "application/xhtml+xml"].includes(contentType) || contentType.endsWith("+json")) {
      throw new DocumentDownloadError(retrievalError);
    }

    const blob = await response.blob();
    signal?.throwIfAborted();
    if (!blob.size) throw new DocumentDownloadError("This file is empty. Contact Legal Affairs for a replacement copy.");
    return blob;
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === "AbortError" || error instanceof DocumentDownloadError) throw error;
    throw new DocumentDownloadError("The document could not be downloaded. Check your connection and try again.");
  }
}

export function saveDocumentDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = objectUrl;
    link.download = fileName || "document";
    link.hidden = true;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give browsers time to start reading the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
