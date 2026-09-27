'use strict';
/*
 * Escape room "Chi ha avvelenato Martina?" - server
 * Un solo processo Node: serve le pagine (schermo, telefoni, regia, stampa),
 * gestisce lo stato del gioco e lo distribuisce in tempo reale via WebSocket.
 */
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const fs = require('fs');
const CONFIG = require('./config.json');
const C = require('./lib/content');

const PORT = Number(process.env.PORT || CONFIG.port || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || CONFIG.adminKey || String(1000 + Math.floor(Math.random() * 9000));
const DURATION_MS = (CONFIG.durationMinutes || 60) * 60 * 1000;

// ---------------------------------------------------------------- utilità
// Elenca gli indirizzi IPv4 del PC, dal più probabile (Wi-Fi/Ethernet di casa) al meno probabile
// (schede virtuali di Hyper-V, WSL, VirtualBox, VMware, Docker, VPN...).
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
  // trim: su Windows "set HOST=1.2.3.4 && npm start" include lo spazio prima di && nel valore
  if (process.env.HOST && process.env.HOST.trim()) return process.env.HOST.trim();
  if (CONFIG.host && String(CONFIG.host).trim()) return String(CONFIG.host).trim();
  const c = lanCandidates();
  return c.length ? c[0].address : 'localhost';
}
const BASE_URL = () => `http://${lanIp()}:${PORT}`;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const token = (n = 6) => crypto.randomBytes(n).toString('base64url').slice(0, n).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const VICTIM = CONFIG.victim || CONFIG.birthday.name;
// Video opzionali: public/media/<atto>.mp4 (o .webm) viene mostrato prima delle scene animate di quell'atto;
// prologue.mp4 prima del prologo, hint.mp4 con ogni suggerimento, dead.mp4 allo scadere del tempo.
function mediaFor(key) {
  for (const ext of ['mp4', 'webm']) if (fs.existsSync(path.join(__dirname, 'public', 'media', `${key}.${ext}`))) return `/media/${key}.${ext}`;
  return null;
}
function fillScene(sc) {
  const out = { ...sc };
  if (sc.text) out.text = fill(sc.text);
  if (sc.title) out.title = fill(sc.title);
  if (sc.chat) out.chat = sc.chat.map((t) => ({ text: fill(t) }));
  return out;
}
function scenesFor(key, extra) {
  const base = typeof C.SCENES[key] === 'function' ? C.SCENES[key](extra) : (C.SCENES[key] || []);
  const video = mediaFor(key);
  return (video ? [{ video }] : []).concat(base.map(fillScene));
}
function foodsList() {
  const foods = [...new Set(Object.values(S.players).map((p) => p.profile && p.profile.food).filter(Boolean))];
  return foods.length ? foods.join(', ') : 'i piatti della cena';
}
const fill = (s) => s.replace(/\{name\}/g, CONFIG.birthday.name).replace(/\{age\}/g, String(CONFIG.birthday.age)).replace(/\{victim\}/g, VICTIM)
  .replace(/\{foods\}/g, () => foodsList()).replace(/\{time\}/g, () => (S.finishedAt && S.startedAt ? msToClock(S.finishedAt - S.startedAt) : '??'));
const msToClock = (ms) => { const sec = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(sec / 60)} minuti e ${sec % 60} secondi`; };

// ---------------------------------------------------------------- stato
const S = {
  phase: 'lobby',          // lobby | intro | level | levelDone | dead | win
  levelIdx: -1,
  players: {},             // pid -> {pid,name,team,connected,joinedAt}
  startedAt: null,
  extraMs: 0,
  hintsUsed: 0,
  hint: null,              // {text, at}
  toast: null,             // {text, kind, at}
  log: [],
  L: {}                    // stato del livello corrente
};
const clients = new Set();  // {ws, role, pid}

function logEvent(text) {
  S.log.unshift({ at: Date.now(), text });
  S.log = S.log.slice(0, 60);
}
function toast(text, kind = 'info') { S.toast = { text, kind, at: Date.now() }; }
const level = () => (S.phase === 'level' || S.phase === 'levelDone') ? C.LEVELS[S.levelIdx] : null;
const connectedPlayers = () => Object.values(S.players).filter((p) => p.connected);
const teamOf = (p) => CONFIG.teams[p.team];
const teamPlayers = (ti) => connectedPlayers().filter((p) => p.team === ti);
const activeTeams = () => CONFIG.teams.map((t, i) => i).filter((i) => teamPlayers(i).length > 0);

function deadline() { return S.startedAt ? S.startedAt + DURATION_MS + S.extraMs : null; }

// Distribuisce N elementi (indovinelli, celle...) tra i giocatori connessi, in modo equo.
function assignRoundRobin(items, players) {
  const map = {};
  if (!players.length) return map;
  items.forEach((it, i) => { const p = players[i % players.length]; (map[p.pid] = map[p.pid] || []).push(it); });
  return map;
}

// ---------------------------------------------------------------- livelli
const LEVEL_IMPL = {
  sync: {
    init() { S.L = { pressing: {}, done: false }; },
    action(p, m) {
      if (m.type === 'hold') S.L.pressing[p.pid] = Date.now();
      if (m.type === 'release') delete S.L.pressing[p.pid];
    },
    tick() {
      const ps = connectedPlayers();
      const now = Date.now();
      let all = ps.length > 0;
      let minHold = Infinity;
      for (const p of ps) {
        const t = S.L.pressing[p.pid];
        if (!t) { all = false; break; }
        minHold = Math.min(minHold, now - t);
      }
      S.L.progress = all ? Math.min(1, minHold / 3000) : 0;
      if (all && minHold >= 3000) solveLevel();
    },
    view(p) { return { pressing: Object.keys(S.L.pressing), progress: S.L.progress || 0, me: p ? !!S.L.pressing[p.pid] : false }; }
  },

  fragments: {
    init() {
      // Per ogni squadra: una parola divisa in tante strisce quanti sono i suoi giocatori.
      const teams = {};
      activeTeams().forEach((ti, order) => {
        const ps = teamPlayers(ti);
        const word = C.FRAGMENT_WORDS[order] || C.FRAGMENT_WORDS[C.FRAGMENT_WORDS.length - 1];
        const strips = shuffle(ps.map((_, i) => i));
        const seed = Math.floor(Math.random() * 1e6);
        teams[ti] = { word, n: ps.length, seed, strip: Object.fromEntries(ps.map((p, i) => [p.pid, strips[i]])) };
      });
      S.L = { teams, answer: activeTeams().map((ti) => teams[ti].word).join(''), attempts: 0 };
    },
    action(p, m) {
      if (m.type !== 'answer') return;
      S.L.attempts++;
      if (norm(m.text) === S.L.answer) { logEvent(`${p.name} ha ricomposto il biglietto`); solveLevel(); }
      else { toast(`Frase errata (${p.name}). Il Cuoco ride.`, 'bad'); notifyPlayer(p.pid, { type: 'wrong' }); }
    },
    view(p) {
      const t = p && S.L.teams[p.team];
      return {
        attempts: S.L.attempts,
        order: activeTeams().map((ti) => CONFIG.teams[ti].name),
        mine: t ? { word: t.word, n: t.n, seed: t.seed, strip: t.strip[p.pid] ?? 0, color: teamOf(p).color } : null
      };
    }
  },

  riddles: {
    init() {
      // Un fascicolo per ogni giocatrice connessa, costruito dalla sua scheda riservata.
      const ps = connectedPlayers().slice().sort((a, b) => a.joinedAt - b.joinedAt);
      const riddles = ps.map((p, i) => ({
        about: p.pid, name: p.name,
        q: C.dossier(p, p.profile, { victim: VICTIM, team: teamOf(p).name, order: i + 1 }),
        accept: [p.name, p.profile && p.profile.nickname].filter(Boolean)
      }));
      // Ogni lettera della parola d'ordine appartiene a un fascicolo: si svela quando viene risolto.
      const letterOwner = C.RIDDLE_PASSWORD.split('').map((_, i) => (riddles.length ? i % riddles.length : 0));
      S.L = { riddles, letterOwner, assign: {}, solved: [], solvedBy: {} };
      LEVEL_IMPL.riddles.reassign();
    },
    reassign() {
      // I fascicoli aperti vengono distribuiti tra le connesse, mai a chi ne è la protagonista:
      // rotazione sull'ordine mescolato (ognuna riceve quello della successiva), poi gli altri a chi ne ha meno.
      const ps = shuffle(connectedPlayers().slice());
      S.L.assign = {};
      const n = ps.length;
      if (!n) return;
      const idxOf = Object.fromEntries(ps.map((p, i) => [p.pid, i]));
      const load = ps.map(() => 0);
      const give = (idx, k) => { (S.L.assign[ps[k].pid] = S.L.assign[ps[k].pid] || []).push(idx); load[k]++; };
      const rest = [];
      for (const idx of S.L.riddles.map((_, i) => i).filter((i) => !S.L.solved.includes(i))) {
        const k = idxOf[S.L.riddles[idx].about];
        if (k === undefined) rest.push(idx); else give(idx, n > 1 ? (k + 1) % n : k);
      }
      for (const idx of rest) {
        let best = -1;
        for (let k = 0; k < n; k++) if (ps[k].pid !== S.L.riddles[idx].about && (best < 0 || load[k] < load[best])) best = k;
        give(idx, best < 0 ? 0 : best);
      }
    },
    action(p, m) {
      if (m.type === 'answer' && Number.isInteger(m.idx)) {
        const r = S.L.riddles[m.idx];
        if (!r || S.L.solved.includes(m.idx)) return;
        if (r.accept.map(norm).includes(norm(m.text))) {
          S.L.solved.push(m.idx); S.L.solvedBy[m.idx] = p.name;
          logEvent(`${p.name} ha identificato ${r.name}`);
          toast(`${p.name} ha identificato la sospettata: ${r.name}!`, 'good');
          LEVEL_IMPL.riddles.reassign();
        } else notifyPlayer(p.pid, { type: 'wrong' });
      }
      if (m.type === 'password') {
        if (norm(m.text) === C.RIDDLE_PASSWORD) { logEvent(`${p.name} ha inserito la parola d'ordine`); solveLevel(); }
        else { toast(`Parola d'ordine errata (${p.name}).`, 'bad'); notifyPlayer(p.pid, { type: 'wrong' }); }
      }
    },
    onPlayersChanged() { LEVEL_IMPL.riddles.reassign(); },
    view(p) {
      return {
        letters: C.RIDDLE_PASSWORD.split('').map((ch, i) => (S.L.solved.includes(S.L.letterOwner[i]) ? ch : null)),
        identified: S.L.solved.map((i) => ({ name: S.L.riddles[i].name, by: S.L.solvedBy[i] })),
        total: S.L.riddles.length,
        allSolved: S.L.solved.length === S.L.riddles.length,
        mine: p ? (S.L.assign[p.pid] || []).map((i) => ({ idx: i, q: S.L.riddles[i].q })) : []
      };
    }
  },

  lights: {
    ROWS: 3, COLS: 4,
    init() {
      const n = 12;
      let grid = Array(n).fill(true);
      // Parte da "tutto acceso" e applica 5-6 mosse casuali: garantisce una soluzione.
      const moves = shuffle([...Array(n).keys()]).slice(0, 5 + Math.floor(Math.random() * 2));
      moves.forEach((c) => LEVEL_IMPL.lights.flip(grid, c));
      if (grid.every(Boolean)) LEVEL_IMPL.lights.flip(grid, 0);
      S.L = { grid, owner: {}, presses: 0 };
      LEVEL_IMPL.lights.reassign();
    },
    reassign() {
      const cells = [...Array(12).keys()];
      const map = assignRoundRobin(cells, connectedPlayers());
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
      S.L.presses++;
      S.L.last = { cell: m.cell, at: Date.now() };
      if (S.L.grid.every(Boolean)) { logEvent(`Quadro elettrico riattivato in ${S.L.presses} mosse`); solveLevel(); }
    },
    onPlayersChanged() { LEVEL_IMPL.lights.reassign(); },
    view(p) {
      const names = {}; for (const [c, pid] of Object.entries(S.L.owner)) names[c] = S.players[pid]?.name || '?';
      return {
        grid: S.L.grid, names, presses: S.L.presses, last: S.L.last,
        mine: p ? Object.entries(S.L.owner).filter(([, pid]) => pid === p.pid).map(([c]) => Number(c)) : []
      };
    }
  },

  qrhunt: {
    init() { S.L = { found: {} }; },
    claim(p, code) {
      const idx = CONFIG.keys.findIndex((k) => norm(k.code) === norm(code));
      if (idx < 0) return { ok: false, msg: 'Codice sconosciuto. Il Cuoco: "Bel tentativo."' };
      if (S.L.found[idx]) return { ok: true, idx, digit: CONFIG.keys[idx].digit, msg: `Fiala ${idx + 1} già trovata da ${S.L.found[idx].name}.` };
      S.L.found[idx] = { pid: p.pid, name: p.name, at: Date.now() };
      logEvent(`${p.name} ha trovato la fiala ${idx + 1}`);
      toast(`${p.name} ha trovato la fiala ${idx + 1}!`, 'good');
      if (Object.keys(S.L.found).length === CONFIG.keys.length) setTimeout(solveLevel, 1500);
      broadcast();
      return { ok: true, idx, digit: CONFIG.keys[idx].digit, msg: `Fiala ${idx + 1} trovata!` };
    },
    action(p, m) { if (m.type === 'code') { const r = LEVEL_IMPL.qrhunt.claim(p, m.text); notifyPlayer(p.pid, { type: 'keyResult', ...r }); } },
    view(p) {
      return {
        keys: CONFIG.keys.map((k, i) => ({ found: !!S.L.found[i], by: S.L.found[i]?.name || null, hint: k.hint })),
        myDigits: p ? Object.entries(S.L.found).filter(([, f]) => f.pid === p.pid).map(([i]) => ({ idx: Number(i), digit: CONFIG.keys[i].digit })) : []
      };
    }
  },

  reconnect: {
    ROTATE_MS: 25000,
    init() { S.L = { token: token(4), prev: null, tokenAt: Date.now(), done: {} }; },
    tick() {
      if (Date.now() - S.L.tokenAt > LEVEL_IMPL.reconnect.ROTATE_MS) { S.L.prev = S.L.token; S.L.token = token(4); S.L.tokenAt = Date.now(); }
    },
    claim(p, t) {
      if (norm(t) !== S.L.token && norm(t) !== S.L.prev) return { ok: false, msg: 'Codice scaduto o errato: guarda il QR attuale sullo schermo.' };
      if (!S.L.done[p.pid]) { S.L.done[p.pid] = Date.now(); logEvent(`${p.name} ha salvato la prova`); }
      LEVEL_IMPL.reconnect.check();
      broadcast();
      return { ok: true, msg: 'Prova salvata!' };
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
      const teams = activeTeams();
      const len = LEVEL_IMPL.simon.LENGTHS[S.L.round];
      const seq = [];
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
          toast(`Round ${S.L.round} superato!`, 'good');
          setTimeout(() => { LEVEL_IMPL.simon.newRound(); broadcast(); }, 1500);
        }
      } else {
        S.L.fails++; S.L.lock = true; S.L.showing = true; S.L.last = { team: p.team, ok: false, at: Date.now() };
        toast(`Sbagliato (${teamOf(p).name})! Si ricomincia il round.`, 'bad');
        setTimeout(() => { LEVEL_IMPL.simon.newRound(); broadcast(); }, 1800);
      }
    },
    view(p) {
      const showing = S.L.lock || Date.now() < S.L.showUntil;
      return { round: S.L.round, rounds: LEVEL_IMPL.simon.LENGTHS.length, seq: S.L.seq, showUntil: S.L.showUntil, showing, pos: S.L.pos, fails: S.L.fails, last: S.L.last, myTeam: p ? p.team : null };
    }
  },

  vault: {
    WINDOW_MS: 20000,
    init() { S.L = { code: CONFIG.keys.map((k) => k.digit).join(''), ok: {}, windowStart: null, resets: 0 }; },
    tick() {
      if (S.L.windowStart && Date.now() - S.L.windowStart > LEVEL_IMPL.vault.WINDOW_MS) {
        S.L.ok = {}; S.L.windowStart = null; S.L.resets++;
        toast('La serratura si è bloccata. Riprovate tutte insieme!', 'bad');
      }
    },
    action(p, m) {
      if (m.type !== 'code') return;
      if (norm(m.text) !== S.L.code) { notifyPlayer(p.pid, { type: 'wrong' }); return; }
      if (!S.L.windowStart) S.L.windowStart = Date.now();
      S.L.ok[p.pid] = true;
      const ps = connectedPlayers();
      if (ps.every((q) => S.L.ok[q.pid])) { logEvent('Cassetta dei farmaci aperta!'); winGame(); }
    },
    view(p) {
      return { confirmed: Object.keys(S.L.ok), total: connectedPlayers().length, windowStart: S.L.windowStart, windowMs: LEVEL_IMPL.vault.WINDOW_MS, resets: S.L.resets, me: p ? !!S.L.ok[p.pid] : false };
    }
  }
};

// ---------------------------------------------------------------- flusso di gioco
let doneTimer = null;
function startLevel(idx) {
  clearTimeout(doneTimer);
  if (idx >= C.LEVELS.length) return winGame();
  S.levelIdx = idx; S.phase = 'level'; S.hint = null; S.levelStartedAt = Date.now();
  LEVEL_IMPL[C.LEVELS[idx].id].init();
  logEvent(`Inizio ${C.LEVELS[idx].title}`);
  broadcast();
}
function solveLevel() {
  if (S.phase !== 'level') return;
  S.phase = 'levelDone';
  const secs = Math.round((Date.now() - S.levelStartedAt) / 1000);
  logEvent(`${C.LEVELS[S.levelIdx].title} superato in ${secs}s`);
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
function startGame() {
  S.startedAt = Date.now(); S.extraMs = 0; S.hintsUsed = 0; S.phase = 'intro';
  logEvent('Partita iniziata');
  broadcast();
}
function resetGame(keepPlayers = true) {
  clearTimeout(doneTimer);
  S.phase = 'lobby'; S.levelIdx = -1; S.startedAt = null; S.extraMs = 0; S.hintsUsed = 0; S.hint = null; S.toast = null; S.L = {}; S.finishedAt = null;
  if (!keepPlayers) S.players = {};
  logEvent('Partita azzerata');
  broadcast();
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
function publicView() {
  const lv = level();
  return {
    phase: S.phase, levelIdx: S.levelIdx, levelCount: C.LEVELS.length,
    level: lv ? { id: lv.id, title: lv.title, subtitle: fill(lv.subtitle) } : null,
    scenes: S.phase === 'intro' ? scenesFor('prologue') : S.phase === 'dead' ? scenesFor('dead') : lv ? scenesFor(lv.id) : [],
    hintScenes: S.hint ? scenesFor('hint', S.hint.text) : null,
    players: Object.values(S.players).map((p) => ({ pid: p.pid, name: p.name, team: p.team, connected: p.connected })),
    teams: CONFIG.teams, birthday: CONFIG.birthday, victim: VICTIM,
    story: { title: fill(C.STORY.title), intro: C.STORY.intro.map(fill), win: C.STORY.win.map(fill), dead: C.STORY.dead.map(fill) },
    profileFields: C.PROFILE_FIELDS.map((f) => ({ ...f, label: fill(f.label) })),
    profilesDone: Object.values(S.players).filter((p) => p.profile && Object.keys(p.profile).length).length,
    startedAt: S.startedAt, deadline: deadline(), finishedAt: S.finishedAt || null, hintsUsed: S.hintsUsed, hint: S.hint, toast: S.toast,
    joinUrl: BASE_URL() + '/', now: Date.now()
  };
}
function viewFor(c) {
  const v = publicView();
  const lv = level();
  const p = c.pid ? S.players[c.pid] : null;
  if (lv) v.L = LEVEL_IMPL[lv.id].view(c.role === 'phone' ? p : null);
  if (c.role === 'phone') v.me = p ? { pid: p.pid, name: p.name, team: p.team, teamName: teamOf(p).name, color: teamOf(p).color, profile: p.profile || null } : null;
  if (c.role === 'admin') {
    v.admin = { log: S.log, hints: lv ? lv.hints : [], levels: C.LEVELS.map((l) => l.title), adminKey: ADMIN_KEY, keys: CONFIG.keys, printUrl: `${BASE_URL()}/print?key=${ADMIN_KEY}`, screenUrl: `${BASE_URL()}/screen`, riddleAnswers: lv && lv.id === 'riddles' ? S.L.riddles.map((r) => r.name) : null, riddlePassword: C.RIDDLE_PASSWORD, profiles: Object.values(S.players).map((p) => ({ name: p.name, profile: p.profile || null })), fragmentsAnswer: lv && lv.id === 'fragments' ? S.L.answer : null };
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
function scanPage(title, body, ok) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="/style.css"></head><body class="scan ${ok ? 'ok' : 'bad'}"><main class="card"><h1>${title}</h1><p>${body}</p>
<p class="muted">Torna alla scheda del gioco nel browser (questa pagina si può chiudere).</p></main></body></html>`;
}
app.get('/k/:code', (req, res) => {
  const p = S.players[pidFromReq(req)];
  if (!p) return res.send(scanPage('Chi sei?', 'Questo telefono non è ancora entrato nel gioco. Apri prima la pagina del gioco e inserisci il tuo nome.', false));
  if (!(level() && level().id === 'qrhunt' && S.phase === 'level')) return res.send(scanPage('Troppo presto!', 'Il Cuoco: "Hai trovato qualcosa... ma non è ancora il momento. Ricorda dove l\'hai visto."', false));
  const r = LEVEL_IMPL.qrhunt.claim(p, req.params.code);
  res.send(scanPage(r.ok ? `Fiala ${r.idx + 1}` : 'Niente', r.ok ? `${r.msg}<br><br>La cifra di questa fiala è <b class="digit">${r.digit}</b>. Ricordala e dilla a tutte!` : r.msg, r.ok));
});
app.get('/r/:token', (req, res) => {
  const p = S.players[pidFromReq(req)];
  if (!p) return res.send(scanPage('Chi sei?', 'Questo telefono non è ancora entrato nel gioco. Apri prima la pagina del gioco e inserisci il tuo nome.', false));
  if (!(level() && level().id === 'reconnect' && S.phase === 'level')) return res.send(scanPage('Non ora', 'Non c\'è nulla da riconnettere in questo momento.', false));
  const r = LEVEL_IMPL.reconnect.claim(p, req.params.token);
  res.send(scanPage(r.ok ? 'Prova salvata!' : 'Scaduto', r.msg, r.ok));
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
      const pid = (m.pid && S.players[m.pid]) ? m.pid : token(8);
      if (!S.players[pid]) {
        // Squadra scelta con il minor numero di giocatori (a parità, la prima).
        const counts = CONFIG.teams.map((_, i) => Object.values(S.players).filter((p) => p.team === i).length);
        const team = counts.indexOf(Math.min(...counts));
        S.players[pid] = { pid, name, team, connected: true, joinedAt: Date.now() };
        logEvent(`${name} è entrata (squadra ${CONFIG.teams[team].name})`);
      } else S.players[pid].name = name;
      c.pid = pid; S.players[pid].connected = true;
      send(c, { type: 'joined', pid });
      return playersChanged();
    }
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
      const text = m.text || lv.hints[Math.min(m.idx ?? 0, lv.hints.length - 1)];
      S.hint = { text, at: Date.now() }; S.hintsUsed++;
      broadcastToPhones({ type: 'buzz', pattern: [300] });
      logEvent(`Suggerimento: ${text}`);
      break;
    }
    case 'addTime': S.extraMs += Number(m.minutes || 5) * 60000; toast(`Il Cuoco concede ${m.minutes || 5} minuti extra`, 'good'); if (S.phase === 'dead' && deadline() > Date.now()) S.phase = 'level'; break;
    case 'kick': delete S.players[m.pid]; for (const c of clients) if (c.pid === m.pid) c.pid = null; playersChanged(); break;
    case 'setTeam': if (S.players[m.pid]) { S.players[m.pid].team = Number(m.team); playersChanged(); } break;
    case 'reset': resetGame(!m.dropPlayers); break;
    case 'win': winGame(); break;
    case 'toast': toast(m.text, 'info'); break;
  }
  broadcast();
}

// Tick di gioco: livelli con logica temporale + refresh periodico dei client.
setInterval(() => {
  const lv = level();
  checkDeadline();
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
    console.log('  HOST=<indirizzo> npm start (Windows: set HOST=<indirizzo> && npm start) usando quello del Wi-Fi:');
    c.forEach((x) => console.log(`    ${x.address.padEnd(15)}  ${x.name}`));
    console.log('');
  }
});
