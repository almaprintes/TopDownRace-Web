-- Public website snapshot; source tables and game RPC permissions stay unchanged.
create schema if not exists tdr_web_private;
revoke all on schema tdr_web_private from public, anon, authenticated;

create table public.web_leaderboard_snapshot (
  id boolean primary key default true check (id),
  payload jsonb not null
);
alter table public.web_leaderboard_snapshot enable row level security;
revoke all on public.web_leaderboard_snapshot from public, anon, authenticated;
grant select on public.web_leaderboard_snapshot to anon, authenticated;
create policy web_leaderboard_public_read on public.web_leaderboard_snapshot
  for select to anon, authenticated using (true);

create table tdr_web_private.refresh_daily (
  day date primary key,
  refreshes bigint not null default 0,
  total_ms double precision not null default 0,
  max_payload_bytes integer not null default 0
);
alter table tdr_web_private.refresh_daily enable row level security;
revoke all on tdr_web_private.refresh_daily from public, anon, authenticated;

create or replace function tdr_web_private.refresh_leaderboards()
returns void language plpgsql security invoker set search_path = '' as $fn$
declare
  started timestamptz := clock_timestamp();
  snapshot jsonb;
begin
  with tracks as (
    select track_id from (values ('circuito-atlantico'),('karting-canarias'),
      ('karting-tenerife'),('santa-cruz')) defaults(track_id)
    union select distinct track_id from public.track_records
  ), boards as (
    select t.track_id, coalesce(b.entries, '[]'::jsonb) entries
    from tracks t
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
        'rank', r.position, 'nick', r.nick, 'best_time_ms', r.best_time_ms
      ) order by r.best_time_ms, r.created_at, r.user_id) entries
      from (
        select rank() over(order by best.best_time_ms) position, best.*
        from (
          select p.nick, tr.best_time_ms, tr.created_at, tr.user_id
          from public.track_records tr join public.profiles p on p.user_id=tr.user_id
          where tr.track_id=t.track_id and tr.best_time_ms > 0
          order by tr.best_time_ms, tr.created_at, tr.user_id
          limit 10
        ) best
      ) r
    ) b
  )
  select jsonb_build_object(
    'version',1,'generated_at',started,'refresh_seconds',300,
    'tracks',coalesce(jsonb_agg(jsonb_build_object('id',track_id,'entries',entries)
      order by track_id),'[]'::jsonb)
  ) into snapshot from boards;

  insert into public.web_leaderboard_snapshot(id,payload) values(true,snapshot)
    on conflict(id) do update set payload=excluded.payload;
  insert into tdr_web_private.refresh_daily(day,refreshes,total_ms,max_payload_bytes)
    values((started at time zone 'UTC')::date,1,
      extract(epoch from clock_timestamp()-started)*1000,
      octet_length(snapshot::text))
    on conflict(day) do update set
      refreshes=tdr_web_private.refresh_daily.refreshes+1,
      total_ms=tdr_web_private.refresh_daily.total_ms+excluded.total_ms,
      max_payload_bytes=greatest(tdr_web_private.refresh_daily.max_payload_bytes,excluded.max_payload_bytes);
  delete from tdr_web_private.refresh_daily where day < (started at time zone 'UTC')::date-90;
end;
$fn$;
revoke all on function tdr_web_private.refresh_leaderboards() from public, anon, authenticated;
select tdr_web_private.refresh_leaderboards();

create extension if not exists pg_cron;
select cron.schedule('tdr-web-rankings-refresh','*/5 * * * *',
  'set statement_timeout = ''5s''; select tdr_web_private.refresh_leaderboards();');
select cron.schedule('tdr-web-rankings-cleanup','43 3 * * *',
  $cron$delete from cron.job_run_details where jobid in
    (select jobid from cron.job where jobname in ('tdr-web-rankings-refresh','tdr-web-rankings-cleanup'))
    and end_time < now()-interval '7 days';$cron$);

