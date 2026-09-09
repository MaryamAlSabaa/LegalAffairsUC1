import { useState } from "react";
import { departments, legalCategories, priorityLevels } from "../../data/mockData";
import { createFrontendDocument } from "../../utils/demoPdfReview";
import {
  ACCEPTED_DOCUMENT_TYPES,
  getDocumentTypeLabel,
  isPdfDocument,
  isSupportedDocumentFile,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../utils/documentTypes";
import Icon from "../common/Icon";

function RequestForm({ onCreateRequest, currentUser }) {
  const [formData, setFormData] = useState({
    title: "",
    partyName: "",
    endUser: currentUser?.name || "",
    department: currentUser?.department || "Legal Affairs",
    categoryCode: "LEG-A",
    priority: "Medium",
    deadline: "",
    description: "",
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState("");
  const [submissionError, setSubmissionError] = useState("");

  const selectedCategory = legalCategories.find((category) => category.code === formData.categoryCode);

  function updateField(fieldName, value) {
    setFormData((current) => ({ ...current, [fieldName]: value }));
  }

  function handleDocumentChange(event) {
    const file = event.target.files[0];
    if (!file) {
      setSelectedFile(null);
      setFileError("");
      return;
    }

    if (!isSupportedDocumentFile(file)) {
      setSelectedFile(null);
      setFileError("Attach a PDF, Word (.doc/.docx), or Excel (.xls/.xlsx) document.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setSelectedFile(null);
      setFileError("For security, each attachment must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setFileError("");
  }

  function getHighestRiskLevel(aiReviewResult) {
    const risks = aiReviewResult?.risk_highlights || [];
    if (risks.some((risk) => risk.risk_level === "high")) return "High";
    if (risks.some((risk) => risk.risk_level === "medium")) return "Medium";
    if (risks.some((risk) => risk.risk_level === "low")) return "Low";
    return "Not Classified";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedFile) {
      setFileError("Please attach one PDF, Word, or Excel document before submitting the request.");
      return;
    }

    setIsSubmitting(true);
    setSubmissionError("");
    setAiStatusMessage("Securing your document and generating its tracking number…");

    const submittedAt = new Date().toLocaleString([], {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const isPdf = isPdfDocument(selectedFile);
    const newRequest = {
      title: formData.title || "Untitled Legal Request",
      partyName: formData.partyName,
      endUser: formData.endUser || currentUser?.name || "Current user",
      categoryCode: formData.categoryCode,
      categoryName: selectedCategory.name,
      department: formData.department,
      requester: currentUser?.name || "Demo Requester",
      requesterUsername: currentUser?.username || "demo.requester",
      assignedReviewer: "Not Assigned",
      priority: formData.priority,
      riskLevel: getHighestRiskLevel(null),
      status: isPdf ? "AI Review Pending" : "New",
      deadline: formData.deadline || "No deadline selected",
      submittedAt,
      description: formData.description || "No description was provided by the requester.",
      documents: [createFrontendDocument(selectedFile, null)],
      uploadFile: selectedFile,
      aiSummary: isPdf
        ? "AI legal review is pending. The backend queue will process this PDF and update the checklist when the AI draft is ready."
        : "Office document secured for manual Legal Affairs review.",
      aiReviewResult: null,
      reviewerComments: [],
    };

    try {
      await onCreateRequest(newRequest);
      setFormData({ title: "", partyName: "", endUser: currentUser?.name || "", department: currentUser?.department || "Legal Affairs", categoryCode: "LEG-A", priority: "Medium", deadline: "", description: "" });
      setSelectedFile(null);
      setFileError("");
      setAiStatusMessage("");
      event.target.reset();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not submit the request. Your form data has been kept.");
      setAiStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="request-form-page">
      <div className="page-heading">
        <div><p className="page-kicker">New matter intake</p><h2>Submit a legal request</h2><p>Provide clear context and the source document so Legal Affairs can route and assess your matter efficiently.</p></div>
        <div className="intake-reference"><Icon name="shield" size={18} /><div><span>Secure intake</span><strong>Encrypted document handling</strong></div></div>
      </div>

      <div className="intake-steps" aria-label="Submission process">
        <div className="is-current"><span>1</span><div><strong>Request details</strong><small>Describe the matter</small></div></div>
        <i />
        <div><span>2</span><div><strong>AI assessment</strong><small>Initial document review</small></div></div>
        <i />
        <div><span>3</span><div><strong>Legal routing</strong><small>Assigned to the right team</small></div></div>
      </div>

      <form onSubmit={handleSubmit} className="intake-layout">
        <div className="intake-main">
          <section className="form-section">
            <header><span><Icon name="file" size={19} /></span><div><h3>Matter information</h3><p>Tell us what you need Legal Affairs to review.</p></div></header>
            <div className="form-grid">
              <label className="field-group form-span-2"><span className="field-label">Request title <b>*</b></span><input className="field-control" value={formData.title} onChange={(event) => updateField("title", event.target.value)} placeholder="e.g. Review research collaboration agreement" required /></label>
              <label className="field-group"><span className="field-label">Party name <b>*</b></span><input className="field-control" value={formData.partyName} onChange={(event) => updateField("partyName", event.target.value)} placeholder="External party or counterparty" required /></label>
              <label className="field-group"><span className="field-label">End user <b>*</b></span><input className="field-control" value={formData.endUser} onChange={(event) => updateField("endUser", event.target.value)} placeholder="Business owner or end user" required /></label>
              <label className="field-group"><span className="field-label">Requesting department <b>*</b></span><select className="field-control" value={formData.department} onChange={(event) => updateField("department", event.target.value)}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
              <label className="field-group"><span className="field-label">Legal category <b>*</b></span><select className="field-control" value={formData.categoryCode} onChange={(event) => updateField("categoryCode", event.target.value)}>{legalCategories.map((category) => <option key={category.code} value={category.code}>{category.code} · {category.name}</option>)}</select></label>
              <label className="field-group"><span className="field-label">Priority</span><select className="field-control" value={formData.priority} onChange={(event) => updateField("priority", event.target.value)}>{priorityLevels.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <label className="field-group"><span className="field-label">Required by</span><input className="field-control" type="date" value={formData.deadline} onChange={(event) => updateField("deadline", event.target.value)} /></label>
              <label className="field-group form-span-2"><span className="field-label">Context and requested outcome <b>*</b></span><textarea className="field-control form-textarea" value={formData.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Explain the background, the specific legal question, parties involved, and the outcome you need…" required /><span className="field-hint">Include decision dates or business constraints that may affect the review.</span></label>
            </div>
          </section>

          <section className="form-section">
            <header><span><Icon name="clipboard" size={19} /></span><div><h3>Supporting document</h3><p>Upload a PDF, Word, or Excel document for controlled review.</p></div></header>
            <label className={`upload-zone ${fileError ? "has-error" : ""} ${selectedFile ? "has-file" : ""}`}>
              <input type="file" accept={ACCEPTED_DOCUMENT_TYPES} onChange={handleDocumentChange} />
              <span className="upload-icon"><Icon name={selectedFile ? "check" : "plus"} size={22} /></span>
              <div><strong>{selectedFile ? selectedFile.name : "Choose a PDF, Word, or Excel document"}</strong><p>{selectedFile ? `${getDocumentTypeLabel(selectedFile)} · ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready for secure upload` : "PDF, DOC, DOCX, XLS, or XLSX · Maximum 10 MB"}</p></div>
              <span className="button-secondary">Browse file</span>
            </label>
            {fileError && <p className="form-message error"><Icon name="warning" size={16} />{fileError}</p>}
            {aiStatusMessage && <p className="form-message info"><Icon name="activity" size={16} />{aiStatusMessage}</p>}
            {submissionError && <p className="form-message error"><Icon name="warning" size={16} />{submissionError}</p>}
          </section>
        </div>

        <aside className="intake-summary">
          <div className="summary-heading"><p className="page-kicker">Submission summary</p><h3>Ready for intake</h3></div>
          <dl>
            <div><dt>Requester</dt><dd>{currentUser?.name || "Current user"}</dd></div>
            <div><dt>Party</dt><dd>{formData.partyName || "Required"}</dd></div>
            <div><dt>End user</dt><dd>{formData.endUser || "Required"}</dd></div>
            <div><dt>Department</dt><dd>{formData.department}</dd></div>
            <div><dt>Category</dt><dd>{selectedCategory?.name || "Not selected"}<small>{formData.categoryCode}</small></dd></div>
            <div><dt>Priority</dt><dd><span className={`priority-badge priority-${formData.priority.toLowerCase()}`}><i />{formData.priority}</span></dd></div>
            <div><dt>Document</dt><dd>{selectedFile ? `1 ${getDocumentTypeLabel(selectedFile)} attached` : "Required"}</dd></div>
          </dl>
          <div className="summary-security"><Icon name="lock" size={17} /><p><strong>Confidential handling</strong>Your document is visible only to authorized participants in the legal workflow.</p></div>
          <button className="button-primary summary-submit" type="submit" disabled={isSubmitting}><span>{isSubmitting ? "Submitting securely…" : "Submit to Legal Affairs"}</span><Icon name="arrowRight" size={18} /></button>
          <p className="submission-consent">By submitting, you confirm the information is accurate and appropriate for Legal Affairs review.</p>
        </aside>
      </form>
    </section>
  );
}

export default RequestForm;
