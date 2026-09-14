import assert from "node:assert/strict";
import test from "node:test";
import {
  getDocumentReviewFindings,
  matchPdfTextHighlights,
  parseDocumentPage,
} from "../src/utils/documentReviewFindings.js";

const quote = "The university shall indemnify all claims without limit.";
const risk = {
  term: "Unlimited indemnity",
  reason: "This obligation has no financial cap.",
  risk_level: "high",
  clause_text: quote,
  page: "Page 2",
};

function finding(overrides = {}) {
  return { id: "doc:risk:0", kind: "risk", severity: "high", quote, page: 2, missing: false, ...overrides };
}

test("accepts positive integer pages and rejects ambiguous or malformed locations", () => {
  for (const [value, expected] of [[1, 1], [12, 12], [" 3 ", 3], ["Page 2", 2], ["PAGE 04", 4]]) {
    assert.equal(parseDocumentPage(value), expected);
  }
  for (const value of [null, undefined, false, {}, [], 0, -1, 1.5, Infinity, NaN, "", "N/A", "0", "-2", "2.5", "Page 2-3", "2-3", "2,3", "2 of 4", "p. 2", "1e2", "Sheet1!A1", "9007199254740992"]) {
    assert.equal(parseDocumentPage(value), null, String(value));
  }
});

test("normalizes the selected attachment's risks and removes equivalent generated suggestions", () => {
  const findings = getDocumentReviewFindings({
    id: "selected",
    aiReviewResult: { risk_highlights: [risk] },
    aiSuggestions: [
      { type: "Risk: high", page: 2, text: `${risk.term}: ${risk.reason}` },
      { type: "Risk", page: 2, text: `AI draft: ${risk.term.toUpperCase()} — ${risk.reason}` },
      { type: "Finance check", page: "N/A", text: "Confirm the approved budget with Finance." },
    ],
  });
  assert.equal(findings.length, 2);
  assert.deepEqual(findings[0], {
    id: "selected:risk:0", kind: "risk", severity: "high", title: risk.term,
    description: risk.reason, quote, page: 2, missing: false, sheet: null, cell: null,
  });
  assert.equal(findings[1].kind, "suggestion");
  assert.equal(findings[1].page, null);
  assert.equal(findings[1].quote, "");
});

test("never imports request-level findings or another attachment's review", () => {
  const first = { id: "first", aiReviewResult: { risk_highlights: [risk] } };
  const second = { id: "second", checklist: [], request: { aiReviewResult: first.aiReviewResult, documents: [first] } };
  assert.equal(getDocumentReviewFindings(first).length, 1);
  assert.deepEqual(getDocumentReviewFindings(second), []);
  assert.deepEqual(getDocumentReviewFindings(null), []);
  assert.deepEqual(getDocumentReviewFindings({ aiReviewResult: { risk_highlights: "invalid" }, aiSuggestions: [null, "invalid", {}] }), []);
});

test("retains missing clauses and uncertainty without inventing pages, severity, or quotes", () => {
  const findings = getDocumentReviewFindings({
    id: "clauses",
    aiReviewResult: { missing_or_unusual_clauses: [
      { clause_title: "Insurance", issue_type: "missing", explanation: "No insurance clause was located.", page: "N/A", clause_text: quote },
      { clause_title: "Termination", issue_type: "unusual", explanation: "Confirm notice period.", page: "2-3", risk_level: "MEDIUM" },
    ] },
    aiSuggestions: [{ type: "Risk: low", text: "Check contact details before signature.", page: 3 }],
  });
  assert.equal(findings[0].missing, true);
  assert.equal(findings[0].page, null);
  assert.equal(findings[0].severity, "info");
  assert.equal(findings[1].missing, false);
  assert.equal(findings[1].page, null);
  assert.equal(findings[1].severity, "medium");
  assert.equal(findings[2].severity, "low");
  assert.deepEqual(matchPdfTextHighlights({ items: [{ str: quote }] }, [findings[0]], 1), []);
});

test("preserves explicit Excel sheet and cell coordinates, rejecting ambiguous coordinates", () => {
  const findings = getDocumentReviewFindings({ id: "workbook", aiReviewResult: { risk_highlights: [
    { ...risk, page: "N/A", sheet: "Budget", cell: "$c$12" },
    { ...risk, cell_reference: "'Manager''s budget'!B4" },
    { ...risk, sheet: "Budget", cell_reference: "Other!A1" },
    { ...risk, cell: "A1:B3" },
  ] } });
  assert.deepEqual(findings.map(({ sheet, cell }) => ({ sheet, cell })), [
    { sheet: "Budget", cell: "C12" },
    { sheet: "Manager's budget", cell: "B4" },
    { sheet: "Budget", cell: null },
    { sheet: null, cell: null },
  ]);
});

test("finds a quoted clause across both split words and separately positioned PDF runs", () => {
  const items = [
    { str: "Introduction. The univer" },
    { str: "sity shall" },
    { str: "indemnify all", hasEOL: true },
    { str: "claims without limit. Other terms follow." },
  ];
  const ranges = matchPdfTextHighlights({ items }, [finding()], 2);
  assert.deepEqual(ranges, [
    { findingId: "doc:risk:0", itemIndex: 0, start: 14, end: 24, severity: "high" },
    { findingId: "doc:risk:0", itemIndex: 1, start: 0, end: 10, severity: "high" },
    { findingId: "doc:risk:0", itemIndex: 2, start: 0, end: 13, severity: "high" },
    { findingId: "doc:risk:0", itemIndex: 3, start: 0, end: 21, severity: "high" },
  ]);
  assert.equal(items[0].str.slice(ranges[0].start, ranges[0].end), "The univer");
});

test("normalizes case, whitespace, and ligatures while retaining original character offsets", () => {
  const source = "Before: ALL   ﬁnancial claims\tremain unlimited. Afterwards.";
  const expected = "ALL   ﬁnancial claims\tremain unlimited.";
  const ranges = matchPdfTextHighlights({ items: [{ str: source }] }, [finding({ quote: '“All financial claims remain unlimited.”' })], 2);
  assert.equal(ranges.length, 1);
  assert.equal(source.slice(ranges[0].start, ranges[0].end), expected);
});

test("does not paint risk labels, short phrases, missing clauses, or absent quotes", () => {
  const text = { items: [{ str: `${quote} Unlimited indemnity.` }] };
  for (const overrides of [
    { quote: "", title: quote, description: quote },
    { quote: undefined, title: "Unlimited indemnity" },
    { quote: "Unlimited indemnity" },
    { missing: true },
    { quote: "Either party may terminate on thirty days notice." },
  ]) {
    assert.deepEqual(matchPdfTextHighlights(text, [finding(overrides)], 2), []);
  }
});

test("respects known pages but can locate a verbatim quote when its page is unknown", () => {
  const text = { items: [{ str: quote }] };
  assert.deepEqual(matchPdfTextHighlights(text, [finding()], 1), []);
  assert.equal(matchPdfTextHighlights(text, [finding({ page: null })], 1).length, 1);
  assert.deepEqual(matchPdfTextHighlights(text, [finding()], "N/A"), []);
});

test("matches only whole words and preserves separate repeated occurrences", () => {
  const clause = "Any payment shall remain refundable";
  assert.deepEqual(matchPdfTextHighlights({ items: [{ str: `${clause}XYZ` }] }, [finding({ quote: clause })], 2), []);
  assert.deepEqual(matchPdfTextHighlights({ items: [{ str: `XXX${clause}` }] }, [finding({ quote: clause })], 2), []);
  const text = `${clause}. ${clause}.`;
  const matches = matchPdfTextHighlights({ items: [{ str: text }] }, [finding({ quote: clause })], 2);
  assert.equal(matches.length, 2);
  assert.ok(matches[0].end < matches[1].start);
  assert.deepEqual(matches.map(({ start, end }) => text.slice(start, end)), [clause, clause]);
});

test("handles empty and non-text PDF content without manufacturing a region", () => {
  for (const content of [null, {}, { items: [] }, { items: [{ type: "beginMarkedContent" }, { str: "" }] }]) {
    assert.deepEqual(matchPdfTextHighlights(content, [finding()], 2), []);
  }
});
