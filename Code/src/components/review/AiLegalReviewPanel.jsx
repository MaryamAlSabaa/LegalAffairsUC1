import { useState } from "react";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "risks", label: "Risks" },
  { id: "clauses", label: "Clauses" },
  { id: "templates", label: "Template Match" },
  { id: "questions", label: "Questions" },
  { id: "precedents", label: "Precedents" },
];

function getRiskBadgeClass(riskLevel) {
  if (riskLevel === "high") return "bg-red-100 text-red-700";
  if (riskLevel === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

function getIssueBadgeClass(issueType) {
  if (issueType === "missing") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
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

  const highRiskCount = (review.risk_highlights || []).filter(
    (risk) => risk.risk_level === "high",
  ).length;
  const missingClauseCount = (review.missing_or_unusual_clauses || []).filter(
    (clause) => clause.issue_type === "missing",
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
          {review.ai_mode === "gemini" ? "Gemini AI" : "Mock preview - no AI analysis"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">Category</p>
          <p className="mt-1 font-bold text-slate-900">
            {review.request_category}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-3">
          <p className="text-slate-500">Confidence</p>
          <p className="mt-1 font-bold text-slate-900">
            {Math.round((review.category_confidence || 0) * 100)}%
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
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Draft Review Note</h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-700">
                {review.draft_review_note}
              </pre>
            </div>
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

        {activeTab === "templates" && (
          <div className="space-y-4">
            {(review.template_comparisons || []).map((template, index) => (
              <div key={`${template.template_name}-${index}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-900">{template.template_name}</p>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                    {Math.round((template.match_score || 0) * 100)}% match
                  </span>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {(template.deviations || []).map((deviation, deviationIndex) => (
                    <li key={`${deviation}-${deviationIndex}`}>{deviation}</li>
                  ))}
                </ul>
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
            {(review.related_precedents || []).map((precedent, index) => (
              <div key={`${precedent.source_id}-${index}`} className="rounded-xl border border-slate-200 p-3">
                <p className="font-bold text-slate-900">{precedent.title}</p>
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  {precedent.source_id} • {Math.round((precedent.similarity_score || 0) * 100)}% similar
                </p>
                <p className="mt-2">{precedent.summary}</p>
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
