-- Zen — Trader Mental Performance Center
-- Optional tables: if these don't exist, js/zen-upgrade.js falls back to
-- in-session-only state (and, for the pre-trade checklist, localStorage)
-- and logs a console warning — nothing else in the app is affected.
-- Mirrors the graceful-fallback pattern used by ai_coach_daily_checks.

-- One check-in per user per calendar day.
CREATE TABLE IF NOT EXISTS zen_checkins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  check_in_date         date NOT NULL,
  focus_score           int,                          -- 1–5
  energy_level          text,                          -- 'low' | 'moderate' | 'high'
  discipline_readiness  int,                          -- 1–5
  emotional_states      jsonb DEFAULT '[]'::jsonb,     -- array of selected state labels
  trading_intent        text,                          -- selected intent label
  readiness_score       int,                          -- 0–100, calculated client-side
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(user_id, check_in_date)
);

ALTER TABLE zen_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zen checkins"
  ON zen_checkins FOR ALL
  USING (auth.uid() = user_id);

-- One journal reflection per user per calendar day.
CREATE TABLE IF NOT EXISTS zen_journal_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_date          date NOT NULL,
  content             text NOT NULL,
  related_checkin_id  uuid REFERENCES zen_checkins(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(user_id, entry_date)
);

ALTER TABLE zen_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zen journal entries"
  ON zen_journal_entries FOR ALL
  USING (auth.uid() = user_id);

-- One guardrail configuration per user (behavioral limits, not enforced —
-- compared against actual trade activity to surface warnings only).
CREATE TABLE IF NOT EXISTS zen_guardrails (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  max_trades             int,
  max_consecutive_losses int,
  max_daily_risk         numeric,
  cooldown_after_loss    int,                       -- minutes
  enabled_rules          jsonb DEFAULT '[]'::jsonb,  -- e.g. ["no_revenge","no_chasing","playbook_only"]
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE zen_guardrails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zen guardrails"
  ON zen_guardrails FOR ALL
  USING (auth.uid() = user_id);
