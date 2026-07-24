// ══════════════════════════════════════════════════════════════
// supabase/functions/notify-subscribers/index.ts
//
// Called by signals.js (`sb.functions.invoke('notify-subscribers', ...)`)
// every time a signal is published, edited, or changes status. This is
// the ONE place that's allowed to hold real provider secrets — a browser
// can never safely hold a VAPID private key, an email API key, or a
// WhatsApp access token, so all of that lives here, server-side, as
// Supabase secrets.
//
// Deploy:
//   supabase functions deploy notify-subscribers
//
// Configure secrets (fill in real values from each provider):
//   supabase secrets set VAPID_PUBLIC_KEY=...      # also paste into
//                                                    # SIG_VAPID_PUBLIC_KEY
//                                                    # in signals.js
//   supabase secrets set VAPID_PRIVATE_KEY=...
//   supabase secrets set RESEND_API_KEY=...         # https://resend.com
//   supabase secrets set WHATSAPP_TOKEN=...         # Meta WhatsApp Cloud API
//   supabase secrets set WHATSAPP_PHONE_ID=...
//
// Generate a VAPID key pair once with:
//   npx web-push generate-vapid-keys
// ══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:alerts@yourdomain.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const { signal_id, pair, direction, event_type, message } = await req.json();

    const title = event_type === 'published'
      ? `New signal: ${pair}`
      : `${pair} signal ${event_type === 'edited' ? 'updated' : 'update'}`;
    const body = message || `${pair} ${direction ?? ''}`.trim();

    // Every user who has opted into at least one channel.
    const { data: subs, error } = await sb
      .from('journal_notification_prefs')
      .select('*')
      .or('push_enabled.eq.true,email_enabled.eq.true,whatsapp_enabled.eq.true');
    if (error) throw error;

    const results = await Promise.allSettled((subs ?? []).flatMap((s) => {
      const jobs: Promise<unknown>[] = [];
      if (s.push_enabled && s.push_subscription) jobs.push(sendPush(s.push_subscription, title, body, signal_id));
      if (s.email_enabled && s.email) jobs.push(sendEmail(s.email, title, body));
      if (s.whatsapp_enabled && s.whatsapp_number) jobs.push(sendWhatsApp(s.whatsapp_number, `${title}\n${body}`));
      return jobs;
    }));

    const failed = results.filter((r) => r.status === 'rejected').length;
    return new Response(JSON.stringify({ ok: true, sent: results.length - failed, failed }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('notify-subscribers error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});

async function sendPush(subscription: unknown, title: string, body: string, signalId: string) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  await webpush.sendNotification(
    subscription as never,
    JSON.stringify({ title, body, data: { signal_id: signalId } })
  );
}

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'NxTGen Signals <alerts@yourdomain.com>',
      to, subject, text: body
    })
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

async function sendWhatsApp(to: string, body: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/[^\d+]/g, ''),
      type: 'text',
      text: { body }
    })
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
}
