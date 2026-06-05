-- Per-user engagement click counters (admin analytics).
alter table public.profiles
  add column if not exists bazi_luan_click_count integer not null default 0,
  add column if not exists tieu_van_luan_click_count integer not null default 0,
  add column if not exists day_luan_follow_up_click_count integer not null default 0;

comment on column public.profiles.bazi_luan_click_count is
  'Số lần user bấm/mở luận Bát tự (la-so-chi-tiet, có quyền, không preview).';
comment on column public.profiles.tieu_van_luan_click_count is
  'Số lần user bấm/mở luận tiểu vận tháng (có quyền).';
comment on column public.profiles.day_luan_follow_up_click_count is
  'Số lần user bấm gửi hỏi thêm trong luận ngày (sau rate limit).';

create or replace function public.increment_profile_engagement(
  p_user_id uuid,
  p_metric text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_metric = 'bazi_luan' then
    update public.profiles
    set bazi_luan_click_count = bazi_luan_click_count + 1,
        updated_at = now()
    where id = p_user_id;
  elsif p_metric = 'tieu_van_luan' then
    update public.profiles
    set tieu_van_luan_click_count = tieu_van_luan_click_count + 1,
        updated_at = now()
    where id = p_user_id;
  elsif p_metric = 'day_luan_follow_up' then
    update public.profiles
    set day_luan_follow_up_click_count = day_luan_follow_up_click_count + 1,
        updated_at = now()
    where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.increment_profile_engagement(uuid, text) from public;
revoke all on function public.increment_profile_engagement(uuid, text) from anon;
revoke all on function public.increment_profile_engagement(uuid, text) from authenticated;
grant execute on function public.increment_profile_engagement(uuid, text) to service_role;

-- Backfill hỏi thêm từ lịch sử idempotency (mỗi lần gửi = 1 lần bấm).
update public.profiles p
set day_luan_follow_up_click_count = s.cnt
from (
  select t.user_id, count(*)::integer as cnt
  from public.day_luan_ask_idempotency i
  inner join public.day_luan_threads t on t.id = i.thread_id
  group by t.user_id
) s
where p.id = s.user_id;
