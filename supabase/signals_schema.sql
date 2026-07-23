-- ════════════════════════════════════════════════════════════════
-- NxTGen Trading Journal — Signals feature schema
-- Prefix matches existing tables (journal_trades, journal_playbook, ...)
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS guards).
-- ════════════════════════════════════════════════════════════════

-- Core signal record — one row per published trade idea
create table if not exists journal_signals (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,

  -- Instrument
  pair              text not null,
  market            text not null check (market in ('forex','crypto','indices','commodities','stocks','synthetic')),
  direction         text not null check (direction in ('buy','sell')),

  -- Levels
  entry             numeric not null,
  stop_loss         numeric not null,
  tp1               numeric,
  tp2               numeric,
  tp3               numeric,
  risk_reward       numeric,             -- computed at publish time, e.g. 3.8
  risk_percent      numeric,
  risk_amount       numeric,

  -- Meta
  confidence        text check (confidence in ('low','medium','high','very_high')),
  confidence_score  int check (confidence_score between 0 and 100),
  session           text check (session in ('sydney','tokyo','london','new_york','london_ny_overlap')),
  setup_type        text,
  status            text not null default 'waiting'
                      check (status in ('waiting','active','partial','tp1_hit','tp2_hit','tp3_hit','stopped_out','cancelled','expired')),
  visibility        text not null default 'private' check (visibility in ('public','premium','private')),

  -- Narrative
  trade_idea        text,
  market_outlook    text,
  htf_bias          text,
  entry_reason      text,
  invalidation      text,
  management_rules  text,
  notes             text,
  lessons           text,

  -- Structure tags (Liquidity / FVG / Order Block / SMT / Structure / Volume)
  confluences        text[] default '{}',
  tags                text[] default '{}',

  -- Chart
  chart_screenshot_url text,
  tradingview_link      text,

  -- Lifecycle
  expires_at        timestamptz,
  published_at      timestamptz,
  entered_at        timestamptz,
  closed_at         timestamptz,

  -- Result (denormalised for fast table/stat rendering; see journal_signal_results for full audit trail)
  result            text check (result in ('win','loss','breakeven','pending')),
  pips              numeric,
  profit_percent    numeric,
  r_multiple        numeric,

  is_draft          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_signals_owner        on journal_signals(owner_id);
create index if not exists idx_signals_status        on journal_signals(status);
create index if not exists idx_signals_market        on journal_signals(market);
create index if not exists idx_signals_visibility    on journal_signals(visibility);
create index if not exists idx_signals_created_at    on journal_signals(created_at desc);
create index if not exists idx_signals_pair          on journal_signals(pair);

-- Status/price timeline entries — powers the animated progress tracker
create table if not exists journal_signal_updates (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references journal_signals(id) on delete cascade,
  status        text not null,
  price         numeric,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_signal_updates_signal on journal_signal_updates(signal_id, created_at);

-- Discussion thread per signal
create table if not exists journal_signal_comments (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references journal_signals(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  body          text not null,
  reaction      text,                    -- optional emoji reaction attached to the comment
  created_at    timestamptz not null default now()
);
create index if not exists idx_signal_comments_signal on journal_signal_comments(signal_id, created_at);

-- Chart screenshots / attachments (before-after, annotated, etc.)
create table if not exists journal_signal_images (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references journal_signals(id) on delete cascade,
  url           text not null,
  kind          text default 'chart' check (kind in ('chart','before','after','attachment')),
  caption       text,
  sort_order    int default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_signal_images_signal on journal_signal_images(signal_id);

-- Likes (one per user per signal)
create table if not exists journal_signal_likes (
  signal_id     uuid not null references journal_signals(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (signal_id, user_id)
);

-- Bookmarks (one per user per signal)
create table if not exists journal_signal_bookmarks (
  signal_id     uuid not null references journal_signals(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (signal_id, user_id)
);

-- Reusable tag library (setup types, confluences, custom labels)
create table if not exists journal_signal_tags (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  label         text not null,
  color         text default 'blue',
  created_at    timestamptz not null default now(),
  unique (owner_id, label)
);

-- Closed-trade result audit trail (supports multiple partial closes per signal)
create table if not exists journal_signal_results (
  id                uuid primary key default gen_random_uuid(),
  signal_id         uuid not null references journal_signals(id) on delete cascade,
  closed_level      text check (closed_level in ('tp1','tp2','tp3','stop_loss','manual','breakeven')),
  price             numeric,
  pips              numeric,
  r_multiple        numeric,
  profit_percent    numeric,
  closed_at         timestamptz not null default now()
);
create index if not exists idx_signal_results_signal on journal_signal_results(signal_id);

-- keep updated_at fresh
create or replace function journal_signals_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_journal_signals_touch on journal_signals;
create trigger trg_journal_signals_touch before update on journal_signals
  for each row execute function journal_signals_touch_updated_at();

-- ── Row Level Security ─────────────────────────────────────────
-- Model: owner_id = the publishing admin (you). Readers see rows based on
-- visibility: 'public' → any authenticated user, 'premium' → any authenticated
-- user for now (swap the `true` below for a real subscription check once you
-- add a premium-status column/table), 'private' → owner only.

alter table journal_signals         enable row level security;
alter table journal_signal_updates  enable row level security;
alter table journal_signal_comments enable row level security;
alter table journal_signal_images   enable row level security;
alter table journal_signal_likes    enable row level security;
alter table journal_signal_bookmarks enable row level security;
alter table journal_signal_tags     enable row level security;
alter table journal_signal_results  enable row level security;

create policy "signals: owner full access" on journal_signals
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "signals: readers see public/premium" on journal_signals
  for select using (
    visibility = 'public'
    or (visibility = 'premium' and auth.role() = 'authenticated')
  );

create policy "signal_updates: follow parent visibility" on journal_signal_updates
  for select using (
    exists (select 1 from journal_signals s where s.id = signal_id
      and (s.owner_id = auth.uid() or s.visibility in ('public','premium')))
  );
create policy "signal_updates: owner writes" on journal_signal_updates
  for all using (exists (select 1 from journal_signals s where s.id = signal_id and s.owner_id = auth.uid()));

create policy "signal_comments: readers see, authors manage own" on journal_signal_comments
  for select using (
    exists (select 1 from journal_signals s where s.id = signal_id
      and (s.owner_id = auth.uid() or s.visibility in ('public','premium')))
  );
create policy "signal_comments: authenticated users write own" on journal_signal_comments
  for insert with check (auth.uid() = user_id);
create policy "signal_comments: authors edit/delete own" on journal_signal_comments
  for update using (auth.uid() = user_id);
create policy "signal_comments: authors delete own" on journal_signal_comments
  for delete using (auth.uid() = user_id);

create policy "signal_images: follow parent visibility" on journal_signal_images
  for select using (
    exists (select 1 from journal_signals s where s.id = signal_id
      and (s.owner_id = auth.uid() or s.visibility in ('public','premium')))
  );
create policy "signal_images: owner writes" on journal_signal_images
  for all using (exists (select 1 from journal_signals s where s.id = signal_id and s.owner_id = auth.uid()));

create policy "signal_likes: self manage" on journal_signal_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "signal_bookmarks: self manage" on journal_signal_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "signal_tags: owner manage" on journal_signal_tags
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "signal_results: follow parent visibility" on journal_signal_results
  for select using (
    exists (select 1 from journal_signals s where s.id = signal_id
      and (s.owner_id = auth.uid() or s.visibility in ('public','premium')))
  );
create policy "signal_results: owner writes" on journal_signal_results
  for all using (exists (select 1 from journal_signals s where s.id = signal_id and s.owner_id = auth.uid()));

-- ── Realtime ────────────────────────────────────────────────────
-- Enable in Supabase Dashboard → Database → Replication, or run:
-- alter publication supabase_realtime add table journal_signals, journal_signal_updates, journal_signal_comments, journal_signal_likes;

-- ════════════════════════════════════════════════════════════════
-- Signals v2 — drafts/lifecycle/notifications/activity/templates
-- Adds the columns + tables needed for: real drafts persistence,
-- a full lifecycle (incl. breakeven), signal updates timeline,
-- a notification center, an activity/audit log, and reusable
-- signal templates. Safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- Extra columns on the core table used by the app's drafts/edit/lifecycle UI
alter table journal_signals add column if not exists draft_name      text;
alter table journal_signals add column if not exists archived       boolean not null default false;
alter table journal_signals add column if not exists scheduled_at   timestamptz;
alter table journal_signals add column if not exists edited_at      timestamptz;
alter table journal_signals add column if not exists checklist      jsonb not null default '[]';
alter table journal_signals add column if not exists version_history jsonb not null default '[]';

-- Add 'breakeven' and 'scheduled' to the status lifecycle
alter table journal_signals drop constraint if exists journal_signals_status_check;
alter table journal_signals add constraint journal_signals_status_check
  check (status in ('draft','scheduled','waiting','active','partial','breakeven',
                     'tp1_hit','tp2_hit','tp3_hit','stopped_out','cancelled','expired','archived'));

create index if not exists idx_signals_archived on journal_signals(archived);
create index if not exists idx_signals_is_draft on journal_signals(is_draft);

-- Automatic per-signal activity/audit log (created, edited, status changes, deleted, ...)
create table if not exists journal_signal_activity (
  id          uuid primary key default gen_random_uuid(),
  signal_id   uuid references journal_signals(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  action      text not null,        -- created | edited | published | unpublished | status_changed | update_added | archived | deleted | duplicated
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_signal_activity_signal on journal_signal_activity(signal_id, created_at desc);
create index if not exists idx_signal_activity_owner  on journal_signal_activity(owner_id, created_at desc);

-- User-facing notification center (new signal, edited, TP/SL hit, etc.)
create table if not exists journal_signal_notifications (
  id          uuid primary key default gen_random_uuid(),
  signal_id   uuid references journal_signals(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  type        text not null,        -- published | edited | entry_triggered | sl_moved | tp1_hit | tp2_hit | tp3_hit | breakeven | cancelled | closed | update
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_signal_notif_owner_unread on journal_signal_notifications(owner_id, read, created_at desc);

-- Reusable signal templates ("Create from Template" / "Use Last Signal")
create table if not exists journal_signal_templates (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  -- Everything EXCEPT the trade-specific fields (pair/entry/sl/tp/rr/notes) —
  -- risk %, position sizing, disclaimer, structure, tags, session, confidence.
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_signal_templates_owner on journal_signal_templates(owner_id, created_at desc);

alter table journal_signal_activity      enable row level security;
alter table journal_signal_notifications enable row level security;
alter table journal_signal_templates     enable row level security;

create policy "signal_activity: owner manage" on journal_signal_activity
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "signal_notifications: owner manage" on journal_signal_notifications
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "signal_templates: owner manage" on journal_signal_templates
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- alter publication supabase_realtime add table journal_signal_notifications, journal_signal_activity;
