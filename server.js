'use strict';
/*
 * Escape room "Chi ha avvelenato Martina?" - server
 * Un solo processo Node: serve le pagine (schermo, telefoni, regia, stampa),
 * gestisce lo stato del gioco e lo distribuisce in tempo reale via WebSocket.
 * Ogni giocatrice sceglie la lingua (it/en) alla registrazione: il suo telefono riceve i testi in quella lingua.
 */
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const CONFIG = require('./config.json');
const C = require('./lib/content');

const PORT = Number(process.env.PORT || CONFIG.port || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || CONFIG.adminKey || String(1000 + Math.floor(Math.random() * 9000));
const DURATION_MS = (CONFIG.durationMinutes || 60) * 60 * 1000;
const VICTIM = CONFIG.victim || CONFIG.birthday.name;
const SCREEN_LANG = CONFIG.screenLang === 'en' ? 'en' : 'it';
const LANGS = ['it', 'en'];

// ---------------------------------------------------------------- rete
function lanCandidates() {
  const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|vmnet|docker|Tailscale|ZeroTier|Bluetooth|Loopback|tun|tap|Npcap/i;
  const REAL = /Wi-?Fi|Wireless|WLAN|Ethernet|LAN|^eth|^wlan|^en\d|^wl/i;
  const out = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family !== 'IPv4' || i.internal) continue;
      let score = 0;
      if (VIRTUAL.test(name)) score -= 100;
      if (REAL.test(name)) score += 20;
      if (/^192\.168\./.test(i.address)) score += 10;
      else if (/^10\./.test(i.address)) score += 5;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(i.address)) score -= 5;
      if (/^169\.254\./.test(i.address)) score -= 50;
      out.push({ name, address: i.address, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
function lanIp() {
  if (process.env.HOST && process.env.HOST.trim()) return process.env.HOST.trim();
  if (CONFIG.host && String(CONFIG.host).trim()) return String(CONFIG.host).trim();
  const c = lanCandidates();
  return c.length ? c[0].address : 'localhost';
}
const BASE_URL = () => `http://${lanIp()}:${PORT}`;

// ---------------------------------------------------------------- utilità
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const token = (n = 6) => crypto.randomBytes(n).toString('base64url').slice(0, n).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const msToClock = (ms, lang) => { const sec = Math.max(0, Math.round(ms / 1000)); return lang === 'en' ? `${Math.floor(sec / 60)} minutes and ${sec % 60} seconds` : `${Math.floor(sec / 60)} minuti e ${sec % 60} secondi`; };
// Traduzione: un testo bilingue {it,en} nella lingua richiesta, con i segnaposto riempiti.
function tr(x, lang) {
  if (x == null) return x;
  if (typeof x === 'object' && 'it' in x) return fill(x[lang] || x.it, lang);
  if (typeof x === 'string') return fill(x, lang);
  return x;
}
function fill(s, lang = 'it') {
  return String(s).replace(/\{name\}/g, CONFIG.birthday.name).replace(/\{age\}/g, String(CONFIG.birthday.age)).replace(/\{victim\}/g, VICTIM)
    .replace(/\{foods\}/g, () => foodsList(lang)).replace(/\{time\}/g, () => (S.finishedAt && S.startedAt ? msToClock(S.finishedAt - S.startedAt, lang) : '??'));
}
function foodsList(lang) {
  const foods = [...new Set(Object.values(S.players).map((p) => p.profile && p.profile.food).filter(Boolean))];
  return foods.length ? foods.join(', ') : (lang === 'en' ? 'the dinner dishes' : 'i piatti della cena');
}
// Video opzionali in public/media/<momento>.mp4 (o .webm), mostrati prima delle scene animate.
function mediaFor(key) {
  for (const ext of ['mp4', 'webm']) if (fs.existsSync(path.join(__dirname, 'public', 'media', `${key}.${ext}`))) return `/media/${key}.${ext}`;
  return null;
}
function scenesFor(key, lang, extra) {
  const base = typeof C.SCENES[key] === 'function' ? C.SCENES[key](extra) : (C.SCENES[key] || []);
  const video = mediaFor(key);
  return (video ? [{ video }] : []).concat(base.map((sc) => ({ ...sc, title: tr(sc.title, lang), text: tr(sc.text, lang), chat: sc.chat && sc.chat.map((t) => ({ text: tr(t, lang) })) })));
}

// ---------------------------------------------------------------- stato
const S = {
  phase: 'lobby',          // lobby | intro | level | levelDone | dead | win
  levelIdx: -1,
  players: {},             // pid -> {pid,name,team,lang,connected,joinedAt,profile}
  startedAt: null, extraMs: 0, hintsUsed: 0,
  hint: null,              // {idx|null, text|null, at}
  toast: null,             // {text:{it,en}|string, kind, at}
  log: [],
  L: {}                    // stato del livello corrente
};
const clients = new Set();  // {ws, role, pid, admin}

function logEvent(text) { S.log.unshift({ at: Date.now(), text }); S.log = S.log.slice(0, 80); }
function toast(text, kind = 'info') { S.toast = { text, kind, at: Date.now() }; }
const level = () => (['level', 'levelDone', 'dead'].includes(S.phase)) ? C.LEVELS[S.levelIdx] : null;
const connectedPlayers = () => Object.values(S.players).filter((p) => p.connected);
const teamOf = (p) => CONFIG.teams[p.team];
const teamPlayers = (ti) => connectedPlayers().filter((p) => p.team === ti);
const activeTeams = () => CONFIG.teams.map((t, i) => i).filter((i) => teamPlayers(i).length > 0);
const deadline = () => (S.startedAt ? S.startedAt + DURATION_MS + S.extraMs : null);
const plName = (pid) => (S.players[pid] ? S.players[pid].name : '?');

function assignRoundRobin(items, players) {
  const map = {};
  if (!players.length) return map;
  items.forEach((it, i) => { const p = players[i % players.length]; (map[p.pid] = map[p.pid] || []).push(it); });
  return map;
}
// Come assignRoundRobin, ma nessuna resta senza: se gli elementi sono meno delle giocatrici si ripetono.
function assignCycle(items, players) {
  const map = {};
  if (!players.length || !items.length) return map;
  for (let i = 0; i < Math.max(items.length, players.length); i++) { const p = players[i % players.length]; const it = items[i % items.length]; const arr = (map[p.pid] = map[p.pid] || []); if (!arr.includes(it)) arr.push(it); }
  return map;
}
const wrong = (p, msg) => { notifyPlayer(p.pid, { type: 'wrong' }); if (msg) toast(msg, 'bad'); };

// ---------------------------------------------------------------- livelli
const LEVEL_IMPL = {
  sync: {
    init() { S.L = { pressing: {}, done: false }; },
    action(p, m) { if (m.type === 'hold') S.L.pressing[p.pid] = Date.now(); if (m.type === 'release') delete S.L.pressing[p.pid]; },
    tick() {
      const ps = connectedPlayers(), now = Date.now();
      let all = ps.length > 0, minHold = Infinity;
      for (const p of ps) { const t = S.L.pressing[p.pid]; if (!t) { all = false; break; } minHold = Math.min(minHold, now - t); }
      S.L.progress = all ? Math.min(1, minHold / 3000) : 0;
      if (all && minHold >= 3000) solveLevel();
    },
    view(p) { return { pressing: Object.keys(S.L.pressing), progress: S.L.progress || 0, me: p ? !!S.L.pressing[p.pid] : false }; }
  },

  fragments: {
    init() {
      const teams = {};
      activeTeams().forEach((ti, order) => {
        const ps = teamPlayers(ti);
        const word = C.FRAGMENT_WORDS[order] || C.FRAGMENT_WORDS[C.FRAGMENT_WORDS.length - 1];
        const strips = shuffle(ps.map((_, i) => i));
        teams[ti] = { word, n: ps.length, seed: Math.floor(Math.random() * 1e6), strip: Object.fromEntries(ps.map((p, i) => [p.pid, strips[i]])) };
      });
      S.L = { teams, answer: activeTeams().map((ti) => teams[ti].word).join(''), attempts: 0 };
    },
    action(p, m) {
      if (m.type !== 'answer') return;
      S.L.attempts++;
      if (norm(m.text) === S.L.answer) { logEvent(`${p.name} ha ricomposto il biglietto`); solveLevel(); }
      else wrong(p, C.L(`Frase errata (${p.name}). Il Cuoco ride.`, `Wrong sentence (${p.name}). The Cook laughs.`));
    },
    view(p) {
      const t = p && S.L.teams[p.team];
      return { attempts: S.L.attempts, order: activeTeams().map((ti) => CONFIG.teams[ti].name), mine: t ? { word: t.word, n: t.n, seed: t.seed, strip: t.strip[p.pid] ?? 0, color: teamOf(p).color } : null };
    }
  },

  cipher: {
    init() {
      const letters = [...new Set(C.CIPHER_WORD.split(''))];
      const syms = shuffle(C.CIPHER_SYMBOLS.slice()).slice(0, letters.length);
      const key = Object.fromEntries(letters.map((l, i) => [l, syms[i]]));
      const parts = assignCycle(shuffle(letters.slice()), shuffle(connectedPlayers().slice()));
      S.L = { key, parts, attempts: 0, cipher: C.CIPHER_WORD.split('').map((l) => key[l]).join(' ') };
    },
    onPlayersChanged() { S.L.parts = assignCycle(shuffle(Object.keys(S.L.key)), shuffle(connectedPlayers().slice())); },
    action(p, m) {
      if (m.type !== 'answer') return;
      S.L.attempts++;
      if (norm(m.text) === C.CIPHER_WORD) { logEvent(`${p.name} ha decifrato il messaggio`); solveLevel(); }
      else wrong(p, C.L(`Parola errata (${p.name}).`, `Wrong word (${p.name}).`));
    },
    view(p) { return { cipher: S.L.cipher, attempts: S.L.attempts, mine: p ? (S.L.parts[p.pid] || []).map((l) => ({ sym: S.L.key[l], letter: l })) : [] }; }
  },

  riddles: {
    init() {
      const ps = connectedPlayers().slice().sort((a, b) => a.joinedAt - b.joinedAt);
      const riddles = ps.map((p, i) => ({ about: p.pid, name: p.name, order: i + 1, accept: [p.name, p.profile && p.profile.nickname].filter(Boolean) }));
      const letterOwner = C.RIDDLE_PASSWORD.split('').map((_, i) => (riddles.length ? i % riddles.length : 0));
      S.L = { riddles, letterOwner, assign: {}, solved: [], solvedBy: {} };
      LEVEL_IMPL.riddles.reassign();
    },
    reassign() {
      // Rotazione sull'ordine mescolato: ognuna riceve il fascicolo di un'altra, mai il proprio.
      const ps = shuffle(connectedPlayers().slice());
      S.L.assign = {};
      const n = ps.length; if (!n) return;
      const idxOf = Object.fromEntries(ps.map((p, i) => [p.pid, i]));
      const load = ps.map(() => 0);
      const give = (idx, k) => { (S.L.assign[ps[k].pid] = S.L.assign[ps[k].pid] || []).push(idx); load[k]++; };
      const rest = [];
      for (const idx of S.L.riddles.map((_, i) => i).filter((i) => !S.L.solved.includes(i))) {
        const k = idxOf[S.L.riddles[idx].about];
        if (k === undefined) rest.push(idx); else give(idx, n > 1 ? (k + 1) % n : k);
      }
      for (const idx of rest) { let best = -1; for (let k = 0; k < n; k++) if (ps[k].pid !== S.L.riddles[idx].about && (best < 0 || load[k] < load[best])) best = k; give(idx, best < 0 ? 0 : best); }
    },
    action(p, m) {
      if (m.type === 'answer' && Number.isInteger(m.idx)) {
        const r = S.L.riddles[m.idx];
        if (!r || S.L.solved.includes(m.idx)) return;
        if (r.accept.map(norm).includes(norm(m.text))) {
          S.L.solved.push(m.idx); S.L.solvedBy[m.idx] = p.name;
          logEvent(`${p.name} ha identificato ${r.name}`);
          toast(C.L(`${p.name} ha identificato la sospettata: ${r.name}!`, `${p.name} identified the suspect: ${r.name}!`), 'good');
          LEVEL_IMPL.riddles.reassign();
        } else wrong(p);
      }
      if (m.type === 'password') {
        if (norm(m.text) === C.RIDDLE_PASSWORD) { logEvent(`${p.name} ha inserito la parola d'ordine`); solveLevel(); }
        else wrong(p, C.L(`Parola d'ordine errata (${p.name}).`, `Wrong password (${p.name}).`));
      }
    },
    onPlayersChanged() { LEVEL_IMPL.riddles.reassign(); },
    view(p, lang) {
      const t = (x) => tr(x, lang);
      return {
        letters: C.RIDDLE_PASSWORD.split('').map((ch, i) => (S.L.solved.includes(S.L.letterOwner[i]) ? ch : null)),
        identified: S.L.solved.map((i) => ({ name: S.L.riddles[i].name, by: S.L.solvedBy[i] })),
        total: S.L.riddles.length, allSolved: S.L.solved.length === S.L.riddles.length,
        mine: p ? (S.L.assign[p.pid] || []).map((i) => { const r = S.L.riddles[i]; const q = S.players[r.about]; return { idx: i, q: C.dossier(q && q.profile, { victim: VICTIM, team: q ? teamOf(q).name : '?', order: r.order }, t) }; }) : []
      };
    }
  },

  seating: {
    N: 5,
    init() {
      const N = LEVEL_IMPL.seating.N;
      const pool = shuffle(connectedPlayers().map((p) => p.name));
      const names = pool.slice(0, N);
      for (const extra of ['LUNA', 'ZOE', 'MIA', 'EVA', 'KIM']) if (names.length < N) names.push(extra);
      const solution = shuffle(names.slice());        // solution[k] = chi siede al posto k+1
      const seatOf = (n) => solution.indexOf(n);
      // Genera indizi veri; aggiungine finché la soluzione è unica, poi togli quelli superflui.
      const candidates = [];
      names.forEach((a) => {
        candidates.push({ type: 'exact', a, k: seatOf(a) + 1 });
        if (seatOf(a) === 0 || seatOf(a) === N - 1) candidates.push({ type: 'end', a }); else candidates.push({ type: 'notEnd', a });
        names.forEach((b) => {
          if (a === b) return;
          if (seatOf(a) === seatOf(b) - 1) candidates.push({ type: 'leftOf', a, b });
          if (Math.abs(seatOf(a) - seatOf(b)) > 1) candidates.push({ type: 'notNext', a, b });
          if (seatOf(a) < seatOf(b) - 1) candidates.push({ type: 'somewhereLeft', a, b });
          if (seatOf(a) === seatOf(b) - 2) candidates.push({ type: 'between', a, b });
        });
      });
      const check = (clue, perm) => {
        const s = (n) => perm.indexOf(n);
        switch (clue.type) {
          case 'exact': return s(clue.a) === clue.k - 1;
          case 'end': return s(clue.a) === 0 || s(clue.a) === N - 1;
          case 'notEnd': return s(clue.a) > 0 && s(clue.a) < N - 1;
          case 'leftOf': return s(clue.a) === s(clue.b) - 1;
          case 'notNext': return Math.abs(s(clue.a) - s(clue.b)) > 1;
          case 'somewhereLeft': return s(clue.a) < s(clue.b);
          case 'between': return Math.abs(s(clue.a) - s(clue.b)) === 2;
        }
      };
      const perms = []; (function gen(rest, acc) { if (!rest.length) return perms.push(acc); rest.forEach((x, i) => gen(rest.filter((_, j) => j !== i), acc.concat(x))); })(names, []);
      const countSolutions = (clues) => perms.filter((perm) => clues.every((c) => check(c, perm))).length;
      // Al massimo un indizio "posto esatto", così il puzzle resta un ragionamento.
      const exactOnes = candidates.filter((c) => c.type === 'exact'), others = shuffle(candidates.filter((c) => c.type !== 'exact'));
      let clues = [exactOnes[Math.floor(Math.random() * exactOnes.length)]];
      for (const c of others) { if (countSolutions(clues) === 1) break; clues.push(c); }
      for (let i = clues.length - 1; i >= 0; i--) { const without = clues.filter((_, j) => j !== i); if (without.length && countSolutions(without) === 1) clues = without; }
      S.L = { names, solution, clues: shuffle(clues), assign: {}, attempts: 0, lock: {} };
      LEVEL_IMPL.seating.reassign();
    },
    reassign() { S.L.assign = assignCycle(S.L.clues.map((_, i) => i), shuffle(connectedPlayers().slice())); },
    onPlayersChanged() { LEVEL_IMPL.seating.reassign(); },
    clueText(c, lang) {
      return tr(C.SEAT_CLUES[c.type], lang).replace('{a}', c.a).replace('{b}', c.b || '').replace('{k}', c.k || '');
    },
    action(p, m) {
      if (m.type !== 'order' || !Array.isArray(m.order)) return;
      if (S.L.lock[p.pid] && Date.now() < S.L.lock[p.pid]) return;
      S.L.attempts++;
      if (m.order.length === S.L.solution.length && m.order.every((n, i) => n === S.L.solution[i])) { logEvent(`${p.name} ha ricostruito i posti a tavola`); solveLevel(); }
      else { S.L.lock[p.pid] = Date.now() + 10000; wrong(p, C.L(`Ordine sbagliato (${p.name}). 10 secondi di attesa.`, `Wrong order (${p.name}). Wait 10 seconds.`)); }
    },
    view(p, lang) {
      return { names: S.L.names, n: S.L.solution.length, attempts: S.L.attempts, clueCount: S.L.clues.length,
        mine: p ? (S.L.assign[p.pid] || []).map((i) => LEVEL_IMPL.seating.clueText(S.L.clues[i], lang)) : [],
        lockedUntil: p ? (S.L.lock[p.pid] || 0) : 0 };
    }
  },

  lights: {
    init() {
      const n = 12;
      const grid = Array(n).fill(true);
      shuffle([...Array(n).keys()]).slice(0, 5 + Math.floor(Math.random() * 2)).forEach((c) => LEVEL_IMPL.lights.flip(grid, c));
      if (grid.every(Boolean)) LEVEL_IMPL.lights.flip(grid, 0);
      S.L = { grid, owner: {}, presses: 0 };
      LEVEL_IMPL.lights.reassign();
    },
    reassign() {
      const map = assignRoundRobin([...Array(12).keys()], connectedPlayers());
      S.L.owner = {};
      for (const [pid, cs] of Object.entries(map)) cs.forEach((c) => { S.L.owner[c] = pid; });
    },
    flip(grid, c) {
      const COLS = 4, r = Math.floor(c / COLS), col = c % COLS;
      const t = (rr, cc) => { if (rr >= 0 && rr < 3 && cc >= 0 && cc < COLS) grid[rr * COLS + cc] = !grid[rr * COLS + cc]; };
      t(r, col); t(r - 1, col); t(r + 1, col); t(r, col - 1); t(r, col + 1);
    },
    action(p, m) {
      if (m.type !== 'toggle' || S.L.owner[m.cell] !== p.pid) return;
      LEVEL_IMPL.lights.flip(S.L.grid, m.cell);
      S.L.presses++; S.L.last = { cell: m.cell, at: Date.now() };
      if (S.L.grid.every(Boolean)) { logEvent(`Quadro elettrico riattivato in ${S.L.presses} mosse`); solveLevel(); }
    },
    onPlayersChanged() { LEVEL_IMPL.lights.reassign(); },
    view(p) {
      const names = {}; for (const [c, pid] of Object.entries(S.L.owner)) names[c] = plName(pid);
      return { grid: S.L.grid, names, presses: S.L.presses, last: S.L.last, mine: p ? Object.entries(S.L.owner).filter(([, pid]) => pid === p.pid).map(([c]) => Number(c)) : [] };
    }
  },

  qrhunt: {
    init() { S.L = { found: {} }; },
    claim(p, code) {
      const t = (x) => tr(x, p.lang);
      const idx = CONFIG.keys.findIndex((k) => norm(k.code) === norm(code));
      if (idx < 0) return { ok: false, msg: t(C.SCAN.unknownCode) };
      if (S.L.found[idx]) return { ok: true, idx, digit: CONFIG.keys[idx].digit, msg: t(C.SCAN.alreadyFound).replace('{n}', idx + 1).replace('{who}', S.L.found[idx].name) };
      S.L.found[idx] = { pid: p.pid, name: p.name, at: Date.now() };
      logEvent(`${p.name} ha trovato la fiala ${idx + 1}`);
      toast(C.L(`${p.name} ha trovato la fiala ${idx + 1}!`, `${p.name} found vial ${idx + 1}!`), 'good');
      if (Object.keys(S.L.found).length === CONFIG.keys.length) setTimeout(solveLevel, 1500);
      broadcast();
      return { ok: true, idx, digit: CONFIG.keys[idx].digit, msg: t(C.SCAN.found).replace('{n}', idx + 1) };
    },
    action(p, m) { if (m.type === 'code') notifyPlayer(p.pid, { type: 'keyResult', ...LEVEL_IMPL.qrhunt.claim(p, m.text) }); },
    view(p) {
      return { keys: CONFIG.keys.map((k, i) => ({ found: !!S.L.found[i], by: S.L.found[i]?.name || null })),
        myDigits: p ? Object.entries(S.L.found).filter(([, f]) => f.pid === p.pid).map(([i]) => ({ idx: Number(i), digit: CONFIG.keys[i].digit })) : [] };
    }
  },

  reconnect: {
    ROTATE_MS: 25000,
    init() { S.L = { token: token(4), prev: null, tokenAt: Date.now(), done: {} }; },
    tick() { if (Date.now() - S.L.tokenAt > LEVEL_IMPL.reconnect.ROTATE_MS) { S.L.prev = S.L.token; S.L.token = token(4); S.L.tokenAt = Date.now(); } },
    claim(p, t) {
      if (norm(t) !== S.L.token && norm(t) !== S.L.prev) return { ok: false, msg: tr(C.SCAN.tokenBad, p.lang) };
      if (!S.L.done[p.pid]) { S.L.done[p.pid] = Date.now(); logEvent(`${p.name} ha salvato la prova`); }
      LEVEL_IMPL.reconnect.check(); broadcast();
      return { ok: true, msg: tr(C.SCAN.saved, p.lang) };
    },
    check() { const ps = connectedPlayers(); if (ps.length && ps.every((p) => S.L.done[p.pid])) solveLevel(); },
    onPlayersChanged() { LEVEL_IMPL.reconnect.check(); },
    action(p, m) { if (m.type === 'code') notifyPlayer(p.pid, { type: 'keyResult', ...LEVEL_IMPL.reconnect.claim(p, m.text) }); },
    view(p) {
      const left = Math.max(0, LEVEL_IMPL.reconnect.ROTATE_MS - (Date.now() - S.L.tokenAt));
      return { token: S.L.token, url: `${BASE_URL()}/r/${S.L.token}`, secondsLeft: Math.ceil(left / 1000), done: Object.keys(S.L.done), me: p ? !!S.L.done[p.pid] : false };
    }
  },

  simon: {
    LENGTHS: [5, 7, 9],
    init() { S.L = { round: 0, fails: 0, lock: false, showing: true }; LEVEL_IMPL.simon.newRound(); },
    tick() { const showing = S.L.lock || Date.now() < S.L.showUntil; if (showing !== S.L.showing) S.L.showing = showing; },
    newRound() {
      const teams = activeTeams(), len = LEVEL_IMPL.simon.LENGTHS[S.L.round], seq = [];
      for (let i = 0; i < len; i++) { let t; do { t = teams[Math.floor(Math.random() * teams.length)]; } while (teams.length > 1 && i > 1 && t === seq[i - 1] && t === seq[i - 2]); seq.push(t); }
      S.L.seq = seq; S.L.pos = 0; S.L.lock = false; S.L.showing = true; S.L.showUntil = Date.now() + 1500 + len * 900 + 800;
    },
    action(p, m) {
      if (m.type !== 'press' || S.L.lock || Date.now() < S.L.showUntil) return;
      if (p.team === S.L.seq[S.L.pos]) {
        S.L.pos++; S.L.last = { team: p.team, ok: true, at: Date.now() };
        if (S.L.pos >= S.L.seq.length) {
          S.L.round++; S.L.lock = true; S.L.showing = true;
          if (S.L.round >= LEVEL_IMPL.simon.LENGTHS.length) { logEvent('Sequenza completata'); solveLevel(); return; }
          toast(C.L(`Dose ${S.L.round} completata!`, `Dose ${S.L.round} completed!`), 'good');
          setTimeout(() => { LEVEL_IMPL.simon.newRound(); broadcast(); }, 1500);
        }
      } else {
        S.L.fails++; S.L.lock = true; S.L.showing = true; S.L.last = { team: p.team, ok: false, at: Date.now() };
        toast(C.L(`Sbagliato (${teamOf(p).name})! Si ricomincia la dose.`, `Wrong (${teamOf(p).name})! The dose starts over.`), 'bad');
        setTimeout(() => { LEVEL_IMPL.simon.newRound(); broadcast(); }, 1800);
      }
    },
    view(p) {
      return { round: S.L.round, rounds: LEVEL_IMPL.simon.LENGTHS.length, seq: S.L.seq, showUntil: S.L.showUntil, showing: S.L.lock || Date.now() < S.L.showUntil, pos: S.L.pos, fails: S.L.fails, last: S.L.last, myTeam: p ? p.team : null };
    }
  },

  rooms: {
    init() {
      const rooms = C.ROOMS;
      const target = rooms[Math.floor(Math.random() * rooms.length)];
      // Indizi veri per la stanza giusta; aggiungine finché tutte le altre sono escluse, poi togli i superflui.
      const valid = shuffle(C.ROOM_CLUES.map((c, i) => i).filter((i) => C.ROOM_CLUES[i].ok(target)));
      const remaining = (clues) => rooms.filter((r) => clues.every((i) => C.ROOM_CLUES[i].ok(r))).length;
      let clues = [];
      for (const i of valid) { if (remaining(clues) === 1) break; clues.push(i); }
      for (let k = clues.length - 1; k >= 0; k--) { const w = clues.filter((_, j) => j !== k); if (w.length && remaining(w) === 1) clues = w; }
      S.L = { target: target.id, clues: shuffle(clues), assign: {}, votes: {}, rounds: 0 };
      LEVEL_IMPL.rooms.reassign();
    },
    reassign() { S.L.assign = assignCycle(S.L.clues.map((_, i) => i), shuffle(connectedPlayers().slice())); },
    onPlayersChanged() { LEVEL_IMPL.rooms.reassign(); },
    action(p, m) {
      if (m.type !== 'vote' || !C.ROOMS.some((r) => r.id === m.room)) return;
      S.L.votes[p.pid] = m.room;
      const ps = connectedPlayers();
      if (!ps.every((q) => S.L.votes[q.pid])) return;
      const all = ps.map((q) => S.L.votes[q.pid]);
      if (all.every((r) => r === S.L.target)) { logEvent('Stanza giusta trovata all\'unanimità'); solveLevel(); return; }
      S.L.rounds++;
      const unanimous = all.every((r) => r === all[0]);
      toast(unanimous ? C.L('Tutte d\'accordo... ma è la stanza sbagliata! Rileggete gli indizi.', 'All agreed... but it is the wrong room! Read the clues again.') : C.L('Non siete d\'accordo: la porta resta chiusa. Confrontatevi e rivotate.', 'You disagree: the door stays shut. Talk it over and vote again.'), 'bad');
      broadcastToPhones({ type: 'buzz', pattern: [120, 60, 120] });
      setTimeout(() => { S.L.votes = {}; broadcast(); }, 2500);
    },
    view(p, lang) {
      const counts = {}; for (const r of Object.values(S.L.votes)) counts[r] = (counts[r] || 0) + 1;
      return { rooms: C.ROOMS.map((r) => ({ id: r.id, name: tr(r.name, lang), floor: r.floor })), counts, voted: Object.keys(S.L.votes).length, total: connectedPlayers().length, rounds: S.L.rounds,
        mine: p ? (S.L.assign[p.pid] || []).map((i) => tr(C.ROOM_CLUES[i].text, lang)) : [], myVote: p ? (S.L.votes[p.pid] || null) : null };
    }
  },

  vault: {
    WINDOW_MS: 20000,
    init() { S.L = { code: CONFIG.keys.map((k) => k.digit).join(''), ok: {}, windowStart: null, resets: 0 }; },
    tick() {
      if (S.L.windowStart && Date.now() - S.L.windowStart > LEVEL_IMPL.vault.WINDOW_MS) {
        S.L.ok = {}; S.L.windowStart = null; S.L.resets++;
        toast(C.L('La serratura si è bloccata. Riprovate tutte insieme!', 'The lock reset. Try again, all together!'), 'bad');
      }
    },
    action(p, m) {
      if (m.type !== 'code') return;
      if (norm(m.text) !== S.L.code) { wrong(p); return; }
      if (!S.L.windowStart) S.L.windowStart = Date.now();
      S.L.ok[p.pid] = true;
      if (connectedPlayers().every((q) => S.L.ok[q.pid])) { logEvent('Cassetta dei farmaci aperta!'); winGame(); }
    },
    view(p) { return { confirmed: Object.keys(S.L.ok), total: connectedPlayers().length, windowStart: S.L.windowStart, windowMs: LEVEL_IMPL.vault.WINDOW_MS, resets: S.L.resets, me: p ? !!S.L.ok[p.pid] : false }; }
  }
};

// ---------------------------------------------------------------- flusso di gioco
let doneTimer = null;
function startLevel(idx) {
  clearTimeout(doneTimer);
  if (idx >= C.LEVELS.length) return winGame();
  S.levelIdx = idx; S.phase = 'level'; S.hint = null; S.levelStartedAt = Date.now();
  LEVEL_IMPL[C.LEVELS[idx].id].init();
  logEvent(`Inizio ${tr(C.LEVELS[idx].title, 'it')}`);
  broadcast();
}
function solveLevel() {
  if (S.phase !== 'level') return;
  S.phase = 'levelDone';
  logEvent(`${tr(C.LEVELS[S.levelIdx].title, 'it')} superato in ${Math.round((Date.now() - S.levelStartedAt) / 1000)}s`);
  broadcastToPhones({ type: 'buzz', pattern: [80, 40, 80, 40, 200] });
  broadcast();
  doneTimer = setTimeout(() => startLevel(S.levelIdx + 1), 7000);
}
function winGame() {
  clearTimeout(doneTimer);
  S.phase = 'win'; S.finishedAt = Date.now();
  logEvent('VITTORIA');
  broadcastToPhones({ type: 'buzz', pattern: [100, 50, 100, 50, 100, 50, 400] });
  broadcast();
}
function startGame() { S.startedAt = Date.now(); S.extraMs = 0; S.hintsUsed = 0; S.phase = 'intro'; logEvent('Partita iniziata'); broadcast(); }
function resetGame(keepPlayers = true) {
  clearTimeout(doneTimer);
  Object.assign(S, { phase: 'lobby', levelIdx: -1, startedAt: null, extraMs: 0, hintsUsed: 0, hint: null, toast: null, L: {}, finishedAt: null });
  if (!keepPlayers) S.players = {};
  logEvent('Partita azzerata'); broadcast();
}
function checkDeadline() {
  const d = deadline();
  if (d && S.phase === 'level' && Date.now() > d) { S.phase = 'dead'; logEvent('Tempo scaduto'); broadcastToPhones({ type: 'buzz', pattern: [600, 200, 600] }); broadcast(); }
}
function playersChanged() {
  const lv = level();
  if (S.phase === 'level' && lv && LEVEL_IMPL[lv.id].onPlayersChanged) LEVEL_IMPL[lv.id].onPlayersChanged();
  broadcast();
}

// ---------------------------------------------------------------- viste per i client
function hintText(lang) {
  if (!S.hint) return null;
  const lv = level();
  if (S.hint.text) return S.hint.text;
  return lv && lv.hints[S.hint.idx] ? tr(lv.hints[S.hint.idx], lang) : null;
}
function publicView(lang) {
  const lv = level();
  return {
    phase: S.phase, levelIdx: S.levelIdx, levelCount: C.LEVELS.length, lang,
    level: lv ? { id: lv.id, title: tr(lv.title, lang), subtitle: tr(lv.subtitle, lang) } : null,
    players: Object.values(S.players).map((p) => ({ pid: p.pid, name: p.name, team: p.team, lang: p.lang, connected: p.connected })),
    teams: CONFIG.teams, birthday: CONFIG.birthday, victim: VICTIM,
    story: { title: tr(C.STORY.title, lang), intro: C.STORY.intro.map((x) => tr(x, lang)), win: C.STORY.win.map((x) => tr(x, lang)), dead: C.STORY.dead.map((x) => tr(x, lang)) },
    profileFields: C.PROFILE_FIELDS.map((f) => ({ key: f.key, required: f.required, label: tr(f.label, lang), placeholder: tr(f.placeholder, lang) })),
    profilesDone: Object.values(S.players).filter((p) => p.profile && Object.keys(p.profile).length).length,
    startedAt: S.startedAt, deadline: deadline(), finishedAt: S.finishedAt || null, hintsUsed: S.hintsUsed,
    hint: S.hint ? { at: S.hint.at, text: hintText(lang) } : null,
    toast: S.toast ? { at: S.toast.at, kind: S.toast.kind, text: tr(S.toast.text, lang) } : null,
    joinUrl: BASE_URL() + '/', now: Date.now()
  };
}
function viewFor(c) {
  const p = c.pid ? S.players[c.pid] : null;
  const lang = c.role === 'phone' && p ? p.lang : SCREEN_LANG;
  const v = publicView(lang);
  const lv = level();
  if (lv) v.L = LEVEL_IMPL[lv.id].view(c.role === 'phone' ? p : null, lang);
  if (c.role === 'screen') {
    // Lo schermo è condiviso: porta anche la seconda lingua, mostrata sotto alla prima.
    const alt = publicView(SCREEN_LANG === 'en' ? 'it' : 'en');
    v.alt = { lang: alt.lang, level: alt.level, story: alt.story, hint: alt.hint, toast: alt.toast };
    if (lv && LEVEL_IMPL[lv.id].view.length > 1) v.alt.L = LEVEL_IMPL[lv.id].view(null, alt.lang);
  }
  if (c.role === 'phone') {
    v.me = p ? { pid: p.pid, name: p.name, team: p.team, lang: p.lang, teamName: teamOf(p).name, color: teamOf(p).color, profile: p.profile || null } : null;
    v.scenes = S.phase === 'intro' ? scenesFor('prologue', lang) : S.phase === 'dead' ? scenesFor('dead', lang) : lv ? scenesFor(lv.id, lang) : [];
    v.hintScenes = S.hint ? scenesFor('hint', lang, hintText(lang)) : null;
  }
  if (c.role === 'admin') {
    const cheat = {};
    if (lv) {
      if (lv.id === 'fragments') cheat.text = `Frase: ${S.L.answer}`;
      if (lv.id === 'cipher') cheat.text = `Parola: ${C.CIPHER_WORD} · chiave: ${Object.entries(S.L.key).map(([l, s]) => `${s}=${l}`).join(' ')}`;
      if (lv.id === 'riddles') cheat.text = 'Fascicoli: ' + S.L.riddles.map((r, i) => `${i + 1}=${r.name}`).join(' · ') + ` · parola d'ordine: ${C.RIDDLE_PASSWORD}`;
      if (lv.id === 'seating') cheat.text = `Posti 1→${S.L.solution.length}: ${S.L.solution.join(', ')} · indizi: ${S.L.clues.map((c) => LEVEL_IMPL.seating.clueText(c, 'it')).join(' / ')}`;
      if (lv.id === 'reconnect') cheat.text = `Codice attuale: ${S.L.token}`;
      if (lv.id === 'rooms') cheat.text = `Stanza giusta: ${tr(C.ROOMS.find((r) => r.id === S.L.target).name, 'it')} · indizi: ${S.L.clues.map((i) => tr(C.ROOM_CLUES[i].text, 'it')).join(' / ')}`;
      if (lv.id === 'vault') cheat.text = `Codice cassetta: ${S.L.code}`;
    }
    v.admin = { log: S.log, hints: lv ? lv.hints.map((h) => tr(h, 'it')) : [], levels: C.LEVELS.map((l) => tr(l.title, 'it')), adminKey: ADMIN_KEY, keys: CONFIG.keys,
      printUrl: `${BASE_URL()}/print?key=${ADMIN_KEY}`, screenUrl: `${BASE_URL()}/screen`, cheat: cheat.text || '',
      profiles: Object.values(S.players).map((p) => ({ name: p.name, lang: p.lang, profile: p.profile || null })) };
  }
  return v;
}
function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function broadcast() { for (const c of clients) send(c, { type: 'state', ...viewFor(c) }); }
function broadcastToPhones(msg) { for (const c of clients) if (c.role === 'phone') send(c, msg); }
function notifyPlayer(pid, msg) { for (const c of clients) if (c.pid === pid && c.role === 'phone') send(c, msg); }

// ---------------------------------------------------------------- HTTP
const app = express();
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phone.html')));
app.get('/screen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/print', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).send('Chiave regia errata. Apri /print?key=CHIAVE');
  res.sendFile(path.join(__dirname, 'public', 'print.html'));
});
app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: req.query.dark || '#000000', light: req.query.light || '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});
app.get('/api/info', (req, res) => res.json({ joinUrl: BASE_URL() + '/', base: BASE_URL(), keys: req.query.key === ADMIN_KEY ? CONFIG.keys : undefined, birthday: CONFIG.birthday }));

function pidFromReq(req) { const m = /(?:^|;\s*)pid=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || ''); return m ? m[1] : null; }
function langFromReq(req) { const m = /(?:^|;\s*)lang=(it|en)/.exec(req.headers.cookie || ''); return m ? m[1] : 'it'; }
function scanPage(title, body, ok, lang) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="/style.css"></head><body class="scan ${ok ? 'ok' : 'bad'}"><main class="card"><h1>${title}</h1><p>${body}</p>
<p class="muted">${tr(C.SCAN.back, lang)}</p></main></body></html>`;
}
app.get('/k/:code', (req, res) => {
  const p = S.players[pidFromReq(req)];
  const lang = p ? p.lang : langFromReq(req), t = (x) => tr(x, lang);
  if (!p) return res.send(scanPage(t(C.SCAN.who), t(C.SCAN.whoBody), false, lang));
  if (!(level() && level().id === 'qrhunt' && S.phase === 'level')) return res.send(scanPage(t(C.SCAN.early), t(C.SCAN.earlyBody), false, lang));
  const r = LEVEL_IMPL.qrhunt.claim(p, req.params.code);
  res.send(scanPage(r.ok ? t(C.SCAN.vial).replace('{n}', r.idx + 1) : t(C.SCAN.nothing), r.ok ? `${r.msg}<br><br>${t(C.SCAN.digit)} <b class="digit">${r.digit}</b>. ${t(C.SCAN.remember)}` : r.msg, r.ok, lang));
});
app.get('/r/:token', (req, res) => {
  const p = S.players[pidFromReq(req)];
  const lang = p ? p.lang : langFromReq(req), t = (x) => tr(x, lang);
  if (!p) return res.send(scanPage(t(C.SCAN.who), t(C.SCAN.whoBody), false, lang));
  if (!(level() && level().id === 'reconnect' && S.phase === 'level')) return res.send(scanPage(t(C.SCAN.notNow), t(C.SCAN.notNowBody), false, lang));
  const r = LEVEL_IMPL.reconnect.claim(p, req.params.token);
  res.send(scanPage(r.ok ? t(C.SCAN.saved) : t(C.SCAN.expired), r.msg, r.ok, lang));
});

// ---------------------------------------------------------------- WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  const c = { ws, role: 'phone', pid: null, admin: false };
  clients.add(c);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'hello') {
      c.role = ['screen', 'phone', 'admin'].includes(m.role) ? m.role : 'phone';
      if (c.role === 'admin') { c.admin = m.key === ADMIN_KEY; if (!c.admin) return send(c, { type: 'authError' }); }
      if (c.role === 'phone' && m.pid && S.players[m.pid]) { c.pid = m.pid; S.players[m.pid].connected = true; playersChanged(); }
      return send(c, { type: 'state', ...viewFor(c) });
    }
    if (m.type === 'join' && c.role === 'phone') {
      const name = String(m.name || '').trim().slice(0, 16);
      if (!name) return;
      const lang = LANGS.includes(m.lang) ? m.lang : 'it';
      const pid = (m.pid && S.players[m.pid]) ? m.pid : token(8);
      if (!S.players[pid]) {
        const counts = CONFIG.teams.map((_, i) => Object.values(S.players).filter((p) => p.team === i).length);
        const team = counts.indexOf(Math.min(...counts));
        S.players[pid] = { pid, name, team, lang, connected: true, joinedAt: Date.now() };
        logEvent(`${name} è entrata (squadra ${CONFIG.teams[team].name}, ${lang})`);
      } else { S.players[pid].name = name; S.players[pid].lang = lang; }
      c.pid = pid; S.players[pid].connected = true;
      send(c, { type: 'joined', pid });
      return playersChanged();
    }
    if (m.type === 'setLang' && c.role === 'phone' && c.pid && S.players[c.pid] && LANGS.includes(m.lang)) { S.players[c.pid].lang = m.lang; return broadcast(); }
    if (m.type === 'profile' && c.role === 'phone' && c.pid && S.players[c.pid] && ['lobby', 'intro'].includes(S.phase)) {
      const prof = {};
      for (const f of C.PROFILE_FIELDS) { const v = String((m.data || {})[f.key] || '').trim().slice(0, 140); if (v) prof[f.key] = v; }
      S.players[c.pid].profile = prof;
      logEvent(`${S.players[c.pid].name} ha compilato la scheda`);
      return broadcast();
    }
    if (c.role === 'phone') {
      const p = c.pid && S.players[c.pid];
      const lv = level();
      if (p && lv && S.phase === 'level') { LEVEL_IMPL[lv.id].action(p, m); broadcast(); }
      return;
    }
    if (c.role === 'admin' && c.admin) return adminAction(m);
  });
  ws.on('close', () => {
    clients.delete(c);
    if (c.pid && S.players[c.pid] && ![...clients].some((o) => o.pid === c.pid)) { S.players[c.pid].connected = false; playersChanged(); }
  });
});

function adminAction(m) {
  switch (m.type) {
    case 'start': startGame(); break;
    case 'firstLevel': startLevel(0); break;
    case 'next': startLevel(S.levelIdx + 1); break;
    case 'prev': startLevel(Math.max(0, S.levelIdx - 1)); break;
    case 'goto': startLevel(Number(m.idx)); break;
    case 'restartLevel': startLevel(S.levelIdx); break;
    case 'solve': solveLevel(); break;
    case 'hint': {
      const lv = level(); if (!lv) break;
      S.hint = m.text ? { text: String(m.text).slice(0, 300), at: Date.now() } : { idx: Math.min(m.idx ?? 0, lv.hints.length - 1), at: Date.now() };
      S.hintsUsed++;
      broadcastToPhones({ type: 'buzz', pattern: [300] });
      logEvent(`Suggerimento: ${hintText('it')}`);
      break;
    }
    case 'addTime': S.extraMs += Number(m.minutes || 5) * 60000; toast(C.L(`Il Cuoco concede ${m.minutes || 5} minuti extra`, `The Cook grants ${m.minutes || 5} extra minutes`), 'good'); if (S.phase === 'dead' && deadline() > Date.now()) S.phase = 'level'; break;
    case 'kick': delete S.players[m.pid]; for (const c of clients) if (c.pid === m.pid) c.pid = null; playersChanged(); break;
    case 'setTeam': if (S.players[m.pid]) { S.players[m.pid].team = Number(m.team); playersChanged(); } break;
    case 'reset': resetGame(!m.dropPlayers); break;
    case 'win': winGame(); break;
    case 'toast': toast(String(m.text || ''), 'info'); break;
  }
  broadcast();
}

// Tick di gioco: scadenza, livelli con logica temporale, refresh periodico.
setInterval(() => {
  checkDeadline();
  const lv = level();
  if (S.phase === 'level' && lv && LEVEL_IMPL[lv.id].tick) {
    const before = JSON.stringify(S.L);
    LEVEL_IMPL[lv.id].tick();
    if (S.phase !== 'level' || JSON.stringify(S.L) !== before) broadcast();
  }
}, 150);
setInterval(broadcast, 5000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Escape room "Chi ha avvelenato ' + VICTIM + '?" in ascolto');
  console.log(`  Telefoni  : ${BASE_URL()}/`);
  console.log(`  Schermo   : ${BASE_URL()}/screen`);
  console.log(`  Regia     : ${BASE_URL()}/admin   (chiave: ${ADMIN_KEY})`);
  console.log(`  Stampa QR : ${BASE_URL()}/print?key=${ADMIN_KEY}\n`);
  const c = lanCandidates();
  if (c.length > 1 && !(process.env.HOST || '').trim() && !String(CONFIG.host || '').trim()) {
    console.log('  Questo PC ha più indirizzi di rete. Ho scelto il primo; se i telefoni non si collegano, avvia con');
    console.log('  HOST=<indirizzo> npm start (Windows: set HOST=<indirizzo> e poi npm start) usando quello del Wi-Fi:');
    c.forEach((x) => console.log(`    ${x.address.padEnd(15)}  ${x.name}`));
    console.log('');
  }
});
