import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { fetchPdfDocument, pdfPreviewErrorMessage } from "../../services/pdfDocument";
import { matchPdfTextHighlights, parseDocumentPage } from "../../utils/documentReviewFindings";
import "./pdfDocumentViewer.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const emptyFindings = [];

function highlightGeometry(match, textContent, viewport, measureContext) {
  const item = textContent.items[match.itemIndex];
  if (!item?.str || !Array.isArray(item.transform)) return null;
  const style = textContent.styles[item.fontName] || {};
  const matrix = pdfjsLib.Util.transform(viewport.transform, item.transform);
  let angle = Math.atan2(matrix[1], matrix[0]);
  if (style.vertical) angle += Math.PI / 2;
  const height = Math.hypot(matrix[2], matrix[3]);
  const width = Math.abs((style.vertical ? item.height : item.width) * viewport.scale);
  if (!height || !width) return null;

  // Map measured character advances onto the PDF item's actual width. Percentages
  // keep the highlight aligned when the canvas shrinks to the available column.
  measureContext.font = `${height}px ${style.fontFamily || "sans-serif"}`;
  const measuredWidth = measureContext.measureText(item.str).width;
  let start = measuredWidth ? measureContext.measureText(item.str.slice(0, match.start)).width / measuredWidth : match.start / item.str.length;
  let end = measuredWidth ? measureContext.measureText(item.str.slice(0, match.end)).width / measuredWidth : match.end / item.str.length;
  if (item.dir === "rtl") [start, end] = [1 - end, 1 - start];
  start = Math.max(0, Math.min(1, start));
  end = Math.max(start, Math.min(1, end));
  const ascent = height * (Number.isFinite(style.ascent) ? style.ascent : Number.isFinite(style.descent) ? 1 + style.descent : 0.8);
  const left = matrix[4] + ascent * Math.sin(angle) + width * start * Math.cos(angle);
  const top = matrix[5] - ascent * Math.cos(angle) + width * start * Math.sin(angle);
  return {
    left: `${left / viewport.width * 100}%`, top: `${top / viewport.height * 100}%`,
    width: `${width * (end - start) / viewport.width * 100}%`, height: `${height / viewport.height * 100}%`,
    transform: `rotate(${angle}rad)`,
  };
}

function PdfPage({ pdfDocument, pageNumber, findings, activeFindingId, onMatchReport, onRetry }) {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const [inView, setInView] = useState(pageNumber === 1);
  const [pageState, setPageState] = useState(null);
  const [renderError, setRenderError] = useState("");
  const [rendered, setRendered] = useState(false);
  const [textContent, setTextContent] = useState(null);
  const [textStatus, setTextStatus] = useState("pending");
  const shouldReadText = findings.length > 0;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setInView(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      root: pageRef.current?.closest(".pdf-document-viewer__pages"), rootMargin: "1000px 0px",
    });
    observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        setRenderError("");
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1100 / original.width, 1.6) });
        setPageState({ page, viewport });
      } catch (error) {
        if (!cancelled) setRenderError("This page could not be displayed. Retry the document preview.");
      }
    }
    prepare();
    return () => { cancelled = true; };
  }, [pdfDocument, pageNumber]);

  useEffect(() => {
    if (!pageState) return undefined;
    let cancelled = false;
    let renderTask;
    setRendered(false);
    if (!inView) {
      // Release offscreen bitmap memory while retaining searchable page text.
      if (canvasRef.current) { canvasRef.current.width = 1; canvasRef.current.height = 1; }
      return undefined;
    }
    async function render() {
      try {
        const { page, viewport } = pageState;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        renderTask = page.render({ canvasContext: context, viewport, transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch (error) {
        if (!cancelled && error?.name !== "RenderingCancelledException") setRenderError("This page could not be displayed. Retry the document preview.");
      }
    }
    render();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pageState, inView]);

  useEffect(() => {
    if (!pageState || !shouldReadText) return undefined;
    let cancelled = false;
    setTextStatus("pending");
    pageState.page.getTextContent().then((content) => {
      if (cancelled) return;
      setTextContent(content);
      setTextStatus("ready");
    }).catch(() => { if (!cancelled) setTextStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [pageState, shouldReadText]);

  const highlights = useMemo(() => {
    if (!textContent || !pageState || findings.length === 0) return [];
    const measureContext = window.document.createElement("canvas").getContext("2d");
    if (!measureContext) return [];
    return matchPdfTextHighlights(textContent, findings, pageNumber).map((match) => ({
      ...match, geometry: highlightGeometry(match, textContent, pageState.viewport, measureContext),
    })).filter((match) => match.geometry);
  }, [textContent, pageState, findings, pageNumber]);

  useEffect(() => {
    if (shouldReadText && textStatus === "pending") return;
    onMatchReport(pageNumber, [...new Set(highlights.map((match) => match.findingId))], rendered);
  }, [highlights, pageNumber, onMatchReport, shouldReadText, textStatus, rendered]);

  const matchedIds = new Set(highlights.map((match) => match.findingId));
  const pageFindings = findings.filter((finding) => finding.page === pageNumber || matchedIds.has(finding.id));
  const unmatchedRisks = pageFindings.filter((finding) => ["high", "medium"].includes(finding.severity) && !matchedIds.has(finding.id));
  const noSearchableText = textStatus === "unavailable" || (textStatus === "ready" && !textContent?.items.some((item) => item.str?.trim()));

  return (
    <article ref={pageRef} className="pdf-document-viewer__page" data-pdf-page={pageNumber} aria-label={`Document page ${pageNumber}`}>
      <header className="pdf-document-viewer__page-heading">
        <strong>Page {pageNumber}</strong>
        {textStatus !== "pending" && unmatchedRisks.length > 0 && <div className="pdf-document-viewer__page-flags">
          {["high", "medium"].map((severity) => {
            const count = unmatchedRisks.filter((finding) => finding.severity === severity).length;
            return count > 0 && <span key={severity} className={`pdf-document-viewer__risk-flag is-${severity}`}>{count} {severity} risk{count === 1 ? "" : "s"} · passage not located</span>;
          })}
        </div>}
      </header>
      {renderError ? <div className="pdf-document-viewer__page-error" role="alert"><p>{renderError}</p><button type="button" onClick={onRetry}>Retry preview</button></div> : <>
        <div className="pdf-document-viewer__paper" style={{ maxWidth: pageState?.viewport.width || 1100, aspectRatio: pageState ? `${pageState.viewport.width} / ${pageState.viewport.height}` : "0.773" }}>
          {!rendered && <p className="pdf-document-viewer__page-loading">Rendering page {pageNumber}…</p>}
          <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} style={{ visibility: rendered ? "visible" : "hidden" }} />
          {rendered && highlights.map((match, index) => <span
            key={`${match.findingId}-${match.itemIndex}-${match.start}-${index}`}
            className={`pdf-document-viewer__highlight is-${match.severity}${activeFindingId === match.findingId ? " is-active" : ""}`}
            data-finding-id={match.findingId}
            style={match.geometry}
            aria-hidden="true"
          />)}
        </div>
      </>}
      {findings.length > 0 && noSearchableText && <p className="pdf-document-viewer__text-note">No searchable text was available on this page. Review the page visually; no text highlights have been added.</p>}
    </article>
  );
}

export default function PdfDocumentViewer({ document, findings = emptyFindings, activeFindingId = null, activePage = null, onFindingLocations }) {
  const documentUrl = document?.url;
  const [pdfDocument, setPdfDocument] = useState(null);
  const [viewerError, setViewerError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [pageReports, setPageReports] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRef = useRef(null);
  const callbackRef = useRef(onFindingLocations);
  const navigationRef = useRef("");
  callbackRef.current = onFindingLocations;
  // Polling returns new objects for unchanged findings. Keep page matching stable.
  const findingsSignature = JSON.stringify(findings);
  const stableFindings = useMemo(() => findings, [findingsSignature]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    const controller = new AbortController();
    setPdfDocument(null);
    setViewerError("");
    setPageReports({});
    setCurrentPage(1);
    navigationRef.current = "";
    async function load() {
      try {
        const bytes = await fetchPdfDocument(documentUrl, { signal: controller.signal });
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: bytes });
        const loaded = await loadingTask.promise;
        if (!cancelled) setPdfDocument(loaded);
      } catch (error) {
        if (!cancelled) setViewerError(pdfPreviewErrorMessage(error));
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
      loadingTask?.destroy().catch(() => {});
    };
  }, [documentUrl, retryCount]);

  const reportMatches = useCallback((pageNumber, findingIds, rendered) => {
    const report = { ids: findingIds, rendered };
    setPageReports((previous) => JSON.stringify(previous[pageNumber]) === JSON.stringify(report) ? previous : { ...previous, [pageNumber]: report });
  }, []);

  const locations = useMemo(() => Object.fromEntries(stableFindings.map((finding) => {
    const match = Object.entries(pageReports).find(([, report]) => report.ids.includes(finding.id));
    return [finding.id, { page: match ? Number(match[0]) : finding.page || null, matched: Boolean(match) }];
  })), [stableFindings, pageReports]);

  useEffect(() => { callbackRef.current?.(locations); }, [locations]);

  function scrollToElement(element) {
    const container = scrollRef.current;
    if (!container || !element) return;
    const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 36;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  function goToPage(page) {
    if (!Number.isInteger(page) || page < 1 || page > (pdfDocument?.numPages || 0)) return;
    scrollToElement(scrollRef.current?.querySelector(`[data-pdf-page="${page}"]`));
    setCurrentPage(page);
  }

  useEffect(() => {
    if (!pdfDocument || !scrollRef.current) return;
    if (!activeFindingId && !activePage) { navigationRef.current = ""; return; }
    const selected = activeFindingId ? locations[activeFindingId] : null;
    const targetPage = selected?.page || parseDocumentPage(activePage);
    const highlight = activeFindingId ? [...scrollRef.current.querySelectorAll("[data-finding-id]")].find((element) => element.dataset.findingId === String(activeFindingId)) : null;
    const target = highlight || (targetPage ? scrollRef.current.querySelector(`[data-pdf-page="${targetPage}"]`) : null);
    if (!target) return;
    const navigationKey = `${documentUrl}|${activeFindingId}|${activePage}|${targetPage}`;
    const quality = highlight ? 2 : 1;
    // Scroll again when a pending quote becomes visible, but do not pull the
    // user back after they deliberately scroll away and its bitmap is released.
    if (navigationRef.current.key === navigationKey && navigationRef.current.quality >= quality) return;
    navigationRef.current = { key: navigationKey, quality };
    scrollToElement(target);
  }, [pdfDocument, activeFindingId, activePage, locations, documentUrl]);

  function updateCurrentPage() {
    const container = scrollRef.current;
    const top = container.getBoundingClientRect().top;
    const visible = [...container.querySelectorAll("[data-pdf-page]")].find((page) => page.getBoundingClientRect().bottom > top + 70);
    if (visible) setCurrentPage(Number(visible.dataset.pdfPage));
  }

  return <section className="pdf-document-viewer" aria-label={`PDF preview: ${document?.name || "supporting document"}`}>
    <div className="pdf-document-viewer__toolbar">
      <span>{pdfDocument ? `${pdfDocument.numPages} page${pdfDocument.numPages === 1 ? "" : "s"}` : "PDF preview"}</span>
      {pdfDocument && <div className="pdf-document-viewer__navigation">
        <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous PDF page">‹</button>
        <label>Page <select aria-label="PDF page" value={currentPage} onChange={(event) => goToPage(Number(event.target.value))}>
          {Array.from({ length: pdfDocument.numPages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select> of {pdfDocument.numPages}</label>
        <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pdfDocument.numPages} aria-label="Next PDF page">›</button>
      </div>}
      {stableFindings.length > 0 && <div className="pdf-document-viewer__legend" aria-label="Highlight colors">
        <span className="is-high">High risk</span><span className="is-medium">Medium risk</span><span className="is-info">Other finding</span>
      </div>}
    </div>
    {viewerError ? <div className="pdf-document-viewer__error" role="alert">
      <strong>PDF preview could not load</strong>
      <p>{viewerError}</p>
      <button type="button" onClick={() => setRetryCount((count) => count + 1)}>Retry preview</button>
    </div> : <div className="pdf-document-viewer__pages" ref={scrollRef} onScroll={updateCurrentPage} tabIndex={0} aria-label="PDF pages">
      {!pdfDocument && <p className="pdf-document-viewer__loading" role="status">Loading PDF preview…</p>}
      {pdfDocument && Array.from({ length: pdfDocument.numPages }, (_, index) => <PdfPage
        key={`${documentUrl}-${retryCount}-${index + 1}`}
        pdfDocument={pdfDocument}
        pageNumber={index + 1}
        findings={stableFindings}
        activeFindingId={activeFindingId}
        onMatchReport={reportMatches}
        onRetry={() => setRetryCount((count) => count + 1)}
      />)}
    </div>}
  </section>;
}
