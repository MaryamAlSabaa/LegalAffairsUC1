alter table legal_requests add column if not exists review_references jsonb not null default '[]'::jsonb;
alter table legal_requests add column if not exists shared_response jsonb;
create table if not exists legal_response_publications (
 id uuid primary key default gen_random_uuid(),
 request_id text not null references legal_requests(id) on delete cascade,
 response_text text not null,
 published_by uuid not null references users(id),
 published_at timestamptz not null default now()
);

alter table request_documents add column if not exists ai_review_result jsonb;
