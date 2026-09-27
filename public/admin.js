// Pannello di regia: avvia, salta livelli, invia suggerimenti, gestisce squadre e tempo.
(function () {
  const { connect, mmss, esc } = NOVA;
  const $ = (id) => document.getElementById(id);
  let S = null, key = localStorage.getItem('adminKey') || '', ws = null, clockSkew = 0;
  const now = () => Date.now() + clockSkew;
  function start() {
    ws = connect({
      hello: () => ({ role: 'admin', key }),
      onState: (s) => { S = s; clockSkew = s.now - Date.now(); $('login').classList.add('hidden'); $('panel').classList.remove('hidden'); render(); },
      onMessage: (m) => { if (m.type === 'authError') { localStorage.removeItem('adminKey'); $('login').classList.remove('hidden'); $('panel').classList.add('hidden'); $('key').value = ''; $('key').placeholder = 'CHIAVE ERRATA'; } }
    });
  }
  $('loginBtn').onclick = () => { key = $('key').value.trim(); localStorage.setItem('adminKey', key); if (ws) location.reload(); else start(); };
  $('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });
  if (key) start();
  const send = (m) => ws.send(m);
  const btn = (label, msg, cls = '') => `<button class="${cls}" data-msg='${JSON.stringify(msg)}'>${label}</button>`;

  function render() {
    const A = S.admin;
    $('links').innerHTML = `<a href="${A.screenUrl}" target="_blank">Schermo</a> · <a href="${A.printUrl}" target="_blank">Stampa QR</a> · <span class="mono">${esc(S.joinUrl)}</span>`;
    $('phase').textContent = `Fase: ${S.phase}` + (S.level ? ` · ${S.level.title}` : '') + ` · Suggerimenti usati: ${S.hintsUsed}`;
    let flow = '';
    if (S.phase === 'lobby') flow = btn(`▶ Inizia (storia + timer) · schede ${S.profilesDone}/${S.players.length}`, { type: 'start' });
    else if (S.phase === 'dead') flow = '<span class="muted">Tempo scaduto: aggiungi minuti per riprendere il livello.</span>';
    else if (S.phase === 'intro') flow = btn('▶ Livello 1', { type: 'firstLevel' });
    else if (S.phase === 'level' || S.phase === 'levelDone') flow = btn('◀ Precedente', { type: 'prev' }, 'secondary') + btn('↻ Ricomincia livello', { type: 'restartLevel' }, 'secondary') + btn('✔ Segna risolto', { type: 'solve' }) + btn('Prossimo ▶', { type: 'next' });
    $('flow').innerHTML = flow;
    $('gotoSel').innerHTML = A.levels.map((l, i) => `<option value="${i}" ${i === S.levelIdx ? 'selected' : ''}>${esc(l)}</option>`).join('');
    $('hints').innerHTML = A.hints.map((h, i) => btn(`💡 ${i + 1}: ${esc(h)}`, { type: 'hint', idx: i }, 'secondary')).join('') || '<span class="muted">nessun suggerimento in questa fase</span>';
    $('keys').innerHTML = A.keys.map((k, i) => `Fiala ${i + 1}: codice <b>${esc(k.code)}</b> → cifra <b>${esc(k.digit)}</b> · nascondila: ${esc(k.hint)}`).join('<br>');
    $('profiles').innerHTML = A.profiles.map((p) => `<details><summary><b>${esc(p.name)}</b> ${p.profile ? '✔' : '<span class="muted">(scheda non compilata)</span>'}</summary>${p.profile ? S.profileFields.map((f) => p.profile[f.key] ? `<div><span class="muted">${esc(f.label)}</span><br>${esc(p.profile[f.key])}</div>` : '').join('') : ''}</details>`).join('');
    let cheat = '';
    if (A.riddleAnswers) cheat = '<b>Fascicoli:</b> ' + A.riddleAnswers.map((a, i) => `${i + 1}=${esc(a)}`).join(' · ') + ` · parola d'ordine: ${esc(A.riddlePassword)}`;
    if (A.fragmentsAnswer) cheat = `<b>Comando:</b> ${esc(A.fragmentsAnswer)}`;
    if (S.level && S.level.id === 'reconnect') cheat = `<b>Codice attuale:</b> ${esc(S.L.token)}`;
    if (S.level && S.level.id === 'vault') cheat = `<b>Codice cassaforte:</b> ${A.keys.map((k) => k.digit).join('')}`;
    $('cheat').innerHTML = cheat;
    $('players').innerHTML = '<tr><th>Nome</th><th>Squadra</th><th>Stato</th><th></th></tr>' + S.players.map((p) => `<tr><td>${esc(p.name)}</td><td><select data-pid="${p.pid}" class="teamSel">${S.teams.map((t, i) => `<option value="${i}" ${i === p.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td><td>${p.connected ? '🟢' : '⚫'}</td><td>${btn('✕', { type: 'kick', pid: p.pid }, 'secondary')}</td></tr>`).join('');
    $('log').innerHTML = A.log.map((l) => `<div>${new Date(l.at).toLocaleTimeString('it-IT')} · ${esc(l.text)}</div>`).join('');
    document.querySelectorAll('[data-msg]').forEach((b) => { b.onclick = () => send(JSON.parse(b.dataset.msg)); });
    document.querySelectorAll('.teamSel').forEach((s) => { s.onchange = () => send({ type: 'setTeam', pid: s.dataset.pid, team: Number(s.value) }); });
  }
  $('gotoBtn').onclick = () => send({ type: 'goto', idx: Number($('gotoSel').value) });
  $('customHintBtn').onclick = () => { const t = $('customHint').value.trim(); if (t) { send({ type: 'hint', text: t }); $('customHint').value = ''; } };
  document.querySelectorAll('[data-min]').forEach((b) => { b.onclick = () => send({ type: 'addTime', minutes: Number(b.dataset.min) }); });
  $('resetBtn').onclick = () => { if (confirm('Azzerare la partita?')) send({ type: 'reset' }); };
  $('resetAllBtn').onclick = () => { if (confirm('Azzerare tutto, comprese le giocatrici?')) send({ type: 'reset', dropPlayers: true }); };
  $('winBtn').onclick = () => { if (confirm('Forzare la vittoria?')) send({ type: 'win' }); };
  setInterval(() => { if (S) $('timer').textContent = S.deadline ? mmss(S.deadline - now()) : '--:--'; }, 500);
})();
