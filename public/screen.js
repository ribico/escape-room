// Pagina "schermo grande": mostra la storia, i QR e lo stato dei livelli in tempo reale.
(function () {
  const { connect, mmss, esc, fragmentSvg } = NOVA;
  const $ = (id) => document.getElementById(id);
  let S = null, lastPhase = null, lastLevel = null, lastToastAt = 0, lastHintAt = 0, clockSkew = 0;

  // ---- audio (WebAudio, nessun file necessario)
  let actx = null;
  $('audioBtn').onclick = () => { actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); $('audioBtn').classList.add('hidden'); beep([660, 880]); };
  function beep(freqs, dur = 0.12, type = 'square') {
    if (!actx) return;
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + i * dur; o.start(t); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.stop(t + dur);
    });
  }
  const sfx = { good: () => beep([523, 659, 784, 1046]), bad: () => beep([200, 150], 0.25, 'sawtooth'), hint: () => beep([880, 1320], 0.1, 'sine'), win: () => beep([523, 659, 784, 1046, 784, 1046, 1318], 0.16) };

  const now = () => Date.now() + clockSkew;
  const teamsOf = () => S.teams.map((t, i) => ({ ...t, i, players: S.players.filter((p) => p.team === i) }));
  function teamsHtml(highlight) {
    return `<div class="teams">${teamsOf().map((t) => `<div class="team" style="--tc:${t.color}"><h3>${esc(t.name)}</h3>${t.players.map((p) => `<span class="p ${p.connected ? '' : 'off'} ${highlight && highlight(p) ? 'on' : ''}">${esc(p.name)}</span>`).join('') || '<span class="muted">nessuna</span>'}</div>`).join('')}</div>`;
  }
  const qr = (text) => `<img class="qr" src="/api/qr?text=${encodeURIComponent(text)}" alt="QR">`;
  const alt = () => S.alt || {};
  const header = (t, sub, t2, sub2) => `<h1 class="title">${esc(t)}</h1>${t2 ? `<div class="title2">${esc(t2)}</div>` : ''}${sub ? `<p class="subtitle">${esc(sub)}</p>` : ''}${sub2 ? `<p class="subtitle alt">${esc(sub2)}</p>` : ''}`;
  const bi = (a, b, cls = 'subtitle') => `<p class="${cls}">${esc(a)}</p>${b && b !== a ? `<p class="${cls} alt">${esc(b)}</p>` : ''}`;

  // ---- rendering per fase/livello
  const R = {
    lobby: () => `${header(`Compleanno di ${S.birthday.name}`, 'Inquadra il QR con la fotocamera del telefono, scegli la lingua, scrivi il tuo nome e compila la tua scheda riservata.', `${S.birthday.name}'s birthday`, 'Scan the QR with your phone camera, choose your language, type your name and fill in your private card.')}${qr(S.joinUrl)}<div class="url">${esc(S.joinUrl)}</div><p class="muted mono">Schede compilate / cards filled in: ${S.profilesDone}/${S.players.length}</p>${teamsHtml((p) => false)}`,
    intro: () => {
      // Una frase ogni 9 secondi: il tempo di leggerla in due lingue.
      const i = Math.min(S.story.intro.length - 1, Math.floor((now() - S.startedAt) / 9000));
      const a = alt().story;
      return `<h1 class="title glitch">${esc(S.story.title)}</h1>${a ? `<div class="title2">${esc(a.title)}</div>` : ''}<p class="subtitle" style="font-size:clamp(1.4rem,3vw,2.4rem)">${esc(S.story.intro[i])}</p>${a ? `<p class="subtitle alt" style="font-size:clamp(1.1rem,2.2vw,1.8rem)">${esc(a.intro[i])}</p>` : ''}<p class="muted">${i + 1} / ${S.story.intro.length}</p>`;
    },
    win: () => { const a = alt().story; return `<h1 class="title glitch" style="color:var(--ok)">${esc(S.story.win[0])}</h1>${a ? `<div class="title2">${esc(a.win[0])}</div>` : ''}${S.story.win.slice(1).map((l, i) => bi(l, a && a.win[i + 1])).join('')}<p class="muted mono">Tempo / time: ${mmss(S.finishedAt - S.startedAt)} · Suggerimenti / hints: ${S.hintsUsed}</p>`; },
    dead: () => { const a = alt().story; return `<h1 class="title glitch" style="color:var(--bad)">${esc(S.story.dead[0])}</h1>${a ? `<div class="title2">${esc(a.dead[0])}</div>` : ''}${S.story.dead.slice(1).map((l, i) => bi(l, a && a.dead[i + 1])).join('')}`; },
    sync: () => `<div class="ring" style="--p:${S.L.progress}"><div>${S.L.pressing.length}/${S.players.filter((p) => p.connected).length}</div></div>${teamsHtml((p) => S.L.pressing.includes(p.pid))}`,
    fragments: () => `<p class="subtitle">Ordine delle squadre / team order: <b>${S.L.order.map(esc).join(' → ')}</b> · Tentativi / attempts: ${S.L.attempts}</p>${teamsHtml()}`,
    cipher: () => `<div class="cipherbig">${esc(S.L.cipher)}</div><p class="subtitle muted">Tentativi / attempts: ${S.L.attempts}</p>${teamsHtml()}`,
    seating: () => `<div class="table">${Array.from({ length: S.L.n }, (_, k) => `<div class="chairbox"><small>${k + 1}</small>?</div>`).join('')}</div><p class="subtitle">${S.L.names.map(esc).join(' · ')}</p><p class="subtitle muted">Indizi / clues: ${S.L.clueCount} · Tentativi / attempts: ${S.L.attempts}</p>${teamsHtml()}`,
    rooms: () => { const a = alt().L; return `<div class="house">${S.L.rooms.map((r, i) => `<div class="hr">${esc(r.name)}<small>${a && a.rooms[i] && a.rooms[i].name !== r.name ? esc(a.rooms[i].name) : '&nbsp;'}</small>${S.L.counts[r.id] ? `<span class="cnt">${S.L.counts[r.id]}</span>` : ''}</div>`).join('')}</div><p class="subtitle">Hanno votato / voted: ${S.L.voted}/${S.L.total}</p>${teamsHtml()}`; },
    riddles: () => `<div class="letters">${S.L.letters.map((l, i) => `<div class="l ${l ? 'on' : ''}"><small>${i + 1}</small>${l || '·'}</div>`).join('')}</div><p class="subtitle">${S.L.allSolved ? 'Tutte le sospettate sono identificate: scrivete la parola d\'ordine su un telefono! / All suspects identified: type the password on a phone!' : `Sospettate identificate / suspects identified: ${S.L.identified.length}/${S.L.total}`}</p><div class="row" style="justify-content:center">${S.L.identified.map((x) => `<span class="chip">${esc(x.name)} <span class="muted">← ${esc(x.by)}</span></span>`).join('')}</div>${teamsHtml()}`,
    lights: () => `<div class="grid4">${S.L.grid.map((on, c) => `<div class="c ${on ? 'on' : ''} ${S.L.last && S.L.last.cell === c && now() - S.L.last.at < 800 ? 'last' : ''}">${esc(S.L.names[c] || '')}</div>`).join('')}</div><p class="muted mono">Mosse / moves: ${S.L.presses}</p>`,
    qrhunt: () => `<div class="keys">${S.L.keys.map((k, i) => `<div class="key ${k.found ? 'found' : ''}"><div class="icon">${k.found ? '🧪' : '❓'}</div><b>Fiala / vial ${i + 1}</b><div class="muted">${k.found ? 'trovata da / found by ' + esc(k.by) : 'nascosta / hidden'}</div></div>`).join('')}</div>${teamsHtml()}`,
    reconnect: () => `<div class="row" style="justify-content:center;gap:40px">${qr(S.L.url)}<div><div class="url">Codice / code: ${esc(S.L.token)}</div><p class="muted">nuovo QR tra / new QR in ${S.L.secondsLeft}s</p></div></div>${teamsHtml((p) => S.L.done.includes(p.pid))}`,
    simon: () => {
      const t0 = S.L.showUntil - (1500 + S.L.seq.length * 900 + 800);
      const el = now() - t0; let lit = -1;
      if (el > 1500 && el < 1500 + S.L.seq.length * 900) { const k = Math.floor((el - 1500) / 900); if ((el - 1500) % 900 < 650) lit = k; }
      const msg = S.L.showing ? (el < 1500 ? 'Guardate... / Watch...' : 'Memorizzate la sequenza / Memorise the sequence') : 'Ripetete la sequenza! / Repeat the sequence!';
      return `<p class="subtitle">Dose ${S.L.round + 1} / ${S.L.rounds} · ${msg}</p><div class="simon">${S.teams.map((t, i) => `<div class="s ${S.L.seq[lit] === i ? 'lit' : ''} ${!S.L.showing && S.L.last && now() - S.L.last.at < 300 && S.L.last.team === i ? 'lit' : ''}" style="--c:${t.color}"></div>`).join('')}</div><div class="seqdots">${S.L.seq.map((_, i) => `<div class="d ${!S.L.showing && i < S.L.pos ? 'ok' : ''}"></div>`).join('')}</div>`;
    },
    vault: () => {
      const pct = S.L.windowStart ? Math.max(0, 1 - (now() - S.L.windowStart) / S.L.windowMs) : 1;
      return `<div class="ring" style="--p:${S.L.confirmed.length / Math.max(1, S.L.total)}"><div>${S.L.confirmed.length}/${S.L.total}</div></div><div class="bar"><div style="width:${pct * 100}%"></div></div><p class="muted">Reset: ${S.L.resets} · Confermate / confirmed</p>${teamsHtml((p) => S.L.confirmed.includes(p.pid))}`;
    }
  };

  function render() {
    if (!S) return;
    const conn = S.players.filter((p) => p.connected).length;
    $('playersMini').textContent = S.players.length ? `${conn}/${S.players.length} connesse` : '';
    const lvl = S.level;
    $('lvlLabel').textContent = lvl ? lvl.title : (S.phase === 'win' ? 'CASO RISOLTO · CASE SOLVED' : S.phase === 'dead' ? 'TEMPO SCADUTO · TIME IS UP' : 'INDAGINE IN CORSO · INVESTIGATION');
    let html = '';
    if (S.phase === 'lobby') html = R.lobby();
    else if (S.phase === 'intro') html = R.intro();
    else if (S.phase === 'win') html = R.win();
    else if (S.phase === 'dead') html = R.dead();
    else if (lvl && S.L) {
      const a = alt();
      html = header(lvl.title, lvl.subtitle, a.level && a.level.title, a.level && a.level.subtitle)
        + (S.hint && now() - S.hint.at < 90000 ? `<div class="hintbox"><b>SUGGERIMENTO / HINT:</b> ${esc(S.hint.text)}${a.hint && a.hint.text && a.hint.text !== S.hint.text ? `<br><span class="muted">${esc(a.hint.text)}</span>` : ''}</div>` : '')
        + R[lvl.id]();
    }
    $('main').innerHTML = html;
    $('overlay').classList.toggle('hidden', S.phase !== 'levelDone');
    if (S.phase === 'levelDone') $('overlay').innerHTML = 'ATTO SUPERATO<br><span style="font-size:.5em">ACT COMPLETE</span>';
    // effetti al cambio di fase
    const key = S.phase + ':' + S.levelIdx;
    if (key !== lastPhase) {
      if (S.phase === 'levelDone') sfx.good();
      if (S.phase === 'win') { sfx.win(); confetti(); }
      if (S.phase === 'dead') sfx.bad();
      lastPhase = key;
    }
    if (S.toast && S.toast.at !== lastToastAt) { lastToastAt = S.toast.at; const a = alt().toast; showToast({ ...S.toast, text: S.toast.text + (a && a.text && a.text !== S.toast.text ? ' · ' + a.text : '') }); if (S.toast.kind === 'bad') sfx.bad(); }
    if (S.hint && S.hint.at !== lastHintAt) { lastHintAt = S.hint.at; sfx.hint(); }
  }
  function showToast(t) { const el = $('toast'); el.textContent = t.text; el.className = 'toast ' + t.kind; clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 5000); }
  function tickTimer() {
    if (!S) return;
    const el = $('timer');
    if (!S.deadline) { el.textContent = mmss((S.deadline ? 0 : 60 * 60000)); el.classList.remove('warn'); return; }
    const left = S.phase === 'win' ? S.deadline - S.finishedAt : S.deadline - now();
    el.textContent = mmss(left); el.classList.toggle('warn', left < 5 * 60000 && S.phase !== 'win');
  }
  connect({ hello: () => ({ role: 'screen' }), onState: (s) => { S = s; clockSkew = s.now - Date.now(); render(); } });
  setInterval(() => { tickTimer(); if (S && (S.phase === 'intro' || (S.level && ['simon', 'vault', 'reconnect', 'lights', 'seating'].includes(S.level.id)))) render(); }, 250);

  // ---- coriandoli
  function confetti() {
    const cv = $('confetti'), ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#ff2d95', '#19e6ff', '#b7ff2a', '#ffd23f', '#fff'];
    const ps = Array.from({ length: 220 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height, r: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], v: 2 + Math.random() * 4, a: Math.random() * 6 }));
    const t0 = Date.now();
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach((p) => { p.y += p.v; p.a += 0.1; p.x += Math.sin(p.a); if (p.y > cv.height) p.y = -20; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.r, p.r * 1.6); });
      if (Date.now() - t0 < 20000 && S && S.phase === 'win') requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }
})();
