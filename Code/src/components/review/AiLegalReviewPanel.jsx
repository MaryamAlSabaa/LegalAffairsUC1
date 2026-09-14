import { useState } from "react";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "risks", label: "Risks" },
  { id: "clauses", label: "Clauses" },
  { id: "checklist", label: "Checklist suggestions" },
  { id: "templates", label: "Template comparison" },
  { id: "questions", label: "Questions" },
  { id: "precedents", label: "Similar past cases" },
];

function getRiskBadgeClass(riskLevel) {
  const level = String(riskLevel || "").toLowerCase();
  if (level === "high") return "bg-red-100 text-red-700";
  if (level === "medium") return "bg-yellow-100 text-yellow-700";
  if (level === "low") return "bg-green-100 text-green-700";
  return "bg-slate-100 text-slate-700";
}

function getIssueBadgeClass(issueType) {
  if (String(issueType || "").toLowerCase() === "missing") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

function records(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function percentage(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : null;
}

function AiLegalReviewPanel({ review }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!review) {
    return (
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
        <h3 className="font-bold text-yellow-950">Pending AI Review</h3>
        <p className="mt-2 text-sm text-yellow-900">
          This request has not received an AI legal review response yet. The
          checklist remains available for human review while the AI result is
          pending.
        </p>
      </div>
    );
  }

  const isGemini = review.ai_mode === "gemini";
  const basis = review.review_basis || {};
  const comparisons = records(review.template_comparisons);
  const precedents = records(review.related_precedents);
  const checklistSuggestions = records(review.suggested_checklist_items).filter((item) => typeof item.criteria === "string" && item.criteria.trim());
  const sourceCount = (value, fallback) => Number.isInteger(value) && value >= 0 ? value : fallback;
  const templateCount = sourceCount(basis.template_count, records(review.reference_sources).length || comparisons.length);
  const pastCaseCount = sourceCount(basis.past_case_count, precedents.length);
  const hasTemplates = basis.template_comparison_status === "available" || templateCount > 0;
  const hasPastCases = basis.past_case_status === "available" || pastCaseCount > 0;
  const confidence = percentage(review.category_confidence);
  const highRiskCount = records(review.risk_highlights).filter(
    (risk) => String(risk.risk_level || "").toLowerCase() === "high",
  ).length;
  const missingClauseCount = records(review.missing_or_unusual_clauses).filter(
    (clause) => String(clause.issue_type || "").toLowerCase() === "missing",
  ).length;

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-bold text-blue-950">AI Legal Review Engine</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Draft only - human Legal Affairs review required
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-700">
          {isGemini ? "Gemini AI" : "Mock preview - no AI analysis"}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-blue-200 bg-white/80 p-4 text-sm text-slate-700">
        <h4 className="font-bold text-slate-900">Review basis</h4>
        <p className="mt-1">{isGemini
          ? "The attached document is reviewed using Gemini's general legal knowledge. Approved templates and past case records add comparisons when available."
          : "This is a local preview. Run a Gemini review to analyze the document and generate draft findings."}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Baseline</dt><dd className="mt-1 font-semibold">{isGemini ? "Gemini general knowledge" : "No AI analysis performed"}</dd></div>
          <div><dt className="text-xs text-slate-500">Approved templates</dt><dd className="mt-1 font-semibold">{hasTemplates ? templateCount ? `${templateCount} supplied` : "Available" : "Not provided · optional"}</dd></div>
          <div><dt className="text-xs text-slate-500">Past case sources</dt><dd className="mt-1 font-semibold">{hasPastCases ? pastCaseCount ? `${pastCaseCount} available` : "Available" : "Not available"}</dd></div>
        </dl>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">Category</p>
          <p className="mt-1 font-bold text-slate-900">
            {review.request_category || "Not classified"}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">Confidence</p>
          <p className="mt-1 font-bold text-slate-900">
            {confidence || "Not supplied"}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">High Risks</p>
          <p className="mt-1 font-bold text-slate-900">{highRiskCount}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">Missing Clauses</p>
          <p className="mt-1 font-bold text-slate-900">{missingClauseCount}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">Clauses Found</p>
          <p className="mt-1 font-bold text-slate-900">
            {(review.extracted_clauses || []).length}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
              activeTab === tab.id
                ? "bg-blue-700 text-white"
                : "bg-white text-blue-700 hover:bg-blue-100"
            }`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-slate-700">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div><h4 className="font-bold">Document summary</h4><p className="whitespace-pre-wrap">{review.document_summary || "No document summary available."}</p></div>
            <div><h4 className="font-bold">Classification rationale</h4><p>{review.classification_reason || "No AI classification available."}</p></div>
            <div>
              <h4 className="font-bold text-slate-900">University Obligations</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {(review.obligations_summary || []).map((obligation, index) => (
                  <li key={`${obligation}-${index}`}>{obligation}</li>
                ))}
              </ul>
              {!review.obligations_summary?.length && <p className="mt-2 text-slate-500">No obligations summary was supplied in this result.</p>}
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Draft Review Note</h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-700">
                {review.draft_review_note || "No draft review note was supplied in this result."}
              </pre>
            </div>
            {review.draft_response && <div>
              <h4 className="font-bold text-slate-900">Draft response</h4>
              <p className="mt-2 whitespace-pre-wrap">{review.draft_response}</p>
              <p className="mt-2 text-xs text-slate-500">Use Prepare response to edit and confirm the text before sharing it with the requester.</p>
            </div>}
          </div>
        )}

        {activeTab === "risks" && (
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-slate-900">Risk Highlights</h4>
              <div className="mt-2 space-y-3">
                {(review.risk_highlights || []).map((risk, index) => (
                  <div key={`${risk.term}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${getRiskBadgeClass(
                        risk.risk_level,
                      )}`}
                    >
                      {risk.risk_level?.toUpperCase()}
                    </span>
                    <p className="mt-2 font-bold text-slate-900">{risk.term}</p>
                    <p className="mt-1">{risk.reason}</p>
                    {risk.clause_text && (
                      <p className="mt-2 italic text-slate-500">“{risk.clause_text}”</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Missing / Unusual Clauses</h4>
              <div className="mt-2 space-y-3">
                {(review.missing_or_unusual_clauses || []).map((clause, index) => (
                  <div key={`${clause.clause_title}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${getIssueBadgeClass(
                        clause.issue_type,
                      )}`}
                    >
                      {clause.issue_type?.toUpperCase()}
                    </span>
                    <p className="mt-2 font-bold text-slate-900">{clause.clause_title}</p>
                    <p className="mt-1">{clause.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "clauses" && (
          <div className="space-y-3">
            {(review.extracted_clauses || []).map((clause, index) => (
              <div key={`${clause.clause_title}-${index}`} className="rounded-xl border border-slate-200 p-3">
                <p className="font-bold text-slate-900">
                  {clause.clause_title}
                  {clause.location_hint ? ` — ${clause.location_hint}` : ""}
                </p>
                <p className="mt-1 italic text-slate-600">{clause.clause_text}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-slate-900">Suggested checklist additions</h4>
              <p className="mt-1 text-slate-500">Consider these document-specific checks during Legal Affairs review. They are suggestions and have not been added to the tracked review checklist.</p>
            </div>
            {checklistSuggestions.map((item, index) => <article key={`${item.criteria}-${index}`} className="rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-slate-900">{item.criteria}</p>
              <p className="mt-1">{typeof item.reason === "string" && item.reason.trim() ? item.reason : "Assess whether this check is relevant to the document."}</p>
            </article>)}
            {checklistSuggestions.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-slate-600">{!isGemini
              ? "Run a Gemini review to generate suggested checklist additions."
              : Array.isArray(review.suggested_checklist_items) ? "No additional checklist items were suggested in this result. Existing checklist results remain available in the document review."
                : "This saved review does not include checklist suggestions. Run a new review to request them."}</p>}
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-4">
            <div><h4 className="font-bold text-slate-900">Approved template comparisons</h4><p className="mt-1 text-slate-500">Comparisons use the approved reference templates supplied for this review.</p></div>
            {comparisons.length === 0 && <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">{hasTemplates ? "No template comparison recorded" : "No approved templates supplied"}</p>
              <p className="mt-1">{hasTemplates
                ? "Approved templates were available, but this result contains no recorded comparison. Run a new review to include their clause comparisons."
                : "Template comparison is optional. Add an approved reference in Review setup when you want to compare its clauses with the document."}</p>
              {!hasTemplates && isGemini && <p className="mt-2 text-slate-500">The document review used Gemini's general knowledge without a template comparison.</p>}
            </div>}
            {comparisons.map((template, index) => (
              <div key={`${template.template_name}-${index}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-900">{template.template_name}</p>
                  {percentage(template.match_score) && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                    {percentage(template.match_score)} match
                  </span>}
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {(template.deviations || []).map((deviation, deviationIndex) => (
                    <li key={`${deviation}-${deviationIndex}`}>{deviation}</li>
                  ))}
                </ul>
                {!template.deviations?.length && <p className="mt-2 text-slate-500">No specific deviations were recorded in this comparison.</p>}
              </div>
            ))}
          </div>
        )}

        {activeTab === "questions" && (
          <ol className="list-decimal space-y-2 pl-5">
            {(review.suggested_questions || []).map((question, index) => (
              <li key={`${question}-${index}`}>{question}</li>
            ))}
          </ol>
        )}

        {activeTab === "precedents" && (
          <div className="space-y-3">
            <div><h4 className="font-bold text-slate-900">Similar past cases</h4><p className="mt-1 text-slate-500">These comparisons refer to case records made available to this review.</p></div>
            {precedents.length === 0 && <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">{hasPastCases ? "No similar past case identified" : "No past case sources available"}</p>
              <p className="mt-1">{hasPastCases
                ? "The supplied case records did not produce a recorded similar-case comparison in this result."
                : "No past case comparison is included in this result. A Gemini general knowledge review can proceed without past case sources."}</p>
            </div>}
            {precedents.map((precedent, index) => (
              <div key={`${precedent.source_id}-${index}`} className="rounded-xl border border-slate-200 p-3">
                <p className="font-bold text-slate-900">{precedent.title}</p>
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  {[precedent.source_id, precedent.document_type, percentage(precedent.similarity_score) ? `${percentage(precedent.similarity_score)} similar` : null].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2">{precedent.summary}</p>
                {precedent.matching_reason && <p className="mt-2"><span className="font-semibold">Why this case is relevant: </span>{precedent.matching_reason}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-white/80 p-3 text-sm text-blue-900">
        ⚠️ {review.disclaimer}
      </div>
    </div>
  );
}

export default AiLegalReviewPanel;

/*
BEGINNER DOCUMENTATION:

1. What does this component display?
It turns the backend AI JSON into readable dashboard sections: risks, clauses, templates, questions, and precedents.

2. Why use tabs?
The AI result has many parts. Tabs keep the page organized without hiding the data in separate pages.

3. Why repeat the disclaimer?
AI helps Legal Affairs, but it must not replace human legal judgment or final approval.
*/
