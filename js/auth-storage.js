// ══ NxTGen — cross-subdomain Supabase auth storage ══
// Supabase's default persistence uses `localStorage`, which is scoped to a
// single origin. app.nxtgencharts.site and admin.nxtgencharts.site are
// different origins, so a session created on one is invisible on the other
// even though they share a parent domain — "sign in once, works on both"
// cannot work on localStorage alone.
//
// This adapter backs the auth session onto a `domain=.nxtgencharts.site`
// cookie (same technique already used for the theme preference in
// index.html) so both subdomains read/write the exact same token. It still
// mirrors into localStorage as a same-origin cache/fallback for browsers
// that block third-party-ish cookie writes in edge cases.
//
// Auth tokens can exceed the ~4KB per-cookie limit, so this chunks long
// values across `key`, `key.0`, `key.1`, ... cookies transparently.
(function () {
  const DOMAIN_ATTR = location.hostname.endsWith('nxtgencharts.site') ? '; domain=.nxtgencharts.site' : '';
  const SECURE_ATTR = location.protocol === 'https:' ? '; secure' : '';
  const CHUNK_SIZE = 3000; // stay well under the ~4096 byte per-cookie limit
  const MAX_CHUNKS = 12;   // ~36KB ceiling, far more than any auth payload needs

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function cookieGet(key) {
    const base = esc(key);
    const single = new RegExp('(?:^|; )' + base + '=([^;]*)');
    const m = document.cookie.match(single);
    if (m) return decodeURIComponent(m[1]);

    // Try chunked form: key.0, key.1, ...
    let out = '';
    let found = false;
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const re = new RegExp('(?:^|; )' + base + '\\.' + i + '=([^;]*)');
      const cm = document.cookie.match(re);
      if (!cm) break;
      found = true;
      out += decodeURIComponent(cm[1]);
    }
    return found ? out : null;
  }

  function cookieClear(key) {
    const names = [key];
    for (let i = 0; i < MAX_CHUNKS; i++) names.push(key + '.' + i);
    names.forEach(name => {
      document.cookie = name + '=; path=/; max-age=0; samesite=lax' + DOMAIN_ATTR + SECURE_ATTR;
    });
  }

  function cookieSet(key, value) {
    cookieClear(key);
    if (value.length <= CHUNK_SIZE) {
      document.cookie = key + '=' + encodeURIComponent(value) +
        '; path=/; max-age=31536000; samesite=lax' + DOMAIN_ATTR + SECURE_ATTR;
      return;
    }
    let i = 0;
    for (let pos = 0; pos < value.length; pos += CHUNK_SIZE, i++) {
      if (i >= MAX_CHUNKS) break; // truncation guard — should never happen for auth payloads
      const chunk = value.slice(pos, pos + CHUNK_SIZE);
      document.cookie = key + '.' + i + '=' + encodeURIComponent(chunk) +
        '; path=/; max-age=31536000; samesite=lax' + DOMAIN_ATTR + SECURE_ATTR;
    }
  }

  window._nxtgenCrossSubdomainAuthStorage = {
    getItem(key) {
      try {
        const fromCookie = cookieGet(key);
        if (fromCookie !== null) {
          try { localStorage.setItem(key, fromCookie); } catch (e) {}
          return fromCookie;
        }
      } catch (e) {}
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try { localStorage.setItem(key, value); } catch (e) {}
      try { cookieSet(key, value); } catch (e) {}
    },
    removeItem(key) {
      try { localStorage.removeItem(key); } catch (e) {}
      try { cookieClear(key); } catch (e) {}
    }
  };
})();
