create extension if not exists pgcrypto;

create table if not exists roles (
  id text primary key,
  name text not null unique
);

create table if not exists departments (
  id text primary key,
  name text not null unique
);

create table if not exists legal_categories (
  code text primary key,
  name text not null unique
);

create table if not exists request_statuses (
  name text primary key,
  sort_order integer not null unique
);

create table if not exists legal_review_criteria (
  id bigserial primary key,
  criteria text not null unique,
  sort_order integer not null unique
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  full_name text not null,
  email text not null,
  password_hash text not null,
  prefix text not null default 'None',
  role_id text not null references roles(id),
  department_id text not null references departments(id),
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Suspended')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_username_lower_key on users (lower(username));
create unique index if not exists users_email_lower_key on users (lower(email));

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists sessions_expires_at_idx on sessions(expires_at);

create table if not exists password_reset_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create sequence if not exists legal_request_number_seq start 1;

create table if not exists legal_requests (
  id text primary key,
  title text not null,
  description text not null default '',
  party_name text not null default 'Not recorded',
  end_user_name text not null default 'Not recorded',
  requester_id uuid not null references users(id),
  department_id text not null references departments(id),
  category_code text not null references legal_categories(code),
  assigned_reviewer_id uuid references users(id),
  assigned_manager_id uuid references users(id),
  assigned_department_approver_id uuid references users(id),
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  risk_level text not null default 'Not Classified',
  status text not null references request_statuses(name),
  deadline date,
  submitted_at timestamptz not null default now(),
  ai_summary text,
  ai_review_result jsonb,
  previous_document_id uuid,
  previous_ai_summary text,
  previous_ai_review_result jsonb,
  manager_decision text default 'Pending Legal Manager Review',
  department_decision text default 'Pending Department Review',
  legal_department_status text not null default 'O' check (legal_department_status in ('C', 'O')),
  end_user_status text not null default 'O' check (end_user_status in ('C', 'O')),
  completed_at timestamptz,
  anasign_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table legal_requests add column if not exists party_name text not null default 'Not recorded';
alter table legal_requests add column if not exists end_user_name text not null default 'Not recorded';
alter table legal_requests add column if not exists legal_department_status text not null default 'O';
alter table legal_requests add column if not exists end_user_status text not null default 'O';
alter table legal_requests add column if not exists completed_at timestamptz;
alter table legal_requests add column if not exists anasign_signature text;
update legal_requests
set legal_department_status='C', end_user_status='C'
where status in ('Approved', 'Closed', 'Archived');
create index if not exists legal_requests_requester_idx on legal_requests(requester_id);
create index if not exists legal_requests_reviewer_idx on legal_requests(assigned_reviewer_id);
create index if not exists legal_requests_status_idx on legal_requests(status);

-- Reviewer assignment is many-to-many. The legacy assigned_reviewer_id column
-- remains during the transition so older installations can be upgraded without
-- losing their current assignment.
create table if not exists request_reviewer_assignments (
  request_id text not null references legal_requests(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  assigned_by uuid references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (request_id, reviewer_id)
);
create index if not exists request_reviewer_assignments_reviewer_idx
  on request_reviewer_assignments(reviewer_id, assigned_at desc);

insert into request_reviewer_assignments (request_id, reviewer_id, assigned_by)
select id, assigned_reviewer_id, assigned_manager_id
from legal_requests
where assigned_reviewer_id is not null
on conflict (request_id, reviewer_id) do nothing;

create table if not exists request_documents (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references legal_requests(id) on delete cascade,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  storage_path text not null,
  size_bytes bigint not null default 0,
  sha256 text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
alter table legal_requests drop constraint if exists legal_requests_previous_document_id_fkey;
alter table legal_requests add constraint legal_requests_previous_document_id_fkey foreign key (previous_document_id) references request_documents(id) on delete set null;
create index if not exists request_documents_request_idx on request_documents(request_id);

create table if not exists request_checklist_items (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references legal_requests(id) on delete cascade,
  document_id uuid not null references request_documents(id) on delete cascade,
  criteria_id bigint not null references legal_review_criteria(id),
  page text not null default 'N/A',
  checked boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, document_id, criteria_id)
);

create table if not exists document_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references request_documents(id) on delete cascade,
  page text not null default 'N/A',
  suggestion_type text not null,
  suggestion_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists reviewer_comments (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references legal_requests(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  comment_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists department_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references legal_requests(id) on delete cascade,
  approver_id uuid not null references users(id),
  decision text not null,
  comment_text text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists manager_actions (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references legal_requests(id) on delete cascade,
  manager_id uuid not null references users(id),
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  request_id text,
  action text not null,
  actor_id uuid references users(id) on delete set null,
  actor_name text not null,
  ip_address text,
  created_at timestamptz not null default now()
);
-- Older local drafts briefly linked audit entries to requests. Keeping the ID
-- as text lets account and system events be audited even without a request.
alter table audit_logs drop constraint if exists audit_logs_request_id_fkey;
create index if not exists audit_logs_created_idx on audit_logs(created_at desc);

create table if not exists notifications (
  id bigserial primary key,
  recipient_id uuid not null references users(id) on delete cascade,
  request_id text references legal_requests(id) on delete cascade,
  notification_type text not null default 'request_activity',
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx on notifications(recipient_id,created_at desc);
create index if not exists notifications_recipient_unread_idx on notifications(recipient_id,is_read) where is_read=false;

create table if not exists ai_review_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references legal_requests(id) on delete cascade,
  document_id uuid not null references request_documents(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  queue_order bigint not null,
  attempt_count integer not null default 0,
  last_error text,
  current_step text not null default 'Queued for AI review',
  operational_trace jsonb not null default '[]'::jsonb,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id, document_id)
);
create index if not exists ai_review_jobs_queue_idx on ai_review_jobs(status, queue_order, created_at);

create table if not exists ai_engine_control (
  id text primary key check (id = 'legal_affair_engine'),
  is_running boolean not null default true,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists ai_engine_events (
  id bigserial primary key,
  event_type text not null,
  level text not null default 'info',
  message text not null,
  request_id text references legal_requests(id) on delete set null,
  job_id uuid references ai_review_jobs(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_engine_events_created_idx on ai_engine_events(created_at desc);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on users;
create trigger users_touch_updated_at before update on users for each row execute function touch_updated_at();
drop trigger if exists legal_requests_touch_updated_at on legal_requests;
create trigger legal_requests_touch_updated_at before update on legal_requests for each row execute function touch_updated_at();
drop trigger if exists checklist_touch_updated_at on request_checklist_items;
create trigger checklist_touch_updated_at before update on request_checklist_items for each row execute function touch_updated_at();
drop trigger if exists ai_jobs_touch_updated_at on ai_review_jobs;
create trigger ai_jobs_touch_updated_at before update on ai_review_jobs for each row execute function touch_updated_at();

insert into roles (id, name) values
  ('requester', 'Requester'), ('legal_reviewer', 'Legal Reviewer'),
  ('legal_manager', 'Legal Manager'), ('department_approver', 'Department Approver'),
  ('admin_user', 'Admin User'), ('owner', 'Owner')
on conflict (id) do update set name = excluded.name;

insert into departments (id, name) values
  ('hr', 'HR'), ('procurement', 'Procurement'), ('research_office', 'Research Office'),
  ('student_affairs', 'Student Affairs'), ('finance', 'Finance'),
  ('legal_affairs', 'Legal Affairs'), ('academic_affairs', 'Academic Affairs'), ('it', 'IT')
on conflict (id) do update set name = excluded.name;

insert into legal_categories (code, name) values
  ('LEG-A', 'Legal Advice / Opinion'), ('LEG-B', 'Contract Review'),
  ('LEG-C', 'Research Agreements'), ('LEG-D', 'Student Agreements'),
  ('LEG-E', 'Committee / Investigation / Disciplinary Matters'),
  ('LEG-F', 'Administrative Legal Work'), ('LEG-G', 'Legal Operations / Reporting')
on conflict (code) do update set name = excluded.name;

insert into request_statuses (name, sort_order) values
  ('New', 1), ('Under Review', 2), ('Waiting for More Information', 3),
  ('Assigned to Legal Reviewer', 4), ('Draft Response Prepared', 5),
  ('Sent for Internal Approval', 6), ('Returned for Revision', 7),
  ('Approved', 8), ('Closed', 9), ('Archived', 10),
  ('AI Review Pending', 11), ('AI Review Processing', 12),
  ('AI Review Complete', 13), ('AI Review Failed', 14)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into legal_review_criteria (criteria, sort_order) values
  ('Document type identified', 1), ('Parties correctly identified', 2),
  ('Request category matches the document', 3), ('Request description matches the attached document', 4),
  ('Effective date identified', 5), ('Expiry date or end date identified', 6),
  ('Scope clearly defined', 7), ('Key obligations summarized', 8),
  ('Payment terms included, if relevant', 9), ('Funding terms included, if relevant', 10),
  ('Term and termination clauses included', 11), ('Confidentiality clause included', 12),
  ('Data protection clause included, if relevant', 13), ('Intellectual property clause included, if relevant', 14),
  ('Publication rights reviewed, if relevant', 15), ('Liability and indemnity reviewed', 16),
  ('Insurance requirements reviewed, if relevant', 17), ('Governing law and jurisdiction reviewed', 18),
  ('Signature authority confirmed', 19), ('Internal approvals obtained or identified', 20),
  ('Missing clauses or missing information identified', 21), ('Unusual or high-risk terms highlighted', 22),
  ('Compared against university-approved template or standard position', 23),
  ('Similar past legal opinion or reviewed agreement considered', 24),
  ('Reviewer questions for requester identified', 25), ('Final approved response/document storage needed', 26)
on conflict (criteria) do update set sort_order = excluded.sort_order;

insert into ai_engine_control (id, is_running) values ('legal_affair_engine', true)
on conflict (id) do nothing;

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
