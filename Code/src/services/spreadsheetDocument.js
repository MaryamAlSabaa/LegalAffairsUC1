class SpreadsheetDocumentError extends Error {}

export const SPREADSHEET_PREVIEW_LIMITS = Object.freeze({
  bytes: 20 * 1024 * 1024,
  sheets: 20,
  rows: 2000,
  columns: 100,
  cells: 100000,
  cellCharacters: 10000,
});

function responseError(status, payload) {
  if (status === 401) return "Your session has expired. Sign in again, then reopen the document.";
  if (status === 403) return "You do not have permission to view this document. Contact Legal Affairs for access.";
  if (status === 404 && payload?.code === "DOCUMENT_FILE_MISSING") {
    return "The uploaded file is missing. Contact Legal Affairs to restore it or arrange another upload.";
  }
  if (status === 404 && payload?.code === "DOCUMENT_NOT_FOUND") {
    return "This document could not be found or is unavailable to you. Refresh the request and try again.";
  }
  if (status >= 500) return "The document service is temporarily unavailable. Try again in a moment.";
  return "The spreadsheet could not be retrieved. Try again. If the problem continues, contact Legal Affairs.";
}

export function spreadsheetPreviewErrorMessage(error) {
  if (error instanceof SpreadsheetDocumentError) return error.message;
  return "The spreadsheet could not be opened. Try again or ask Legal Affairs for a replacement copy.";
}

export async function fetchSpreadsheetDocument(url, { signal, fetchImpl = fetch } = {}) {
  signal?.throwIfAborted();
  if (!url) throw new SpreadsheetDocumentError("No spreadsheet is available. Refresh the request and try again.");
  try {
    const previewUrl = new URL(url, globalThis.location?.href || "http://localhost");
    if (["http:", "https:"].includes(previewUrl.protocol)) previewUrl.searchParams.delete("download");
    const response = await fetchImpl(previewUrl.href, { credentials: "include", signal });
    signal?.throwIfAborted();
    if (!response.ok) {
      let payload;
      try { payload = await response.json(); } catch { signal?.throwIfAborted(); }
      signal?.throwIfAborted();
      throw new SpreadsheetDocumentError(responseError(response.status, payload));
    }
    const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (["text/html", "application/json", "application/xhtml+xml"].includes(contentType) || contentType.endsWith("+json")) {
      throw new SpreadsheetDocumentError(responseError(0));
    }
    const sizeError = "This spreadsheet exceeds the 20 MB preview limit. Ask for a smaller workbook or use the Download option.";
    if (Number(response.headers.get("content-length")) > SPREADSHEET_PREVIEW_LIMITS.bytes) {
      throw new SpreadsheetDocumentError(sizeError);
    }
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          signal?.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > SPREADSHEET_PREVIEW_LIMITS.bytes) {
            await reader.cancel();
            throw new SpreadsheetDocumentError(sizeError);
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    signal?.throwIfAborted();
    if (bytes.byteLength > SPREADSHEET_PREVIEW_LIMITS.bytes) throw new SpreadsheetDocumentError(sizeError);
    if (!bytes.byteLength) throw new SpreadsheetDocumentError("This spreadsheet is empty. Ask Legal Affairs for a replacement copy.");
    return bytes;
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === "AbortError" || error instanceof SpreadsheetDocumentError) throw error;
    throw new SpreadsheetDocumentError("The spreadsheet could not be retrieved. Check your connection and try again.");
  }
}

function isExcelContainer(bytes) {
  // Reject HTML, JSON and arbitrary text that SheetJS otherwise accepts as CSV.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const cfb = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value);
  const biff = bytes[0] === 0x09 && [0x00, 0x02, 0x04, 0x08].includes(bytes[1]);
  return zip || cfb || biff;
}

export async function parseSpreadsheetDocument(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length) throw new SpreadsheetDocumentError("This spreadsheet is empty. Ask Legal Affairs for a replacement copy.");
  if (bytes.length > SPREADSHEET_PREVIEW_LIMITS.bytes) throw new SpreadsheetDocumentError("This spreadsheet exceeds the 20 MB preview limit.");
  if (!isExcelContainer(bytes)) {
    throw new SpreadsheetDocumentError("This file is not a supported Excel workbook. Ask for an .xls or .xlsx copy.");
  }
  try {
    const XLSX = await import("xlsx");
    const metadata = XLSX.read(bytes, { type: "array", bookSheets: true, bookVBA: false });
    const names = metadata.SheetNames?.slice(0, SPREADSHEET_PREVIEW_LIMITS.sheets) || [];
    if (!names.length) throw new Error("No sheets");
    const workbook = XLSX.read(bytes, {
      type: "array", sheets: names, sheetRows: SPREADSHEET_PREVIEW_LIMITS.rows,
      cellHTML: false, cellFormula: true, bookVBA: false, cellStyles: false,
    });
    const sheets = [];
    let remainingCells = SPREADSHEET_PREVIEW_LIMITS.cells;
    let textTruncated = false;
    for (const name of names) {
      const source = workbook.Sheets[name];
      const range = source?.["!fullref"] || source?.["!ref"];
      const bounds = range ? XLSX.utils.decode_range(range) : null;
      const totalRows = bounds ? bounds.e.r + 1 : 0;
      const totalColumns = bounds ? bounds.e.c + 1 : 0;
      const columns = Math.min(totalColumns, SPREADSHEET_PREVIEW_LIMITS.columns);
      const rows = Math.min(totalRows, SPREADSHEET_PREVIEW_LIMITS.rows, columns ? Math.floor(remainingCells / columns) : 0);
      remainingCells -= rows * columns;
      const cells = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const address = XLSX.utils.encode_cell({ r: row, c: column });
          const cell = source?.[address];
          if (!cell || cell.t === "z") continue;
          const hasValue = cell.v !== undefined && cell.v !== null;
          const originalText = hasValue ? String(cell.w ?? cell.v) : "";
          const text = originalText.slice(0, SPREADSHEET_PREVIEW_LIMITS.cellCharacters);
          if (originalText.length > text.length) textTruncated = true;
          if (text || cell.f) cells.push({ address, row, column, text, formula: Boolean(cell.f), truncated: originalText.length > text.length });
        }
      }
      sheets.push({
        name, rows, columns, cells, totalRows, totalColumns,
        hidden: Boolean(workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name)?.Hidden),
        truncated: rows < totalRows || columns < totalColumns,
      });
    }
    return {
      sheets, totalSheets: metadata.SheetNames.length,
      truncated: names.length < metadata.SheetNames.length || sheets.some((sheet) => sheet.truncated) || textTruncated,
      textTruncated, limits: SPREADSHEET_PREVIEW_LIMITS,
    };
  } catch (error) {
    if (error instanceof SpreadsheetDocumentError) throw error;
    if (/password|encrypt/i.test(error?.message || "")) {
      throw new SpreadsheetDocumentError("This workbook is password protected. Ask Legal Affairs for an unprotected copy to preview.");
    }
    throw new SpreadsheetDocumentError("This workbook could not be read. It may be damaged or unsupported. Ask Legal Affairs for an .xls or .xlsx replacement.");
  }
}

function normalizedQuote(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

export function locateSpreadsheetFindings(workbook, findings = []) {
  if (!workbook?.sheets) return [];
  const matches = [];
  for (const finding of findings) {
    if (finding.missing) continue;
    const quote = normalizedQuote(finding.quote);
    if (!quote) continue;
    const sheets = finding.sheet ? workbook.sheets.filter((sheet) => sheet.name === finding.sheet) : workbook.sheets;
    const reference = typeof finding.cell === "string" ? finding.cell.replace(/\$/g, "").toUpperCase() : "";
    const hasLocation = Boolean(finding.sheet && /^[A-Z]{1,3}[1-9]\d*$/.test(reference));
    // Without a precise location, short/common phrases cannot identify evidence reliably.
    if (!hasLocation && (quote.length < 24 || quote.split(" ").length < 4)) continue;
    const candidates = [];
    for (const sheet of sheets) {
      for (const cell of sheet.cells) {
        if (reference && cell.address !== reference) continue;
        const value = normalizedQuote(cell.text);
        if (!value || !value.includes(quote)) continue;
        if (quote.length < 24 && value !== quote) continue;
        if (hasLocation || value === quote || quote.length >= 24) {
          candidates.push({ findingId: finding.id, sheet: sheet.name, address: cell.address, row: cell.row, column: cell.column, severity: finding.severity });
        }
      }
    }
    if (candidates.length === 1) matches.push(candidates[0]);
  }
  return matches;
}
