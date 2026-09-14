import assert from "node:assert/strict";
import test from "node:test";
import { fetchDocumentDownload, saveDocumentDownload } from "../src/services/documentDownload.js";

const url = "https://documents.example/api/documents/123/file";
const bytes = new TextEncoder().encode("Test document contents");

test("requests an authenticated attachment and preserves its bytes and content type", async () => {
  for (const mimeType of [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ]) {
    const controller = new AbortController();
    const blob = await fetchDocumentDownload(`${url}?version=2&download=0`, {
      signal: controller.signal,
      fetchImpl: async (requestedUrl, options) => {
        assert.equal(requestedUrl, `${url}?version=2&download=1`);
        assert.equal(options.credentials, "include");
        assert.equal(options.signal, controller.signal);
        return new Response(bytes, { headers: { "Content-Type": mimeType } });
      },
    });
    assert.equal(blob.type, mimeType);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  }
});

test("authentication, access, missing files, and temporary failures have useful download errors", async () => {
  for (const [status, payload, message] of [
    [401, { code: "DOCUMENT_FILE_MISSING" }, /Sign in again/],
    [403, {}, /permission to download/],
    [404, { code: "DOCUMENT_FILE_MISSING" }, /file is missing/],
    [404, { code: "DOCUMENT_NOT_FOUND" }, /unavailable to you/],
    [503, { error: "Internal server details" }, /temporarily unavailable/],
  ]) {
    await assert.rejects(fetchDocumentDownload(url, {
      fetchImpl: async () => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }),
    }), message);
  }
});

test("does not save JSON and HTML error payloads even after a successful HTTP status", async () => {
  for (const contentType of ["application/json", "application/problem+json", "text/html; charset=utf-8", "application/xhtml+xml"]) {
    await assert.rejects(fetchDocumentDownload(url, {
      fetchImpl: async () => new Response("Unexpected server response", { headers: { "Content-Type": contentType } }),
    }), /document could not be downloaded/);
  }
});

test("ambiguous server errors do not claim the stored file is missing", async () => {
  await assert.rejects(fetchDocumentDownload(url, {
    fetchImpl: async () => new Response(`<html>Not found at ${url}</html>`, { status: 404 }),
  }), (error) => {
    assert.match(error.message, /Try again/);
    assert.doesNotMatch(error.message, /file is missing|https:|<html>/);
    return true;
  });
});

test("empty files and connection errors provide recovery guidance", async () => {
  await assert.rejects(fetchDocumentDownload(url, {
    fetchImpl: async () => new Response(new Uint8Array(), { headers: { "Content-Type": "application/pdf" } }),
  }), /file is empty/);
  await assert.rejects(fetchDocumentDownload(url, {
    fetchImpl: async () => { throw new TypeError(`Failed to fetch ${url}`); },
  }), (error) => {
    assert.match(error.message, /Check your connection/);
    assert.doesNotMatch(error.message, /https:/);
    return true;
  });
});

test("missing URLs and cancelled downloads do not start requests", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const fetchImpl = async () => { called = true; };
  await assert.rejects(fetchDocumentDownload(undefined, { fetchImpl }), /No file is available/);
  await assert.rejects(fetchDocumentDownload(url, { fetchImpl, signal: controller.signal }), { name: "AbortError" });
  assert.equal(called, false);
});

test("a download cancelled during body loading does not return a saveable blob", async () => {
  const controller = new AbortController();
  await assert.rejects(fetchDocumentDownload(url, {
    signal: controller.signal,
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers({ "Content-Type": "application/pdf" }),
      blob: async () => {
        controller.abort();
        return new Blob([bytes]);
      },
    }),
  }), { name: "AbortError" });
});

test("saving uses a local blob URL and the original international filename", (context) => {
  const blob = new Blob([bytes]);
  const fileName = "اتفاقية البحث.pdf";
  const objectUrl = "blob:https://app.example/document";
  const link = { click() {}, remove() {} };
  const previousDocument = globalThis.document;
  let clicked = false;
  let removed = false;
  let release;
  globalThis.document = {
    createElement: (tag) => { assert.equal(tag, "a"); return link; },
    body: { append: (element) => { assert.equal(element, link); } },
  };
  context.mock.method(URL, "createObjectURL", (value) => { assert.equal(value, blob); return objectUrl; });
  const revoke = context.mock.method(URL, "revokeObjectURL");
  context.mock.method(globalThis, "setTimeout", (callback) => { release = callback; });
  context.mock.method(link, "click", () => {
    assert.equal(link.href, objectUrl);
    assert.equal(link.download, fileName);
    clicked = true;
  });
  context.mock.method(link, "remove", () => { removed = true; });
  try {
    saveDocumentDownload(blob, fileName);
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(revoke.mock.calls.length, 0);
    release();
    assert.deepEqual(revoke.mock.calls[0].arguments, [objectUrl]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
