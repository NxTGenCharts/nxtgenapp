-- AI Coach — Daily Brief readiness checklist
-- One row per user per calendar day. Optional table: if it doesn't exist,
-- js/ai-coach-upgrade.js falls back to in-session-only state and logs a
-- console warning — nothing else in the app is affected.

CREATE TABLE IF NOT EXISTS ai_coach_daily_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  check_date  date NOT NULL,
  checked     jsonb DEFAULT '[]'::jsonb,   -- array of item indices the user has checked
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, check_date)
);

ALTER TABLE ai_coach_daily_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily checks"
  ON ai_coach_daily_checks FOR ALL
  USING (auth.uid() = user_id);
