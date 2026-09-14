import fs from "node:fs";
import path from "node:path";

export function resolveDocumentStoragePath(storageRoot, relativePath) {
  const absolutePath = path.resolve(storageRoot, relativePath);
  const root = `${path.resolve(storageRoot)}${path.sep}`;
  if (!absolutePath.startsWith(root)) throw Object.assign(new Error("Invalid document storage path."), { status: 500 });
  return absolutePath;
}

export function createDocumentFileHandler({ getDocumentForUser, storageRoot }) {
  return async (req, res, next) => {
    const handleError = (error) => {
      if (res.headersSent) return next(error);
      // sendFile may fail after the access check, before writing its headers.
      // Clear file headers so these responses remain readable JSON errors.
      for (const name of ["Content-Type", "Content-Disposition", "Content-Length", "Content-Range"]) res.removeHeader(name);
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return res.status(404).json({
          error: "The document is missing from server storage.",
          code: "DOCUMENT_FILE_MISSING",
        });
      }
      next(error);
    };

    try {
      res.set("Cache-Control", "private, no-store");
      const document = await getDocumentForUser(req.user, req.params.documentId);
      if (!document) return res.status(404).json({
        error: "Document not found or access denied.",
        code: "DOCUMENT_NOT_FOUND",
      });
      const absolutePath = resolveDocumentStoragePath(storageRoot, document.storage_path);
      await fs.promises.access(absolutePath, fs.constants.R_OK);
      const safeName = document.file_name.replace(/[\r\n"]/g, "_");
      const inline = document.mime_type === "application/pdf" && req.query.download !== "1";
      // Express encodes international filenames safely for Content-Disposition.
      res.attachment(safeName);
      if (inline) res.set("Content-Disposition", res.get("Content-Disposition").replace(/^attachment/, "inline"));
      res.set({
        "Content-Type": document.mime_type || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      res.sendFile(absolutePath, (error) => { if (error) handleError(error); });
    } catch (error) {
      handleError(error);
    }
  };
}
