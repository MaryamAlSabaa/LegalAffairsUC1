import { useEffect, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import AiLegalReviewPanel from "./AiLegalReviewPanel";

export default function InternalReviewWorkspace({ request }) {
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
  // Background polling must not overwrite unsaved template edits or response text.
  }, [request.id]);
  const endpoint = `/requests/${encodeURIComponent(request.id)}`;
  async function act(callback) {
    setBusy(true); setMessage("");
    try { await callback(); } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function saveReferences() {
    const saved = await apiRequest(`${endpoint}/review-references`, { method: "PUT", body: { references } });
    setReferences(saved);
  }
  async function analyze() {
    await saveReferences();
    await apiRequest(`${endpoint}/queue-review`, { method: "POST" });
    // Process all current PDFs for this request, never another request's queue.
    for (const document of request.documents.filter(d => d.isCurrent && d.type === "application/pdf")) {
      const result = await apiRequest("/ai/process-next", { method: "POST", body: { requestId: request.id } });
      if (!result.processed) throw new Error(result.message);
    }
    const requests = await apiRequest("/requests");
    const updated = requests.find(item => item.id === request.id);
    setDocuments(updated.documents || []);
    setReview(updated.aiReviewResult); setResponse(updated.aiReviewResult?.draft_response || "");
    setConfirmed(false); setMessage("Draft analysis saved. Review it before sharing a response.");
  }
  return <section className="space-y-4 rounded-2xl border border-blue-200 bg-white p-5">
    <h3 className="font-bold text-slate-900">Internal legal review</h3>
    <p className="text-sm text-slate-600">Only Legal Reviewers and Legal Managers can see draft findings. The requester receives only the response you confirm below.</p>
    <details>
      <summary className="cursor-pointer font-semibold">Approved templates for comparison ({references.length})</summary>
      <p className="my-2 text-sm">Paste the approved template text and identify its title/version. Save references, then run analysis to compare the PDF against them.</p>
      {references.map((reference, index) => <div key={index} className="my-3 space-y-2 rounded border p-3">
        <input aria-label="Template title and version" placeholder="Template title and version" className="w-full rounded border p-2" maxLength={200} value={reference.title} onChange={e => setReferences(references.map((r,i) => i===index ? {...r,title:e.target.value}:r))} />
        <textarea aria-label="Approved template text" placeholder="Approved template text" className="w-full rounded border p-2" rows={6} maxLength={40000} value={reference.text} onChange={e => setReferences(references.map((r,i) => i===index ? {...r,text:e.target.value}:r))} />
        <label className="block text-sm"><input type="checkbox" checked={reference.approved === true} onChange={e => setReferences(references.map((r,i) => i===index ? {...r,approved:e.target.checked}:r))} /> I confirm this is an approved reference template.</label>
        <button type="button" onClick={() => setReferences(references.filter((_,i) => i!==index))}>Remove reference</button>
      </div>)}
      <button type="button" disabled={busy || references.length >= 5} className="m-2 rounded border p-2" onClick={() => setReferences([...references,{title:"",text:"",approved:false}])}>Add template</button>
      <button type="button" disabled={busy} className="m-2 rounded border p-2" onClick={() => act(async () => {await saveReferences();setMessage("Approved references saved.");})}>Save references</button>
    </details>
    <button type="button" disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => act(analyze)}>{busy ? "Working?" : "Run AI review"}</button>
    {documents.some(d => d.aiReviewResult) && <details><summary className="cursor-pointer font-semibold">Reviews by document</summary>
      {documents.filter(d => d.aiReviewResult).map(d => <div key={d.id} className="my-3"><h4 className="font-semibold">{d.name}{d.isCurrent ? "" : " (previous version)"}</h4><AiLegalReviewPanel review={d.aiReviewResult} /><button type="button" disabled={busy} className="my-2 rounded border p-2" onClick={() => {setResponse(d.aiReviewResult.draft_response || "");setConfirmed(false);}}>Use this document's draft response</button></div>)}
    </details>}
    {review ? <AiLegalReviewPanel review={review} /> : <p className="text-sm">No draft analysis available. AI analysis requires a PDF and configured Gemini access. Word and Excel documents require manual review.</p>}
    <h4 className="font-semibold">Response to requester ? draft preview</h4>
    <p className="text-sm">Edit the first draft or write your response. Internal findings and templates are not included automatically.</p>
    <textarea aria-label="Response to requester" className="w-full rounded border p-3" rows={8} maxLength={20000} value={response} onChange={e => {setResponse(e.target.value);setConfirmed(false);}} />
    <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I have reviewed this exact response and confirm it can be shared with the requester.</label>
    <button type="button" className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy || !confirmed || !response.trim()} onClick={() => act(async () => {
      const publication = await apiRequest(`${endpoint}/publish-response`, { method:"POST", body:{response,confirmed} });
      setShared(publication);setConfirmed(false);setMessage("Confirmed response shared with the requester.");
    })}>Confirm and share response</button>
    {shared && <div className="rounded border bg-green-50 p-3"><h4 className="font-semibold">Last shared response</h4><p className="whitespace-pre-wrap">{shared.text}</p><p className="text-xs">Shared by {shared.publishedBy} on {new Date(shared.publishedAt).toLocaleString()}</p></div>}
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
  </section>;
}
