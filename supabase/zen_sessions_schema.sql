-- Zen Session — immersive guided pre-trade routine history
-- Optional table: if it doesn't exist, js/zen-session.js falls back to
-- localStorage for session history and logs a console warning — nothing
-- else in the app is affected. Mirrors the graceful-fallback pattern
-- already used by zen_checkins / zen_journal_entries / zen_guardrails.

CREATE TABLE IF NOT EXISTS zen_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_date       date NOT NULL,
  duration_label     text,                          -- 'Quick Reset' | 'Focus Reset' | 'Full Pre-Trade Session'
  duration_minutes   int,                            -- 5 | 10 | 15
  intention          text,                           -- selected session intention
  mode               text,                           -- 'guided' | 'minimal' | 'silent'
  emotion_before     text,
  emotion_after      text,
  readiness_before   int,
  readiness_after    int,
  completed          boolean DEFAULT false,
  committed_to_plan  boolean DEFAULT false,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zen_sessions_user_date_idx ON zen_sessions (user_id, session_date DESC);

ALTER TABLE zen_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zen sessions"
  ON zen_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
