import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DOTENV_CONFIG_PATH = path.join(os.tmpdir(), "related-cases-test-nonexistent.env");
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/related_cases_tests";
const { findRelatedCases } = await import("../services/relatedCaseService.js");

const input = {
  requestId: "LA-2026-0010", categoryCode: "LEG-B",
  title: "Software licensing renewal", description: "Check licence fees and data hosting provisions.",
};

function storedCase(overrides = {}) {
  return {
    id: "LA-2025-0012", title: "Software licensing agreement", category_code: "LEG-B", category_name: "Contracts and Agreements",
    status: "Approved", ai_mode: "gemini", completed_at: new Date("2025-08-02T08:00:00Z"), updated_at: new Date("2025-08-02T09:00:00Z"),
    category_match: true, text_rank: 0.15,
    summary: "Confirm licence scope and hosting location before signature.", summary_source: "published_response",
    ...overrides,
  };
}

test("retrieves only bounded, established real matters with verified human publication evidence", async () => {
  let calls = 0;
  const cases = await findRelatedCases(input, async (sql, values) => {
    calls += 1;
    assert.match(sql, /lr\.id<>\$1/);
    assert.match(sql, /lr\.status in \('Approved','Closed'\)/);
    assert.match(sql, /lr\.id not like 'DEMO-LA-%'/);
    assert.match(sql, /ai_review_result->>'ai_mode'.*<>'mock'/);
    assert.match(sql, /not exists[\s\S]*request_documents[\s\S]*is_current=true[\s\S]*='mock'/);
    assert.match(sql, /limit 500/);
    assert.match(sql, /limit 6/);
    assert.match(sql, /websearch_to_tsquery\('english',\$3\)/);
    assert.match(sql, /p\.request_id=s\.id and p\.id::text=s\.shared_publication_id/);
    assert.doesNotMatch(sql, /select lr\.\*|reviewer_comments|draft_response|party_name|requester_id|storage_path/);
    assert.deepEqual(values.slice(0, 2), [input.requestId, input.categoryCode]);
    assert.match(values[2], /software OR licensing OR renewal/);
    return { rows: [storedCase()] };
  });
  assert.equal(calls, 1);
  assert.deepEqual(cases, [{
    source_id: "LA-2025-0012", title: "Software licensing agreement", document_type: "Contracts and Agreements",
    summary: "Confirm licence scope and hosting location before signature.", summary_source: "published_response",
    category_code: "LEG-B", status: "Approved", completed_at: "2025-08-02T08:00:00.000Z", last_updated_at: "2025-08-02T09:00:00.000Z",
    similarity_score: 0.5, match_basis: "same_category_and_text",
  }]);
});

test("current, demo, mock, unresolved, duplicate, and unrelated records never become references", async () => {
  const cases = await findRelatedCases(input, async () => ({ rows: [
    storedCase({ id: input.requestId }),
    storedCase({ id: "DEMO-LA-008" }),
    storedCase({ id: "mock", ai_mode: "MOCK" }),
    storedCase({ id: "draft", status: "Under Review" }),
    storedCase({ id: "unrelated", category_code: "LEG-F", category_match: false, text_rank: 0 }),
    storedCase(), storedCase(),
  ] }));
  assert.deepEqual(cases.map((entry) => entry.source_id), ["LA-2025-0012"]);
});

test("allows manually closed real records without asserting an approved outcome or invented completion date", async () => {
  const cases = await findRelatedCases(input, async () => ({ rows: [storedCase({
    status: "Closed", ai_mode: null, completed_at: null, summary_source: "submitted_description", text_rank: 0,
    summary: "Submitted request concerning software fees.",
  })] }));
  assert.equal(cases[0].status, "Closed");
  assert.equal(cases[0].completed_at, null);
  assert.equal(cases[0].last_updated_at, "2025-08-02T09:00:00.000Z");
  assert.equal(cases[0].summary_source, "submitted_description");
  assert.equal(cases[0].match_basis, "same_category");
});

test("cross-category evidence requires actual text overlap and labels the retrieval basis", async () => {
  const cases = await findRelatedCases(input, async () => ({ rows: [storedCase({
    category_code: "LEG-A", category_name: "Legal Advice", text_rank: 0.2, category_match: false,
  })] }));
  assert.equal(cases.length, 1);
  assert.equal(cases[0].match_basis, "matching_text");
  assert.equal(cases[0].similarity_score, 0.2);
});

test("keeps user-supplied identifiers and search operators out of SQL text", async () => {
  const requestId = "'; DROP TABLE legal_requests; --";
  const categoryCode = "LEG-B' OR TRUE --";
  await findRelatedCases({ requestId, categoryCode, title: 'license "); DROP TABLE users -- %_ <->', description: "hosting & !!" }, async (sql, values) => {
    assert.equal(values[0], requestId);
    assert.equal(values[1], categoryCode);
    assert.doesNotMatch(sql, /DROP TABLE|OR TRUE/);
    assert.match(values[2], /^[\p{L}\p{N}]+(?: OR [\p{L}\p{N}]+)*$/u);
    assert.doesNotMatch(values[2], /[%_<>!&";]/);
    return { rows: [] };
  });
});

test("returns at most six minimal bounded records and never copies private extra fields", async () => {
  const cases = await findRelatedCases({ ...input, description: "hosting ".repeat(5000) }, async (_sql, values) => {
    assert.ok(values[2].split(" OR ").length <= 24);
    return { rows: Array.from({ length: 12 }, (_, index) => storedCase({
      id: `case-${index}`, title: "T".repeat(1000), summary: "S".repeat(10000),
      requester_email: "private@example.org", ai_summary: "Private analysis", draft_response: "Unapproved draft",
    })) };
  });
  assert.equal(cases.length, 6);
  for (const entry of cases) {
    assert.equal(entry.title.length, 300);
    assert.equal(entry.summary.length, 650);
    assert.equal(entry.requester_email, undefined);
    assert.equal(entry.ai_summary, undefined);
    assert.equal(entry.draft_response, undefined);
  }
});

test("does not search without a current request and usable category or subject evidence", async () => {
  let called = false;
  const queryImpl = async () => { called = true; return { rows: [] }; };
  assert.deepEqual(await findRelatedCases({}, queryImpl), []);
  assert.deepEqual(await findRelatedCases({ requestId: input.requestId, title: "Please review the legal document" }, queryImpl), []);
  assert.equal(called, false);
});

test("an empty history remains empty and database failures are not replaced with invented cases", async () => {
  assert.deepEqual(await findRelatedCases(input, async () => ({ rows: [] })), []);
  await assert.rejects(findRelatedCases(input, async () => { throw new Error("Test database unavailable"); }), /Test database unavailable/);
});
