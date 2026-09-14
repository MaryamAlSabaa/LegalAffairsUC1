class PdfDocumentError extends Error {}

const retrievalError = "The PDF could not be retrieved. Try again. If the problem continues, contact Legal Affairs.";

function responseError(status, payload) {
  if (status === 401) {
    return "Your session has expired. Sign in again, then reopen the document.";
  }
  if (status === 403) {
    return "You do not have permission to view this document. Contact Legal Affairs for access.";
  }
  if (status === 404) {
    if (
      payload?.code === "DOCUMENT_FILE_MISSING" ||
      payload?.error === "The document is missing from server storage."
    ) {
      return "The uploaded PDF file is missing. Contact Legal Affairs to restore it or arrange another upload.";
    }
    if (payload?.code === "DOCUMENT_NOT_FOUND") {
      return "This document could not be found or is unavailable to you. Refresh the request and try again. If the problem continues, contact Legal Affairs.";
    }
  }
  if (status >= 500) {
    return "The document service is temporarily unavailable. Try again in a moment.";
  }
  return retrievalError;
}

export function pdfPreviewErrorMessage(error) {
  if (error instanceof PdfDocumentError) return error.message;
  if (error?.name === "PasswordException") {
    return "This PDF requires a password. Contact Legal Affairs for a copy that can be previewed.";
  }
  if (error?.name === "InvalidPDFException") {
    return "This file could not be read as a PDF. Contact Legal Affairs for a replacement copy.";
  }
  return "The PDF preview could not be opened. Try again. If the problem continues, contact Legal Affairs.";
}

export async function fetchPdfDocument(url, { signal, fetchImpl = fetch } = {}) {
  signal?.throwIfAborted();
  if (!url) {
    throw new PdfDocumentError("No PDF is available for this document. Refresh the request and try again.");
  }

  try {
    const response = await fetchImpl(url, {
      credentials: "include",
      headers: { Accept: "application/pdf" },
      signal,
    });
    signal?.throwIfAborted();

    if (!response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        signal?.throwIfAborted();
        if (error?.name === "AbortError") throw error;
        // A proxy or older server may return a plain-text or HTML error page.
      }
      signal?.throwIfAborted();
      throw new PdfDocumentError(responseError(response.status, payload));
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      throw new PdfDocumentError(retrievalError);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    signal?.throwIfAborted();
    if (!bytes.length) {
      throw new PdfDocumentError("This PDF file is empty. Contact Legal Affairs for a replacement copy.");
    }
    return bytes;
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === "AbortError" || error instanceof PdfDocumentError) throw error;
    throw new PdfDocumentError("The PDF could not be downloaded. Check your connection and try again.");
  }
}
