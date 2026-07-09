-- The item cache was keyed by (template_key, item_key, data_hash), which
-- blocks generating the same item under a different template VERSION — the
-- exact workflow of A/B model tests and the Phase C rewrite loop. Scope the
-- cache per version, and make prose_published pick the newest published row
-- per (template_key, item_key) so republishing under a new version wins.

alter table prose_items add column if not exists template_version int not null default 1;

-- Backfill from the owning job's template.
update prose_items i
set template_version = t.version
from prose_jobs j
join prose_templates t on t.id = j.template_id
where i.job_id = j.id and i.template_version <> t.version;

alter table prose_items
  drop constraint if exists prose_items_template_key_item_key_data_hash_key;
alter table prose_items
  add constraint prose_items_tplver_item_hash_key
  unique (template_key, template_version, item_key, data_hash);

create or replace view prose_published
  with (security_invoker = true) as
  select distinct on (template_key, item_key)
         template_key, item_key,
         coalesce(edited_output, output) as output,
         data_hash, updated_at
  from prose_items where status = 'published'
  order by template_key, item_key, updated_at desc;
