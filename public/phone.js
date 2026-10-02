// Pagina "telefono": ogni giocatrice vede solo la propria parte del puzzle, nella lingua scelta alla registrazione.
(function () {
  const { connect, esc, fragmentSvg } = NOVA;
  const $ = (id) => document.getElementById(id);
  let S = null, pid = localStorage.getItem('pid') || null, lastKey = '', lastToastAt = 0, clockSkew = 0, forceLobby = false;
  let seenScene = null, seenHint = 0, lang = localStorage.getItem('lang') || null;
  const now = () => Date.now() + clockSkew;
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  function setPid(v) { pid = v; localStorage.setItem('pid', v); document.cookie = `pid=${v}; path=/; max-age=86400; SameSite=Lax`; }
  function setLang(v) { lang = v; localStorage.setItem('lang', v); document.cookie = `lang=${v}; path=/; max-age=86400; SameSite=Lax`; document.documentElement.lang = v; }
  if (pid) setPid(pid);
  if (lang) setLang(lang);

  // ---- testi dell'interfaccia
  const UI = {
    it: {
      terminal: 'INDAGINE · TERMINALE', solved: 'CASO RISOLTO', timeout: 'TEMPO SCADUTO', hint: 'SUGGERIMENTO', connected: 'connessa', connecting: 'connessione...',
      chooseLang: 'Scegli la lingua / Choose your language', join: 'Entra nell\'indagine', joinHelp: 'Scrivi il tuo nome: verrai assegnata a una squadra.', yourName: 'il tuo nome', enter: 'ENTRA',
      inside: 'Sei dentro, {name}!', team: 'Squadra {team}', card: '🔒 Scheda riservata', cardHelp: 'Compila la tua scheda: le risposte le vede solo la regia, non le altre ragazze. Serviranno durante l\'indagine.', cardSaved: 'Scheda salvata ✔', cardEdit: '(puoi ancora modificarla).', cardRequired: 'I campi con * sono obbligatori.', saveCard: 'SALVA SCHEDA', updateCard: 'AGGIORNA SCHEDA', cardSavedToast: 'Scheda salvata. Nessun\'altra può vederla.', fillRequired: 'Compila i campi obbligatori (*)', waitStart: 'Poi aspetta che la regia avvii il gioco. Tieni il telefono sbloccato e non chiudere questa pagina.', changeLang: 'English',
      poisoned: '{victim} è stata avvelenata.', lookScreen: 'Guarda lo schermo.', noCard: 'Non hai compilato la scheda: fallo ora, prima che inizi l\'indagine.', fillCard: 'Compila la scheda',
      levelDone: '✔ ATTO SUPERATO', nextSoon: 'Prossimo atto tra pochi secondi...', win: '💊 ANTIDOTO SOMMINISTRATO 💊<br>{victim} è salva.<br>Buon compleanno {name}!', dead: '☠ TROPPO TARDI', deadHelp: 'Il tempo è scaduto. Guardate lo schermo.',
      wrongToast: 'Sbagliato! Il Cuoco ride di te.', digit: 'Cifra',
      sync: 'Tieni premuto il pulsante. Si sblocca solo se lo fate TUTTE insieme per 3 secondi.', hold: 'PREMI E TIENI', holding: 'TIENI!', pressing: '{n} stanno premendo',
      fragments: 'Questa è la tua striscia del biglietto. Metti il telefono accanto a quelli della tua squadra ({team}), in verticale, nell\'ordine giusto.', fullSentence: 'Frase completa (tre parole, ordine: {order}):', writeSentence: 'SCRIVI LA FRASE', send: 'INVIA',
      cipher: 'Ecco la tua parte della chiave. Dilla alle altre e guardate il messaggio sullo schermo.', cipherNone: 'Non hai pezzi di chiave: aiuta le altre a mettere insieme le lettere.', cipherWord: 'La parola decifrata:', writeWord: 'SCRIVI LA PAROLA',
      file: 'Fascicolo {n}', suspectName: 'NOME DELLA SOSPETTATA', identify: 'IDENTIFICA', filesDone: 'I tuoi fascicoli sono chiusi. Aiuta le altre!', password: 'Parola d\'ordine', passwordHelp: 'Le lettere svelate sullo schermo, in ordine.', passwordPh: 'PAROLA D\'ORDINE', unlock: 'SBLOCCA',
      seatClue: 'Il tuo indizio', seatNoClue: 'Non hai indizi: aiuta le altre a ragionare.', seatHelp: 'Tocca i nomi nell\'ordine dei posti, da sinistra (posto 1) a destra (posto {n}).', seatSlot: 'Posto {k}', clear: 'CANCELLA', seatLocked: 'Attendi {s} s prima di riprovare.',
      lights: 'Controlli {what} del quadro elettrico. Premendo cambi il tuo e quelli vicini. Guarda lo schermo!', thisSwitch: 'questo interruttore', theseSwitches: 'questi interruttori', switchLabel: 'Interruttore {r}·{c} · {state}', on: 'ACCESO', off: 'SPENTO', noSwitch: 'Nessun interruttore assegnato: aiuta le altre a decidere.',
      qrhunt: 'Cerca le tre fiale nascoste in casa e inquadra la loro etichetta (QR) con la <b>fotocamera</b>. Se il QR non si legge, digita qui il codice scritto sotto.', vialCode: 'CODICE FIALA', sendCode: 'INVIA CODICE', yourVials: 'Le tue fiale', vial: 'Fiala {n}', vialsFound: 'Fiale trovate: {a}/{b}',
      saved: '✔ Prova salvata!', waitOthers: 'Aspetta le altre ({n} pronte).', erasing: 'PROVA IN CANCELLAZIONE', reconnect: 'Inquadra con la fotocamera il QR sullo schermo, oppure digita il codice scritto sotto al QR.', code: 'CODICE', saveProof: 'SALVA LA PROVA',
      simonRound: 'Dose {a}/{b} · ', simonWatch: 'Guarda lo schermo e memorizza...', simonGo: 'Premi quando tocca al tuo colore!',
      roomsClue: 'Il tuo indizio', roomsNoClue: 'Non hai indizi: ascolta le altre.', roomsHelp: 'Vota la stanza. Puoi cambiare voto finché non avete votato tutte.', voted: 'Hanno votato: {a}/{b}', yourVote: 'Il tuo voto',
      confirmed: '✔ Confermato', ready: '{a}/{b} pronte. Forza!', vault: 'Inserisci il codice a 3 cifre (fiala 1, fiala 2, fiala 3). Tutte dovete confermare entro 20 secondi dalla prima!'
    },
    en: {
      terminal: 'INVESTIGATION · TERMINAL', solved: 'CASE SOLVED', timeout: 'TIME IS UP', hint: 'HINT', connected: 'connected', connecting: 'connecting...',
      chooseLang: 'Scegli la lingua / Choose your language', join: 'Join the investigation', joinHelp: 'Type your name: you will be assigned to a team.', yourName: 'your name', enter: 'JOIN',
      inside: 'You are in, {name}!', team: 'Team {team}', card: '🔒 Private card', cardHelp: 'Fill in your card: only the game master sees the answers, not the other girls. They will be used during the investigation.', cardSaved: 'Card saved ✔', cardEdit: '(you can still edit it).', cardRequired: 'Fields marked * are required.', saveCard: 'SAVE CARD', updateCard: 'UPDATE CARD', cardSavedToast: 'Card saved. Nobody else can see it.', fillRequired: 'Fill in the required fields (*)', waitStart: 'Then wait for the game master to start the game. Keep your phone unlocked and do not close this page.', changeLang: 'Italiano',
      poisoned: '{victim} has been poisoned.', lookScreen: 'Look at the screen.', noCard: 'You have not filled in your card: do it now, before the investigation starts.', fillCard: 'Fill in the card',
      levelDone: '✔ ACT COMPLETE', nextSoon: 'Next act in a few seconds...', win: '💊 ANTIDOTE GIVEN 💊<br>{victim} is safe.<br>Happy birthday {name}!', dead: '☠ TOO LATE', deadHelp: 'Time is up. Look at the screen.',
      wrongToast: 'Wrong! The Cook laughs at you.', digit: 'Digit',
      sync: 'Press and hold the button. It only unlocks if you ALL do it together for 3 seconds.', hold: 'PRESS AND HOLD', holding: 'HOLD!', pressing: '{n} are pressing',
      fragments: 'This is your strip of the note. Put your phone next to your team mates\' phones ({team}), upright, in the right order.', fullSentence: 'Full sentence (three words, order: {order}):', writeSentence: 'TYPE THE SENTENCE', send: 'SEND',
      cipher: 'Here is your part of the key. Tell the others and look at the message on the screen.', cipherNone: 'You have no key pieces: help the others put the letters together.', cipherWord: 'The decoded word:', writeWord: 'TYPE THE WORD',
      file: 'File {n}', suspectName: 'SUSPECT\'S NAME', identify: 'IDENTIFY', filesDone: 'Your files are closed. Help the others!', password: 'Password', passwordHelp: 'The letters revealed on the screen, in order.', passwordPh: 'PASSWORD', unlock: 'UNLOCK',
      seatClue: 'Your clue', seatNoClue: 'You have no clue: help the others think.', seatHelp: 'Tap the names in seat order, from the left (seat 1) to the right (seat {n}).', seatSlot: 'Seat {k}', clear: 'CLEAR', seatLocked: 'Wait {s} s before trying again.',
      lights: 'You control {what} of the fuse box. Pressing flips yours and the neighbouring ones. Watch the screen!', thisSwitch: 'this switch', theseSwitches: 'these switches', switchLabel: 'Switch {r}·{c} · {state}', on: 'ON', off: 'OFF', noSwitch: 'No switch assigned: help the others decide.',
      qrhunt: 'Look for the three vials hidden in the house and scan their label (QR) with the <b>camera</b>. If the QR will not scan, type the code written below it here.', vialCode: 'VIAL CODE', sendCode: 'SEND CODE', yourVials: 'Your vials', vial: 'Vial {n}', vialsFound: 'Vials found: {a}/{b}',
      saved: '✔ Evidence saved!', waitOthers: 'Wait for the others ({n} ready).', erasing: 'EVIDENCE BEING ERASED', reconnect: 'Scan the QR on the screen with your camera, or type the code written under the QR.', code: 'CODE', saveProof: 'SAVE THE EVIDENCE',
      simonRound: 'Dose {a}/{b} · ', simonWatch: 'Watch the screen and memorise...', simonGo: 'Press when it is your colour!',
      roomsClue: 'Your clue', roomsNoClue: 'You have no clue: listen to the others.', roomsHelp: 'Vote for the room. You can change your vote until everyone has voted.', voted: 'Voted: {a}/{b}', yourVote: 'Your vote',
      confirmed: '✔ Confirmed', ready: '{a}/{b} ready. Go!', vault: 'Enter the 3-digit code (vial 1, vial 2, vial 3). Everyone must confirm within 20 seconds of the first!'
    }
  };
  const T = (k, vars = {}) => { let s = (UI[lang || 'it'] || UI.it)[k] || k; for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(b); return s; };

  const ws = connect({
    hello: () => ({ role: 'phone', pid }),
    onOpen: () => { $('status').textContent = T('connected'); },
    onState: (s) => { S = s; clockSkew = s.now - Date.now(); if (S.me && S.me.lang && S.me.lang !== lang) setLang(S.me.lang); render(); },
    onMessage: (m) => {
      if (m.type === 'joined') setPid(m.pid);
      if (m.type === 'wrong') { vibrate([120, 60, 120]); $('main').classList.remove('shake'); void $('main').offsetWidth; $('main').classList.add('shake'); toast(T('wrongToast'), 'bad'); }
      if (m.type === 'buzz') vibrate(m.pattern);
      if (m.type === 'keyResult') { toast(m.msg + (m.ok && m.digit ? ` ${T('digit')}: ${m.digit}` : ''), m.ok ? 'good' : 'bad'); if (m.ok) vibrate([200]); }
    }
  });
  const send = (msg) => ws.send(msg);
  function toast(text, kind = 'info') { const el = $('toast'); el.textContent = text; el.className = 'toast ' + kind; clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 3500); }
  const input = (id, ph, big = true) => `<input id="${id}" class="${big ? 'big' : ''}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="characters" spellcheck="false">`;
  const cine = (scenes, opts) => NOVA.cine.play(scenes, { ...opts, lang: lang || 'it' }).catch(() => {});
  let seatPick = [];

  // ---- viste
  const V = {
    lang: () => `<div class="join"><h2>${T('chooseLang')}</h2><div class="langs"><button data-lang="it">🇮🇹 Italiano</button><button data-lang="en">🇬🇧 English</button></div></div>`,
    join: () => `<div class="join"><h2>${T('join')}</h2><p class="muted">${T('joinHelp')}</p>${input('name', T('yourName'), false)}<button id="joinBtn">${T('enter')}</button><button id="langBack" class="secondary" style="width:100%;margin-top:10px">${T('changeLang')}</button></div>`,
    lobby: () => {
      const done = S.me.profile && Object.keys(S.me.profile).length;
      const form = S.profileFields.map((f) => `<label class="muted" style="display:block;margin:10px 0 4px">${esc(f.label)}${f.required ? ' *' : ''}</label><input id="pf_${f.key}" placeholder="${esc(f.placeholder)}" autocomplete="off" value="${esc((S.me.profile || {})[f.key] || '')}">`).join('');
      return `<div class="bigmsg" style="padding:10px 0">${T('inside', { name: esc(S.me.name) })}<br><span style="color:${S.me.color}">${T('team', { team: esc(S.me.teamName) })}</span></div>
        <div class="card"><h2>${T('card')}</h2><p class="muted">${T('cardHelp')} ${done ? `<b class="ok-badge">${T('cardSaved')}</b> ${T('cardEdit')}` : T('cardRequired')}</p>${form}<button id="profBtn" style="width:100%;margin-top:14px">${done ? T('updateCard') : T('saveCard')}</button></div>
        <p class="muted" style="text-align:center;margin-top:14px">${T('waitStart')}</p><button id="switchLang" class="secondary" style="width:100%">${T('changeLang')}</button>`;
    },
    intro: () => `<div class="bigmsg glitch" style="color:var(--bad)">${T('poisoned', { victim: esc(S.victim) })}</div><p class="muted" style="text-align:center">${T('lookScreen')} ${S.me.profile ? '' : T('noCard')}</p>${S.me.profile ? '' : `<button id="backLobby" class="secondary" style="width:100%">${T('fillCard')}</button>`}`,
    levelDone: () => `<div class="bigmsg" style="color:var(--ok)">${T('levelDone')}</div><p class="muted" style="text-align:center">${T('nextSoon')}</p>`,
    win: () => `<div class="bigmsg" style="color:var(--ok)">${T('win', { victim: esc(S.victim), name: esc(S.birthday.name) })}</div>`,
    dead: () => `<div class="bigmsg" style="color:var(--bad)">${T('dead')}</div><p class="muted" style="text-align:center">${T('deadHelp')}</p>`,
    sync: () => `<p>${T('sync')}</p><button class="holdbtn ${S.L.me ? 'active' : ''}" id="hold">${S.L.me ? T('holding') : T('hold')}</button><p class="muted" style="text-align:center">${T('pressing', { n: S.L.pressing.length })}</p>`,
    fragments: () => `<p>${T('fragments', { team: esc(S.me.teamName) })}</p><div class="strip" style="--tc:${S.me.color}">${S.L.mine ? fragmentSvg(S.L.mine, S.L.mine.strip) : ''}</div><p style="margin-top:12px">${T('fullSentence', { order: S.L.order.map(esc).join(' → ') })}</p>${input('ans', T('writeSentence'))}<button id="ansBtn" style="width:100%;margin-top:8px">${T('send')}</button>`,
    cipher: () => `<p>${S.L.mine.length ? T('cipher') : T('cipherNone')}</p><div class="keyparts">${S.L.mine.map((k) => `<div class="keypart"><span class="sym">${k.sym}</span><span class="eq">=</span><span class="let">${k.letter}</span></div>`).join('')}</div><p style="margin-top:12px">${T('cipherWord')}</p>${input('ans', T('writeWord'))}<button id="ansBtn" style="width:100%;margin-top:8px">${T('send')}</button>`,
    riddles: () => {
      const mine = S.L.mine.map((r) => `<div class="card riddle"><div class="muted mono">${T('file', { n: r.idx + 1 })}</div><div class="q">${esc(r.q)}</div>${input('r' + r.idx, T('suspectName'))}<button data-idx="${r.idx}" class="rBtn" style="width:100%;margin-top:8px">${T('identify')}</button></div>`).join('');
      const done = S.L.mine.length ? '' : `<p class="ok-badge">${T('filesDone')}</p>`;
      return mine + done + `<div class="card"><div class="muted mono">${T('password')}</div><p class="muted">${T('passwordHelp')}</p>${input('pw', T('passwordPh'))}<button id="pwBtn" style="width:100%;margin-top:8px">${T('unlock')}</button></div>`;
    },
    seating: () => {
      const locked = S.L.lockedUntil > now();
      return `<div class="card"><div class="muted mono">${T('seatClue')}</div>${S.L.mine.length ? S.L.mine.map((c) => `<div class="q">${esc(c)}</div>`).join('') : `<p class="muted">${T('seatNoClue')}</p>`}</div>
        <p style="margin-top:12px">${T('seatHelp', { n: S.L.n })}</p>
        <div class="seats" id="seats">${Array.from({ length: S.L.n }, (_, k) => `<div class="seat ${seatPick[k] ? 'filled' : ''}"><small>${T('seatSlot', { k: k + 1 })}</small><b>${esc(seatPick[k] || '?')}</b></div>`).join('')}</div>
        <div class="namepick">${S.L.names.map((n) => `<button class="secondary nameBtn" data-name="${esc(n)}" ${seatPick.includes(n) ? 'disabled' : ''}>${esc(n)}</button>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button id="seatClear" class="secondary" style="flex:1">${T('clear')}</button><button id="seatSend" style="flex:2" ${seatPick.length === S.L.n && !locked ? '' : 'disabled'}>${T('send')}</button></div>
        ${locked ? `<p class="muted" style="text-align:center">${T('seatLocked', { s: Math.ceil((S.L.lockedUntil - now()) / 1000) })}</p>` : ''}`;
    },
    lights: () => `<p>${T('lights', { what: S.L.mine.length === 1 ? T('thisSwitch') : T('theseSwitches') })}</p>${S.L.mine.map((c) => `<button class="cellbtn ${S.L.grid[c] ? 'on' : ''}" data-cell="${c}">${T('switchLabel', { r: Math.floor(c / 4) + 1, c: (c % 4) + 1, state: S.L.grid[c] ? T('on') : T('off') })}</button>`).join('') || `<p class="muted">${T('noSwitch')}</p>`}`,
    qrhunt: () => `<p>${T('qrhunt')}</p>${input('key', T('vialCode'))}<button id="keyBtn" style="width:100%;margin-top:8px">${T('sendCode')}</button>${S.L.myDigits.length ? `<div class="card" style="margin-top:14px"><div class="muted mono">${T('yourVials')}</div><div class="digits">${S.L.myDigits.map((d) => `<div>${T('vial', { n: d.idx + 1 })}: <span class="digit">${d.digit}</span></div>`).join('')}</div></div>` : ''}<p class="muted" style="margin-top:12px">${T('vialsFound', { a: S.L.keys.filter((k) => k.found).length, b: S.L.keys.length })}</p>`,
    reconnect: () => S.L.me ? `<div class="bigmsg" style="color:var(--ok)">${T('saved')}</div><p class="muted" style="text-align:center">${T('waitOthers', { n: S.L.done.length })}</p>` : `<div class="bigmsg" style="color:var(--bad)">${T('erasing')}</div><p>${T('reconnect')}</p>${input('key', T('code'))}<button id="keyBtn" style="width:100%;margin-top:8px">${T('saveProof')}</button>`,
    simon: () => `<p style="text-align:center">${T('simonRound', { a: S.L.round + 1, b: S.L.rounds })}${S.L.showing ? T('simonWatch') : T('simonGo')}</p><button class="simonbtn ${S.L.showing ? 'locked' : ''}" id="simon" style="--tc:${S.me.color}">${esc(S.me.teamName)}</button>`,
    rooms: () => `<div class="card"><div class="muted mono">${T('roomsClue')}</div>${S.L.mine.length ? S.L.mine.map((c) => `<div class="q">${esc(c)}</div>`).join('') : `<p class="muted">${T('roomsNoClue')}</p>`}</div>
      <p style="margin-top:12px">${T('roomsHelp')}</p><div class="roomgrid">${S.L.rooms.map((r) => `<button class="secondary roomBtn ${S.L.myVote === r.id ? 'sel' : ''}" data-room="${r.id}">${esc(r.name)}</button>`).join('')}</div>
      <p class="muted" style="text-align:center">${T('voted', { a: S.L.voted, b: S.L.total })}</p>`,
    vault: () => S.L.me ? `<div class="bigmsg" style="color:var(--ok)">${T('confirmed')}</div><p class="muted" style="text-align:center">${T('ready', { a: S.L.confirmed.length, b: S.L.total })}</p>` : `<p>${T('vault')}</p>${input('code', '___')}<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del">⌫</button><button data-k="0">0</button><button class="go" data-k="go">OK</button></div>`
  };

  function playScenes() {
    if (!S || !S.me) return;
    const key = S.phase === 'intro' ? 'intro' : S.phase === 'dead' ? 'dead:' + S.levelIdx : S.phase === 'level' ? 'level:' + S.levelIdx : null;
    if (key && key !== seenScene) {
      seenScene = key;
      if (S.scenes && S.scenes.length) cine(S.scenes, { button: S.phase === 'intro' ? (lang === 'en' ? 'GOT IT' : 'HO CAPITO') : S.phase === 'dead' ? 'OK' : (lang === 'en' ? 'START' : 'INIZIA') });
    }
    if (S.hint && S.hint.at !== seenHint) {
      const fresh = now() - S.hint.at < 60000;
      seenHint = S.hint.at;
      if (fresh && S.hintScenes) cine(S.hintScenes, { button: false });
    }
  }
  function render() {
    if (!S) return;
    playScenes();
    $('lvl').textContent = S.level ? S.level.title : (S.phase === 'win' ? T('solved') : S.phase === 'dead' ? T('timeout') : T('terminal'));
    $('me').textContent = S.me ? S.me.name : '';
    const t = $('team'); if (S.me) { t.style.display = ''; t.style.setProperty('--tc', S.me.color); t.textContent = S.me.teamName; } else t.style.display = 'none';
    const h = $('hint'); if (S.hint && S.hint.text && now() - S.hint.at < 90000) { h.classList.remove('hidden'); h.innerHTML = `<b>${T('hint')}:</b> ${esc(S.hint.text)}`; } else h.classList.add('hidden');
    if (S.toast && S.toast.at !== lastToastAt && S.toast.kind === 'good') { lastToastAt = S.toast.at; toast(S.toast.text, 'good'); }

    let view;
    if (!S.me) view = lang ? 'join' : 'lang';
    else if (S.phase === 'lobby') view = 'lobby';
    else if (S.phase === 'intro') view = 'intro';
    else if (S.phase === 'levelDone') view = 'levelDone';
    else if (S.phase === 'win') view = 'win';
    else if (S.phase === 'dead') view = 'dead';
    else if (forceLobby && S.phase === 'intro') view = 'lobby';
    else view = S.level.id;
    if (view !== 'seating') seatPick = [];
    const key = view + '|' + lang + '|' + JSON.stringify(viewKey(view));
    if (key === lastKey) return;
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
      case 'cipher': return [L.mine];
      case 'riddles': return [L.mine.map((r) => r.idx)];
      case 'seating': return [L.mine, seatPick, L.lockedUntil > now()];
      case 'lights': return [L.mine, L.mine.map((c) => L.grid[c])];
      case 'qrhunt': return [L.myDigits, L.keys.map((k) => k.found)];
      case 'reconnect': return [L.me, L.done.length];
      case 'simon': return [L.round, L.showing];
      case 'rooms': return [L.mine, L.myVote, L.voted, L.total];
      case 'vault': return [L.me, L.confirmed.length, L.total];
      case 'lobby': return [S.me && S.me.team, !!(S.me && S.me.profile), S.phase];
      case 'intro': return [!!(S.me && S.me.profile)];
      default: return [S.me && S.me.team];
    }
  }
  function bind(view) {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    if (view === 'lang') document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); lastKey = ''; render(); }));
    if (view === 'join') {
      const go = () => { const name = $('name').value.trim(); if (name) send({ type: 'join', name, pid, lang }); };
      on('joinBtn', 'click', go); on('name', 'keydown', (e) => { if (e.key === 'Enter') go(); }); $('name').focus();
      on('langBack', 'click', () => { setLang(lang === 'en' ? 'it' : 'en'); lastKey = ''; render(); });
    }
    if (view === 'lobby') {
      on('profBtn', 'click', () => {
        const data = {}; let missing = false;
        S.profileFields.forEach((f) => { const v = $('pf_' + f.key).value.trim(); data[f.key] = v; if (f.required && !v) missing = true; });
        if (missing) { toast(T('fillRequired'), 'bad'); return; }
        send({ type: 'profile', data }); forceLobby = false; toast(T('cardSavedToast'), 'good'); vibrate(60);
      });
      on('switchLang', 'click', () => { const l = lang === 'en' ? 'it' : 'en'; setLang(l); send({ type: 'setLang', lang: l }); lastKey = ''; render(); });
    }
    if (view === 'intro') on('backLobby', 'click', () => { forceLobby = true; lastKey = ''; render(); });
    if (view === 'sync') {
      const b = $('hold');
      const down = (e) => { e.preventDefault(); b.classList.add('active'); b.textContent = T('holding'); send({ type: 'hold' }); vibrate(30); };
      const up = (e) => { e.preventDefault(); b.classList.remove('active'); b.textContent = T('hold'); send({ type: 'release' }); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    if (view === 'fragments' || view === 'cipher') { const go = () => send({ type: 'answer', text: $('ans').value }); on('ansBtn', 'click', go); on('ans', 'keydown', (e) => { if (e.key === 'Enter') go(); }); }
    if (view === 'riddles') {
      document.querySelectorAll('.rBtn').forEach((b) => b.addEventListener('click', () => { const idx = Number(b.dataset.idx); send({ type: 'answer', idx, text: $('r' + idx).value }); }));
      document.querySelectorAll('input[id^="r"]').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') send({ type: 'answer', idx: Number(i.id.slice(1)), text: i.value }); }));
      on('pwBtn', 'click', () => send({ type: 'password', text: $('pw').value }));
    }
    if (view === 'seating') {
      document.querySelectorAll('.nameBtn').forEach((b) => b.addEventListener('click', () => { if (seatPick.length < S.L.n) { seatPick.push(b.dataset.name); vibrate(20); lastKey = ''; render(); } }));
      on('seatClear', 'click', () => { seatPick = []; lastKey = ''; render(); });
      on('seatSend', 'click', () => { send({ type: 'order', order: seatPick.slice() }); seatPick = []; });
    }
    if (view === 'lights') document.querySelectorAll('.cellbtn').forEach((b) => b.addEventListener('click', () => { send({ type: 'toggle', cell: Number(b.dataset.cell) }); vibrate(40); }));
    if (view === 'qrhunt' || view === 'reconnect') on('keyBtn', 'click', () => { send({ type: 'code', text: $('key').value }); $('key').value = ''; });
    if (view === 'simon') on('simon', 'pointerdown', (e) => { e.preventDefault(); if (!S.L.showing) { send({ type: 'press' }); vibrate(40); } });
    if (view === 'rooms') document.querySelectorAll('.roomBtn').forEach((b) => b.addEventListener('click', () => { send({ type: 'vote', room: b.dataset.room }); vibrate(30); }));
    if (view === 'vault') document.querySelectorAll('.keypad button').forEach((b) => b.addEventListener('click', () => {
      const i = $('code'), k = b.dataset.k;
      if (k === 'del') i.value = i.value.slice(0, -1);
      else if (k === 'go') send({ type: 'code', text: i.value });
      else if (i.value.length < 3) i.value += k;
      vibrate(20);
    }));
  }
  setInterval(() => {
    if (!S || !S.level) return;
    if (S.level.id === 'simon') { const showing = now() < S.L.showUntil; if (showing !== S.L.showing) { S.L.showing = showing; render(); } }
    if (S.level.id === 'seating' && S.L.lockedUntil) render();
  }, 250);
})();
