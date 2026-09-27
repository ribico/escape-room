// Scene "cinematiche" per i telefoni: brevi animazioni SVG/CSS con testo, messaggi in arrivo,
// video opzionali. Nessuna risorsa esterna. Uso: NOVA.cine.play(scenes) -> Promise.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---- disegni animati (viewBox 200x200)
  const ART = {
    ecg: () => `<svg viewBox="0 0 200 200" class="art"><path class="ecg" d="M0 100 L40 100 L50 100 L58 60 L66 140 L74 100 L110 100 L118 80 L124 120 L130 100 L200 100" fill="none" stroke="#ff4b4b" stroke-width="3"/><circle class="dot" cx="100" cy="100" r="5" fill="#ff4b4b"/></svg>`,
    flat: () => `<svg viewBox="0 0 200 200" class="art"><path class="ecg slow" d="M0 100 L60 100 L66 70 L72 130 L78 100 L200 100" fill="none" stroke="#ff4b4b" stroke-width="3"/></svg>`,
    paper: () => `<svg viewBox="0 0 200 200" class="art"><g class="strips">${[0, 1, 2, 3].map((i) => `<g class="strip s${i}"><rect x="${40 + i * 30}" y="40" width="28" height="120" fill="#f3f0ff" stroke="#999"/>${[0, 1, 2, 3, 4].map((k) => `<line x1="${44 + i * 30}" y1="${60 + k * 20}" x2="${64 + i * 30}" y2="${60 + k * 20}" stroke="#333" stroke-width="2"/>`).join('')}</g>`).join('')}</g></svg>`,
    folder: () => `<svg viewBox="0 0 200 200" class="art"><rect x="30" y="60" width="140" height="100" rx="6" fill="#c9a227"/><rect class="sheet" x="40" y="50" width="120" height="100" rx="3" fill="#f3f0ff"/><g class="stamp"><rect x="55" y="85" width="90" height="28" fill="none" stroke="#ff2d95" stroke-width="3" transform="rotate(-12 100 100)"/><text x="100" y="105" text-anchor="middle" font-size="14" font-weight="900" fill="#ff2d95" transform="rotate(-12 100 100)">SOSPETTATA</text></g><path class="flap" d="M30 60 L30 160 L170 160 L170 60 Z" fill="#e0b737" /></svg>`,
    circuit: () => `<svg viewBox="0 0 200 200" class="art">${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect class="bulb b${(r * 4 + c) % 5}" x="${25 + c * 40}" y="${45 + r * 40}" width="30" height="30" rx="6" fill="#b7ff2a"/>`).join('')).join('')}<path class="spark" d="M100 10 L95 30 L105 30 L98 48" fill="none" stroke="#19e6ff" stroke-width="3"/></svg>`,
    vials: () => `<svg viewBox="0 0 200 200" class="art">${[0, 1, 2].map((i) => `<g class="vial v${i}"><rect x="${45 + i * 45}" y="60" width="24" height="90" rx="10" fill="none" stroke="#19e6ff" stroke-width="3"/><rect x="${45 + i * 45}" y="110" width="24" height="40" rx="8" fill="${['#ff2d95', '#19e6ff', '#b7ff2a'][i]}" class="liquid"/><text x="${57 + i * 45}" y="45" text-anchor="middle" font-size="18" fill="#fff" font-weight="800">?</text></g>`).join('')}</svg>`,
    camera: () => `<svg viewBox="0 0 200 200" class="art"><rect class="flash" x="0" y="0" width="200" height="200" fill="#fff"/><g class="polaroid"><rect x="50" y="40" width="100" height="120" fill="#fff"/><rect class="photo" x="58" y="48" width="84" height="84" fill="#333"/><text x="100" y="150" text-anchor="middle" font-size="9" fill="#333">PROVA N.1</text></g><g class="eraser"><rect x="30" y="90" width="140" height="30" fill="#ff4b4b" opacity=".8"/><text x="100" y="110" text-anchor="middle" font-size="12" fill="#fff" font-weight="900">CANCELLAZIONE...</text></g></svg>`,
    formula: () => `<svg viewBox="0 0 200 200" class="art"><path d="M70 40 L70 100 L45 160 L155 160 L130 100 L130 40 Z" fill="none" stroke="#fff" stroke-width="3"/>${['#ff2d95', '#19e6ff', '#b7ff2a'].map((c, i) => `<circle class="drop d${i}" cx="${80 + i * 20}" cy="10" r="7" fill="${c}"/>`).join('')}<path class="mix" d="M52 150 L148 150 L138 120 L62 120 Z" fill="#b7ff2a"/></svg>`,
    lock: () => `<svg viewBox="0 0 200 200" class="art"><path class="shackle" d="M70 90 V60 a30 30 0 0 1 60 0 V90" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><rect x="50" y="90" width="100" height="80" rx="12" fill="#ff2d95"/>${[0, 1, 2].map((i) => `<circle class="pin p${i}" cx="${80 + i * 20}" cy="130" r="8" fill="#fff"/>`).join('')}</svg>`,
    skull: () => `<svg viewBox="0 0 200 200" class="art"><g class="pulse"><circle cx="100" cy="90" r="45" fill="#f3f0ff"/><circle cx="82" cy="85" r="10" fill="#07060f"/><circle cx="118" cy="85" r="10" fill="#07060f"/><path d="M95 105 L100 115 L105 105 Z" fill="#07060f"/><rect x="78" y="128" width="44" height="18" rx="4" fill="#f3f0ff"/>${[0, 1, 2, 3].map((i) => `<line x1="${86 + i * 10}" y1="128" x2="${86 + i * 10}" y2="146" stroke="#07060f" stroke-width="2"/>`).join('')}</g></svg>`
  };

  function typewriter(el, text, ctl, cps = 45) {
    return new Promise((res) => {
      let i = 0; el.textContent = '';
      const t = setInterval(() => { if (ctl.aborted) { clearInterval(t); return res(); } el.textContent = text.slice(0, ++i); if (i >= text.length) { clearInterval(t); res(); } }, 1000 / cps);
      el._stop = () => { clearInterval(t); el.textContent = text; res(); };
    });
  }
  // Una sola scena alla volta: una nuova richiesta interrompe quella in corso (vince lo stato più recente).
  let current = null;

  // Ogni scena: { art, title, text, ms, buzz, video, chat:[{from,text}] }
  async function play(scenes, opts = {}) {
    if (!scenes || !scenes.length) return;
    if (current) current.abort();
    const ctl = { aborted: false, onAbort: null, abort() { this.aborted = true; if (this.onAbort) this.onAbort(); } };
    current = ctl;
    const ov = document.createElement('div'); ov.className = 'cine'; document.body.appendChild(ov);
    let skip = false;
    ov.addEventListener('click', (e) => { if (e.target.closest('button')) return; const t = ov.querySelector('.tw'); if (t && t._stop) t._stop(); else skip = true; });
    for (const sc of scenes) {
      if (ctl.aborted) break;
      skip = false;
      if (sc.video) { await playVideo(ov, sc, ctl); continue; }
      if (sc.chat) { await playChat(ov, sc, ctl); continue; }
      ov.innerHTML = `<div class="scene">${sc.art && ART[sc.art] ? ART[sc.art]() : ''}<h2 class="ctitle">${esc(sc.title || '')}</h2><p class="tw"></p><div class="ctap">tocca per continuare</div></div>`;
      if (sc.buzz) vibrate(sc.buzz);
      await typewriter(ov.querySelector('.tw'), sc.text || '', ctl);
      const t0 = Date.now(); while (!skip && !ctl.aborted && Date.now() - t0 < (sc.ms || 2500)) await sleep(80);
    }
    if (opts.button !== false && !ctl.aborted) {
      const s = ov.querySelector('.scene'); const tap = s && s.querySelector('.ctap');
      if (tap) { tap.outerHTML = `<button class="cbtn">${esc(opts.button || 'INIZIA')}</button>`; await new Promise((r) => { ov.querySelector('.cbtn').addEventListener('click', r); ctl.onAbort = r; }); }
    }
    if (current === ctl) current = null;
    ov.classList.add('out'); await sleep(350); ov.remove();
  }

  // Messaggi in arrivo, stile chat, con "sta scrivendo..."
  async function playChat(ov, sc, ctl) {
    ov.innerHTML = `<div class="scene chat"><div class="chead"><span class="avatar">🧑‍🍳</span><div><b>${esc(sc.from || 'IL CUOCO')}</b><div class="muted small">numero sconosciuto</div></div></div><div class="msgs"></div><div class="ctap">tocca per continuare</div></div>`;
    const box = ov.querySelector('.msgs');
    for (const m of sc.chat) {
      if (ctl.aborted) return;
      const typing = document.createElement('div'); typing.className = 'bubble typing'; typing.innerHTML = '<span></span><span></span><span></span>'; box.appendChild(typing); box.scrollTop = box.scrollHeight;
      await sleep(Math.min(2200, 500 + m.text.length * 25));
      typing.className = 'bubble'; typing.textContent = m.text; vibrate([60]); box.scrollTop = box.scrollHeight;
      await sleep(600);
    }
    const t0 = Date.now(); let done = false; ov.addEventListener('click', () => (done = true), { once: true });
    while (!done && !ctl.aborted && Date.now() - t0 < (sc.ms || 3000)) await sleep(80);
  }

  async function playVideo(ov, sc, ctl) {
    ov.innerHTML = `<div class="scene"><video class="cvideo" src="${esc(sc.video)}" playsinline preload="auto"></video><button class="cbtn">▶ GUARDA</button></div>`;
    const v = ov.querySelector('video'); const b = ov.querySelector('.cbtn');
    await new Promise((res) => { ctl.onAbort = res; b.onclick = () => { b.remove(); v.play().catch(() => res()); v.onended = res; v.onerror = res; ov.querySelector('.scene').addEventListener('click', () => { v.pause(); res(); }, { once: true }); }; });
  }

  window.NOVA = window.NOVA || {};
  window.NOVA.cine = { play, ART };
})();
