// Pagina "telefono": ogni giocatrice vede solo la propria parte del puzzle.
(function () {
  const { connect, esc, fragmentSvg } = NOVA;
  const $ = (id) => document.getElementById(id);
  let S = null, pid = localStorage.getItem('pid') || null, lastKey = '', lastToastAt = 0, clockSkew = 0, forceLobby = false;
  const now = () => Date.now() + clockSkew;
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  function setPid(v) { pid = v; localStorage.setItem('pid', v); document.cookie = `pid=${v}; path=/; max-age=86400; SameSite=Lax`; }
  if (pid) setPid(pid); // rinfresca il cookie usato dalle pagine /k e /r

  const ws = connect({
    hello: () => ({ role: 'phone', pid }),
    onOpen: () => { $('status').textContent = 'connessa'; },
    onState: (s) => { S = s; clockSkew = s.now - Date.now(); render(); },
    onMessage: (m) => {
      if (m.type === 'joined') { setPid(m.pid); }
      if (m.type === 'wrong') { vibrate([120, 60, 120]); $('main').classList.remove('shake'); void $('main').offsetWidth; $('main').classList.add('shake'); toast('Sbagliato! Il Cuoco ride di te.', 'bad'); }
      if (m.type === 'buzz') vibrate(m.pattern);
      if (m.type === 'keyResult') { toast(m.msg + (m.ok && m.digit ? ` Cifra: ${m.digit}` : ''), m.ok ? 'good' : 'bad'); if (m.ok) vibrate([200]); }
    }
  });
  const send = (msg) => ws.send(msg);
  function toast(text, kind = 'info') { const el = $('toast'); el.textContent = text; el.className = 'toast ' + kind; clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 3500); }
  const input = (id, ph, big = true) => `<input id="${id}" class="${big ? 'big' : ''}" placeholder="${ph}" autocomplete="off" autocapitalize="characters" spellcheck="false">`;

  // ---- viste
  const V = {
    join: () => `<div class="join"><h2>Entra nell'indagine</h2><p class="muted">Scrivi il tuo nome: verrai assegnata a una squadra.</p>${input('name', 'il tuo nome', false)}<button id="joinBtn">ENTRA</button></div>`,
    lobby: () => {
      const done = S.me.profile && Object.keys(S.me.profile).length;
      const form = S.profileFields.map((f) => `<label class="muted" style="display:block;margin:10px 0 4px">${esc(f.label)}${f.required ? ' *' : ''}</label><input id="pf_${f.key}" placeholder="${esc(f.placeholder)}" autocomplete="off" value="${esc((S.me.profile || {})[f.key] || '')}">`).join('');
      return `<div class="bigmsg" style="padding:10px 0">Sei dentro, ${esc(S.me.name)}!<br><span style="color:${S.me.color}">Squadra ${esc(S.me.teamName)}</span></div>
        <div class="card"><h2>🔒 Scheda riservata</h2><p class="muted">Compila la tua scheda: le risposte le vede solo la regia, non le altre ragazze. Serviranno durante l'indagine. ${done ? '<b class="ok-badge">Scheda salvata ✔</b> (puoi ancora modificarla).' : 'I campi con * sono obbligatori.'}</p>${form}<button id="profBtn" style="width:100%;margin-top:14px">${done ? 'AGGIORNA SCHEDA' : 'SALVA SCHEDA'}</button></div>
        <p class="muted" style="text-align:center;margin-top:14px">Poi aspetta che la regia avvii il gioco. Tieni il telefono sbloccato e non chiudere questa pagina.</p>`;
    },
    intro: () => `<div class="bigmsg glitch" style="color:var(--bad)">${esc(S.victim)} è stata avvelenata.</div><p class="muted" style="text-align:center">Guarda lo schermo. ${S.me.profile ? '' : 'Non hai compilato la scheda: fallo ora, prima che inizi l\'indagine.'}</p>${S.me.profile ? '' : '<button id="backLobby" class="secondary" style="width:100%">Compila la scheda</button>'}`,
    levelDone: () => `<div class="bigmsg" style="color:var(--ok)">✔ LIVELLO SUPERATO</div><p class="muted" style="text-align:center">Prossimo livello tra pochi secondi...</p>`,
    win: () => `<div class="bigmsg" style="color:var(--ok)">💊 ANTIDOTO SOMMINISTRATO 💊<br>${esc(S.victim)} è salva.<br>Buon compleanno ${esc(S.birthday.name)}!</div>`,
    dead: () => `<div class="bigmsg" style="color:var(--bad)">☠ TROPPO TARDI</div><p class="muted" style="text-align:center">Il tempo è scaduto. Guardate lo schermo.</p>`,
    sync: () => `<p>Tieni premuto il pulsante. Si sblocca solo se lo fate TUTTE insieme per 3 secondi.</p><button class="holdbtn ${S.L.me ? 'active' : ''}" id="hold">${S.L.me ? 'TIENI!' : 'PREMI E TIENI'}</button><p class="muted" style="text-align:center">${S.L.pressing.length} stanno premendo</p>`,
    fragments: () => `<p>Questa è la tua striscia del biglietto. Metti il telefono accanto a quelli della tua squadra (${esc(S.me.teamName)}), in verticale, nell'ordine giusto.</p><div class="strip" style="--tc:${S.me.color}">${S.L.mine ? fragmentSvg(S.L.mine, S.L.mine.strip) : ''}</div><p style="margin-top:12px">Frase completa (tre parole, ordine: ${S.L.order.map(esc).join(' → ')}):</p>${input('ans', 'SCRIVI LA FRASE')}<button id="ansBtn" style="width:100%;margin-top:8px">INVIA</button>`,
    riddles: () => {
      const mine = S.L.mine.map((r) => `<div class="card riddle"><div class="muted mono">Fascicolo ${r.idx + 1}</div><div class="q">${esc(r.q)}</div>${input('r' + r.idx, 'NOME DELLA SOSPETTATA')}<button data-idx="${r.idx}" class="rBtn" style="width:100%;margin-top:8px">IDENTIFICA</button></div>`).join('');
      const done = S.L.mine.length ? '' : '<p class="ok-badge">I tuoi fascicoli sono chiusi. Aiuta le altre!</p>';
      const pw = `<div class="card"><div class="muted mono">Parola d'ordine</div><p class="muted">Le lettere svelate sullo schermo, in ordine.</p>${input('pw', 'PAROLA D\'ORDINE')}<button id="pwBtn" style="width:100%;margin-top:8px">SBLOCCA</button></div>`;
      return mine + done + pw;
    },
    lights: () => `<p>Controlli ${S.L.mine.length === 1 ? 'questo interruttore' : 'questi interruttori'} del quadro elettrico. Premendo cambi il tuo e quelli vicini. Guarda lo schermo!</p>${S.L.mine.map((c) => `<button class="cellbtn ${S.L.grid[c] ? 'on' : ''}" data-cell="${c}">Interruttore ${Math.floor(c / 4) + 1}·${(c % 4) + 1} · ${S.L.grid[c] ? 'ACCESO' : 'SPENTO'}</button>`).join('') || '<p class="muted">Nessun interruttore assegnato: aiuta le altre a decidere.</p>'}`,
    qrhunt: () => `<p>Cerca le tre fiale nascoste in casa e inquadra la loro etichetta (QR) con la <b>fotocamera</b>. Se il QR non si legge, digita qui il codice scritto sotto.</p>${input('key', 'CODICE FIALA')}<button id="keyBtn" style="width:100%;margin-top:8px">INVIA CODICE</button>${S.L.myDigits.length ? `<div class="card" style="margin-top:14px"><div class="muted mono">Le tue fiale</div><div class="digits">${S.L.myDigits.map((d) => `<div>Fiala ${d.idx + 1}: <span class="digit">${d.digit}</span></div>`).join('')}</div></div>` : ''}<p class="muted" style="margin-top:12px">Fiale trovate: ${S.L.keys.filter((k) => k.found).length}/${S.L.keys.length}</p>`,
    reconnect: () => S.L.me ? `<div class="bigmsg" style="color:var(--ok)">✔ Prova salvata!</div><p class="muted" style="text-align:center">Aspetta le altre (${S.L.done.length} pronte).</p>` : `<div class="bigmsg" style="color:var(--bad)">PROVA IN CANCELLAZIONE</div><p>Inquadra con la fotocamera il QR sullo schermo, oppure digita il codice scritto sotto al QR.</p>${input('key', 'CODICE')}<button id="keyBtn" style="width:100%;margin-top:8px">SALVA LA PROVA</button>`,
    simon: () => `<p style="text-align:center">Round ${S.L.round + 1}/${S.L.rounds} · ${S.L.showing ? 'Guarda lo schermo e memorizza...' : 'Premi quando tocca al tuo colore!'}</p><button class="simonbtn ${S.L.showing ? 'locked' : ''}" id="simon" style="--tc:${S.me.color}">${esc(S.me.teamName)}</button>`,
    vault: () => S.L.me ? `<div class="bigmsg" style="color:var(--ok)">✔ Confermato</div><p class="muted" style="text-align:center">${S.L.confirmed.length}/${S.L.total} pronte. Forza!</p>` : `<p>Inserisci il codice a 3 cifre (fiala 1, fiala 2, fiala 3). Tutte dovete confermare entro 20 secondi dalla prima!</p>${input('code', '___')}<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del">⌫</button><button data-k="0">0</button><button class="go" data-k="go">OK</button></div>`
  };

  function render() {
    if (!S) return;
    $('lvl').textContent = S.level ? S.level.title : (S.phase === 'win' ? 'CASO RISOLTO' : S.phase === 'dead' ? 'TEMPO SCADUTO' : 'INDAGINE · TERMINALE');
    $('me').textContent = S.me ? S.me.name : '';
    const t = $('team'); if (S.me) { t.style.display = ''; t.style.setProperty('--tc', S.me.color); t.textContent = S.me.teamName; } else t.style.display = 'none';
    const h = $('hint'); if (S.hint && now() - S.hint.at < 90000) { h.classList.remove('hidden'); h.innerHTML = `<b>SUGGERIMENTO:</b> ${esc(S.hint.text)}`; } else h.classList.add('hidden');
    if (S.toast && S.toast.at !== lastToastAt && S.toast.kind === 'good') { lastToastAt = S.toast.at; toast(S.toast.text, 'good'); }

    let view;
    if (!S.me) view = 'join';
    else if (S.phase === 'lobby') view = 'lobby';
    else if (S.phase === 'intro') view = 'intro';
    else if (S.phase === 'levelDone') view = 'levelDone';
    else if (S.phase === 'win') view = 'win';
    else if (S.phase === 'dead') view = 'dead';
    else if (forceLobby && S.phase === 'intro') view = 'lobby';
    else view = S.level.id;
    // Evita di rifare il DOM (e perdere il testo digitato) se la vista non cambia sostanzialmente.
    const key = view + '|' + JSON.stringify(view === 'join' ? 0 : viewKey(view));
    if (key === lastKey) return;
    // Conserva il testo negli input mentre si ridisegna.
    const saved = {}; document.querySelectorAll('input').forEach((i) => { saved[i.id] = i.value; });
    lastKey = key;
    $('main').innerHTML = V[view]();
    document.querySelectorAll('input').forEach((i) => { if (saved[i.id]) i.value = saved[i.id]; });
    bind(view);
  }
  function viewKey(v) {
    const L = S.L || {};
    switch (v) {
      case 'sync': return [L.me, L.pressing.length];
      case 'fragments': return [L.mine && L.mine.strip, L.order];
      case 'riddles': return [L.mine.map((r) => r.idx)];
      case 'lights': return [L.mine, L.mine.map((c) => L.grid[c])];
      case 'qrhunt': return [L.myDigits, L.keys.map((k) => k.found)];
      case 'reconnect': return [L.me, L.done.length];
      case 'simon': return [L.round, L.showing];
      case 'vault': return [L.me, L.confirmed.length, L.total];
      case 'lobby': return [S.me && S.me.team, !!(S.me && S.me.profile), S.phase];
      case 'intro': return [!!(S.me && S.me.profile)];
      default: return [S.me && S.me.team];
    }
  }
  function bind(view) {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    if (view === 'join') {
      const go = () => { const name = $('name').value.trim(); if (name) send({ type: 'join', name, pid }); };
      on('joinBtn', 'click', go); on('name', 'keydown', (e) => { if (e.key === 'Enter') go(); }); $('name').focus();
    }
    if (view === 'lobby') on('profBtn', 'click', () => {
      const data = {}; let missing = false;
      S.profileFields.forEach((f) => { const v = $('pf_' + f.key).value.trim(); data[f.key] = v; if (f.required && !v) missing = true; });
      if (missing) { toast('Compila i campi obbligatori (*)', 'bad'); return; }
      send({ type: 'profile', data }); forceLobby = false; toast('Scheda salvata. Nessun\'altra può vederla.', 'good'); vibrate(60);
    });
    if (view === 'intro') on('backLobby', 'click', () => { forceLobby = true; lastKey = ''; render(); });
    if (view === 'sync') {
      const b = $('hold');
      const down = (e) => { e.preventDefault(); b.classList.add('active'); b.textContent = 'TIENI!'; send({ type: 'hold' }); vibrate(30); };
      const up = (e) => { e.preventDefault(); b.classList.remove('active'); b.textContent = 'PREMI E TIENI'; send({ type: 'release' }); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    if (view === 'fragments') { const go = () => send({ type: 'answer', text: $('ans').value }); on('ansBtn', 'click', go); on('ans', 'keydown', (e) => { if (e.key === 'Enter') go(); }); }
    if (view === 'riddles') {
      document.querySelectorAll('.rBtn').forEach((b) => b.addEventListener('click', () => { const idx = Number(b.dataset.idx); send({ type: 'answer', idx, text: $('r' + idx).value }); }));
      document.querySelectorAll('input[id^="r"]').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') send({ type: 'answer', idx: Number(i.id.slice(1)), text: i.value }); }));
      on('pwBtn', 'click', () => send({ type: 'password', text: $('pw').value }));
    }
    if (view === 'lights') document.querySelectorAll('.cellbtn').forEach((b) => b.addEventListener('click', () => { send({ type: 'toggle', cell: Number(b.dataset.cell) }); vibrate(40); }));
    if (view === 'qrhunt' || view === 'reconnect') on('keyBtn', 'click', () => { send({ type: 'code', text: $('key').value }); $('key').value = ''; });
    if (view === 'simon') on('simon', 'pointerdown', (e) => { e.preventDefault(); if (!S.L.showing) { send({ type: 'press' }); vibrate(40); } });
    if (view === 'vault') document.querySelectorAll('.keypad button').forEach((b) => b.addEventListener('click', () => {
      const i = $('code'), k = b.dataset.k;
      if (k === 'del') i.value = i.value.slice(0, -1);
      else if (k === 'go') send({ type: 'code', text: i.value });
      else if (i.value.length < 3) i.value += k;
      vibrate(20);
    }));
  }
  setInterval(() => { if (S && S.level && S.level.id === 'simon') { const showing = now() < S.L.showUntil; if (showing !== S.L.showing) { S.L.showing = showing; render(); } } }, 200);
})();
