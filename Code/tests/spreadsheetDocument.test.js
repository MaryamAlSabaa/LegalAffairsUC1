import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  fetchSpreadsheetDocument,
  parseSpreadsheetDocument,
  locateSpreadsheetFindings,
  spreadsheetPreviewErrorMessage,
  SPREADSHEET_PREVIEW_LIMITS,
} from "../src/services/spreadsheetDocument.js";

const url = "https://documents.example/api/documents/123/file";

function workbookBytes(bookType = "xlsx", sheets = { Terms: [["Clause", "Value"], ["Liability", "The university accepts unlimited liability for every claim."]] }) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(book, { type: "array", bookType }));
}

test("fetches authenticated attachment bytes for preview without triggering the download endpoint", async () => {
  const bytes = workbookBytes();
  const controller = new AbortController();
  const result = await fetchSpreadsheetDocument(`${url}?download=1&version=2`, {
    signal: controller.signal,
    fetchImpl: async (requestedUrl, options) => {
      assert.equal(requestedUrl, `${url}?version=2`);
      assert.equal(options.credentials, "include");
      assert.equal(options.signal, controller.signal);
      return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename=terms.xlsx" } });
    },
  });
  assert.deepEqual(result, bytes);
});

test("explains authentication, missing storage and unavailable service errors", async () => {
  for (const [status, body, expected] of [
    [401, {}, /Sign in again/], [403, {}, /permission/],
    [404, { code: "DOCUMENT_FILE_MISSING" }, /uploaded file is missing/],
    [404, { code: "DOCUMENT_NOT_FOUND" }, /unavailable to you/],
    [503, {}, /temporarily unavailable/],
  ]) {
    await assert.rejects(fetchSpreadsheetDocument(url, {
      fetchImpl: async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    }), (error) => expected.test(spreadsheetPreviewErrorMessage(error)));
  }
});

test("does not feed successful HTML or JSON error pages to the spreadsheet parser", async () => {
  for (const type of ["text/html; charset=utf-8", "application/json", "application/problem+json"]) {
    await assert.rejects(fetchSpreadsheetDocument(url, {
      fetchImpl: async () => new Response("invalid response", { headers: { "Content-Type": type } }),
    }), /could not be retrieved/);
  }
});

test("bounds large downloads using declared and streamed response sizes", async () => {
  await assert.rejects(fetchSpreadsheetDocument(url, {
    fetchImpl: async () => new Response("data", { headers: { "Content-Length": String(SPREADSHEET_PREVIEW_LIMITS.bytes + 1) } }),
  }), /20 MB preview limit/);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(SPREADSHEET_PREVIEW_LIMITS.bytes + 1)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(fetchSpreadsheetDocument(url, { fetchImpl: async () => new Response(stream) }), /20 MB preview limit/);
  assert.equal(cancelled, true);
});

test("handles empty files, network errors, and missing URLs", async () => {
  await assert.rejects(fetchSpreadsheetDocument(url, { fetchImpl: async () => new Response(new Uint8Array()) }), /empty/);
  await assert.rejects(fetchSpreadsheetDocument(url, { fetchImpl: async () => { throw new TypeError("sensitive server detail"); } }), (error) => {
    assert.match(spreadsheetPreviewErrorMessage(error), /Check your connection/);
    assert.doesNotMatch(error.message, /sensitive/);
    return true;
  });
  await assert.rejects(fetchSpreadsheetDocument(null, { fetchImpl: async () => assert.fail("should not fetch") }), /No spreadsheet/);
});

test("preserves cancellation before download and while reading its body", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchSpreadsheetDocument(url, { signal: controller.signal, fetchImpl: async () => assert.fail("should not fetch") }), { name: "AbortError" });
  const active = new AbortController();
  await assert.rejects(fetchSpreadsheetDocument(url, {
    signal: active.signal,
    fetchImpl: async () => ({
      ok: true, headers: new Headers(), arrayBuffer: async () => { active.abort(); return workbookBytes().buffer; },
    }),
  }), { name: "AbortError" });
});

for (const format of ["xlsx", "xls"]) {
  test(`reads a real .${format} workbook with sheet and cell references`, async () => {
    const result = await parseSpreadsheetDocument(workbookBytes(format, { Terms: [["Liability", "Unlimited liability"]], Budget: [["Amount", 1250]] }));
    assert.equal(result.totalSheets, 2);
    assert.equal(result.sheets[0].name, "Terms");
    assert.deepEqual(result.sheets[0].cells[1], { address: "B1", row: 0, column: 1, text: "Unlimited liability", formula: false, truncated: false });
    assert.equal(result.sheets[1].cells[1].text, "1250");
    assert.equal(result.truncated, false);
  });
}

test("keeps markup and links as plain values and uses cached formula results", async () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["<img src=x onerror=alert(1)>", "Terms link", 2, "No cached result"]]);
  sheet.B1.l = { Target: "javascript:alert(1)" };
  sheet.C1.f = "1+1";
  sheet.D1 = { t: "n", f: "HYPERLINK(\"https://example.com\")" };
  XLSX.utils.book_append_sheet(book, sheet, "Terms");
  const result = await parseSpreadsheetDocument(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  const cells = result.sheets[0].cells;
  assert.equal(cells[0].text, "<img src=x onerror=alert(1)>");
  assert.equal(cells[1].text, "Terms link");
  assert.equal(cells[1].l, undefined);
  assert.equal(cells[2].text, "2");
  assert.equal(cells[2].formula, true);
  assert.equal(cells[2].f, undefined);
  assert.ok(!cells.some((cell) => cell.text.includes("HYPERLINK")));
});

test("rejects arbitrary text and HTML disguised as an Excel attachment", async () => {
  for (const content of ["not an Excel file", "<html><table><tr><td>not a workbook</td></tr></table></html>", '{"error":"No file"}']) {
    await assert.rejects(parseSpreadsheetDocument(new TextEncoder().encode(content)), /not a supported Excel workbook/);
  }
});

test("reports original row counts while bounding the preview", async () => {
  const rows = Array.from({ length: SPREADSHEET_PREVIEW_LIMITS.rows + 5 }, (_, row) => [row + 1, `Row ${row + 1}`]);
  const result = await parseSpreadsheetDocument(workbookBytes("xlsx", { Long: rows }));
  assert.equal(result.sheets[0].rows, SPREADSHEET_PREVIEW_LIMITS.rows);
  assert.equal(result.sheets[0].totalRows, rows.length);
  assert.equal(result.sheets[0].truncated, true);
  assert.equal(result.truncated, true);
  assert.ok(result.sheets[0].cells.every((cell) => cell.row < SPREADSHEET_PREVIEW_LIMITS.rows));
});

test("discloses omitted sheets, columns and excessive cell text", async () => {
  const sheets = Object.fromEntries(Array.from({ length: SPREADSHEET_PREVIEW_LIMITS.sheets + 1 }, (_, index) => [`Sheet ${index}`, [["data"]]]));
  sheets["Sheet 0"] = [[...Array.from({ length: SPREADSHEET_PREVIEW_LIMITS.columns + 1 }, () => "value")]];
  sheets["Sheet 1"] = [["x".repeat(SPREADSHEET_PREVIEW_LIMITS.cellCharacters + 1)]];
  const result = await parseSpreadsheetDocument(workbookBytes("xlsx", sheets));
  assert.equal(result.sheets.length, SPREADSHEET_PREVIEW_LIMITS.sheets);
  assert.equal(result.totalSheets, SPREADSHEET_PREVIEW_LIMITS.sheets + 1);
  assert.equal(result.sheets[0].columns, SPREADSHEET_PREVIEW_LIMITS.columns);
  assert.equal(result.sheets[0].totalColumns, SPREADSHEET_PREVIEW_LIMITS.columns + 1);
  assert.equal(result.sheets[1].cells[0].truncated, true);
  assert.equal(result.textTruncated, true);
  assert.equal(result.truncated, true);
});

test("bounds aggregate worksheet dimensions and identifies sheets outside the preview", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, { A1: { t: "s", v: "Terms" }, CV1500: { t: "s", v: "Outside preview" }, "!ref": "A1:CV1500" }, "Wide");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Another worksheet"]]), "Later");
  const result = await parseSpreadsheetDocument(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  assert.ok(result.sheets.reduce((sum, sheet) => sum + sheet.rows * sheet.columns, 0) <= SPREADSHEET_PREVIEW_LIMITS.cells);
  assert.equal(result.sheets[0].totalRows, 1500);
  assert.equal(result.sheets[1].rows, 0);
  assert.equal(result.sheets[1].totalRows, 1);
  assert.equal(result.sheets[1].truncated, true);
  assert.ok(!result.sheets[0].cells.some((cell) => cell.text === "Outside preview"));
});

const evidence = {
  sheets: [
    { name: "Terms", cells: [
      { address: "B3", row: 2, column: 1, text: "The university accepts unlimited liability for every claim." },
      { address: "C3", row: 2, column: 2, text: "The supplier keeps all research results and inventions." },
      { address: "B4", row: 3, column: 1, text: "USD100" },
    ] },
    { name: "Budget", cells: [{ address: "B3", row: 2, column: 1, text: "Payment is due in 30 days after invoice delivery." }] },
  ],
};

test("highlights precise sheet and cell only when the actual cell supports the quote", () => {
  const findings = [
    { id: "risk", sheet: "Terms", cell: "$B$3", quote: "The university accepts unlimited liability for every claim.", severity: "high" },
    { id: "stale", sheet: "Terms", cell: "B3", quote: "Payment is due in 30 days after invoice delivery." },
    { id: "invented", sheet: "Terms", cell: "D100", quote: "Unlimited liability" },
    { id: "coordinate-only", sheet: "Terms", cell: "C3" },
  ];
  assert.deepEqual(locateSpreadsheetFindings(evidence, findings), [{ findingId: "risk", sheet: "Terms", address: "B3", row: 2, column: 1, severity: "high" }]);
});

test("finds distinctive unique quotations without a reported cell location", () => {
  const matches = locateSpreadsheetFindings(evidence, [{ id: "risk", quote: "The supplier keeps all\nresearch results and inventions.", severity: "medium" }]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].address, "C3");
  assert.equal(matches[0].sheet, "Terms");
});

test("does not highlight ambiguous quotations, missing clauses, or short fragments", () => {
  const duplicated = { sheets: [...evidence.sheets, { name: "Copy", cells: [...evidence.sheets[0].cells] }] };
  const quote = evidence.sheets[0].cells[0].text;
  assert.deepEqual(locateSpreadsheetFindings(duplicated, [{ id: "duplicate", quote }]), []);
  assert.deepEqual(locateSpreadsheetFindings(evidence, [
    { id: "missing", missing: true, sheet: "Terms", cell: "B3", quote },
    { id: "short", quote: "unlimited liability" },
    { id: "prefix", sheet: "Terms", cell: "B4", quote: "USD1" },
  ]), []);
});

test("resolves repeated quotes only with an exact sheet and treats stale sheet coordinates conservatively", () => {
  const duplicated = { sheets: [...evidence.sheets, { name: "Copy", cells: [...evidence.sheets[0].cells] }] };
  const quote = evidence.sheets[0].cells[0].text;
  assert.equal(locateSpreadsheetFindings(duplicated, [{ id: "risk", sheet: "Copy", cell: "B3", quote }])[0].sheet, "Copy");
  assert.deepEqual(locateSpreadsheetFindings(evidence, [{ id: "risk", sheet: "Wrong Sheet", cell: "B3", quote }]), []);
});
