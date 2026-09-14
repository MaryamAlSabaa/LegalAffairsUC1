import { useEffect, useId, useRef, useState } from "react";
import Icon from "../common/Icon";
import { fetchDocumentDownload, saveDocumentDownload } from "../../services/documentDownload";

function DocumentDownloadButton({ document, className = "button-secondary" }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const controllerRef = useRef(null);
  const errorId = useId();

  useEffect(() => {
    setErrorMessage("");
    setIsDownloading(false);
    return () => controllerRef.current?.abort();
  }, [document?.url]);

  async function download() {
    if (controllerRef.current && !controllerRef.current.signal.aborted) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsDownloading(true);
    setErrorMessage("");
    try {
      const blob = await fetchDocumentDownload(document?.url, { signal: controller.signal });
      saveDocumentDownload(blob, document?.name);
    } catch (error) {
      if (!controller.signal.aborted) setErrorMessage(error.message || "The download could not start. Try again.");
    } finally {
      if (!controller.signal.aborted) {
        controllerRef.current = null;
        setIsDownloading(false);
      }
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        className={className}
        onClick={download}
        disabled={isDownloading || !document?.url}
        aria-busy={isDownloading}
        aria-label={`${isDownloading ? "Downloading" : "Download"} ${document?.name || "document"}`}
        aria-describedby={errorMessage ? errorId : undefined}
      >
        <Icon name="download" size={16} />
        {isDownloading ? "Downloading…" : "Download"}
      </button>
      {errorMessage && <p id={errorId} role="alert" className="max-w-sm text-sm text-red-700">{errorMessage}</p>}
    </div>
  );
}

export default DocumentDownloadButton;
