-- Prose Engine — template-driven LLM content generation with human review
-- (artifacts/docs/seo/prose-engine-spec.md in Ngay-lanh-thang-tot).
-- Access is edge-function-only (service role): RLS is enabled with no
-- policies, so anon/authenticated clients see nothing.

create table if not exists prose_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,               -- 'p1-day' | 'p2-event' | 'p3-hop-tuoi' | …
  version       int  not null,
  name          text not null,
  system_prompt text not null,               -- voice charter, register rules, hard bans
  user_template text not null,               -- {{data.*}} / {{json data}} placeholders
  output_schema jsonb not null,              -- JSON Schema, enforced via tool-use
  few_shots     jsonb not null default '[]', -- [{input, output}]
  guards        jsonb not null default '{}',
  model         text not null default 'claude-sonnet-5',
  temperature   numeric not null default 0.8,
  max_tokens    int not null default 1200,
  created_by    uuid references auth.users,
  created_at    timestamptz not null default now(),
  unique (key, version)
);

create table if not exists prose_jobs (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references prose_templates,
  status        text not null default 'draft',
    -- draft | estimating | running | review | approved | published | failed | cancelled
  mode          text not null default 'realtime',  -- 'realtime' | 'batch' (Phase B)
  anthropic_batch_id text,
  item_count    int not null default 0,
  review_sample_pct numeric not null default 5,
  tokens_in     bigint not null default 0,
  tokens_out    bigint not null default 0,
  cost_usd      numeric not null default 0,
  created_by    uuid references auth.users,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table if not exists prose_items (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references prose_jobs,
  template_key  text not null,
  item_key      text not null,               -- '2026-08-01' | 'khai-truong|2026-09' | slug
  data_hash     text not null,               -- sha256 of input_data → cache key
  input_data    jsonb not null,
  output        jsonb,
  edited_output jsonb,                       -- human override — wins over output
  status        text not null default 'pending',
    -- pending | generated | failed_validation | flagged | approved | rejected | published
  validation    jsonb not null default '[]', -- [{gate, ok, detail}]
  similarity    jsonb,                       -- {maxScore, nearestItemKey}
  regen_count   int not null default 0,
  reviewer      uuid references auth.users,
  review_note   text,
  updated_at    timestamptz not null default now(),
  unique (template_key, item_key, data_hash)
);

create index if not exists prose_items_job_idx on prose_items (job_id);
create index if not exists prose_items_status_idx on prose_items (template_key, status);

create or replace function prose_items_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists prose_items_touch on prose_items;
create trigger prose_items_touch before update on prose_items
  for each row execute function prose_items_touch_updated_at();

-- Edge-function-only access: no policies on purpose.
alter table prose_templates enable row level security;
alter table prose_jobs      enable row level security;
alter table prose_items     enable row level security;

-- What the site repo consumes (service role in CI). security_invoker so the
-- empty RLS above also gates the view for anon/authenticated.
create or replace view prose_published
  with (security_invoker = true) as
  select template_key, item_key,
         coalesce(edited_output, output) as output,
         data_hash, updated_at
  from prose_items where status = 'published';
