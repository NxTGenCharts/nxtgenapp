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

let _vapidReady = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails('mailto:alerts@nxtgencharts.site', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    _vapidReady = true;
  } catch (e) {
    // A malformed VAPID key must never take down email/WhatsApp with it —
    // log it and just skip push for this invocation instead of crashing
    // the whole module at boot.
    console.error('VAPID setup failed — push disabled for this deployment:', e);
  }
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Browser calls via supabase-js (`sb.functions.invoke`) send an automatic
// CORS preflight OPTIONS request before the real POST — it has no body.
// Every response also needs these headers or the browser will block the
// real response from ever reaching the caller, even if the function
// itself succeeded.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
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
      if (s.email_enabled && s.email) jobs.push(sendEmail(s.email, { title, body, pair, direction, eventType: event_type, signalId: signal_id }));
      if (s.whatsapp_enabled && s.whatsapp_number) jobs.push(sendWhatsApp(s.whatsapp_number, `${title}\n${body}`));
      return jobs;
    }));

    const failed = results.filter((r) => r.status === 'rejected').length;
    // Log individual failures — Promise.allSettled swallows them otherwise,
    // and "1 failed" alone doesn't tell you whether it was push, email, or
    // WhatsApp that broke.
    results.forEach((r) => { if (r.status === 'rejected') console.error('notify job failed:', r.reason); });

    return new Response(JSON.stringify({ ok: true, sent: results.length - failed, failed }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('notify-subscribers error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});

async function sendPush(subscription: unknown, title: string, body: string, signalId: string) {
  if (!_vapidReady) return;
  await webpush.sendNotification(
    subscription as never,
    JSON.stringify({ title, body, data: { signal_id: signalId } })
  );
}

const APP_URL = 'https://app.nxtgencharts.site';
const UNSUB_MAILTO = 'unsubscribe@nxtgencharts.site';

// Two flat-color renders of the same logo — dark glyph for the light-mode
// email, light glyph for the dark-mode email. Host both somewhere public
// (Supabase Storage public bucket, or /public in your app) and paste the
// URLs here. Until these point to real files, the <img> tags below will
// just show broken-image icons — the fallback text-only card design still
// works underneath them either way.
const LOGO_LIGHT_URL = `${APP_URL}/email-assets/logo-light-mode.png`; // dark logo, light backgrounds
const LOGO_DARK_URL = `${APP_URL}/email-assets/logo-dark-mode.png`;   // light logo, dark backgrounds

async function sendEmail(
  to: string,
  info: { title: string; body: string; pair?: string; direction?: string; eventType?: string; signalId?: string }
) {
  if (!RESEND_API_KEY) return;
  const { title, body, pair, direction, eventType, signalId } = info;

  const eventLabel = eventType === 'published' ? 'Published'
    : eventType === 'edited' ? 'Edited'
    : 'Status Update';
  const directionColor = direction === 'sell' ? '#f87171' : '#34d399';
  const directionLabel = direction ? direction.toUpperCase() : '';
  const viewUrl = signalId ? `${APP_URL}/signals?signal=${signalId}` : `${APP_URL}/signals`;
  const settingsUrl = `${APP_URL}/signals?notif-settings=1`;

  // Colors are set twice on purpose: once as the light-mode default (plain
  // inline styles, since that's what every email client renders if it
  // doesn't understand the <style> block at all), and once again inside
  // the dark-mode media query with !important, which only wins on clients
  // that support prefers-color-scheme (Apple/iOS/macOS Mail, Outlook.com,
  // Yahoo). [data-ogsc] repeats the same overrides for Outlook.com/Windows
  // Mail, which use that attribute hook instead of the media query.
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  .logo-dark { display: none; }
  @media (prefers-color-scheme: dark) {
    .bg-page { background: #0b0e14 !important; }
    .bg-card { background: #12151d !important; border-color: #232733 !important; }
    .text-heading { color: #f9fafb !important; }
    .text-body { color: #9ca3af !important; }
    .text-muted a, .text-muted { color: #6b7280 !important; }
    .border-t { border-color: #232733 !important; }
    .badge { background: #1e293b !important; color: #93c5fd !important; }
    .logo-light { display: none !important; }
    .logo-dark { display: inline-block !important; }
  }
  [data-ogsc] .bg-page { background: #0b0e14 !important; }
  [data-ogsc] .bg-card { background: #12151d !important; border-color: #232733 !important; }
  [data-ogsc] .text-heading { color: #f9fafb !important; }
  [data-ogsc] .text-body { color: #9ca3af !important; }
  [data-ogsc] .text-muted, [data-ogsc] .text-muted a { color: #6b7280 !important; }
  [data-ogsc] .border-t { border-color: #232733 !important; }
  [data-ogsc] .badge { background: #1e293b !important; color: #93c5fd !important; }
  [data-ogsc] .logo-light { display: none !important; }
  [data-ogsc] .logo-dark { display: inline-block !important; }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" class="bg-card" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td class="border-t" style="padding:18px 24px;border-bottom:1px solid #e5e7eb;">
          <img src="${LOGO_LIGHT_URL}" width="132" alt="NxTGen Trading Journal" class="logo-light" style="display:inline-block;height:auto;max-width:132px;border:0;outline:none;vertical-align:middle;">
          <img src="${LOGO_DARK_URL}" width="132" alt="NxTGen Trading Journal" class="logo-dark" style="display:none;height:auto;max-width:132px;border:0;outline:none;vertical-align:middle;">
        </td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <span class="badge" style="display:inline-block;padding:3px 10px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">${eventLabel}</span>
        </td></tr>
        <tr><td style="padding:8px 24px 0;">
          <span class="text-heading" style="color:#111827;font-size:22px;font-weight:700;">${pair || 'Signal'}</span>
          ${directionLabel ? `<span style="margin-left:8px;color:${directionColor};font-size:15px;font-weight:700;">${directionLabel}</span>` : ''}
        </td></tr>
        <tr><td style="padding:10px 24px 26px;">
          <span class="text-body" style="color:#4b5563;font-size:14px;line-height:1.5;">${body}</span>
        </td></tr>
        <tr><td style="padding:0 24px 28px;">
          <a href="${viewUrl}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px;">View signal</a>
        </td></tr>
        <tr><td class="border-t" style="padding:18px 24px;border-top:1px solid #e5e7eb;">
          <span class="text-muted" style="color:#9ca3af;font-size:11.5px;line-height:1.6;">
            You're getting this because email alerts are turned on in your NxTGen Notification Settings.
            <a href="${settingsUrl}" class="text-muted" style="color:#9ca3af;">Manage preferences</a> or
            <a href="mailto:${UNSUB_MAILTO}?subject=Unsubscribe" class="text-muted" style="color:#9ca3af;">unsubscribe</a>.
          </span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${title}\n\n${body}\n\nView signal: ${viewUrl}\n\n—\nYou're getting this because email alerts are on in your NxTGen Notification Settings.\nManage preferences: ${settingsUrl}\nUnsubscribe: mailto:${UNSUB_MAILTO}?subject=Unsubscribe`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Verified on Resend against nxtgencharts.site — safe to send to any
      // recipient now, not just the Resend account's own signup address.
      from: 'NxTGen Signals <alerts@nxtgencharts.site>',
      reply_to: `NxTGen Support <${UNSUB_MAILTO}>`,
      to, subject: title, html, text,
      // A List-Unsubscribe header is one of the strongest signals inbox
      // providers use to distinguish legitimate bulk-ish mail from spam —
      // it's what puts the native "Unsubscribe" link next to the sender
      // name in Gmail/Outlook.
      headers: {
        'List-Unsubscribe': `<mailto:${UNSUB_MAILTO}?subject=Unsubscribe>, <${settingsUrl}>`,
        // Gmail/Yahoo require this alongside List-Unsubscribe for their
        // one-click unsubscribe bulk-sender rules (Feb 2024) — without it,
        // List-Unsubscribe alone doesn't count as compliant and can hurt
        // inbox placement.
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
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