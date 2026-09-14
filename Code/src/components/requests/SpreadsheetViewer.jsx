import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSpreadsheetDocument,
  locateSpreadsheetFindings,
  spreadsheetPreviewErrorMessage,
} from "../../services/spreadsheetDocument";
import "./spreadsheetViewer.css";

const ROWS_PER_PAGE = 100;
const COLUMNS_PER_PAGE = 20;

function columnLabel(index) {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}

export default function SpreadsheetViewer({ document, findings = [], activeFindingId, activeCell, onSelectFinding, onWorkbookLoaded }) {
  const [workbook, setWorkbook] = useState(null);
  const [viewerError, setViewerError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [rowPage, setRowPage] = useState(0);
  const [columnPage, setColumnPage] = useState(0);
  const cellRefs = useRef({});
  const loadedCallbackRef = useRef(onWorkbookLoaded);
  loadedCallbackRef.current = onWorkbookLoaded;
  const documentUrl = document?.url;

  useEffect(() => {
    const controller = new AbortController();
    let worker;
    let workerTimer;
    let finishWorker;
    setWorkbook(null);
    setViewerError("");
    setLoading(true);
    setSheetIndex(0);
    setRowPage(0);
    setColumnPage(0);

    async function load() {
      try {
        const bytes = await fetchSpreadsheetDocument(documentUrl, { signal: controller.signal });
        if (controller.signal.aborted) return;
        // Parse outside the page thread, with a deadline for unusually complex workbooks.
        worker = new Worker(new URL("../../services/spreadsheetDocument.worker.js", import.meta.url), { type: "module" });
        const result = await new Promise((resolve) => {
          finishWorker = resolve;
          worker.onmessage = (event) => resolve(event.data);
          worker.onerror = () => resolve({ error: "The spreadsheet preview could not start. Retry the preview." });
          workerTimer = setTimeout(() => resolve({ error: "This workbook is too complex to preview in time. Ask for a smaller workbook or use the Download option." }), 20000);
          worker.postMessage(bytes, [bytes.buffer]);
        });
        clearTimeout(workerTimer);
        worker.terminate();
        if (controller.signal.aborted) return;
        if (result.error) {
          setViewerError(result.error);
        } else {
          setWorkbook(result.workbook);
          loadedCallbackRef.current?.(result.workbook);
        }
      } catch (error) {
        if (!controller.signal.aborted) setViewerError(spreadsheetPreviewErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => {
      controller.abort();
      clearTimeout(workerTimer);
      worker?.terminate();
      finishWorker?.({ error: "cancelled" });
    };
  }, [documentUrl, retryCount]);

  const findingsSignature = JSON.stringify(findings);
  // Background polling must not pull the reviewer back to a previously selected cell.
  const matches = useMemo(() => locateSpreadsheetFindings(workbook, findings), [workbook, findingsSignature]);
  const activeLocation = matches.find((match) => match.findingId === activeFindingId);
  const checklistLocation = useMemo(() => {
    const locatedSheet = workbook?.sheets.find((item) => item.name === activeCell?.sheet);
    const reference = typeof activeCell?.cell === "string" ? activeCell.cell.replace(/\$/g, "").toUpperCase() : "";
    const parts = /^([A-Z]{1,3})([1-9]\d*)$/.exec(reference);
    if (!locatedSheet || !parts) return null;
    let column = 0;
    for (const letter of parts[1]) column = column * 26 + letter.charCodeAt(0) - 64;
    const row = Number(parts[2]) - 1;
    column -= 1;
    if (row >= locatedSheet.rows || column >= locatedSheet.columns) return null;
    return { sheet: locatedSheet.name, address: reference, row, column };
  }, [workbook, activeCell?.sheet, activeCell?.cell]);
  const navigationLocation = checklistLocation || activeLocation;
  const sheet = workbook?.sheets[sheetIndex];
  const cells = useMemo(() => new Map((sheet?.cells || []).map((cell) => [cell.address, cell])), [sheet]);
  const highlights = useMemo(() => {
    const result = new Map();
    for (const match of matches) {
      if (match.sheet !== sheet?.name) continue;
      if (!result.has(match.address)) result.set(match.address, []);
      result.get(match.address).push(match);
    }
    return result;
  }, [matches, sheet]);

  useEffect(() => {
    if (!navigationLocation || !workbook) return;
    setSheetIndex(workbook.sheets.findIndex((item) => item.name === navigationLocation.sheet));
    setRowPage(Math.floor(navigationLocation.row / ROWS_PER_PAGE));
    setColumnPage(Math.floor(navigationLocation.column / COLUMNS_PER_PAGE));
  }, [navigationLocation, workbook]);

  useEffect(() => {
    if (navigationLocation?.sheet !== sheet?.name) return;
    const cell = cellRefs.current[navigationLocation?.address];
    cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [navigationLocation, sheet, rowPage, columnPage]);

  if (loading) return <div className="spreadsheet-viewer spreadsheet-viewer-state" role="status">Loading spreadsheet preview...</div>;
  if (viewerError) {
    return (
      <div className="spreadsheet-viewer spreadsheet-viewer-state">
        <div className="spreadsheet-viewer-error" role="alert">
          <h3>Spreadsheet preview could not load</h3>
          <p>{viewerError}</p>
          <button type="button" className="button-secondary" onClick={() => setRetryCount((count) => count + 1)}>Retry preview</button>
        </div>
      </div>
    );
  }
  if (!sheet) return <div className="spreadsheet-viewer spreadsheet-viewer-state">No worksheets are available in this preview.</div>;

  const startRow = rowPage * ROWS_PER_PAGE;
  const endRow = Math.min(sheet.rows, startRow + ROWS_PER_PAGE);
  const startColumn = columnPage * COLUMNS_PER_PAGE;
  const endColumn = Math.min(sheet.columns, startColumn + COLUMNS_PER_PAGE);
  const rows = Array.from({ length: Math.max(0, endRow - startRow) }, (_, index) => startRow + index);
  const columns = Array.from({ length: Math.max(0, endColumn - startColumn) }, (_, index) => startColumn + index);

  function selectSheet(index) {
    setSheetIndex(index);
    setRowPage(0);
    setColumnPage(0);
  }

  return (
    <section className="spreadsheet-viewer" aria-label={`Spreadsheet preview: ${document?.name || "attached document"}`}>
      <div className="spreadsheet-sheet-tabs" aria-label="Worksheets">
        {workbook.sheets.map((item, index) => (
          <button key={item.name} type="button" aria-pressed={index === sheetIndex} onClick={() => selectSheet(index)}>
            {item.name}{item.hidden ? " (hidden in original)" : ""}
          </button>
        ))}
      </div>
      <p className="spreadsheet-preview-note">
        Preview of saved cell values. Formula results may be out of date; charts, images, comments and original formatting are not shown.
      </p>
      {workbook.truncated && (
        <p className="spreadsheet-preview-limit" role="status">
          Limited preview: up to {workbook.limits.sheets} sheets, {workbook.limits.rows.toLocaleString()} rows and {workbook.limits.columns} columns per sheet, with {workbook.limits.cells.toLocaleString()} cells in total.
          {workbook.textTruncated ? ` Cell text is limited to ${workbook.limits.cellCharacters.toLocaleString()} characters.` : ""}
          {" "}Content outside these limits is not displayed.
        </p>
      )}
      <div className="spreadsheet-pagination">
        <div>
          <button type="button" onClick={() => setRowPage((page) => page - 1)} disabled={rowPage === 0} aria-label="Previous rows">Previous rows</button>
          <span>{sheet.rows ? `Rows ${startRow + 1}–${endRow} of ${sheet.totalRows.toLocaleString()}` : "No rows displayed"}</span>
          <button type="button" onClick={() => setRowPage((page) => page + 1)} disabled={endRow >= sheet.rows} aria-label="Next rows">Next rows</button>
        </div>
        {sheet.columns > COLUMNS_PER_PAGE && <div>
          <button type="button" onClick={() => setColumnPage((page) => page - 1)} disabled={columnPage === 0} aria-label="Previous columns">Previous columns</button>
          <span>Columns {columnLabel(startColumn)}–{columnLabel(endColumn - 1)}</span>
          <button type="button" onClick={() => setColumnPage((page) => page + 1)} disabled={endColumn >= sheet.columns} aria-label="Next columns">Next columns</button>
        </div>}
      </div>
      <div className="spreadsheet-grid-scroll" tabIndex={0} role="region" aria-label={`${sheet.name} worksheet cells`}>
        {sheet.rows && sheet.columns ? (
          <table className="spreadsheet-grid">
            <caption className="sr-only">{sheet.name}, rows {startRow + 1} to {endRow}. Highlighted cells have matched review evidence.</caption>
            <thead><tr><th scope="col" className="spreadsheet-corner" aria-label="Row number" />{columns.map((column) => <th scope="col" key={column}>{columnLabel(column)}</th>)}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row}>
                <th scope="row">{row + 1}</th>
                {columns.map((column) => {
                  const address = `${columnLabel(column)}${row + 1}`;
                  const cell = cells.get(address);
                  const cellFindings = highlights.get(address) || [];
                  const isActive = cellFindings.some((match) => match.findingId === activeFindingId);
                  const highRisk = cellFindings.some((match) => ["high", "critical"].includes(String(match.severity).toLowerCase()));
                  const value = cell?.text || (cell?.formula ? "Formula result unavailable" : "");
                  return (
                    <td key={column} ref={(element) => { if (element) cellRefs.current[address] = element; else delete cellRefs.current[address]; }}
                      data-cell-address={address}
                      className={`${cellFindings.length ? `spreadsheet-cell-${highRisk ? "high" : "review"}` : ""} ${isActive ? "spreadsheet-cell-active" : ""}`}>
                      {cellFindings.length ? (
                        <button type="button" className="spreadsheet-cell-finding" aria-label={`${address}: ${value}. ${cellFindings.length} review finding${cellFindings.length === 1 ? "" : "s"}.`}
                          onClick={() => onSelectFinding?.(cellFindings[0].findingId)}>
                          <span className="spreadsheet-cell-text">{value}{cell?.truncated ? "… [text truncated]" : ""}</span>
                          <span className="spreadsheet-cell-badge">{highRisk ? "High risk" : "Review"}</span>
                        </button>
                      ) : <span className="spreadsheet-cell-text">{value}{cell?.truncated ? "… [text truncated]" : ""}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="spreadsheet-empty">{sheet.totalRows ? "This sheet is outside the preview limit." : "This worksheet has no cell values."}</p>}
      </div>
    </section>
  );
}
