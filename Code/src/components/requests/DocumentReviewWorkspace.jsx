import { useEffect, useMemo, useRef, useState } from "react";
import ContractChecklist from "../review/ContractChecklist";
import PdfDocumentViewer from "./PdfDocumentViewer";
import SpreadsheetViewer from "./SpreadsheetViewer";
import DocumentDownloadButton from "./DocumentDownloadButton";
import { apiRequest } from "../../services/apiClient";
import { isAiReviewableDocument, isPdfDocument, isSpreadsheetDocument } from "../../utils/documentTypes";
import { getDocumentReviewFindings, parseDocumentPage } from "../../utils/documentReviewFindings";
import { canViewInternalReview } from "../../utils/permissions";
import "./documentReviewWorkspace.css";

function checklistLocation(item) {
  const page = parseDocumentPage(item.page);
  if (page) return { page };
  const reference = String(item.page || "").match(/^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?[1-9]\d*)$/i);
  if (reference) return { sheet: reference[1]?.replace(/''/g, "'") || reference[2], cell: reference[3].replace(/\$/g, "").toUpperCase() };
  return null;
}

export default function DocumentReviewWorkspace({ document, requestId, currentUser, canManageReview, onChecklistItemToggle, onRefresh, onClose }) {
  const internal = canViewInternalReview(currentUser?.role);
  const reviewable = isAiReviewableDocument(document);
  const [activeFindingId, setActiveFindingId] = useState(null);
  const [activeLocation, setActiveLocation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState("findings");
  const started = useRef(false);
  const mounted = useRef(false);
  const findings = useMemo(() => internal ? getDocumentReviewFindings(document) : [], [document, internal]);
  const review = internal ? document.aiReviewResult : null;
  const hasAnalysis = Boolean(review && review.ai_mode !== "mock");
  const mayAnalyze = internal && reviewable && document.isCurrent !== false;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function analyze() {
    if (!mayAnalyze || busy) return;
    setBusy(true); setFailed(false); setMessage("Comparing this document against the review checklist…");
    try {
      await apiRequest(`/requests/${encodeURIComponent(requestId)}/queue-review`, { method: "POST", body: {
        documentId: document.id,
        useApprovedTemplates: hasAnalysis && review?.review_basis?.template_comparison_status === "available",
      } });
      const result = await apiRequest("/ai/process-next", { method: "POST", body: { requestId, documentId: document.id } });
      if (!result.processed) throw new Error(result.message || "The review is queued. Results will appear when processing finishes.");
      await onRefresh?.();
      if (mounted.current) setMessage("Draft comparison saved. Select a finding to inspect its evidence.");
    } catch (error) {
      if (mounted.current) { setFailed(true); setMessage(error.message || "The review could not complete. Try again."); }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    // Opening an unreviewed current file starts its comparison once. Polling and
    // StrictMode must not queue a duplicate review of the same attachment.
    if (mayAnalyze && !hasAnalysis && !started.current) {
      started.current = true;
      analyze();
    }
  }, [mayAnalyze, hasAnalysis]);

  function selectFinding(id) { setActiveFindingId(id); setActiveLocation(null); setPanel("findings"); }
  const scope = review?.review_scope;

  return <section className={`document-review-workspace ${internal ? "has-analysis" : ""}`} aria-label={`Document review: ${document.name}`}>
    <header className="document-review-header">
      <div><p className="page-kicker">Document review</p><h3>{document.name}</h3><p>{internal ? "Inspect the document alongside its checklist and draft findings." : "Document preview"}</p></div>
      <div className="document-review-actions"><DocumentDownloadButton document={document} /><button type="button" className="button-secondary" onClick={onClose}>Close preview</button></div>
    </header>
    <div className="document-review-layout">
      <div className="document-review-source">
        {isPdfDocument(document) ? <PdfDocumentViewer document={document} findings={findings} activeFindingId={activeFindingId} activePage={activeLocation?.page} />
          : isSpreadsheetDocument(document) ? <SpreadsheetViewer document={document} findings={findings} activeFindingId={activeFindingId} activeCell={activeLocation?.cell ? activeLocation : null} onSelectFinding={selectFinding} />
            : <div className="document-review-empty">A preview is not available for this file type. Use the Download option to open it.</div>}
      </div>
      {internal && <aside className="document-review-analysis" aria-label="Selected document analysis">
        <div className="document-review-analysis-heading"><h4>Checklist & risk review</h4><p>Gemini reviews the document using general legal knowledge. Templates are optional; findings require Legal Affairs review.</p>
          {mayAnalyze && <button type="button" className="button-primary" disabled={busy} onClick={analyze}>{busy ? "Reviewing document…" : hasAnalysis ? "Review again" : "Run AI review"}</button>}
        </div>
        {message && <p className={`document-review-notice ${failed ? "is-error" : ""}`} role={failed ? "alert" : "status"}>{message}</p>}
        {scope?.partial && <p className="document-review-notice">Partial workbook review: some content exceeds the analysis limits. Check the remaining content manually.</p>}
        {scope?.notes?.length > 0 && <details className="document-review-scope"><summary>Review coverage</summary><ul>{scope.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
        <div className="document-review-tabs" role="tablist" aria-label="Document analysis">
          <button type="button" role="tab" aria-selected={panel === "findings"} onClick={() => setPanel("findings")}>Findings ({findings.length})</button>
          <button type="button" role="tab" aria-selected={panel === "checklist"} onClick={() => setPanel("checklist")}>Checklist</button>
        </div>
        {panel === "findings" ? <div className="document-review-findings" role="tabpanel" aria-label="Findings">
          {!hasAnalysis && <p className="document-review-empty">{busy ? "The document is open while the checklist comparison runs." : "No completed AI comparison is available for this attachment yet."}</p>}
          {hasAnalysis && findings.length === 0 && <p className="document-review-empty">No risk findings were returned. Complete the checklist and verify the document before making a decision.</p>}
          {findings.length > 0 && <p className="document-review-legend">Red: high risk · Amber: medium risk. Only matching source text is highlighted.</p>}
          {findings.map(finding => <button type="button" key={finding.id} className={`document-review-finding severity-${finding.severity} ${activeFindingId === finding.id ? "is-active" : ""}`} aria-pressed={activeFindingId === finding.id} onClick={() => selectFinding(finding.id)}>
            <span className="document-review-finding-level">{finding.missing ? "Missing clause" : finding.severity === "info" ? "Review finding" : `${finding.severity} risk`}</span>
            <strong>{finding.title}</strong><span>{finding.description}</span>
            {finding.quote && !finding.missing && <q>{finding.quote}</q>}
            <small>{finding.missing ? "Not present in the source; no passage to highlight" : finding.sheet && finding.cell ? `${finding.sheet}!${finding.cell}` : finding.page ? `Page ${finding.page}` : finding.quote ? "Locate matching text" : "No source location provided"}</small>
          </button>)}
        </div> : <div role="tabpanel" aria-label="Checklist"><ContractChecklist requestId={requestId} document={document} canManageReview={canManageReview} onChecklistItemToggle={onChecklistItemToggle}
          locationForItem={checklistLocation} onLocateItem={location => { setActiveFindingId(null); setActiveLocation(location); }} /></div>}
      </aside>}
    </div>
  </section>;
}
