import test from "node:test";
import assert from "node:assert/strict";
import { restrictReview } from "../services/reviewVisibility.js";

const draft = { id: "test", aiSummary: "secret", aiReviewResult: { draft_response: "secret" }, previousAiSummary: "secret", previousAiReviewResult: {}, aiReviewJob: { lastError: "secret" }, reviewReferences: ["secret"], riskLevel: "High", documents: [{ id: "doc", aiReviewResult: {draft_response:"secret"}, checklist: ["secret"], aiSuggestions: ["secret"] }], sharedResponse: {text:"Approved response"} };
for (const role of ["Requester", "Department Approver", "Owner", "Admin User"]) {
 test(`${role} cannot receive internal analysis`, () => {
  const visible = restrictReview(draft, {role});
  assert.ok(!JSON.stringify(visible).includes("secret"));
  assert.equal(visible.sharedResponse.text, "Approved response");
  assert.equal(visible.documents[0].id, "doc");
  assert.equal(visible.riskLevel,"Not Classified");
 });
}
for (const role of ["Legal Reviewer", "Legal Manager"]) {
 test(`${role} retains draft review`, () => assert.deepEqual(restrictReview(draft, {role}), draft));
}
test("filtering does not mutate stored analysis", () => { restrictReview(draft,{role:"Requester"}); assert.equal(draft.documents[0].checklist[0],"secret"); });
