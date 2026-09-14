import assert from "node:assert/strict";
import test from "node:test";
import { fetchPdfDocument, pdfPreviewErrorMessage } from "../src/services/pdfDocument.js";

const url = "https://documents.example/api/documents/123/file";
const pdfBytes = new TextEncoder().encode("%PDF-1.7\nexample PDF bytes");

async function previewError(response) {
  let caughtError;
  await assert.rejects(fetchPdfDocument(url, { fetchImpl: async () => response }), (error) => {
    caughtError = error;
    return true;
  });
  return pdfPreviewErrorMessage(caughtError);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("fetches PDF bytes using the session credentials and cancellation signal", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await fetchPdfDocument(url, {
    signal: controller.signal,
    fetchImpl: async (requestedUrl, options) => {
      calls += 1;
      assert.equal(requestedUrl, url);
      assert.equal(options.credentials, "include");
      assert.equal(options.signal, controller.signal);
      assert.equal(options.headers.Accept, "application/pdf");
      return new Response(pdfBytes, { headers: { "Content-Type": "application/pdf" } });
    },
  });
  assert.equal(calls, 1);
  assert.ok(result instanceof Uint8Array);
  assert.deepEqual(result, pdfBytes);
});

test("accepts a PDF served as a generic binary download", async () => {
  const result = await fetchPdfDocument(url, {
    fetchImpl: async () => new Response(pdfBytes, {
      headers: { "Content-Type": "application/octet-stream" },
    }),
  });
  assert.deepEqual(result, pdfBytes);
});

test("offers upload-again guidance only for a confirmed missing file", async () => {
  for (const payload of [
    { code: "DOCUMENT_FILE_MISSING", error: "Document unavailable" },
    { error: "The document is missing from server storage." },
  ]) {
    const message = await previewError(jsonResponse(404, payload));
    assert.match(message, /file is missing/);
    assert.match(message, /restore it or arrange another upload/);
  }
});

test("distinguishes a missing document record from missing PDF bytes", async () => {
  const message = await previewError(jsonResponse(404, { code: "DOCUMENT_NOT_FOUND" }));
  assert.match(message, /document could not be found/);
  assert.match(message, /unavailable to you/);
  assert.match(message, /Refresh the request/);
  assert.doesNotMatch(message, /file is missing|upload/);
});

test("does not diagnose missing files from ambiguous JSON, HTML, or plain-text 404s", async () => {
  for (const response of [
    jsonResponse(404, { error: `Cannot GET ${url}` }),
    jsonResponse(404, null),
    new Response(`<html>Cannot GET ${url}</html>`, { status: 404 }),
    new Response("Not found", { status: 404 }),
  ]) {
    const message = await previewError(response);
    assert.match(message, /could not be retrieved/);
    assert.doesNotMatch(message, /missing|upload|https:|Cannot GET/);
  }
});

test("explains authentication and authorization failures before file errors", async () => {
  assert.match(await previewError(jsonResponse(401, { code: "DOCUMENT_FILE_MISSING" })), /Sign in again/);
  assert.match(await previewError(new Response("Forbidden", { status: 403 })), /permission/);
});

test("handles temporary service failures without exposing the server response", async () => {
  const message = await previewError(jsonResponse(503, { error: `Internal error at ${url}` }));
  assert.match(message, /temporarily unavailable/);
  assert.doesNotMatch(message, /https:|Internal error/);
});

test("does not send successful HTML or JSON responses to the PDF renderer", async () => {
  for (const contentType of ["text/html; charset=utf-8", "application/json"]) {
    const message = await previewError(new Response("unexpected response", {
      headers: { "Content-Type": contentType },
    }));
    assert.match(message, /could not be retrieved/);
  }
});

test("explains an empty document", async () => {
  const message = await previewError(new Response(new Uint8Array(), {
    headers: { "Content-Type": "application/pdf" },
  }));
  assert.match(message, /file is empty/);
});

test("shows connection guidance for a failed fetch without exposing the URL", async () => {
  await assert.rejects(fetchPdfDocument(url, {
    fetchImpl: async () => { throw new TypeError(`Failed to fetch ${url}`); },
  }), (error) => {
    const message = pdfPreviewErrorMessage(error);
    assert.match(message, /Check your connection/);
    assert.doesNotMatch(message, /https:/);
    return true;
  });
});

test("does not fetch when the document URL is missing", async () => {
  let called = false;
  await assert.rejects(fetchPdfDocument(undefined, {
    fetchImpl: async () => { called = true; },
  }), /No PDF is available/);
  assert.equal(called, false);
});

test("does not start a fetch for an already cancelled preview", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(fetchPdfDocument(url, {
    signal: controller.signal,
    fetchImpl: async () => { called = true; },
  }), { name: "AbortError" });
  assert.equal(called, false);
});

test("preserves cancellation of an in-flight request", async () => {
  const controller = new AbortController();
  const request = fetchPdfDocument(url, {
    signal: controller.signal,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
});

test("does not return PDF bytes when cancellation occurs during body loading", async () => {
  const controller = new AbortController();
  await assert.rejects(fetchPdfDocument(url, {
    signal: controller.signal,
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers({ "Content-Type": "application/pdf" }),
      arrayBuffer: async () => {
        controller.abort();
        return pdfBytes.buffer;
      },
    }),
  }), { name: "AbortError" });
});

test("preserves cancellation while parsing an API error", async () => {
  const controller = new AbortController();
  await assert.rejects(fetchPdfDocument(url, {
    signal: controller.signal,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => {
        controller.abort();
        throw controller.signal.reason;
      },
    }),
  }), { name: "AbortError" });
});

test("maps renderer errors to useful guidance without exposing internals", () => {
  assert.match(pdfPreviewErrorMessage({ name: "PasswordException" }), /requires a password/);
  assert.match(pdfPreviewErrorMessage({ name: "InvalidPDFException" }), /could not be read as a PDF/);
  const message = pdfPreviewErrorMessage(new Error(`PDF.js failed at ${url}`));
  assert.match(message, /Try again/);
  assert.doesNotMatch(message, /https:|PDF\.js/);
});
