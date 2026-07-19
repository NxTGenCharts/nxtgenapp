// ═══════════════════════════════════════════════════════════════════
//  NxTGen Calendar Proxy — Supabase Edge Function
//  Fetches Forex Factory calendar data server-side (no CORS issues)
//  and returns normalised JSON events filtered to the requested week.
//
//  Deploy: supabase functions deploy cal-proxy --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Impact label mapping from FF integer codes
const IMPACT_MAP: Record<string, string> = {
  '0': 'holiday', '1': 'low', '2': 'med', '3': 'high', '4': 'high',
  'low': 'low', 'medium': 'med', 'med': 'med', 'high': 'high',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { startDate, endDate } = await req.json();
    if (!startDate) {
      return json({ error: 'startDate required' }, 400);
    }

    const wkStart = new Date(startDate + 'T00:00:00Z');
    const wkEnd   = new Date((endDate || startDate) + 'T23:59:59Z');

    // Build the FF calendar week URL param: may26.2026
    const d   = new Date(startDate + 'T00:00:00Z');
    const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
    const day = d.getUTCDate();
    const yr  = d.getUTCFullYear();
    const weekParam = `${mon}${day}.${yr}`;

    let events: any[] = [];

    // ── Source 1: Fair Economy JSON mirror (fast, structured) ──
    const feUrls = [
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
    ];

    for (const url of feUrls) {
      try {
        const res  = await fetch(url, { headers: { 'User-Agent': 'NxTGen-Journal/1.0' } });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data)) continue;
        const filtered = data.filter((e: any) => {
          if (!e.date) return false;
          const ed = new Date(e.date);
          return ed >= wkStart && ed <= wkEnd;
        });
        if (filtered.length > 0) { events = filtered; break; }
      } catch (_) { continue; }
    }

    // ── Source 2: Scrape FF calendar page for the exact week ──
    if (!events.length) {
      try {
        const ffUrl  = `https://www.forexfactory.com/calendar?week=${weekParam}`;
        const res    = await fetch(ffUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (res.ok) {
          const html   = await res.text();
          // Parse table rows from FF HTML
          // Row pattern: <tr class="calendar_row ...">
          const rows   = html.matchAll(/<tr[^>]+class="[^"]*calendar_row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g);
          let   curDate = startDate;

          for (const row of rows) {
            const cells = row[1];

            // Date cell
            const dateMatch = cells.match(/class="[^"]*date[^"]*"[^>]*>\s*<[^>]+>\s*([A-Z][a-z]+\s+\d+)/);
            if (dateMatch) {
              const raw = dateMatch[1].trim(); // e.g. "May 27"
              // Reconstruct full date using the year from startDate
              const parsed = new Date(`${raw} ${yr}`);
              if (!isNaN(parsed.getTime())) {
                curDate = parsed.toISOString().slice(0, 10);
              }
            }

            // Time cell
            const timeMatch  = cells.match(/class="[^"]*time[^"]*"[^>]*>\s*([^<]*)/);
            const timeRaw    = (timeMatch?.[1] || '').trim().replace(/\s+/g, ' ');

            // Currency cell
            const curMatch   = cells.match(/class="[^"]*currency[^"]*"[^>]*>\s*([A-Z]{3})/);
            const currency   = curMatch?.[1] || '';

            // Impact cell — look for ff-icon-impact-* or impact flag
            const impactMatch = cells.match(/impact-([a-z]+)/);
            const impactRaw   = impactMatch?.[1] || 'low';
            const impact      = IMPACT_MAP[impactRaw] || 'low';

            // Event title
            const titleMatch = cells.match(/class="[^"]*event[^"]*"[^>]*>\s*<[^>]+>\s*([^<]+)/);
            const title      = (titleMatch?.[1] || '').trim();

            // Forecast / Previous / Actual
            const forecastMatch = cells.match(/class="[^"]*forecast[^"]*"[^>]*>\s*([^<]*)/);
            const previousMatch = cells.match(/class="[^"]*previous[^"]*"[^>]*>\s*([^<]*)/);
            const actualMatch   = cells.match(/class="[^"]*actual[^"]*"[^>]*>\s*([^<]*)/);

            if (!currency || !title) continue;
            if (impact === 'holiday') continue;

            // Build ISO date string
            let isoDate = curDate;
            if (timeRaw && timeRaw !== 'All Day' && timeRaw !== 'Tentative') {
              const timeParsed = parseFFTime(timeRaw, curDate);
              if (timeParsed) isoDate = timeParsed;
            }

            const ed = new Date(isoDate);
            if (ed < wkStart || ed > wkEnd) continue;

            events.push({
              title:    title,
              country:  currency,
              date:     isoDate,
              impact:   impact,
              forecast: (forecastMatch?.[1] || '').trim(),
              previous: (previousMatch?.[1] || '').trim(),
              actual:   (actualMatch?.[1]   || '').trim(),
            });
          }
        }
      } catch (_) { /* ignore scrape errors */ }
    }

    // Final normalise
    const normalised = events
      .filter(e => e.title && e.country && e.date)
      .map(e => ({
        title:    e.title,
        country:  (e.country || '').toUpperCase(),
        date:     e.date,
        impact:   (e.impact  || 'low').toLowerCase(),
        forecast: e.forecast || '',
        previous: e.previous || '',
        actual:   e.actual   || '',
      }));

    return json(normalised, 200);

  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Parse FF time strings like "8:30am" into ISO datetime
function parseFFTime(timeStr: string, dateStr: string): string | null {
  try {
    const m = timeStr.match(/(\d+):(\d+)(am|pm)/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ampm = m[3].toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00Z`;
  } catch (_) { return null; }
}
