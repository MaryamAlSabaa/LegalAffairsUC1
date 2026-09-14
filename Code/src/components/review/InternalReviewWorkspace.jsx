import { useEffect, useId, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import "./internalReview.css";
import Icon from "../common/Icon";
import AiLegalReviewPanel from "./AiLegalReviewPanel";
import { isAiReviewableDocument } from "../../utils/documentTypes";

export default function InternalReviewWorkspace({ request, onRefresh }) {
  const workspaceId = useId();
  const [stage, setStage] = useState("prepare");
  const [preview, setPreview] = useState(false);
  const [noticeType, setNoticeType] = useState("success");
  const [operation, setOperation] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [documents, setDocuments] = useState(request.documents || []);
  const [review, setReview] = useState(request.aiReviewResult);
  const [references, setReferences] = useState(request.reviewReferences || []);
  const [useApprovedTemplates, setUseApprovedTemplates] = useState(false);
  const [response, setResponse] = useState(request.aiReviewResult?.draft_response || "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shared, setShared] = useState(request.sharedResponse);
  useEffect(() => {
    setDocuments(request.documents || []);
    setReview(request.aiReviewResult); setReferences(request.reviewReferences || []);
    setUseApprovedTemplates(false);
    setResponse(request.aiReviewResult?.draft_response || ""); setConfirmed(false);
    setShared(request.sharedResponse); setMessage("");
    setStage(request.aiReviewResult ? "findings" : "prepare"); setPreview(false); setSelectedDocumentId("");
  // Background polling must not overwrite unsaved template edits or response text.
  }, [request.id]);
  useEffect(() => {
    setDocuments(request.documents || []);
    setReview(request.aiReviewResult);
  }, [request.documents, request.aiReviewResult]);
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
  async function analyze(includeTemplates = false) {
    if (includeTemplates) await saveReferences();
    const queued = await apiRequest(`${endpoint}/queue-review`, { method: "POST", body: { useApprovedTemplates: includeTemplates } });
    // Process all current PDF and Excel attachments for this request, never another request's queue.
    for (let index = 0; index < queued.queued; index += 1) {
      setOperation(`Reviewing document ${index + 1} of ${queued.queued}`);
      const result = await apiRequest("/ai/process-next", { method: "POST", body: { requestId: request.id } });
      if (!result.processed) throw new Error(result.message);
    }
    await onRefresh?.();
    const requests = await apiRequest("/requests");
    const updated = requests.find(item => item.id === request.id);
    setDocuments(updated.documents || []);
    setReview(updated.aiReviewResult); setResponse(updated.aiReviewResult?.draft_response || "");
    setConfirmed(false); setSelectedDocumentId(""); setStage("findings"); setMessage(includeTemplates
      ? "Draft analysis with approved template comparison saved. Review the findings before preparing your response."
      : "Draft analysis saved without template comparison. Review the findings before preparing your response.");
  }
  const currentReviewDocuments = documents.filter(d => d.isCurrent && isAiReviewableDocument(d));
  const reviewedDocuments = documents.filter(d => d.aiReviewResult);
  const activeDocument = reviewedDocuments.find(d => d.id === selectedDocumentId);
  const activeReview = activeDocument?.aiReviewResult || review;
  const templatesReady = references.every(r => r.title?.trim() && r.text?.trim() && r.approved);
  const comparisonReady = references.length > 0 && templatesReady;
  const comparisonIncomplete = useApprovedTemplates && !comparisonReady;
  const defaultReviewTasks = ["Document classification", "Document summary", "Clause review", "Missing clauses", "Risk assessment", "Checklist suggestions", "Review notes", "Draft response"];
  const steps = [
    { id: "prepare", title: "Prepare", detail: "Documents & review options", icon: "file" },
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
          <div className="internal-review-card-heading"><span><Icon name="file" /> Source documents</span><span className="internal-review-count">{currentReviewDocuments.length} document{currentReviewDocuments.length !== 1 ? "s" : ""}</span></div>
          <p className="internal-review-help">Current PDF and Excel attachments are included in the next review. Word documents require manual review.</p>
          <div className="internal-review-documents">{documents.filter(d => d.isCurrent).map(document => <div key={document.id} className="internal-review-document"><Icon name="file" size={20} /><div><strong>{document.name}</strong><small>{isAiReviewableDocument(document) ? "Ready for AI review" : "Manual review required"}</small></div><Icon name={isAiReviewableDocument(document) ? "check" : "help"} size={16} /></div>)}</div>
          {!currentReviewDocuments.length && <p className="internal-review-empty-inline">Add a current PDF or Excel attachment to run AI analysis.</p>}
        </div>
        <div className="internal-review-card internal-review-default-scope">
          <div className="internal-review-card-heading"><span><Icon name="cpu" /> Gemini document review</span><span className="internal-review-count">Included by default</span></div>
          <p className="internal-review-help">Gemini reviews the uploaded document using its general legal knowledge. No template is required.</p>
          <ul className="internal-review-scope-list">{defaultReviewTasks.map(task => <li key={task}><Icon name="check" size={14} /><span>{task}</span></li>)}</ul>
          <p className="internal-review-source-note">Approved template comparisons and similar past cases are additional context when actual reference sources are available. The review identifies the sources used.</p>
        </div>
        <details key={request.id} className="internal-review-card internal-review-optional-templates">
          <summary><span><Icon name="clipboard" /><span><strong>Approved template comparison</strong><small>Optional · {references.length} reference{references.length !== 1 ? "s" : ""} added</small></span></span><Icon name="chevronDown" size={17} /></summary>
          <div className="internal-review-optional-content">
          <p className="internal-review-help">Add approved reference text to compare clauses and identify deviations from your organization's terms.</p>
          <label className="internal-review-check internal-review-template-choice"><input type="checkbox" disabled={busy} checked={useApprovedTemplates} onChange={event => setUseApprovedTemplates(event.target.checked)} /><span><strong>Include approved templates in this review</strong><small>Turn this on to add a comparison to the standard Gemini review.</small></span></label>
          {!references.length && <div className="internal-review-template-empty"><Icon name="clipboard" size={28} /><strong>No comparison templates added</strong><p>You can run the standard review now. Add a reference only when you want a template comparison.</p></div>}
          <fieldset disabled={busy} className="internal-review-template-fields">
            {references.map((reference, index) => <div key={index} className="internal-review-template">
              <div className="internal-review-template-heading"><strong>Reference {index + 1}</strong><button type="button" className="internal-review-remove" onClick={() => setReferences(references.filter((_, i) => i !== index))}>Remove</button></div>
              <label>Template title and version<input placeholder="e.g. Approved services agreement, v2.1" maxLength={200} value={reference.title} onChange={e => updateReference(index, {title: e.target.value, approved: false})} /></label>
              <label>Reference text<textarea placeholder="Paste the approved clauses or full template text..." rows={5} maxLength={40000} value={reference.text} onChange={e => updateReference(index, {text: e.target.value, approved: false})} /></label>
              <label className="internal-review-check"><input type="checkbox" checked={reference.approved === true} onChange={e => updateReference(index, {approved: e.target.checked})} /><span>I confirm this is an approved reference template.</span></label>
            </div>)}
          </fieldset>
          <div className="internal-review-actions"><button type="button" disabled={busy || references.length >= 5} className="internal-review-button secondary" onClick={() => setReferences([...references, {title:"", text:"", approved:false}])}><Icon name="plus" size={16} /> Add template</button><button type="button" disabled={busy || !templatesReady} className="internal-review-button text" onClick={() => act(async () => { await saveReferences(); setMessage("Approved references saved. Enable template comparison to use them in your next review."); })}>Save references</button></div>
          {!templatesReady && <p className="internal-review-help">Complete and approve each reference to save or compare it. You can still run the standard review; template edits stay here.</p>}
          </div>
        </details>
        <div className="internal-review-run"><div><strong>{useApprovedTemplates ? "Gemini review with template comparison" : "Ready for a Gemini review?"}</strong><p>AI findings are drafts and require your assessment.</p>{comparisonIncomplete ? <p>Complete and approve a reference for comparison, or run without templates. Your saved references and current edits will be kept.</p> : !useApprovedTemplates && <p>Template comparison is off. Saved references and current template edits will be kept.</p>}</div><div className="internal-review-run-actions"><button type="button" disabled={busy || !currentReviewDocuments.length || comparisonIncomplete} className="internal-review-button primary" onClick={() => act(() => analyze(useApprovedTemplates), "Starting review")}><Icon name="cpu" size={18} />{busy ? "Review in progress" : useApprovedTemplates ? "Run with templates" : activeReview ? "Run review again" : "Run AI review"}</button>{useApprovedTemplates && <button type="button" disabled={busy || !currentReviewDocuments.length} className="internal-review-button secondary" onClick={() => { setUseApprovedTemplates(false); act(() => analyze(false), "Starting review without templates"); }}>Run without templates</button>}</div></div>
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
