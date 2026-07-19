/**
 * NxTGen — MT5 Sync Edge Function (MetaApi Edition)
 * ===================================================
 *
 * No EA. No laptop. Uses MetaApi cloud to connect directly
 * to the broker's MT5 server with the user's credentials.
 *
 * Endpoints:
 *
 *  POST /mt5-sync/connect
 *    Body: { token, accountName, login, password, server }
 *    → Provisions a MetaApi account, returns metaApiAccountId
 *
 *  POST /mt5-sync/sync
 *    Body: { token, accountName, metaApiAccountId }
 *    → Fetches latest trades from MetaApi, stores in buffer
 *
 *  GET  /mt5-sync?token=&account=
 *    → Returns buffered trades (permanent history)
 *
 *  DELETE /mt5-sync/disconnect
 *    Body: { token, accountName, metaApiAccountId }
 *    → Removes MetaApi account, cleans up buffer
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-mt5-token, x-mt5-account, apikey",
};

// MetaApi base URLs
const META_API_URL    = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const META_CLIENT_URL = "https://mt-client-api-v1.london.agiliumtrade.ai";

function makeAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function metaApiHeaders() {
  const token = Deno.env.get("META_API_TOKEN");
  if (!token) throw new Error("Missing META_API_TOKEN env var");
  return {
    "auth-token": token,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const url  = new URL(req.url);
    const path = url.pathname.split("/").pop(); // last segment

    if (req.method === "POST" && path === "connect")    return await handleConnect(req);
    if (req.method === "POST" && path === "sync")       return await handleSync(req);
    if (req.method === "GET")                           return await handleGet(req);
    if (req.method === "DELETE" && path === "disconnect") return await handleDisconnect(req);

    return jsonError("Not found", 404);
  } catch (err) {
    console.error("[mt5-sync] CRASH:", String(err));
    return jsonError("Internal error: " + String(err), 500);
  }
});

// ── CONNECT: provision MetaApi account ───────────────────────────────────────
async function handleConnect(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { token, accountName, login, password, server } = body;

  if (!token || !accountName || !login || !password || !server) {
    return jsonError("Missing required fields: token, accountName, login, password, server", 400);
  }

  // Verify JWT
  const user = await verifyJWT(req);
  if (!user) return jsonError("Unauthorized", 401);

  const admin = makeAdmin();

  // Confirm this user owns the token+account
  const owns = await verifyOwnership(admin, token, accountName, user.id);
  if (!owns) return jsonError("Token does not belong to your account", 403);

  // Check if MetaApi account already exists for this token
  const { data: accData } = await admin
    .from("journal_account_data")
    .select("accounts")
    .eq("user_id", user.id)
    .single();

  const accounts = accData?.accounts ?? [];
  const acc = accounts.find((a: AccObj) => a?.mt5?.webhookToken === token);
  const existingMetaId = acc?.mt5?.metaApiAccountId;

  // If already provisioned, just return it
  if (existingMetaId) {
    console.log(`[mt5-sync] account already provisioned: ${existingMetaId}`);
    return json({ ok: true, metaApiAccountId: existingMetaId, status: "existing" });
  }

  // Provision new MetaApi account
  console.log(`[mt5-sync] provisioning MetaApi account for login=${login} server=${server}`);

  const provResp = await fetch(`${META_API_URL}/users/current/accounts`, {
    method: "POST",
    headers: metaApiHeaders(),
    body: JSON.stringify({
      login:       String(login),
      password:    String(password),
      name:        accountName.slice(0, 64),
      server:      String(server),
      platform:    "mt5",
      type:        "cloud",
      application: "MetaApi",
      magic:       0,
      reliability: "regular",
    }),
  });

  const provData = await provResp.json();
  console.log(`[mt5-sync] MetaApi provision response ${provResp.status}:`, JSON.stringify(provData));

  if (!provResp.ok) {
    const msg = provData?.message || provData?.error || "MetaApi provisioning failed";
    return jsonError(msg, 502);
  }

  const metaApiAccountId = provData.id;
  if (!metaApiAccountId) return jsonError("MetaApi did not return account ID", 502);

  // Persist metaApiAccountId into the account's mt5 config
  const updatedAccounts = accounts.map((a: AccObj) => {
    if (a?.mt5?.webhookToken !== token) return a;
    return { ...a, mt5: { ...a.mt5, metaApiAccountId, metaApiStatus: "provisioned" } };
  });

  await admin.from("journal_account_data").upsert(
    { user_id: user.id, accounts: updatedAccounts },
    { onConflict: "user_id" }
  );

  return json({ ok: true, metaApiAccountId, status: "provisioned" });
}

// ── SYNC: fetch trades from MetaApi → buffer ─────────────────────────────────
async function handleSync(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { token, accountName, metaApiAccountId } = body;

  if (!token || !accountName || !metaApiAccountId) {
    return jsonError("Missing required fields", 400);
  }

  const user = await verifyJWT(req);
  if (!user) return jsonError("Unauthorized", 401);

  const admin = makeAdmin();
  const owns = await verifyOwnership(admin, token, accountName, user.id);
  if (!owns) return jsonError("Forbidden", 403);

  console.log(`[mt5-sync] syncing MetaApi account ${metaApiAccountId}`);

  // Fetch account state first
  // Wait for account to deploy (poll state up to 60s)
  let state = "DEPLOYING";
  let stateAttempts = 0;
  while (state !== "DEPLOYED" && state !== "ERROR" && stateAttempts < 6) {
    await new Promise(r => setTimeout(r, 10000)); // wait 10s between checks
    stateAttempts++;
    const stateResp = await fetch(
      `${META_API_URL}/users/current/accounts/${metaApiAccountId}`,
      { headers: metaApiHeaders() }
    );
    if (stateResp.ok) {
      const stateData = await stateResp.json();
      state = stateData.state || "DEPLOYING";
      console.log(`[mt5-sync] account state attempt ${stateAttempts}: ${state}`);
    }
  }

  if (state === "ERROR") {
    return jsonError("MetaApi failed to connect — check your login, password, and server name", 502);
  }

  // Fetch deal history (from epoch → now)
  const from = "1970-01-01T00:00:00.000Z";
  const to   = new Date().toISOString();

  const dealsResp = await fetch(
    `${META_CLIENT_URL}/users/current/accounts/${metaApiAccountId}/history-deals/time/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
    { headers: metaApiHeaders() }
  );

  let deals: MetaDeal[] = [];
  if (dealsResp.ok) {
    const raw = await dealsResp.json();
    deals = Array.isArray(raw) ? raw : (raw.deals ?? []);
    console.log(`[mt5-sync] fetched ${deals.length} deals from MetaApi`);
  } else {
    const err = await dealsResp.json().catch(() => ({}));
    console.warn(`[mt5-sync] deals fetch failed ${dealsResp.status}: ${err.message}`);
  }

  // Fetch open positions
  const posResp = await fetch(
    `${META_CLIENT_URL}/users/current/accounts/${metaApiAccountId}/positions`,
    { headers: metaApiHeaders() }
  );

  let positions: MetaPosition[] = [];
  if (posResp.ok) {
    const raw = await posResp.json();
    positions = Array.isArray(raw) ? raw : (raw.positions ?? []);
    console.log(`[mt5-sync] fetched ${positions.length} open positions`);
  }

  // Convert deals to trade rows (pair entry+exit by positionId)
  const rows = buildTradeRows(deals, positions, token, accountName);
  console.log(`[mt5-sync] built ${rows.length} trade rows`);

  if (rows.length > 0) {
    const { error } = await admin
      .from("mt5_trade_buffer")
      .upsert(rows, { onConflict: "token,ticket" });

    if (error) {
      console.error("[mt5-sync] upsert error:", error.message);
      return jsonError("DB write failed", 500);
    }
  }

  // Update last sync time
  const { data: accData } = await admin
    .from("journal_account_data")
    .select("accounts")
    .eq("user_id", user.id)
    .single();

  const updatedAccounts = (accData?.accounts ?? []).map((a: AccObj) => {
    if (a?.mt5?.webhookToken !== token) return a;
    return { ...a, mt5: { ...a.mt5, lastSync: new Date().toISOString(), lastSyncStatus: "ok" } };
  });

  await admin.from("journal_account_data").upsert(
    { user_id: user.id, accounts: updatedAccounts },
    { onConflict: "user_id" }
  );

  return json({ ok: true, synced: rows.length });
}

// ── GET: return full trade history buffer ─────────────────────────────────────
async function handleGet(req: Request): Promise<Response> {
  const url     = new URL(req.url);
  const token   = (url.searchParams.get("token")   || "").trim();
  const account = (url.searchParams.get("account") || "").trim();

  if (!token || !account) return jsonError("Missing token or account param", 400);

  const user = await verifyJWT(req);
  if (!user) return jsonError("Unauthorized", 401);

  const admin = makeAdmin();
  const owns = await verifyOwnership(admin, token, account, user.id);
  if (!owns) return jsonError("Forbidden", 403);

  const { data: rows, error } = await admin
    .from("mt5_trade_buffer")
    .select("*")
    .eq("token", token)
    .order("close_time", { ascending: false })
    .limit(500);

  if (error) return jsonError("DB read failed", 500);

  return json({ ok: true, trades: (rows ?? []).map(rowToTrade), account });
}

// ── DISCONNECT: remove MetaApi account + buffer ───────────────────────────────
async function handleDisconnect(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { token, accountName, metaApiAccountId } = body;

  const user = await verifyJWT(req);
  if (!user) return jsonError("Unauthorized", 401);

  const admin = makeAdmin();
  const owns = await verifyOwnership(admin, token, accountName, user.id);
  if (!owns) return jsonError("Forbidden", 403);

  // Delete MetaApi account
  if (metaApiAccountId) {
    const delResp = await fetch(
      `${META_CLIENT_URL}/users/current/accounts/${metaApiAccountId}`,
      { method: "DELETE", headers: metaApiHeaders() }
    );
    console.log(`[mt5-sync] MetaApi delete: ${delResp.status}`);
  }

  // Clear buffer
  await admin.from("mt5_trade_buffer").delete().eq("token", token);

  return json({ ok: true });
}

// ── Build trade rows from MetaApi deals ──────────────────────────────────────
interface MetaDeal {
  id: string;
  positionId: string;
  symbol: string;
  type: string;        // DEAL_TYPE_BUY, DEAL_TYPE_SELL
  entryType: string;   // DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_ENTRY_INOUT
  volume: number;
  price: number;
  profit: number;
  swap: number;
  commission: number;
  time: string;        // ISO string
  brokerTime?: string;
}

interface MetaPosition {
  id: string;
  symbol: string;
  type: string;        // POSITION_TYPE_BUY, POSITION_TYPE_SELL
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  swap: number;
  commission: number;
  time: string;
}

interface TradeRow {
  token: string; account: string; ticket: string; symbol: string;
  trade_type: string; lots: number; open_price: number; close_price: number;
  open_time: number; close_time: number; profit: number; swap: number;
  commission: number; status: string;
}

function buildTradeRows(
  deals: MetaDeal[],
  positions: MetaPosition[],
  token: string,
  account: string
): TradeRow[] {
  const rows: TradeRow[] = [];

  // Group deals by positionId
  const byPos: Record<string, MetaDeal[]> = {};
  for (const d of deals) {
    const pid = d.positionId || d.id;
    if (!byPos[pid]) byPos[pid] = [];
    byPos[pid].push(d);
  }

  for (const [, posDeals] of Object.entries(byPos)) {
    const entry = posDeals.find(d => d.entryType === "DEAL_ENTRY_IN");
    const exits = posDeals.filter(d => d.entryType === "DEAL_ENTRY_OUT");

    if (!exits.length) continue; // open position handled separately

    for (const exit of exits) {
      const dir       = entry?.type === "DEAL_TYPE_BUY" ? "buy" : "sell";
      const lots      = exit.volume || entry?.volume || 0;
      const openPx    = entry?.price || exit.price;
      const openTime  = entry  ? Math.floor(new Date(entry.time).getTime()  / 1000) : 0;
      const closeTime = Math.floor(new Date(exit.time).getTime() / 1000);
      const profit    = exit.profit    ?? 0;
      const swap      = exit.swap      ?? 0;
      const commission = (exit.commission ?? 0) + (entry?.commission ?? 0);

      rows.push({
        token, account,
        ticket:      exit.id,
        symbol:      (exit.symbol || entry?.symbol || "").toUpperCase(),
        trade_type:  dir,
        lots:        Number(lots.toFixed(2)),
        open_price:  openPx,
        close_price: exit.price,
        open_time:   openTime,
        close_time:  closeTime,
        profit, swap, commission,
        status: "closed",
      });
    }
  }

  // Open positions
  for (const pos of positions) {
    const dir = pos.type === "POSITION_TYPE_BUY" ? "buy" : "sell";
    rows.push({
      token, account,
      ticket:      pos.id,
      symbol:      (pos.symbol || "").toUpperCase(),
      trade_type:  dir,
      lots:        Number((pos.volume || 0).toFixed(2)),
      open_price:  pos.openPrice,
      close_price: pos.currentPrice,
      open_time:   Math.floor(new Date(pos.time).getTime() / 1000),
      close_time:  0,
      profit:      pos.profit    ?? 0,
      swap:        pos.swap      ?? 0,
      commission:  pos.commission ?? 0,
      status: "open",
    });
  }

  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
interface AccObj {
  name?: string;
  mt5?: { webhookToken?: string; metaApiAccountId?: string; [key: string]: unknown };
}

async function verifyJWT(req: Request): Promise<{ id: string } | null> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user }, error } = await anon.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
}

function normName(s: string) { return s.replace(/[^a-z0-9]/gi, "").toLowerCase(); }

async function verifyOwnership(
  admin: ReturnType<typeof createClient>,
  token: string,
  account: string,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("journal_account_data")
    .select("accounts")
    .eq("user_id", userId)
    .single();
  const accounts: AccObj[] = data?.accounts ?? [];
  const norm = normName(account);
  return accounts.some(a =>
    a?.mt5?.webhookToken === token &&
    (a?.name === account || normName(a?.name ?? "") === norm)
  );
}

// deno-lint-ignore no-explicit-any
function rowToTrade(row: any) {
  return {
    ticket: row.ticket, symbol: row.symbol, type: row.trade_type,
    lots: row.lots, openPrice: row.open_price, closePrice: row.close_price,
    openTime: row.open_time, closeTime: row.close_time,
    profit: row.profit, swap: row.swap, commission: row.commission,
    status: row.status ?? "closed",
  };
}

// deno-lint-ignore no-explicit-any
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function jsonError(msg: string, status: number) { return json({ ok: false, error: msg }, status); }
