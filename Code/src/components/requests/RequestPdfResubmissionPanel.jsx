import { useState } from "react";
import {
  ACCEPTED_DOCUMENT_TYPES,
  isSupportedDocumentFile,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../utils/documentTypes";

function RequestPdfResubmissionPanel({ documents, onUpdateDocuments }) {
  const [removeDocumentIds, setRemoveDocumentIds] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const remainingExistingDocuments = documents.filter(
    (document) => !removeDocumentIds.includes(document.id),
  );
  const hasSupportingDocument =
    remainingExistingDocuments.length + newFiles.length > 0;
  const hasDocumentChange = removeDocumentIds.length > 0 || newFiles.length > 0;

  function toggleRemoval(documentId) {
    const nextRemovedDocumentIds = removeDocumentIds.includes(documentId)
      ? removeDocumentIds.filter((id) => id !== documentId)
      : [...removeDocumentIds, documentId];
    const remainingDocumentCount = documents.filter(
      (document) => !nextRemovedDocumentIds.includes(document.id),
    ).length;

    setRemoveDocumentIds(nextRemovedDocumentIds);
    setMessage(
      remainingDocumentCount + newFiles.length < 1
        ? "Upload a replacement document before resubmitting. Every updated request must keep supporting documentation."
        : "",
    );
  }

  function selectNewFiles(event) {
    const selectedFiles = [...(event.target.files || [])];
    const invalidFile = selectedFiles.find(
      (file) => !isSupportedDocumentFile(file) || file.size > MAX_ATTACHMENT_SIZE_BYTES,
    );
    if (invalidFile) {
      setNewFiles([]);
      setMessage(`${invalidFile.name} is not a supported PDF, Word, or Excel document, or it exceeds the 10 MB limit.`);
      event.target.value = "";
      return;
    }
    setNewFiles(selectedFiles);
    setMessage("");
  }

  async function submitUpdate() {
    if (isSaving) return;
    if (remainingExistingDocuments.length + newFiles.length < 1) {
      setMessage("Keep at least one existing document or upload a replacement before resubmitting.");
      return;
    }
    if (removeDocumentIds.length === 0 && newFiles.length === 0) {
      setMessage("Choose a document change before resubmitting.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      await onUpdateDocuments({ removeDocumentIds, files: newFiles });
      setRemoveDocumentIds([]);
      setNewFiles([]);
      setMessage("Document update submitted. PDFs are queued for AI review; Office documents are routed for manual review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update request documents.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <h3 className="font-bold text-blue-950">Respond with Updated Documents</h3>
      <p className="mt-1 text-sm text-blue-800">
        Your reviewer requested more information. Add PDF, Word, or Excel documents, remove outdated attachments, or upload a replacement. At least one document must remain attached.
      </p>

      <div className="mt-4 space-y-2">
        {documents.map((document) => (
          <label key={document.id} className="flex items-center gap-3 rounded-lg bg-white p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={removeDocumentIds.includes(document.id)}
              onChange={() => toggleRemoval(document.id)}
              disabled={isSaving}
            />
            <span className={removeDocumentIds.includes(document.id) ? "line-through opacity-60" : ""}>
              Remove {document.name}
            </span>
          </label>
        ))}
      </div>

      <label className="mt-4 block text-sm font-semibold text-blue-950">
        Add or replace documents
        <input
          className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-normal"
          type="file"
          accept={ACCEPTED_DOCUMENT_TYPES}
          multiple
          disabled={isSaving}
          onChange={selectNewFiles}
        />
      </label>
      {newFiles.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-green-700">
          New documents: {newFiles.map((file) => file.name).join(", ")}
        </p>
      )}

      <button
        type="button"
        disabled={isSaving || !hasSupportingDocument || !hasDocumentChange}
        onClick={submitUpdate}
        className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving
            ? "Uploading and queuing..."
            : !hasSupportingDocument
            ? "Upload a Replacement Document to Resubmit"
            : "Submit Document Update"}
      </button>
      {message && <p className="mt-3 text-sm font-semibold text-blue-800">{message}</p>}
    </section>
  );
}

export default RequestPdfResubmissionPanel;
