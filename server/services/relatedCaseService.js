import { query } from "../db.js";

const MAX_RESULTS = 6;
const ESTABLISHED_STATUSES = new Set(["Approved", "Closed"]);
const GENERIC_TERMS = new Set((
  "the and for with that this from into are was were have has had will shall would should could can "
  + "not all any our their its your please review request document legal university khalifa draft "
  + "agreement contract proposed confirm required final before after regarding against"
).split(" "));

function boundedText(value, limit) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, limit) : "";
}

function searchText(title, description) {
  const terms = `${boundedText(title, 300)} ${boundedText(description, 2000)}`.normalize("NFKC").toLowerCase()
    .match(/[\p{L}\p{N}]{3,64}/gu) || [];
  return [...new Set(terms.filter((term) => !GENERIC_TERMS.has(term) && !/^\d+$/u.test(term)))].slice(0, 24).join(" OR ");
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Internal evidence lookup for the legal engine. Legal managers and reviewers
 * have global request access; callers must keep this out of requester responses.
 * These are prior internal matters, not legal authorities or binding precedent.
 */
export async function findRelatedCases({ requestId, categoryCode, title, description } = {}, queryImpl = query) {
  const currentId = boundedText(requestId, 200);
  const category = boundedText(categoryCode, 64);
  const terms = searchText(title, description);
  if (!currentId || (!category && !terms)) return [];

  const result = await queryImpl(
    `with recent_cases as materialized (
       select lr.id,left(lr.title,300) as title,left(lr.description,2000) as description,
              lr.category_code,lr.status,lr.completed_at,lr.updated_at,
              lr.ai_review_result->>'ai_mode' as ai_mode,
              lr.shared_response->>'id' as shared_publication_id
       from legal_requests lr
       where lr.id<>$1
         and lr.status in ('Approved','Closed')
         and lr.id not like 'DEMO-LA-%'
         and lower(coalesce(lr.ai_review_result->>'ai_mode',''))<>'mock'
         and not exists (
           select 1 from request_documents d
           where d.request_id=lr.id and d.is_current=true
             and lower(coalesce(d.ai_review_result->>'ai_mode',''))='mock'
         )
       order by coalesce(lr.completed_at,lr.updated_at) desc,lr.id
       limit 500
     ), search as (
       select websearch_to_tsquery('english',$3) as terms
     ), ranked as (
       select r.*,(r.category_code=$2) as category_match,
              ts_rank_cd(
                setweight(to_tsvector('english',r.title),'A') ||
                setweight(to_tsvector('english',r.description),'B'),s.terms,32
              ) as text_rank
       from recent_cases r cross join search s
     ), selected as (
       select * from ranked
       where category_match or text_rank>0
       order by category_match desc,text_rank desc,coalesce(completed_at,updated_at) desc,id
       limit 6
     )
     select s.id,s.title,s.category_code,c.name as category_name,s.status,
            s.completed_at,s.updated_at,s.ai_mode,s.category_match,s.text_rank,
            case when nullif(btrim(p.response_text),'') is not null then left(p.response_text,650)
                 else left(s.description,650) end as summary,
            case when nullif(btrim(p.response_text),'') is not null then 'published_response'
                 else 'submitted_description' end as summary_source
     from selected s
     join legal_categories c on c.code=s.category_code
     left join legal_response_publications p on p.request_id=s.id and p.id::text=s.shared_publication_id
     order by s.category_match desc,s.text_rank desc,coalesce(s.completed_at,s.updated_at) desc,s.id`,
    [currentId, category, terms],
  );

  const seen = new Set();
  const cases = [];
  for (const row of result.rows || []) {
    if (!row || typeof row.id !== "string" || row.id === currentId || row.id.startsWith("DEMO-LA-")
      || !ESTABLISHED_STATUSES.has(row.status) || String(row.ai_mode || "").toLowerCase() === "mock" || seen.has(row.id)) continue;
    const sameCategory = Boolean(category && row.category_code === category);
    const rank = Number(row.text_rank);
    const textMatch = Boolean(terms && Number.isFinite(rank) && rank > 0);
    if (!sameCategory && !textMatch) continue;
    const caseTitle = boundedText(row.title, 300);
    if (!caseTitle) continue;
    seen.add(row.id);
    cases.push({
      source_id: row.id,
      title: caseTitle,
      document_type: boundedText(row.category_name, 200) || boundedText(row.category_code, 64),
      summary: boundedText(row.summary, 650),
      summary_source: row.summary_source === "published_response" ? "published_response" : "submitted_description",
      category_code: boundedText(row.category_code, 64),
      status: row.status,
      completed_at: isoDate(row.completed_at),
      last_updated_at: isoDate(row.updated_at),
      // A retrieval score describes category/text overlap, not legal equivalence.
      similarity_score: Math.round(((sameCategory ? 0.35 : 0) + (textMatch ? Math.min(0.6, rank) : 0)) * 100) / 100,
      match_basis: sameCategory ? (textMatch ? "same_category_and_text" : "same_category") : "matching_text",
    });
    if (cases.length === MAX_RESULTS) break;
  }
  return cases;
}
