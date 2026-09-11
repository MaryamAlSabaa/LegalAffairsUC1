import { useEffect, useId, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import "./internalReview.css";
import Icon from "../common/Icon";
import AiLegalReviewPanel from "./AiLegalReviewPanel";

export default function InternalReviewWorkspace({ request }) {
  const workspaceId = useId();
  const [stage, setStage] = useState("prepare");
  const [preview, setPreview] = useState(false);
  const [noticeType, setNoticeType] = useState("success");
  const [operation, setOperation] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [documents, setDocuments] = useState(request.documents || []);
  const [review, setReview] = useState(request.aiReviewResult);
  const [references, setReferences] = useState(request.reviewReferences || []);
  const [response, setResponse] = useState(request.aiReviewResult?.draft_response || "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shared, setShared] = useState(request.sharedResponse);
  useEffect(() => {
    setDocuments(request.documents || []);
    setReview(request.aiReviewResult); setReferences(request.reviewReferences || []);
    setResponse(request.aiReviewResult?.draft_response || ""); setConfirmed(false);
    setShared(request.sharedResponse); setMessage("");
    setStage(request.aiReviewResult ? "findings" : "prepare"); setPreview(false); setSelectedDocumentId("");
  // Background polling must not overwrite unsaved template edits or response text.
  }, [request.id]);
  const endpoint = `/requests/${encodeURIComponent(request.id)}`;
  async function act(callback, label = "Saving") {
    setBusy(true); setMessage(""); setOperation(label); setNoticeType("success");
    try { await callback(); } catch (error) { setNoticeType("error"); setMessage(error.message); }
    finally { setBusy(false); setOperation(""); }
  }
  async function saveReferences() {
    const saved = await apiRequest(`${endpoint}/review-references`, { method: "PUT", body: { references } });
    setReferences(saved);
  }
  async function analyze() {
    await saveReferences();
    await apiRequest(`${endpoint}/queue-review`, { method: "POST" });
    // Process all current PDFs for this request, never another request's queue.
    for (const [index] of currentPdfs.entries()) {
      setOperation(`Reviewing PDF ${index + 1} of ${currentPdfs.length}`);
      const result = await apiRequest("/ai/process-next", { method: "POST", body: { requestId: request.id } });
      if (!result.processed) throw new Error(result.message);
    }
    const requests = await apiRequest("/requests");
    const updated = requests.find(item => item.id === request.id);
    setDocuments(updated.documents || []);
    setReview(updated.aiReviewResult); setResponse(updated.aiReviewResult?.draft_response || "");
    setConfirmed(false); setSelectedDocumentId(""); setStage("findings"); setMessage("Draft analysis saved. Review the findings before preparing your response.");
  }
  const currentPdfs = documents.filter(d => d.isCurrent && d.type === "application/pdf");
  const reviewedDocuments = documents.filter(d => d.aiReviewResult);
  const activeDocument = reviewedDocuments.find(d => d.id === selectedDocumentId);
  const activeReview = activeDocument?.aiReviewResult || review;
  const templatesReady = references.every(r => r.title.trim() && r.text.trim() && r.approved);
  const steps = [
    { id: "prepare", title: "Prepare", detail: "Documents & templates", icon: "file" },
    { id: "findings", title: "Review findings", detail: activeReview ? "Draft analysis available" : "Awaiting analysis", icon: "search" },
    { id: "response", title: "Prepare response", detail: shared ? "Response previously shared" : "Review before sharing", icon: "mail" },
  ];
  function updateReference(index, values) {
    setReferences(references.map((reference, i) => i === index ? { ...reference, ...values } : reference));
  }
  return <section className="internal-review" aria-labelledby={`${workspaceId}-title`} aria-busy={busy}>
    <header className="internal-review-header">
      <div className="internal-review-heading"><span className="internal-review-emblem"><Icon name="shield" size={25} /></span><div>
        <p className="internal-review-eyebrow">LEGAL AFFAIRS WORKSPACE</p>
        <h3 id={`${workspaceId}-title`}>Internal legal review</h3>
        <p>Review the evidence. Refine the response. Share when ready.</p>
      </div></div>
      <span className="internal-review-private"><Icon name="lock" size={13} /> Internal only</span>
    </header>
    <div className="internal-review-access"><Icon name="users" size={16} /><p>Visible to Legal Reviewers and Legal Managers. Requesters see only the response you confirm and share.</p></div>
    <nav className="internal-review-steps" aria-label="Legal review stages">
      {steps.map((step, index) => <button key={step.id} type="button" aria-current={stage === step.id ? "step" : undefined} aria-controls={`${workspaceId}-content`} className={stage === step.id ? "is-active" : ""} onClick={() => setStage(step.id)}>
        <span className="internal-review-step-number">{index + 1}</span><span><strong>{step.title}</strong><small>{step.detail}</small></span><Icon name={step.icon} size={18} />
      </button>)}
    </nav>
    {message && <div role={noticeType === "error" ? "alert" : "status"} className={`internal-review-notice ${noticeType}`}><Icon name={noticeType === "error" ? "warning" : "check"} size={18} /><p>{message}</p><button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">Dismiss</button></div>}
    {busy && <div className="internal-review-progress" role="status"><span className="internal-review-spinner" />{operation}...</div>}
    <div id={`${workspaceId}-content`} className="internal-review-content">
      {stage === "prepare" && <div className="internal-review-preparation">
        <div className="internal-review-card">
          <div className="internal-review-card-heading"><span><Icon name="file" /> Source documents</span><span className="internal-review-count">{currentPdfs.length} PDF{currentPdfs.length !== 1 ? "s" : ""}</span></div>
          <p className="internal-review-help">Current PDFs are included in the next review. Office documents remain available for manual review.</p>
          <div className="internal-review-documents">{documents.filter(d => d.isCurrent).map(document => <div key={document.id} className="internal-review-document"><Icon name="file" size={20} /><div><strong>{document.name}</strong><small>{document.type === "application/pdf" ? "Ready for AI review" : "Manual review required"}</small></div><Icon name={document.type === "application/pdf" ? "check" : "help"} size={16} /></div>)}</div>
          {!currentPdfs.length && <p className="internal-review-empty-inline">No current PDF attached. Add a PDF to this request to run AI analysis.</p>}
        </div>
        <div className="internal-review-card">
          <div className="internal-review-card-heading"><span><Icon name="clipboard" /> Approved templates</span><span className="internal-review-count">{references.length} / 5</span></div>
          <p className="internal-review-help">Optional. Add approved reference text to compare clauses and identify deviations.</p>
          {!references.length && <div className="internal-review-template-empty"><Icon name="clipboard" size={28} /><strong>No comparison templates added</strong><p>You can review the document now, or add a template to include a comparison.</p></div>}
          <fieldset disabled={busy} className="internal-review-template-fields">
            {references.map((reference, index) => <div key={index} className="internal-review-template">
              <div className="internal-review-template-heading"><strong>Reference {index + 1}</strong><button type="button" className="internal-review-remove" onClick={() => setReferences(references.filter((_, i) => i !== index))}>Remove</button></div>
              <label>Template title and version<input placeholder="e.g. Approved services agreement, v2.1" maxLength={200} value={reference.title} onChange={e => updateReference(index, {title: e.target.value, approved: false})} /></label>
              <label>Reference text<textarea placeholder="Paste the approved clauses or full template text..." rows={5} maxLength={40000} value={reference.text} onChange={e => updateReference(index, {text: e.target.value, approved: false})} /></label>
              <label className="internal-review-check"><input type="checkbox" checked={reference.approved === true} onChange={e => updateReference(index, {approved: e.target.checked})} /><span>I confirm this is an approved reference template.</span></label>
            </div>)}
          </fieldset>
          <div className="internal-review-actions"><button type="button" disabled={busy || references.length >= 5} className="internal-review-button secondary" onClick={() => setReferences([...references, {title:"", text:"", approved:false}])}><Icon name="plus" size={16} /> Add template</button><button type="button" disabled={busy || !templatesReady} className="internal-review-button text" onClick={() => act(async () => { await saveReferences(); setMessage("Approved references saved."); })}>Save references</button></div>
        </div>
        <div className="internal-review-run"><div><strong>Ready for a first-pass review?</strong><p>AI findings are drafts and require your assessment.</p>{!templatesReady && <p>Complete and confirm each template before running the review.</p>}</div><button type="button" disabled={busy || !currentPdfs.length || !templatesReady} className="internal-review-button primary" onClick={() => act(analyze, "Starting review")}><Icon name="cpu" size={18} />{busy ? "Review in progress" : activeReview ? "Run review again" : "Run AI review"}</button></div>
      </div>}
      {stage === "findings" && <div className="internal-review-findings">
        <div className="internal-review-section-heading"><div><h4>Draft findings</h4><p>Validate the analysis against the source document.</p></div><button type="button" className="internal-review-button secondary" onClick={() => setStage("prepare")}><Icon name="settings" size={16} /> Review setup</button></div>
        {reviewedDocuments.length > 0 && <label className="internal-review-document-select">Review document<select value={selectedDocumentId} onChange={e => setSelectedDocumentId(e.target.value)}><option value="">Latest request review</option>{reviewedDocuments.map(d => <option key={d.id} value={d.id}>{d.name}{d.isCurrent ? "" : " (previous version)"}</option>)}</select></label>}
        {activeReview ? <><AiLegalReviewPanel key={selectedDocumentId || "latest"} review={activeReview} /><div className="internal-review-actions end"><button type="button" className="internal-review-button primary" onClick={() => setStage("response")}>Prepare response <Icon name="arrowRight" size={16} /></button></div></> : <div className="internal-review-empty"><span><Icon name="search" size={30} /></span><h4>No analysis available yet</h4><p>Run a review from Prepare to generate summaries, clause findings, risks, and a draft response.</p><button type="button" className="internal-review-button secondary" onClick={() => setStage("prepare")}>Go to review setup <Icon name="arrowRight" size={16} /></button></div>}
      </div>}
      {stage === "response" && <div className="internal-review-response">
        <div className="internal-review-section-heading"><div><h4>Response to requester</h4><p>Edit the draft, preview the exact text, then confirm sharing.</p></div><span className="internal-review-count"><Icon name="lock" size={12} /> Unshared draft</span></div>
        <div className="internal-review-editor">
          <div className="internal-review-editor-toolbar"><div className="internal-review-toggle" role="group" aria-label="Response view"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Edit draft</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Requester preview</button></div>{activeReview?.draft_response && <button type="button" disabled={busy || Boolean(response.trim())} className="internal-review-button text" title={response.trim() ? "Clear the editor first to use the AI draft" : "Insert the selected review's draft response"} onClick={() => {setResponse(activeReview.draft_response); setConfirmed(false);}}>Use AI draft</button>}</div>
          {preview ? <div className="internal-review-preview"><p className="internal-review-eyebrow">RESPONSE FROM LEGAL AFFAIRS</p><div>{response.trim() || "Your response preview will appear here."}</div></div> : <textarea aria-label="Response to requester" disabled={busy} placeholder="Write your response or refine the AI draft. Include only the information you intend to share with the requester." rows={10} maxLength={20000} value={response} onChange={e => {setResponse(e.target.value); setConfirmed(false);}} />}
          <div className="internal-review-editor-footer"><span>Internal findings and templates are not attached.</span><span>{response.length.toLocaleString()} / 20,000</span></div>
        </div>
        <div className="internal-review-approval"><label className="internal-review-check"><input type="checkbox" disabled={busy || !response.trim()} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span><strong>Ready to share with the requester</strong><small>I have reviewed this exact response and confirm it can be shared.</small></span></label><button type="button" className="internal-review-button publish" disabled={busy || !confirmed || !response.trim()} onClick={() => act(async () => {const publication = await apiRequest(`${endpoint}/publish-response`, {method:"POST", body:{response, confirmed}}); setShared(publication); setConfirmed(false); setMessage("Confirmed response shared with the requester.");}, "Sharing response")}><Icon name="mail" size={17} /> Confirm & share</button></div>
        {shared && <details className="internal-review-shared"><summary><Icon name="check" size={17} /><span>Last shared response<small>Shared by {shared.publishedBy} on {new Date(shared.publishedAt).toLocaleString()}</small></span><Icon name="chevronDown" size={16} /></summary><p>{shared.text}</p></details>}
      </div>}
    </div>
  </section>;
}
