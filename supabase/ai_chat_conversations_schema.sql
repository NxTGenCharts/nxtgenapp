-- AI Chat — multi-conversation history
-- One row per saved conversation. Optional table: if it doesn't exist,
-- js/ai-chat-history.js falls back to the existing single-session
-- sessionStorage behaviour (unchanged) and logs a console warning —
-- nothing else in the chat is affected.

CREATE TABLE IF NOT EXISTS ai_chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       text NOT NULL DEFAULT 'New conversation',
  messages    jsonb DEFAULT '[]'::jsonb,   -- lightweight {role,content,ts}[] (images excluded, same as sessionStorage copy)
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE ai_chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat conversations"
  ON ai_chat_conversations FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_user_updated
  ON ai_chat_conversations (user_id, updated_at DESC);
