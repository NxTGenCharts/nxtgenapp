// ══ admin.nxtgencharts.site — subdomain gate ══
// This copy of the app is deployed only at the admin subdomain. Supabase
// Auth is shared with the main site (app.nxtgencharts.site) — any existing
// trader account can technically authenticate here — so this script adds
// a second check straight after sign-in: if the signed-in account isn't
// the admin account, it's signed out immediately and bounced back to the
// login screen. No data is ever fetched or rendered for a non-admin session.
//
// This is a UX/UI safeguard for a private console, not the security
// boundary — that's still the Postgres RLS policy from
// supabase/signals_admin_lockdown.sql, which rejects every write from a
// non-admin regardless of what this script does.
// Hard route lock — this deployment is Admin-console-only. Every nav link,
// tab, and mobile shortcut for the other journal pages has been removed
// from the markup already; this wraps the shared nav() function (defined
// in nav-dashboard-trades.js, loaded earlier) as a second layer so that
// any leftover call — a stale URL, a deep link, a console command — still
// lands on Admin instead of quietly rendering another page.
(function () {
  const _origNav = window.nav;
  if (typeof _origNav === 'function') {
    window.nav = function (pageId, sbEl, label, extra, skipPush) {
      if (pageId !== 'admin') {
        pageId = 'admin'; sbEl = document.getElementById('sb-admin'); label = 'Admin'; extra = null;
        if (location.pathname !== '/admin') history.replaceState({}, '', '/admin');
      }
      return _origNav(pageId, sbEl, label, extra, skipPush);
    };
  }
})();

window._admGateEnforce = async function () {
  const isAdmin = typeof window._sigIsAdmin === 'function' && window._sigIsAdmin();

  if (isAdmin) {
    // Land on the Admin console by default here, not the personal Dashboard.
    if (location.pathname === '/' || location.pathname === '') {
      history.replaceState({}, '', '/admin');
    }
    return true;
  }

  try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
      flex-direction:column;gap:10px;font-family:system-ui,-apple-system,sans-serif;
      background:#080b12;color:#f8fafc;text-align:center;padding:24px">
      <div style="font-size:40px">🔒</div>
      <div style="font-size:18px;font-weight:700">Not authorized</div>
      <div style="opacity:.65;max-width:360px;font-size:14px">
        This is a private admin console. Your account doesn't have access — redirecting you to sign in.
      </div>
    </div>`;
  setTimeout(() => window.location.replace('./login.html'), 2200);
  return false;
};
