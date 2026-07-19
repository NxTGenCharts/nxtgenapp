// supabase/functions/ai-coach/index.ts
//
// NxTGen AI Coach — Gemini primary, Groq fallback
// ─────────────────────────────────────────────────────────────────
// The frontend (app.js) is UNCHANGED — it still POSTs:
//   { system: "...", messages: [{ role, content }, ...] }
// and still reads back:
//   { content: [{ type: "text", text: "..." }], provider: "gemini" | "groq" }
//
// The "provider" field is purely a debug aid — it tells you which
// backend actually answered a given request. The frontend doesn't
// need to read it (existing UI code that only looks at `content`
// keeps working unchanged), but you can see it in DevTools → Network
// → the ai-coach request → Response tab.
//
// Behavior:
//   1. Try Gemini (with automatic retry on 503/429, exponential backoff).
//   2. If Gemini still fails after all retries, fall back to Groq
//      (Llama 3.3 70B via Groq's OpenAI-compatible chat completions API).
//   3. Image blocks are only sent to Gemini — Groq's free-tier text
//      models don't support vision, so if the fallback triggers on a
//      message containing images, we strip images and note that in
//      the prompt so the reply still makes sense contextually.
//
// Required secrets:
//   GEMINI_API_KEY   (existing)
//   GEMINI_MODEL     (optional, defaults to gemini-flash-latest)
//   GROQ_API_KEY     (new — get one free at https://console.groq.com/keys)
//   GROQ_MODEL       (optional, defaults to llama-3.3-70b-versatile)
// ─────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Retry configuration for transient Gemini errors (503 = overloaded,
// 429 = rate limited). Exponential backoff: 500ms, 1s, 2s.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!GEMINI_API_KEY) {
    return json(
      { error: 'GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=your_key' },
      500,
    );
  }

  try {
    const { system, messages } = await req.json();

    if (!Array.isArray(messages) || !messages.length) {
      return json({ error: 'messages array is required' }, 400);
    }

    // ---- Attempt 1: Gemini (with built-in retry) ----
    const contents = messages.map(anthropicMessageToGemini);

    const geminiBody: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    };

    if (system) {
      geminiBody.systemInstruction = { parts: [{ text: system }] };
    }

    const geminiRes = await callGeminiWithRetry(geminiBody);

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const candidate = geminiData?.candidates?.[0];

      if (candidate) {
        const text = (candidate.content?.parts || [])
          .map((p: any) => p.text || '')
          .join('');
        return json({ content: [{ type: 'text', text }], provider: 'gemini' });
      }

      // Candidate missing — likely a safety block, not a capacity issue.
      // No point falling back to Groq for this; return the block reason.
      const blockReason = geminiData?.promptFeedback?.blockReason;
      return json({
        content: [
          {
            type: 'text',
            text: blockReason
              ? `⚠ Response blocked by Gemini safety filters (${blockReason}). Try rephrasing.`
              : '⚠ No response generated. Try again.',
          },
        ],
        provider: 'gemini',
      });
    }

    // ---- Gemini failed after retries. Fall back to Groq if it's a
    //      capacity/rate issue (not e.g. an auth or bad-request error). ----
    const geminiErrBody = await geminiRes.json().catch(() => ({}));
    const geminiErrMsg = geminiErrBody?.error?.message || `Gemini API error ${geminiRes.status}`;

    const shouldFallback = RETRYABLE_STATUS_CODES.has(geminiRes.status) && !!GROQ_API_KEY;

    if (!shouldFallback) {
      return json({ error: geminiErrMsg }, geminiRes.status);
    }

    const hadImages = messages.some(
      (m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.type === 'image'),
    );

    try {
      const groqText = await callGroq(system, messages, hadImages);
      return json({ content: [{ type: 'text', text: groqText }], provider: 'groq' });
    } catch (groqErr) {
      // Both providers failed — return a clear combined error.
      return json(
        {
          error:
            'AI Coach is experiencing high demand right now. Please try again in a few seconds.',
          transient: true,
          rawError: `Gemini: ${geminiErrMsg} | Groq fallback: ${(groqErr as Error).message}`,
        },
        503,
      );
    }
  } catch (err) {
    return json({ error: (err as Error).message || 'Unknown server error' }, 500);
  }
});

/**
 * Calls the Gemini API, automatically retrying with exponential backoff
 * if Gemini responds with a transient error (503 overloaded, 429 rate
 * limited). Returns the final Response object (success or failure) —
 * the caller reads geminiRes.ok / geminiRes.status as normal.
 */
async function callGeminiWithRetry(body: Record<string, any>): Promise<Response> {
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok || !RETRYABLE_STATUS_CODES.has(res.status)) {
      return res;
    }

    lastRes = res;

    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 500ms, 1s, 2s
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastRes as Response;
}

/**
 * Calls Groq's OpenAI-compatible chat completions endpoint as a fallback
 * when Gemini is unavailable. Groq's free-tier text models don't support
 * vision, so image blocks are stripped and noted in the text instead.
 */
async function callGroq(
  system: string | undefined,
  messages: any[],
  hadImages: boolean,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const groqMessages: any[] = [];

  if (system) {
    groqMessages.push({ role: 'system', content: system });
  }

  for (const m of messages) {
    groqMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: anthropicContentToPlainText(m.content),
    });
  }

  if (hadImages) {
    groqMessages.push({
      role: 'system',
      content:
        'Note: one or more images were attached to this conversation but could not be ' +
        'analyzed because the primary vision-capable AI is temporarily unavailable. ' +
        'Let the user know you cannot see the image right now and ask them to describe ' +
        'it or try again shortly.',
    });
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || `Groq API error ${res.status}`;
    throw new Error(msg);
  }

  return data?.choices?.[0]?.message?.content || '⚠ No response generated. Try again.';
}

/**
 * Convert Anthropic-style content (string, or array of text/image blocks)
 * into a single plain-text string for providers that don't understand
 * the block format (i.e. Groq).
 */
function anthropicContentToPlainText(content: any): string {
  if (typeof content === 'string') return content;

  return (content || [])
    .map((block: any) => {
      if (block.type === 'image') return '[image attached]';
      return block.text || '';
    })
    .join('\n');
}

/**
 * Convert one Anthropic-style message ({role, content}) into a
 * Gemini "content" object ({role, parts}).
 *
 * Anthropic content is either:
 *   - a plain string, or
 *   - an array of blocks: { type: 'text', text } | { type: 'image', source: { type:'base64', media_type, data } }
 *
 * Gemini parts are:
 *   - { text } | { inlineData: { mimeType, data } }
 */
function anthropicMessageToGemini(msg: { role: string; content: any }) {
  const role = msg.role === 'assistant' ? 'model' : 'user';

  if (typeof msg.content === 'string') {
    return { role, parts: [{ text: msg.content }] };
  }

  const parts = (msg.content || []).map((block: any) => {
    if (block.type === 'image') {
      return {
        inlineData: {
          mimeType: block.source?.media_type || 'image/jpeg',
          data: block.source?.data || '',
        },
      };
    }
    // default: text block
    return { text: block.text || '' };
  });

  return { role, parts };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}