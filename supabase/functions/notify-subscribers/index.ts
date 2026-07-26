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
// This file is organized top-to-bottom as:
//   1. Types
//   2. Config / secrets
//   3. Signal data + status→email-kind resolution + formatters
//   4. Personalization (display name lookup)
//   5. Per-event theme table (color/label/headline for each of the ~10 emails)
//   6. Small HTML building blocks (badges, buttons, cards, callouts)
//   7. Email shell (header/dark-mode CSS/footer) + subject lines
//   8. Email composition (renderEmail — plugs everything above together)
//   9. Provider senders (Resend / Web Push / WhatsApp)
//  10. Deno.serve handler — orchestration only
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
//   supabase secrets set RESEND_FROM_ADDRESS=alerts@nxtgencharts.site
//   supabase secrets set RESEND_FROM_NAME="NxTGen Signals"
//   supabase secrets set WHATSAPP_TOKEN=...         # Meta WhatsApp Cloud API
//   supabase secrets set WHATSAPP_PHONE_ID=...
//
// Generate a VAPID key pair once with:
//   npx web-push generate-vapid-keys
//
// See DELIVERABILITY.md / AUDIT.md alongside this file for the DNS/auth
// setup (SPF, DKIM, DMARC, subdomain) and a full audit of what changed
// from the original version — no template change fixes inbox placement
// on its own, that's a domain-authentication problem.
// ══════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

// ──────────────────────────────────────────────────────────────
// 1. TYPES
// ──────────────────────────────────────────────────────────────

// Raw body sent by signals.js. Intentionally thin — the browser only tells
// us WHICH signal changed and WHAT kind of change it was. We treat that as
// a pointer and re-fetch the authoritative row server-side rather than
// trusting whatever the client happened to have in memory (or letting the
// client spoof entry/SL/TP/RR values into an email).
interface NotifyRequestBody {
  signal_id: string;
  pair?: string;
  direction?: 'buy' | 'sell';
  event_type: 'published' | 'edited' | 'status_changed' | string;
  message?: string;
}

// Subset of journal_signals columns the templates actually use — selected
// explicitly rather than `select('*')`.
interface SignalRow {
  id: string;
  owner_id: string | null;
  pair: string;
  market: string | null;
  direction: 'buy' | 'sell';
  order_type: string | null;
  entry: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  risk_reward: number | null;
  risk_percent: number | null;
  confidence: string | null;
  session: string | null;
  status: string;
  result: 'win' | 'loss' | 'breakeven' | 'pending' | null;
  pips: number | null;
  r_multiple: number | null;
  profit_percent: number | null;
  published_at: number | string | null;
  edited_at: number | string | null;
  closed_at: number | string | null;
  created_at: number | string | null;
  updated_at: number | string | null;
}

interface NotificationPrefRow {
  owner_id: string;
  push_enabled: boolean;
  push_subscription: unknown;
  email_enabled: boolean;
  email: string | null;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  timezone: string | null;
}

// The single branch point every downstream color/subject/template decision
// hangs off. Two requests can both arrive as event_type 'status_changed'
// and still resolve to completely different emails, because the signal's
// current `status` (fresh from the DB) resolves to a different kind.
type EmailKind =
  | 'published' | 'edited'
  | 'tp1_hit' | 'tp2_hit' | 'stopped_out' | 'closed' | 'cancelled'
  | 'partial' | 'breakeven' | 'expired' | 'update';

interface EmailContext {
  kind: EmailKind;
  signal: SignalRow;
  message: string;
  recipientName: string | null; // null -> template falls back to a generic greeting
  timezone: string; // resolved IANA zone — see resolveTimeZone()
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ──────────────────────────────────────────────────────────────
// 2. CONFIG / SECRETS
// ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';

// Send from the verified domain in Resend: nxtgencharts.site (apex), via
// its alerts@ address. The alerts.nxtgencharts.site *subdomain* is NOT
// verified in Resend — sending from it fails with a 403 "domain is not
// verified" error (see AUDIT.md). If a subdomain is verified in Resend
// later for reputation isolation, this can be switched back.
const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') || 'NxTGen Signals';
const RESEND_FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS') || 'alerts@nxtgencharts.site';

// The one account allowed to publish/edit/delete signals (see the
// signals_write/signals_update/signals_delete RLS policies on
// journal_signals — all three key off this same UUID). The admin always
// gets a bell notification for their own action, even if they've never
// opted into push/email/WhatsApp on the notification-settings page —
// everyone else only gets notified if they've opted into at least one
// channel there.
const ADMIN_OWNER_ID = 'acc49a9d-b664-481f-9e07-746fd8ab10ec';

const APP_URL = 'https://app.nxtgencharts.site';
const MARKETING_URL = 'https://nxtgencharts.site';
const SUPPORT_EMAIL = 'support@nxtgencharts.site';
const UNSUB_MAILTO = 'unsubscribe@nxtgencharts.site';

// Fill in with real handles/invite links — placeholders so the footer
// doesn't 404 to nowhere.
const SOCIAL_LINKS = {
  x: 'https://x.com/nxtgencharts',
  instagram: 'https://instagram.com/nxtgencharts',
  discord: 'https://discord.gg/nxtgencharts'
};
const LEGAL_LINKS = {
  terms: `${MARKETING_URL}/terms`,
  privacy: `${MARKETING_URL}/privacy`
};

// Two flat-color renders of the same logo — dark glyph for the light-mode
// email, light glyph for the dark-mode email. Host both somewhere public
// (Supabase Storage public bucket, or /public in your app) and paste the
// URLs here. Until these point to real files the <img> tags just show
// broken-image icons — the fallback text-only layout still works underneath.
const LOGO_LIGHT_URL = `${APP_URL}/email-assets/logo-light-mode.png`;
const LOGO_DARK_URL = `${APP_URL}/email-assets/logo-dark-mode.png`;

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

// ──────────────────────────────────────────────────────────────
// 3. SIGNAL DATA + STATUS→KIND RESOLUTION + FORMATTERS
// ──────────────────────────────────────────────────────────────

const SIGNAL_SELECT = [
  'id', 'owner_id', 'pair', 'market', 'direction', 'order_type',
  'entry', 'stop_loss', 'tp1', 'tp2', 'risk_reward', 'risk_percent',
  'confidence', 'session', 'status', 'result', 'pips', 'r_multiple',
  'profit_percent', 'published_at', 'edited_at', 'closed_at',
  'created_at', 'updated_at'
].join(', ');

// Always re-read the signal from the database rather than trusting the
// payload the browser sent. The browser is not a security boundary, and
// (more mundanely) the row may have changed again between the client
// firing the event and this function running.
async function fetchSignal(signalId: string): Promise<SignalRow | null> {
  if (!signalId) return null;
  const { data, error } = await sb
    .from('journal_signals')
    .select(SIGNAL_SELECT)
    .eq('id', signalId)
    .maybeSingle();
  if (error) {
    console.error('fetchSignal failed:', error);
    return null;
  }
  return (data as SignalRow) ?? null;
}

// Minimal SignalRow built from the broadcast payload when the DB row is
// unavailable (deleted between publish and send, RLS edge case, etc.), so
// a notification can still go out instead of silently dropping. Anything
// the templates can't show renders as "—".
function signalFromPayload(body: NotifyRequestBody): SignalRow {
  return {
    id: body.signal_id, owner_id: null, pair: body.pair || 'Signal',
    market: null, direction: body.direction || 'buy', order_type: null,
    entry: null, stop_loss: null, tp1: null, tp2: null,
    risk_reward: null, risk_percent: null, confidence: null, session: null,
    status: 'active', result: null, pips: null, r_multiple: null, profit_percent: null,
    published_at: null, edited_at: null, closed_at: null, created_at: null, updated_at: null
  };
}

// The single branch point that decides which of the ~10 email layouts to
// render. `event_type` from the client only distinguishes "published" /
// "edited" / "everything else"; for "everything else" we look at the
// signal's current status (fresh from the DB) to pick the specific variant.
function resolveEmailKind(eventType: string, status: string): EmailKind {
  if (eventType === 'published') return 'published';
  if (eventType === 'edited') return 'edited';
  switch (status) {
    case 'tp1_hit': return 'tp1_hit';
    case 'tp2_hit': return 'tp2_hit';
    case 'stopped_out': return 'stopped_out';
    case 'closed': return 'closed';
    case 'cancelled': return 'cancelled';
    case 'partial': return 'partial';
    case 'breakeven': return 'breakeven';
    case 'expired': return 'expired';
    default: return 'update';
  }
}

const SESSION_LABEL: Record<string, string> = {
  asian: 'Asian', london: 'London', new_york: 'New York'
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', scheduled: 'Scheduled', waiting: 'Waiting for Entry', active: 'Active',
  partial: 'Partially Closed', breakeven: 'Breakeven', tp1_hit: 'TP1 Hit', tp2_hit: 'TP2 Hit',
  stopped_out: 'Stopped Out', cancelled: 'Cancelled', expired: 'Expired', closed: 'Closed'
};

function formatPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  // Forex-style pairs commonly need 4-5dp, indices/crypto/stocks 1-2dp.
  // Without the pair's decimal metadata we pick a sensible default and
  // trim trailing zeros rather than guessing wrong precision.
  const fixed = Math.abs(v) < 50 ? v.toFixed(5) : v.toFixed(2);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function formatRR(rr: number | null | undefined): string {
  if (rr === null || rr === undefined || Number.isNaN(rr)) return '—';
  return `1:${rr.toFixed(1).replace(/\.0$/, '')}`;
}

function formatSignedR(r: number | null | undefined): string {
  if (r === null || r === undefined || Number.isNaN(r)) return '—';
  const sign = r > 0 ? '+' : '';
  return `${sign}${r.toFixed(2)}R`;
}

function formatDateTime(v: number | string | null | undefined, tz: string): string {
  if (!v) return '—';
  const d = typeof v === 'number' ? new Date(v) : new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      timeZone: tz
    });
  } catch (e) {
    // Unknown/invalid zone string slipped through — fall back to UTC
    // rather than letting the whole email render throw.
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      timeZone: 'UTC'
    });
  }
}

// journal_notification_prefs.timezone mirrors the #pf-timezone picker on
// the Profile page and the notification-settings picker on the Signals
// page: either a real IANA zone, or the sentinel 'exchange' meaning "the
// visitor's own device timezone" (resolved client-side, per
// core-utils-ai.js's getUserTz()). There's no device to resolve that
// against here — this runs server-side, once, for every recipient of a
// given email — so 'exchange' (and null/unset) fall back to the same
// default the rest of the app uses when nothing's been chosen yet:
// Africa/Lagos (see profile.js: `d.timezone || 'Africa/Lagos'`).
function resolveTimeZone(raw: string | null | undefined): string {
  if (!raw || raw === 'exchange') return 'Africa/Lagos';
  return raw;
}

function shortId(id: string): string {
  return id ? id.slice(0, 8).toUpperCase() : '—';
}

// ──────────────────────────────────────────────────────────────
// 4. PERSONALIZATION
// ──────────────────────────────────────────────────────────────

// journal_notification_prefs only stores owner_id + contact info, not a
// display name — so "Hi John," has to come from Supabase Auth itself. The
// service-role client can call the Admin API (getUserById), which reads
// user_metadata.full_name / name if the person set one during signup or in
// their profile, without needing a separate `profiles` table.
//
// Wrapped so a single bad/missing user id degrades to a generic greeting
// instead of failing the whole notification job — this runs inside
// Promise.allSettled per-recipient, so one bad id must never take other
// recipients' emails down with it.
async function resolveDisplayName(client: SupabaseClient, ownerId: string | null, emailFallback?: string | null): Promise<string | null> {
  if (ownerId) {
    try {
      const { data, error } = await client.auth.admin.getUserById(ownerId);
      if (!error && data?.user) {
        const meta = data.user.user_metadata || {};
        const name = (meta.full_name || meta.name || meta.first_name || '').toString().trim();
        if (name) return name.split(/\s+/)[0]; // first name reads more natural in a greeting
      }
    } catch (e) {
      console.error('resolveDisplayName: admin lookup failed, falling back:', e);
    }
  }
  // Fall back to the local part of the email ("john.doe@x.com" -> "John.doe")
  // rather than a bare "Hi," which looks broken/unfinished in a fintech product.
  if (emailFallback) {
    const local = emailFallback.split('@')[0];
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// 5. PER-EVENT THEME TABLE
// ──────────────────────────────────────────────────────────────

interface KindTheme {
  label: string;                  // badge text, top of email
  accent: string;                 // primary accent color (light mode)
  accentBg: string;                // soft badge background (light mode)
  accentDark: string;               // accent on dark-mode background
  accentBgDark: string;
  subjectEmoji: string;            // single emoji used in the subject line only
  headline: (s: SignalRow) => string;
}

// Every visual difference between the ~10 email variants (New Signal, TP
// Hit, SL Hit, Cancelled, ...) flows from this one table, so adding an
// 11th event later is a one-line addition here instead of a new template.
const KIND_THEME: Record<EmailKind, KindTheme> = {
  published: {
    label: 'New Signal', accent: '#2563eb', accentBg: '#eff6ff', accentDark: '#60a5fa', accentBgDark: '#1e293b',
    subjectEmoji: '', headline: (s) => `New ${s.direction === 'buy' ? 'Buy' : 'Sell'} Signal`
  },
  edited: {
    label: 'Signal Updated', accent: '#7c3aed', accentBg: '#f5f3ff', accentDark: '#a78bfa', accentBgDark: '#241e35',
    subjectEmoji: '', headline: () => 'Signal Details Updated'
  },
  tp1_hit: {
    label: 'Take Profit 1 Hit', accent: '#059669', accentBg: '#ecfdf5', accentDark: '#34d399', accentBgDark: '#0f2a20',
    subjectEmoji: '✅', headline: () => 'Take Profit 1 Hit'
  },
  tp2_hit: {
    label: 'Take Profit 2 Hit', accent: '#059669', accentBg: '#ecfdf5', accentDark: '#34d399', accentBgDark: '#0f2a20',
    subjectEmoji: '✅', headline: () => 'Take Profit 2 Hit'
  },
  stopped_out: {
    label: 'Stop Loss Hit', accent: '#dc2626', accentBg: '#fef2f2', accentDark: '#f87171', accentBgDark: '#2a1414',
    subjectEmoji: '⚠️', headline: () => 'Stop Loss Hit'
  },
  closed: {
    label: 'Trade Closed', accent: '#0f172a', accentBg: '#f1f5f9', accentDark: '#cbd5e1', accentBgDark: '#1a2030',
    subjectEmoji: '📈', headline: (s) => `Trade Closed${s.result === 'loss' ? '' : s.result === 'win' ? ' — Winner' : ''}`
  },
  cancelled: {
    label: 'Signal Cancelled', accent: '#6b7280', accentBg: '#f9fafb', accentDark: '#9ca3af', accentBgDark: '#1c2027',
    subjectEmoji: '', headline: () => 'Signal Cancelled'
  },
  partial: {
    label: 'Partial Close', accent: '#0891b2', accentBg: '#ecfeff', accentDark: '#22d3ee', accentBgDark: '#0e2730',
    subjectEmoji: '', headline: () => 'Partial Position Closed'
  },
  breakeven: {
    label: 'Breakeven Activated', accent: '#2563eb', accentBg: '#eff6ff', accentDark: '#60a5fa', accentBgDark: '#1e293b',
    subjectEmoji: '🔒', headline: () => 'Stop Moved to Breakeven'
  },
  expired: {
    label: 'Signal Expired', accent: '#6b7280', accentBg: '#f9fafb', accentDark: '#9ca3af', accentBgDark: '#1c2027',
    subjectEmoji: '', headline: () => 'Signal Expired'
  },
  update: {
    label: 'Trade Update', accent: '#334155', accentBg: '#f1f5f9', accentDark: '#94a3b8', accentBgDark: '#1a2030',
    subjectEmoji: '', headline: () => 'Trade Update'
  }
};

// Deliverability note: at most ONE emoji, no ALL-CAPS words other than the
// direction (BUY/SELL — domain terminology, not shouting), no exclamation
// marks, no "urgent"/"act now"/"free" language. Kept short so subjects
// don't truncate on mobile inbox lists.
function buildSubject(kind: EmailKind, signal: SignalRow): string {
  const theme = KIND_THEME[kind];
  const emoji = theme.subjectEmoji ? `${theme.subjectEmoji} ` : '';
  const dir = signal.direction === 'buy' ? 'BUY' : 'SELL';
  switch (kind) {
    case 'published': return `${emoji}New ${signal.pair} ${dir} Signal`;
    case 'edited': return `${signal.pair} ${dir} Signal Updated`;
    case 'tp1_hit': return `${emoji}TP1 Hit • ${signal.pair}`;
    case 'tp2_hit': return `${emoji}TP2 Hit • ${signal.pair}`;
    case 'stopped_out': return `${emoji}Stop Loss Hit • ${signal.pair}`;
    case 'closed': return `${emoji}Trade Closed ${formatSignedR(signal.r_multiple)} • ${signal.pair}`;
    case 'cancelled': return `Signal Cancelled • ${signal.pair}`;
    case 'partial': return `Partial Close • ${signal.pair}`;
    case 'breakeven': return `${emoji}Breakeven Activated • ${signal.pair}`;
    case 'expired': return `Signal Expired • ${signal.pair}`;
    default: return `Trade Update • ${signal.pair}`;
  }
}

// ──────────────────────────────────────────────────────────────
// 6. SMALL HTML BUILDING BLOCKS
// ──────────────────────────────────────────────────────────────
//
// Plain table/HTML fragments with inline styles (Outlook's rendering
// engine is Word's, which ignores most CSS positioning/flex/grid — tables
// are still the only universally reliable layout primitive in email).
// Dark mode is handled by a small set of *static* class hooks
// (bg-page/bg-card/text-heading/text-body/text-muted/border-t/badge)
// defined once in the shell CSS below, plus one dynamic class
// (kind-badge) whose dark-mode color is injected per-email because it
// depends on which of the ~10 event colors this email is.

function escapeHtml(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function kindBadge(label: string, accent: string, accentBg: string): string {
  return `<span class="kind-badge" style="display:inline-block;padding:4px 12px;border-radius:999px;background:${accentBg};color:${accent};font-size:11.5px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(label)}</span>`;
}

function directionBadge(direction: 'buy' | 'sell'): string {
  const isBuy = direction === 'buy';
  const fg = isBuy ? '#059669' : '#dc2626';
  const bg = isBuy ? '#ecfdf5' : '#fef2f2';
  return `<span style="display:inline-block;padding:5px 14px;border-radius:8px;background:${bg};color:${fg};font-size:14px;font-weight:800;letter-spacing:0.4px;">${isBuy ? 'BUY' : 'SELL'}</span>`;
}

// A single labeled stat inside the signal summary card (Entry / SL / TP1 /
// RR / etc). Two-column table row so it stays aligned in Outlook.
function statRow(label: string, value: string, valueColor?: string): string {
  return `
    <tr>
      <td class="text-muted" style="padding:7px 0;color:#9ca3af;font-size:12.5px;">${escapeHtml(label)}</td>
      <td class="text-heading" style="padding:7px 0;color:#111827;font-size:13.5px;font-weight:600;text-align:right;${valueColor ? `color:${valueColor};` : ''}">${escapeHtml(value)}</td>
    </tr>`;
}

// Bulletproof-ish button pattern: a real <a> styled as a block with
// padding, no background-image tricks, so it survives Outlook's Word
// engine without needing VML.
function button(href: string, label: string, variant: 'primary' | 'secondary' | 'tertiary'): string {
  const styles = {
    primary: 'background:#3b82f6;color:#ffffff;border:1px solid #3b82f6;',
    secondary: 'background:#ffffff;color:#111827;border:1px solid #d1d5db;',
    tertiary: 'background:transparent;color:#6b7280;border:1px solid transparent;'
  }[variant];
  return `<a href="${escapeHtml(href)}" style="display:inline-block;${styles}text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px;margin:0 6px 8px 0;">${escapeHtml(label)}</a>`;
}

function calloutBox(text: string, tone: 'success' | 'warning' | 'neutral'): string {
  const palette = {
    success: { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' },
    warning: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
    neutral: { bg: '#f8fafc', fg: '#334155', border: '#e2e8f0' }
  }[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${palette.bg};border:1px solid ${palette.border};border-radius:8px;padding:12px 14px;color:${palette.fg};font-size:13px;line-height:1.5;">${text}</td></tr></table>`;
}

// Invisible-but-indexed preheader text: this is what shows next to the
// subject line in the inbox list (Gmail/Apple Mail/Outlook all read it).
// Padded with zero-width spaces so clients that DO render a snippet of
// body text don't run the preheader straight into the visible heading
// with no separation.
function preheader(text: string): string {
  const pad = '&#8203;'.repeat(40);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${escapeHtml(text)}${pad}</div>`;
}

function buildCalloutForKind(ctx: EmailContext): string | null {
  const { kind, signal } = ctx;
  switch (kind) {
    case 'tp1_hit':
    case 'tp2_hit':
      return calloutBox(`Target reached. Running result so far: <strong>${escapeHtml(formatSignedR(signal.r_multiple))}</strong>${signal.pips != null ? ` (${escapeHtml(String(signal.pips))} pips)` : ''}.`, 'success');
    case 'stopped_out':
      return calloutBox(`Stop loss was hit. Result: <strong>${escapeHtml(formatSignedR(signal.r_multiple))}</strong>. Risk was capped as planned.`, 'warning');
    case 'closed': {
      const tone = signal.result === 'loss' ? 'warning' : signal.result === 'breakeven' ? 'neutral' : 'success';
      return calloutBox(`Final result: <strong>${escapeHtml(formatSignedR(signal.r_multiple))}</strong>${signal.profit_percent != null ? ` (${escapeHtml(String(signal.profit_percent))}%)` : ''}.`, tone);
    }
    case 'breakeven':
      return calloutBox('Stop loss has been moved to entry. This position can no longer close at a loss.', 'neutral');
    case 'cancelled':
      return calloutBox('This signal was cancelled before it was triggered. No position was entered.', 'neutral');
    case 'partial':
      return calloutBox('A portion of this position was closed. Remaining size is still open and being managed.', 'neutral');
    case 'expired':
      return calloutBox('This pending order expired before price reached the entry level.', 'neutral');
    default:
      return null;
  }
}

function buildSummaryCard(signal: SignalRow, timezone: string): string {
  const rows = [
    statRow('Entry', formatPrice(signal.entry)),
    statRow('Stop Loss', formatPrice(signal.stop_loss), '#dc2626'),
    statRow('Take Profit 1', formatPrice(signal.tp1), '#059669'),
    signal.tp2 != null ? statRow('Take Profit 2', formatPrice(signal.tp2), '#059669') : '',
    statRow('Risk / Reward', formatRR(signal.risk_reward)),
    statRow('Session', signal.session ? (SESSION_LABEL[signal.session] || signal.session) : '—'),
    statRow('Status', STATUS_LABEL[signal.status] || signal.status),
    statRow('Published', formatDateTime(signal.published_at, timezone)),
    statRow('Last Updated', formatDateTime(signal.updated_at, timezone)),
    statRow('Signal ID', shortId(signal.id))
  ].join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
    <tr><td style="padding:6px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${rows}
      </table>
    </td></tr>
  </table>`;
}

// ──────────────────────────────────────────────────────────────
// 7. EMAIL SHELL (header / dark-mode CSS / footer)
// ──────────────────────────────────────────────────────────────

// Static CSS shared by every email, independent of which of the ~10 event
// colors is in play. Colors are set twice on purpose: once as the
// light-mode default (plain inline styles — what every client renders if
// it ignores the <style> block entirely), and once again inside the
// dark-mode media query with !important (Apple/iOS/macOS Mail,
// Outlook.com, Yahoo). [data-ogsc] repeats the same overrides for
// Outlook.com/Windows Mail, which use that attribute hook instead of the
// media query.
function staticDarkModeCss(theme: KindTheme): string {
  return `
<style>
  .logo-dark { display: none; }
  @media (prefers-color-scheme: dark) {
    .bg-page { background: #0b0e14 !important; }
    .bg-card { background: #12151d !important; border-color: #232733 !important; }
    .text-heading { color: #f9fafb !important; }
    .text-body { color: #9ca3af !important; }
    .text-muted, .text-muted a { color: #6b7280 !important; }
    .border-t { border-color: #232733 !important; }
    .badge { background: #1e293b !important; color: #93c5fd !important; }
    .kind-badge { background: ${theme.accentBgDark} !important; color: ${theme.accentDark} !important; }
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
  [data-ogsc] .kind-badge { background: ${theme.accentBgDark} !important; color: ${theme.accentDark} !important; }
  [data-ogsc] .logo-light { display: none !important; }
  [data-ogsc] .logo-dark { display: inline-block !important; }
</style>`;
}

function renderEmailShell(theme: KindTheme, preheaderText: string, bodyContentHtml: string): string {
  const settingsUrl = `${APP_URL}/signals?notif-settings=1`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
${staticDarkModeCss(theme)}
</head>
<body class="bg-page" style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
${preheader(preheaderText)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" class="bg-card" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">

        <!-- Header -->
        <tr><td class="border-t" style="padding:20px 28px;border-bottom:1px solid #e5e7eb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="left">
              <img src="${LOGO_LIGHT_URL}" width="128" alt="NxTGen Trading Journal" class="logo-light" style="display:inline-block;height:auto;max-width:128px;border:0;outline:none;vertical-align:middle;">
              <img src="${LOGO_DARK_URL}" width="128" alt="NxTGen Trading Journal" class="logo-dark" style="display:none;height:auto;max-width:128px;border:0;outline:none;vertical-align:middle;">
              <div class="text-muted" style="margin-top:3px;color:#9ca3af;font-size:11px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">Professional Trading Signals</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Per-event content -->
        ${bodyContentHtml}

        <!-- Footer -->
        <tr><td class="border-t" style="padding:22px 28px 26px;border-top:1px solid #e5e7eb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>
            <span class="text-muted" style="color:#9ca3af;font-size:11.5px;line-height:1.7;">
              You're receiving this because email alerts are turned on in your
              <a href="${settingsUrl}" class="text-muted" style="color:#9ca3af;text-decoration:underline;">NxTGen notification settings</a>.
            </span>
          </td></tr>
          <tr><td style="padding-top:12px;">
            <span class="text-muted" style="color:#9ca3af;font-size:11.5px;">
              <a href="${MARKETING_URL}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Website</a>
              &nbsp;·&nbsp;<a href="mailto:${SUPPORT_EMAIL}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Support</a>
              &nbsp;·&nbsp;<a href="${SOCIAL_LINKS.x}" class="text-muted" style="color:#9ca3af;text-decoration:none;">X</a>
              &nbsp;·&nbsp;<a href="${SOCIAL_LINKS.instagram}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Instagram</a>
              &nbsp;·&nbsp;<a href="${SOCIAL_LINKS.discord}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Discord</a>
            </span>
          </td></tr>
          <tr><td style="padding-top:10px;">
            <span class="text-muted" style="color:#9ca3af;font-size:11px;">
              <a href="${LEGAL_LINKS.terms}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Terms</a>
              &nbsp;·&nbsp;<a href="${LEGAL_LINKS.privacy}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Privacy</a>
              &nbsp;·&nbsp;<a href="${settingsUrl}" class="text-muted" style="color:#9ca3af;text-decoration:none;">Notification preferences</a>
              &nbsp;·&nbsp;<a href="mailto:${UNSUB_MAILTO}?subject=Unsubscribe" class="text-muted" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a>
            </span>
          </td></tr>
          <tr><td style="padding-top:14px;">
            <span class="text-muted" style="color:#c1c5cd;font-size:10.5px;">© ${new Date().getFullYear()} NxTGen Trading Journal. All rights reserved.</span>
          </td></tr>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ──────────────────────────────────────────────────────────────
// 8. EMAIL COMPOSITION
// ──────────────────────────────────────────────────────────────

function renderEmail(ctx: EmailContext): RenderedEmail {
  const { kind, signal, message, recipientName, timezone } = ctx;
  const theme = KIND_THEME[kind];
  const subject = buildSubject(kind, signal);
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi there,';
  const viewUrl = `${APP_URL}/signals?signal=${signal.id}`;
  const dashboardUrl = `${APP_URL}/signals`;
  const settingsUrl = `${APP_URL}/signals?notif-settings=1`;
  const callout = buildCalloutForKind(ctx);

  const bodyContentHtml = `
        <tr><td style="padding:26px 28px 4px;">
          ${kindBadge(theme.label, theme.accent, theme.accentBg)}
        </td></tr>
        <tr><td style="padding:12px 28px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td class="text-heading" style="color:#111827;font-size:26px;font-weight:800;letter-spacing:-0.3px;">${escapeHtml(signal.pair)}</td>
            <td style="padding-left:10px;">${directionBadge(signal.direction)}</td>
          </tr></table>
          <div class="text-muted" style="margin-top:4px;color:#6b7280;font-size:13.5px;font-weight:600;">${escapeHtml(theme.headline(signal))}</div>
        </td></tr>
        <tr><td class="text-body" style="padding:14px 28px 0;color:#374151;font-size:14px;line-height:1.6;">
          ${greeting} ${escapeHtml(message || theme.headline(signal))}
        </td></tr>
        ${callout ? `<tr><td style="padding:16px 28px 0;">${callout}</td></tr>` : ''}
        <tr><td style="padding:18px 28px 0;">
          <div class="text-muted" style="margin-bottom:8px;color:#9ca3af;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">Signal Summary</div>
          ${buildSummaryCard(signal, timezone)}
        </td></tr>
        <tr><td style="padding:22px 28px 6px;">
          ${button(viewUrl, 'View Signal', 'primary')}
          ${button(dashboardUrl, 'Open Dashboard', 'secondary')}
          ${button(settingsUrl, 'Manage Notifications', 'tertiary')}
        </td></tr>
        <tr><td style="padding:14px 28px 0;">
          <div class="border-t" style="border-top:1px solid #f1f5f9;font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>`;

  const html = renderEmailShell(theme, message || theme.headline(signal), bodyContentHtml);
  const text = buildPlainText(ctx, subject, viewUrl, settingsUrl);
  return { subject, html, text };
}

function buildPlainText(ctx: EmailContext, subject: string, viewUrl: string, settingsUrl: string): string {
  const { signal, message, recipientName } = ctx;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';
  const lines = [
    subject,
    '',
    `${greeting} ${message || ''}`.trim(),
    '',
    `${signal.pair} — ${signal.direction.toUpperCase()}`,
    `Entry: ${formatPrice(signal.entry)}`,
    `Stop Loss: ${formatPrice(signal.stop_loss)}`,
    `Take Profit 1: ${formatPrice(signal.tp1)}`,
    signal.tp2 != null ? `Take Profit 2: ${formatPrice(signal.tp2)}` : '',
    `Risk/Reward: ${formatRR(signal.risk_reward)}`,
    `Session: ${signal.session ? (SESSION_LABEL[signal.session] || signal.session) : '—'}`,
    `Status: ${STATUS_LABEL[signal.status] || signal.status}`,
    `Signal ID: ${shortId(signal.id)}`,
    '',
    `View signal: ${viewUrl}`,
    '',
    '—',
    "You're getting this because email alerts are on in your NxTGen Notification Settings.",
    `Manage preferences: ${settingsUrl}`,
    `Unsubscribe: mailto:${UNSUB_MAILTO}?subject=Unsubscribe`
  ].filter(Boolean);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────
// 9. PROVIDER SENDERS
// ──────────────────────────────────────────────────────────────

async function sendPush(subscription: unknown, title: string, body: string, signalId: string): Promise<void> {
  if (!_vapidReady) return;
  await webpush.sendNotification(
    subscription as never,
    JSON.stringify({ title, body, data: { signal_id: signalId } })
  );
}

async function sendWhatsApp(to: string, body: string): Promise<void> {
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

async function sendEmailViaResend(to: string, email: RenderedEmail, settingsUrl: string): Promise<void> {
  if (!RESEND_API_KEY) return; // not configured yet — skip silently, same as push/WhatsApp do when unconfigured
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${RESEND_FROM_NAME} <${RESEND_FROM_ADDRESS}>`,
      // Reply-To goes to a monitored support inbox, never a noreply@ — a
      // noreply address is itself a spam signal to Gmail/Outlook, and it
      // means a genuinely confused recipient has no way to reach a human.
      reply_to: `NxTGen Support <${SUPPORT_EMAIL}>`,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      // List-Unsubscribe is one of the strongest signals inbox providers
      // use to separate legitimate bulk-ish mail from spam — it's what
      // puts the native "Unsubscribe" pill next to the sender name in
      // Gmail/Outlook instead of the recipient hitting "Report spam".
      // List-Unsubscribe-Post is required *alongside* it for Gmail/Yahoo's
      // one-click unsubscribe rules (Feb 2024 bulk-sender requirements) —
      // without it, List-Unsubscribe alone no longer counts as compliant.
      headers: {
        'List-Unsubscribe': `<mailto:${UNSUB_MAILTO}?subject=Unsubscribe>, <${settingsUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    })
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

// ──────────────────────────────────────────────────────────────
// 10. DENO.SERVE HANDLER — orchestration only
// ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  try {
    const body = (await req.json()) as NotifyRequestBody;
    if (!body.signal_id) {
      return new Response(JSON.stringify({ ok: false, error: 'signal_id is required' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // Re-fetch the signal server-side instead of trusting the browser's
    // payload — the browser is not a security boundary, and this is also
    // what lets the email show entry/SL/TP/RR even though the client only
    // sends {signal_id, pair, direction, event_type, message}.
    const signal = (await fetchSignal(body.signal_id)) ?? signalFromPayload(body);
    const kind = resolveEmailKind(body.event_type, signal.status);
    const fallbackMessage = body.message || '';
    const settingsUrl = `${APP_URL}/signals?notif-settings=1`;

    // Every user who has opted into at least one channel — these are the
    // only non-admin recipients. Nobody else (no opt-in on the signals
    // page's notification settings) gets notified at all, bell included.
    const { data: subs, error } = await sb
      .from('journal_notification_prefs')
      .select('*')
      .or('push_enabled.eq.true,email_enabled.eq.true,whatsapp_enabled.eq.true');
    if (error) throw error;

    // ── In-app bell feed — one row per recipient ────────────────────
    // Recipients are exactly: the admin (always, for their own action)
    // plus every user in `subs` above (opted into push/email/WhatsApp).
    // This used to also rely on signals.js's client-side _sigNotify() to
    // log the admin's own bell row — that call has been removed (see
    // signals.js) so this edge function is now the single writer and the
    // admin can't end up with two rows for the same event. Requires the
    // recipient_id column from fix-drafts-and-notifications.sql.
    const bellRecipientIds = new Set<string>([ADMIN_OWNER_ID]);
    (subs as NotificationPrefRow[] | null)?.forEach((s) => bellRecipientIds.add(s.owner_id));

    if (bellRecipientIds.size) {
      const bellMessage = fallbackMessage
        || (kind === 'published' ? `New signal: ${signal.pair}` : `${signal.pair} signal update`);
      const bellRows = Array.from(bellRecipientIds).map((recipientId) => ({
        signal_id: signal.id,
        owner_id: ADMIN_OWNER_ID, // every notify-triggering event is an admin action
        recipient_id: recipientId,
        type: kind,
        message: bellMessage,
        read: false
      }));
      const { error: bellErr } = await sb.from('journal_signal_notifications').insert(bellRows);
      // A bell-feed failure shouldn't take down push/email/WhatsApp sending
      // below — log it and keep going.
      if (bellErr) console.error('bell fan-out insert failed:', bellErr);
    }

    const results = await Promise.allSettled((subs ?? []).flatMap((s: NotificationPrefRow) => {
      const jobs: Promise<unknown>[] = [];

      if (s.push_enabled && s.push_subscription) {
        const pushTitle = kind === 'published' ? `New signal: ${signal.pair}` : `${signal.pair} signal update`;
        jobs.push(sendPush(s.push_subscription, pushTitle, fallbackMessage || pushTitle, signal.id));
      }

      if (s.email_enabled && s.email && RESEND_API_KEY) {
        jobs.push((async () => {
          const recipientName = await resolveDisplayName(sb, s.owner_id, s.email);
          const timezone = resolveTimeZone(s.timezone);
          const rendered = renderEmail({ kind, signal, message: fallbackMessage, recipientName, timezone });
          await sendEmailViaResend(s.email as string, rendered, settingsUrl);
        })());
      }

      if (s.whatsapp_enabled && s.whatsapp_number) {
        const waTitle = kind === 'published' ? `New signal: ${signal.pair}` : `${signal.pair} signal update`;
        jobs.push(sendWhatsApp(s.whatsapp_number, `${waTitle}\n${fallbackMessage}`));
      }

      return jobs;
    }));

    const failed = results.filter((r) => r.status === 'rejected').length;
    // Log individual failures — Promise.allSettled swallows them otherwise,
    // and "1 failed" alone doesn't tell you whether it was push, email, or
    // WhatsApp that broke.
    results.forEach((r) => { if (r.status === 'rejected') console.error('notify job failed:', r.reason); });

    return new Response(JSON.stringify({ ok: true, kind, sent: results.length - failed, failed }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('notify-subscribers error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
