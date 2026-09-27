'use strict';
// Simulazione automatica: 12 telefoni + regia giocano tutti i livelli fino alla vittoria.
// Uso: node tools/simulate.js  (con il server già avviato: ADMIN_KEY=test node server.js)
const WebSocket = require('ws');
const http = require('http');
const PORT = process.env.PORT || 3000, KEY = process.env.ADMIN_KEY || 'test';
const NAMES = ['Martina', 'Giulia', 'Sofia', 'Aurora', 'Alice', 'Ginevra', 'Emma', 'Giorgia', 'Greta', 'Beatrice', 'Anna', 'Sara'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (path, cookie) => new Promise((res, rej) => http.get({ port: PORT, path, headers: { cookie } }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));

function client(role, extra = {}) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, state: null, pid: null, msgs: [] };
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.type === 'state') c.state = m; else { c.msgs.push(m); if (m.type === 'joined') c.pid = m.pid; } });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.open = new Promise((r) => ws.on('open', () => { c.send({ type: 'hello', role, ...extra }); r(); }));
  return c;
}
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok  :', msg); };
async function waitFor(c, pred, label, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (c.state && pred(c.state)) return; await sleep(60); }
  console.error('TIMEOUT:', label, JSON.stringify(c.state && { phase: c.state.phase, L: c.state.L }).slice(0, 400)); process.exit(1);
}

(async () => {
  const admin = client('admin', { key: KEY }); await admin.open;
  await sleep(200); admin.send({ type: 'reset', dropPlayers: true });
  const phones = NAMES.map(() => client('phone', { pid: null }));
  await Promise.all(phones.map((p) => p.open));
  phones.forEach((p, i) => p.send({ type: 'join', name: NAMES[i] }));
  await waitFor(admin, (s) => s.players.length === 12, 'lobby: 12 giocatrici entrate');
  const teamsCount = [0, 1, 2].map((t) => admin.state.players.filter((p) => p.team === t).length);
  assert(teamsCount.every((n) => n === 4), `squadre bilanciate 4/4/4 (${teamsCount})`);
  await sleep(200);
  const me = (p) => p.state.me;
  // Schede riservate: 11 le compilano, una (Sara) no, per provare il fascicolo di riserva.
  phones.slice(0, 11).forEach((p, i) => p.send({ type: 'profile', data: { nickname: NAMES[i].slice(0, 3) + 'y', food: ['pizza', 'sushi', 'lasagne', 'patatine'][i % 4], passion: 'pallavolo n.' + i, met: 'in prima media', secret: 'segreto ' + i, closest: NAMES[(i + 1) % 12], alibi: 'in bagno' } }));
  await waitFor(admin, (s) => s.profilesDone === 11, 'lobby: 11 schede compilate');
  assert(admin.state.admin.profiles.filter((p) => p.profile).length === 11, 'la regia vede le schede');
  assert(!phones[0].state.players || !JSON.stringify(phones[0].state).includes('segreto 3'), 'un telefono non vede le schede delle altre');

  admin.send({ type: 'start' }); await waitFor(admin, (s) => s.phase === 'intro', 'intro');
  assert(admin.state.story.intro[3].includes('pizza') && admin.state.story.intro[3].includes('sushi'), 'la storia elenca i piatti delle schede');
  admin.send({ type: 'firstLevel' }); await waitFor(admin, (s) => s.level && s.level.id === 'sync', 'livello sync');

  // 1. sync: tutte premono per 3s
  phones.forEach((p) => p.send({ type: 'hold' }));
  await waitFor(admin, (s) => s.phase === 'levelDone', 'sync risolto (tutte premute 3s)', 6000);
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'fragments', 'livello fragments');

  // 2. fragments: ricostruisce il comando dalle strisce di ogni squadra
  await sleep(300);
  const words = [0, 1, 2].map((t) => phones.find((p) => me(p).team === t).state.L.mine.word);
  const strips = phones.filter((p) => me(p).team === 0).map((p) => p.state.L.mine.strip).sort();
  assert(JSON.stringify(strips) === JSON.stringify([0, 1, 2, 3]), 'strisce 0..3 distribuite alla squadra 0');
  phones[0].send({ type: 'answer', text: 'comando sbagliato' }); await sleep(200);
  assert(phones[0].msgs.some((m) => m.type === 'wrong'), 'risposta errata segnalata al telefono');
  phones[0].send({ type: 'answer', text: words.join(' ').toLowerCase() });
  await waitFor(admin, (s) => s.phase === 'levelDone', `fragments risolto con "${words.join(' ')}"`);
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'riddles', 'livello riddles');

  // 3. riddles: ogni telefono risponde ai propri indovinelli con le risposte della regia
  await sleep(300);
  const answers = admin.state.admin.riddleAnswers;
  assert(phones.every((p) => p.state.L.mine.length === 1), 'un fascicolo per telefono');
  assert(phones.every((p) => answers[p.state.L.mine[0].idx] !== me(p).name), 'nessuna riceve il proprio fascicolo');
  assert(phones.some((p) => p.state.L.mine[0].q.includes('segreto ')), 'i fascicoli usano le schede');
  assert(phones.some((p) => p.state.L.mine[0].q.includes('Non ha compilato la scheda')), 'fascicolo di riserva per chi non ha compilato');
  { const p = phones.find((p) => answers[p.state.L.mine[0].idx] === 'Giulia'); p.send({ type: 'answer', idx: p.state.L.mine[0].idx, text: 'giuy' }); await waitFor(admin, (s) => s.L.identified.some((x) => x.name === 'Giulia'), 'accettato il soprannome al posto del nome'); }
  phones.forEach((p) => p.state.L.mine.forEach((r) => p.send({ type: 'answer', idx: r.idx, text: answers[r.idx] })));
  await waitFor(admin, (s) => s.L && s.L.allSolved, 'tutte le sospettate identificate');
  assert(admin.state.L.letters.every(Boolean), 'tutte le lettere della parola d\'ordine svelate');
  phones[3].send({ type: 'password', text: 'contro veleno' });
  await waitFor(admin, (s) => s.phase === 'levelDone', 'parola d\'ordine CONTROVELENO accettata');
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'lights', 'livello lights');

  // Tempo scaduto: togliendo 61 minuti si entra in "dead"; aggiungendone 10 si riprende lo stesso livello.
  admin.send({ type: 'addTime', minutes: -61 }); await waitFor(admin, (s) => s.phase === 'dead', 'tempo scaduto → fase "troppo tardi"');
  admin.send({ type: 'addTime', minutes: 71 }); await waitFor(admin, (s) => s.phase === 'level' && s.level.id === 'lights', 'minuti extra → il livello riprende');
  // 4. lights: risolve con eliminazione gaussiana su GF(2) e fa premere le proprietarie
  await sleep(300);
  const grid = admin.state.L.grid;
  const sol = solveLights(grid);
  assert(sol, 'configurazione del circuito risolvibile');
  const owner = {}; phones.forEach((p) => p.state.L.mine.forEach((c) => (owner[c] = p)));
  for (const c of sol) { owner[c].send({ type: 'toggle', cell: c }); await sleep(80); }
  await waitFor(admin, (s) => s.phase === 'levelDone', `circuito completato in ${sol.length} mosse`);
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'qrhunt', 'livello qrhunt');

  // 5. qrhunt: due chiavi via QR (pagina /k con cookie), una via codice digitato
  await sleep(300);
  const keys = admin.state.admin.keys;
  let r = await get(`/k/${keys[0].code}`, `pid=${phones[0].pid}`); assert(r.body.includes('Fiala 1') && r.body.includes(keys[0].digit), 'QR fiala 1 scansionato mostra la cifra');
  r = await get(`/k/${keys[0].code}`, `pid=${phones[1].pid}`); assert(r.body.includes('già trovata'), 'stessa fiala riscansionata: già trovata');
  r = await get(`/k/${keys[1].code}`, 'pid=sconosciuto'); assert(r.body.includes('Chi sei'), 'telefono non registrato rifiutato');
  r = await get(`/k/${keys[1].code}`, `pid=${phones[5].pid}`); assert(r.body.includes('Fiala 2'), 'QR fiala 2 scansionato');
  phones[9].send({ type: 'code', text: keys[2].code.toLowerCase() });
  await waitFor(admin, (s) => s.phase === 'levelDone', 'tre fiale trovate (2 QR + 1 codice)');
  assert(phones[0].state.L.myDigits.length === 1, 'la cifra resta visibile sul telefono di chi ha trovato la fiala');
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'reconnect', 'livello reconnect');

  // 6. reconnect: tutte scansionano il QR dello schermo (token corrente)
  await sleep(300);
  r = await get(`/r/XXXX`, `pid=${phones[0].pid}`); assert(r.body.includes('Scaduto'), 'token errato rifiutato');
  for (const p of phones) { const tok = admin.state.L.token; const rr = await get(`/r/${tok}`, `pid=${p.pid}`); assert(rr.body.includes('Prova salvata'), `${me(p).name} ha salvato la prova via QR`); }
  await waitFor(admin, (s) => s.phase === 'levelDone', 'tutte le prove salvate');
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'simon', 'livello simon');

  // 7. simon: attende la fine della dimostrazione, poi preme nel giusto ordine; un errore al round 2
  for (let round = 0; round < 3; round++) {
    await waitFor(admin, (s) => s.L && s.L.round === round && !s.L.showing, `simon round ${round + 1}: sequenza mostrata`, 20000);
    const seq = admin.state.L.seq.slice();
    if (round === 1) { const wrongTeam = (seq[0] + 1) % 3; phones.find((p) => me(p).team === wrongTeam).send({ type: 'press' }); await waitFor(admin, (s) => s.L.fails === 1, 'errore rilevato, round ricomincia'); await waitFor(admin, (s) => s.L.round === 1 && s.L.pos === 0 && !s.L.showing && s.L.fails === 1, 'round 2 ripetuto', 20000); }
    const seq2 = admin.state.L.seq;
    for (const t of seq2) { phones.find((p) => me(p).team === t).send({ type: 'press' }); await sleep(120); }
    if (round < 2) await waitFor(admin, (s) => s.L.round === round + 1, `round ${round + 1} completato`);
  }
  await waitFor(admin, (s) => s.phase === 'levelDone', 'sequenza completata (3 round)');
  admin.send({ type: 'next' }); await waitFor(admin, (s) => s.level && s.level.id === 'vault', 'livello vault');

  // 8. vault: tutte inseriscono il codice entro 20s
  await sleep(300);
  const code = keys.map((k) => k.digit).join('');
  phones[0].send({ type: 'code', text: '000' }); await sleep(150); assert(phones[0].msgs.filter((m) => m.type === 'wrong').length >= 2, 'codice cassaforte errato rifiutato');
  phones.forEach((p) => p.send({ type: 'code', text: code }));
  await waitFor(admin, (s) => s.phase === 'win', 'VITTORIA: cassaforte aperta');
  console.log('\nSimulazione completata: tutti i livelli funzionano.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

// Lights-out 4x3: trova un insieme di celle da premere per accendere tutto (algebra su GF(2)).
function solveLights(grid) {
  const n = 12, COLS = 4;
  const nb = (c) => { const r = Math.floor(c / COLS), col = c % COLS, s = [c]; if (r > 0) s.push(c - COLS); if (r < 2) s.push(c + COLS); if (col > 0) s.push(c - 1); if (col < COLS - 1) s.push(c + 1); return s; };
  const A = Array.from({ length: n }, (_, i) => { const row = Array(n + 1).fill(0); nb(i).forEach((j) => (row[j] = 1)); row[n] = grid[i] ? 0 : 1; return row; });
  let rank = 0; const pivots = [];
  for (let col = 0; col < n && rank < n; col++) {
    let piv = -1; for (let r = rank; r < n; r++) if (A[r][col]) { piv = r; break; }
    if (piv < 0) continue; [A[rank], A[piv]] = [A[piv], A[rank]];
    for (let r = 0; r < n; r++) if (r !== rank && A[r][col]) for (let k = 0; k <= n; k++) A[r][k] ^= A[rank][k];
    pivots.push(col); rank++;
  }
  for (let r = rank; r < n; r++) if (A[r][n]) return null;
  const x = Array(n).fill(0); pivots.forEach((col, r) => (x[col] = A[r][n]));
  return x.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
}
