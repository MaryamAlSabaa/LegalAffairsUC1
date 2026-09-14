import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { fetchPdfDocument, pdfPreviewErrorMessage } from "../../services/pdfDocument";
import { canViewInternalReview } from "../../utils/permissions";
import DocumentDownloadButton from "./DocumentDownloadButton";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;



function PdfPageCanvas({ pdfDocument, pageNumber, pageRef }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let isCancelled = false;
    let renderTask = null;

    async function renderPage() {
      try {
        setRenderError("");
        const page = await pdfDocument.getPage(pageNumber);

        if (isCancelled) return;

        const containerWidth = 900;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / unscaledViewport.width, 1.4);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (isCancelled || error?.name === "RenderingCancelledException") return;
        setRenderError("This page could not be displayed. Reopen the preview and try again.");
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDocument, pageNumber]);

  return (
    <div ref={pageRef} className="mx-auto w-fit scroll-mt-4 rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        Page {pageNumber}
      </div>
      {renderError ? (
        <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {renderError}
        </div>
      ) : (
        <canvas ref={canvasRef} className="max-w-full rounded-lg border border-slate-200" />
      )}
    </div>
  );
}

function BrowserIndependentPdfViewer({ document, pageRefs }) {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [viewerStatus, setViewerStatus] = useState("Loading PDF preview...");
  const [viewerError, setViewerError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const documentUrl = document?.url;

  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;
    const controller = new AbortController();

    async function loadPdf() {
      try {
        setPdfDocument(null);
        setPageCount(0);
        setViewerError("");
        setViewerStatus("Loading PDF preview...");

        // Read API errors before handing the authenticated PDF bytes to the renderer.
        const bytes = await fetchPdfDocument(documentUrl, { signal: controller.signal });
        if (isCancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: bytes });

        const loadedPdf = await loadingTask.promise;

        if (isCancelled) return;

        setPdfDocument(loadedPdf);
        setPageCount(loadedPdf.numPages);
        setViewerStatus("");
      } catch (error) {
        if (isCancelled) return;

        setViewerError(pdfPreviewErrorMessage(error));
        setViewerStatus("");
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      controller.abort();
      if (loadingTask) loadingTask.destroy().catch(() => {});
    };
  }, [documentUrl, retryCount]);

  if (viewerError) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center p-6">
        <div role="alert" className="max-w-xl rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <h3 className="font-bold text-red-800">PDF preview could not load</h3>
          <p className="mt-2 text-sm text-red-700">{viewerError}</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Retry preview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[50vh] overflow-y-auto bg-slate-100 p-4 xl:min-h-0">
      {viewerStatus && (
        <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-slate-500">
          {viewerStatus}
        </div>
      )}

      {pdfDocument && (
        <div className="space-y-5 pb-6">
          {Array.from({ length: pageCount }, (_, index) => (
            <PdfPageCanvas
              key={index + 1}
              pdfDocument={pdfDocument}
              pageNumber={index + 1}
              pageRef={(element) => {
                pageRefs.current[index + 1] = element;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PdfReviewModal({ document, currentUser, onClose }) {
  const pageRefs = useRef({});
  if (!document) return null;

  const showAiSuggestions = canViewInternalReview(currentUser?.role);
  const aiSuggestions = showAiSuggestions ? document.aiSuggestions || [] : [];

  function goToPdfPage(page) {
    const pageNumber = Number.parseInt(String(page), 10);
    if (!pageNumber || !pageRefs.current[pageNumber]) return;

    pageRefs.current[pageNumber].scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 p-3 sm:p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                PDF Review Popup
              </p>
              <h2 className="break-words text-lg font-bold text-slate-900 sm:text-xl">
                {document.name}
              </h2>
              <p className="text-sm text-slate-500">
                {showAiSuggestions ? "PDF preview with AI page suggestions." : "Secure PDF preview."}
              </p>
            </div>

            <div className="flex flex-wrap items-start gap-2">
            {showAiSuggestions && <DocumentDownloadButton document={document} />}
            <button
              type="button"
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              onClick={onClose}
            >
              Close PDF View
            </button>
            </div>
          </div>
        </div>

        <div className={`grid min-h-0 flex-1 grid-cols-1 ${showAiSuggestions ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""}`}>
          <BrowserIndependentPdfViewer document={document} pageRefs={pageRefs} />

          {showAiSuggestions && <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-slate-50 p-4">
            <div className="shrink-0 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                AI Suggestions by Page
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Draft support only. Legal Affairs must make the final decision.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
              {aiSuggestions.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                  No page-specific AI suggestions are available yet. The AI review may still be queued, may have failed, or this request was created before AI review was available.
                </p>
              )}
              {aiSuggestions.map((suggestion) => (
                <article
                  key={`${suggestion.page}-${suggestion.text}`}
                  className="rounded-xl border border-blue-200 bg-blue-50 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-white px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      onClick={() => goToPdfPage(suggestion.page)}
                    >
                      Page {suggestion.page}
                    </button>
                    <span className="break-words text-right text-[11px] font-bold uppercase tracking-wide text-blue-700">
                      {suggestion.type}
                    </span>
                  </div>
                  <p className="break-words text-sm leading-relaxed text-slate-700">
                    {suggestion.text}
                  </p>
                </article>
              ))}
            </div>
          </aside>}
        </div>
      </div>
    </div>
  );
}

export default PdfReviewModal;

/*
BEGINNER DOCUMENTATION:

1. What is a modal?
A modal is a popup layer that appears above the normal page. Here it lets the user review a PDF without leaving Request Details.

2. Why use PDF.js instead of an iframe?
Some browsers or localhost setups download PDFs instead of displaying them inside an iframe. PDF.js reads the PDF file and draws each page on a canvas, so the app controls the preview.

3. Why can the page badges be clicked?
Each rendered PDF page has a React ref. Clicking a suggestion page number scrolls the left PDF preview to that page.

4. What is a canvas?
<canvas> is an HTML element that JavaScript can draw onto. PDF.js draws each PDF page onto a canvas.

5. Why is the AI suggestions panel scrollable?
The panel has its own scrolling area so long suggestions remain easy to read while the PDF stays visible.

6. Why is the checklist absent from this popup?
The legal review checklist is intentionally kept out of the PDF view. It is available only in the internal request-details view for non-requester roles.
*/
