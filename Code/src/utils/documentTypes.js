export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const supportedExtensions = new Set(["pdf", "doc", "docx", "xls", "xlsx"]);

export function getDocumentExtension(fileName = "") {
  return String(fileName).split(".").pop()?.toLowerCase() || "";
}

export function isSupportedDocumentFile(file) {
  return Boolean(file && supportedExtensions.has(getDocumentExtension(file.name)));
}

export function isPdfDocument(document) {
  return document?.type === "application/pdf" || getDocumentExtension(document?.name) === "pdf";
}

export function getDocumentTypeLabel(document) {
  const extension = getDocumentExtension(document?.name);
  if (extension === "pdf" || document?.type === "application/pdf") return "PDF";
  if (["doc", "docx"].includes(extension) || document?.type?.includes("word")) return "Word";
  if (["xls", "xlsx"].includes(extension) || document?.type?.includes("excel") || document?.type?.includes("spreadsheet")) return "Excel";
  return "Document";
}
