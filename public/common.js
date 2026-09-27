// Utilità condivise tra schermo, telefono e regia: connessione WS con riconnessione, formattazioni, PRNG.
window.NOVA = (function () {
  const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  function connect({ hello, onState, onMessage, onOpen }) {
    let ws, timer, delay = 500;
    const api = { send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }, ready: false };
    function open() {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { delay = 500; api.ready = true; ws.send(JSON.stringify({ type: 'hello', ...hello() })); onOpen && onOpen(); };
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'state') onState(m); else onMessage && onMessage(m); };
      ws.onclose = () => { api.ready = false; clearTimeout(timer); timer = setTimeout(open, delay); delay = Math.min(delay * 2, 5000); };
      ws.onerror = () => ws.close();
    }
    open();
    return api;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function mmss(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  // PRNG deterministico (mulberry32): stesso seed -> stesse decorazioni su tutti i telefoni della squadra.
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Immagine completa del livello "frammenti": parola + linee decorative che attraversano tutte le strisce.
  function fragmentSvg({ word, n, seed, color }, strip) {
    const W = 9 * n, H = 16, r = rng(seed);
    const fs = Math.min(11, (W * 0.82) / (word.length * 0.62));
    let lines = '';
    for (let k = 0; k < 4; k++) {
      let d = `M -1 ${(r() * H).toFixed(2)}`;
      for (let x = 0; x <= W + 1; x += 1.5) d += ` L ${x.toFixed(2)} ${(r() * H).toFixed(2)}`;
      lines += `<path d="${d}" fill="none" stroke="${k % 2 ? color : '#19e6ff'}" stroke-width="${(0.12 + r() * 0.2).toFixed(2)}" opacity=".8"/>`;
    }
    const vb = strip == null ? `0 0 ${W} ${H}` : `${strip * 9} 0 9 ${H}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#0b0a18"/>${lines}
      <text x="${W / 2}" y="${H / 2}" fill="#fff" font-family="Impact, 'Arial Black', sans-serif" font-weight="900" font-size="${fs.toFixed(2)}" text-anchor="middle" dominant-baseline="central" letter-spacing="${(fs * 0.08).toFixed(2)}" stroke="${color}" stroke-width="0.12">${esc(word)}</text>
    </svg>`;
  }
  return { connect, mmss, esc, rng, fragmentSvg };
})();
