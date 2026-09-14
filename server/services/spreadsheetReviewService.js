import * as XLSX from "xlsx";

const DEFAULT_LIMITS = Object.freeze({
  maxSheets: 12,
  maxRowsPerSheet: 1000,
  maxColumnsPerSheet: 100,
  maxCells: 10000,
  maxCharacters: 120000,
  maxCellCharacters: 4000,
});

export function isSpreadsheetReviewDocument(job) {
  return /\.(xlsx|xls)$/i.test(String(job?.file_name || ""))
    || ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(job?.mime_type);
}

function extractionLimits(overrides = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, fallback]) => [key,
    Number.isSafeInteger(overrides[key]) && overrides[key] > 0 ? Math.min(overrides[key], fallback) : fallback,
  ]));
}

/** Extract bounded, labelled evidence without executing formulas, macros, or links. */
export function extractSpreadsheetReviewEvidence(bytes, overrides) {
  const limits = extractionLimits(overrides);
  let workbook;
  let names;
  try {
    const signature = Buffer.from(bytes).subarray(0, 8).toString("hex");
    if (!signature.startsWith("504b0304") && signature !== "d0cf11e0a1b11ae1") throw new Error("Invalid workbook signature");
    names = XLSX.read(bytes, { type: "buffer", bookSheets: true }).SheetNames;
    if (!names?.length) throw new Error("No worksheets");
    workbook = XLSX.read(bytes, {
      type: "buffer", sheets: names.slice(0, limits.maxSheets), sheetRows: limits.maxRowsPerSheet,
      cellFormula: true, cellHTML: false, cellStyles: false, cellText: true, bookVBA: false,
    });
  } catch {
    throw Object.assign(new Error("The Excel workbook could not be read. Upload a valid, unencrypted .xls or .xlsx workbook."), { status: 422 });
  }

  const cells = [];
  const includedSheets = [];
  const omissions = new Set();
  let characters = 0;
  let exhausted = false;
  if (names.length > limits.maxSheets) omissions.add("Additional worksheets were omitted by the worksheet limit.");
  for (const sheetName of names.slice(0, limits.maxSheets)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    includedSheets.push(sheetName);
    const declared = sheet["!fullref"] || sheet["!ref"];
    if (declared) {
      const range = XLSX.utils.decode_range(declared);
      if (range.e.r >= limits.maxRowsPerSheet) omissions.add("Rows beyond the per-sheet row limit were omitted.");
      if (range.e.c >= limits.maxColumnsPerSheet) omissions.add("Columns beyond the per-sheet column limit were omitted.");
    }
    for (const address of Object.keys(sheet)) {
      if (address.startsWith("!")) continue;
      const position = XLSX.utils.decode_cell(address);
      if (position.r >= limits.maxRowsPerSheet || position.c >= limits.maxColumnsPerSheet) continue;
      const cell = sheet[address];
      if (!cell || (cell.v === undefined && !cell.f)) continue;
      const fullValue = String(cell.w ?? cell.v ?? "");
      const fullFormula = typeof cell.f === "string" ? cell.f : "";
      if (!fullValue.trim() && !fullFormula) continue;
      if (fullValue.length > limits.maxCellCharacters || fullFormula.length > limits.maxCellCharacters) {
        omissions.add("Long cell values or formulas were truncated.");
      }
      const record = { sheet: sheetName, cell: address, value: fullValue.slice(0, limits.maxCellCharacters) };
      if (fullFormula) record.formula = fullFormula.slice(0, limits.maxCellCharacters);
      const length = JSON.stringify(record).length + 1;
      if (cells.length >= limits.maxCells || characters + length > limits.maxCharacters) {
        omissions.add("Additional cells were omitted by the cell or text limit.");
        exhausted = true;
        break;
      }
      cells.push(record);
      characters += length;
    }
    if (exhausted) break;
  }

  return {
    cells,
    scope: {
      type: "spreadsheet",
      partial: omissions.size > 0,
      total_sheets: names.length,
      included_sheets: includedSheets,
      included_cells: cells.length,
      limits: {
        max_sheets: limits.maxSheets, max_rows_per_sheet: limits.maxRowsPerSheet,
        max_columns_per_sheet: limits.maxColumnsPerSheet, max_cells: limits.maxCells,
        max_characters: limits.maxCharacters, max_cell_characters: limits.maxCellCharacters,
      },
      notes: [
        "Review evidence contains cell values and formulas only; drawings, charts, embedded files, and comments are not analyzed.",
        "Formulas are not executed or recalculated; displayed results may be cached.",
        ...omissions,
      ],
    },
  };
}

function comparable(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim() : "";
}

/** Validate model-supplied spreadsheet coordinates against the evidence actually sent. */
export function attachSpreadsheetReviewEvidence(result, evidence) {
  const indexed = new Map(evidence.cells.map((cell) => [JSON.stringify([cell.sheet, cell.cell]), cell]));
  function validate(item, checklist = false) {
    if (!item || typeof item !== "object") return null;
    const cell = typeof (item.cell || item.cell_reference) === "string" ? (item.cell || item.cell_reference).replace(/\$/g, "").toUpperCase() : "";
    const source = indexed.get(JSON.stringify([item.sheet, cell]));
    const quote = comparable(item.clause_text);
    const missing = /^missing\b/i.test(String(item.issue_type || ""));
    const verified = !missing && Boolean(source && quote && comparable(source.value).includes(quote));
    const normalized = { ...item, page: "N/A", sheet: verified ? source.sheet : null, cell: verified ? source.cell : null };
    if (checklist) {
      normalized.checked = item.checked === true && verified;
      if (verified) normalized.page = `'${source.sheet.replace(/'/g, "''")}'!${source.cell}`;
      if (item.checked === true && !verified) normalized.note = `${String(item.note || "").trim()} Confirm this criterion manually; no matching cell evidence was supplied.`.trim();
    }
    return normalized;
  }
  return {
    ...result,
    risk_highlights: result.risk_highlights.map((item) => validate(item)).filter(Boolean),
    missing_or_unusual_clauses: result.missing_or_unusual_clauses.map((item) => validate(item)).filter(Boolean),
    extracted_clauses: result.extracted_clauses.map((item) => validate(item)).filter(Boolean),
    review_checklist: result.review_checklist.map((item) => validate(item, true)).filter(Boolean),
    review_scope: evidence.scope,
  };
}
