import { Chess, validateFen } from "../vendor/chess.js";
import { DECKS, LINKS, PUZZLES, ORACLE, UPDATED } from "./data.js";

/* ---------- utils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("noah." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("noah." + k, JSON.stringify(v)); } catch {} }
};
const tokyoDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayIndex = () => Math.floor((Date.now() + 9 * 3600e3) / 86400e3);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, r = Math.random) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const corners = '<i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i>';

/* ---------- background: living particle field ---------- */
(function bg() {
  const c = $("#bg"), x = c.getContext("2d"); let W, H, pts = [], mouse = { x: -999, y: -999 }, t = 0;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function size() { W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio; c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px";
    const n = Math.min(110, Math.floor(innerWidth * innerHeight / 14000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 })); }
  addEventListener("resize", size); addEventListener("pointermove", (e) => { mouse.x = e.clientX * devicePixelRatio; mouse.y = e.clientY * devicePixelRatio; });
  size();
  function frame() {
    t += 0.004; x.clearRect(0, 0, W, H);
    // rotating hex rings
    const cx = W * 0.5, cy = H * 0.42, R = Math.min(W, H) * 0.34;
    for (let k = 0; k < 3; k++) {
      x.beginPath(); const r = R * (0.55 + k * 0.25), rot = t * (k % 2 ? -1 : 1) * (0.6 + k * 0.2);
      for (let i = 0; i <= 6; i++) { const a = rot + i * Math.PI / 3; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a) * 0.55; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.strokeStyle = `rgba(${k === 1 ? "180,140,255" : "56,248,200"},${0.07 + 0.03 * Math.sin(t * 3 + k)})`; x.lineWidth = devicePixelRatio; x.stroke();
    }
    for (const p of pts) {
      p.x += p.vx * devicePixelRatio; p.y += p.vy * devicePixelRatio;
      if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
      const dm = Math.hypot(p.x - mouse.x, p.y - mouse.y); if (dm < 140 * devicePixelRatio) { p.x += (p.x - mouse.x) / dm * 0.8; p.y += (p.y - mouse.y) / dm * 0.8; }
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y), L = 130 * devicePixelRatio;
      if (d < L) { x.strokeStyle = `rgba(56,248,200,${(1 - d / L) * 0.22})`; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
    }
    for (const p of pts) { x.fillStyle = "rgba(160,255,230,.7)"; x.fillRect(p.x, p.y, 1.6 * devicePixelRatio, 1.6 * devicePixelRatio); }
    if (!still) requestAnimationFrame(frame);
  }
  frame();
})();

/* ---------- HUD ---------- */
setInterval(() => { $("#clock").textContent = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Tokyo" }); }, 1000);
$("#upd").textContent = UPDATED;
function typeOut(el, text, speed = 18) { el.innerHTML = ""; let i = 0; const span = document.createElement("span"); el.append(span, h('<i class="cur"></i>'));
  const tick = () => { if (!el.isConnected) return; span.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(tick, speed); }; tick(); }

/* ---------- chess core ---------- */
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
function forcedMate(c, n) { // side to move gets mated within n attacker moves
  if (c.isCheckmate()) return true;
  if (n === 0 || c.isGameOver()) return false;
  for (const d of c.moves({ verbose: true })) {
    c.move(d); let ok = false;
    for (const a of c.moves({ verbose: true })) { c.move(a); if (forcedMate(c, n - 1)) ok = true; c.undo(); if (ok) break; }
    c.undo(); if (!ok) return false;
  }
  return true;
}
function solutions(fen, n) { const c = new Chess(fen), out = []; for (const m of c.moves({ verbose: true })) { c.move(m); if (forcedMate(c, n - 1)) out.push(m.san); c.undo(); } return out; }
function bestDefence(c, n) { // pick the reply that survives longest
  let best = null, bestK = -1;
  for (const d of c.moves({ verbose: true })) { c.move(d); let k = 0; while (k < n && !forcedMate(c, k)) k++; c.undo(); if (k > bestK) { bestK = k; best = d; } }
  return best;
}

function Board(el, { fen, onMove, interactive = true, edit = null }) {
  let game = new Chess(fen), sel = null, last = null;
  const api = {
    get game() { return game; }, set(f) { game = new Chess(f); sel = null; last = null; draw(); },
    lastMove(m) { last = m; draw(); }, draw
  };
  function draw() {
    el.innerHTML = ""; el.classList.add("board");
    const flip = false, b = edit ? edit.grid() : game.board();
    const targets = sel && !edit ? game.moves({ square: sel, verbose: true }) : [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const rr = flip ? 7 - r : r, ff = flip ? 7 - f : f, sq = "abcdefgh"[ff] + (8 - rr), p = b[rr][ff];
      const d = document.createElement("div"); d.className = "sq " + ((rr + ff) % 2 ? "d" : "l"); d.dataset.sq = sq;
      if (sq === sel) d.classList.add("sel");
      if (last && (sq === last.from || sq === last.to)) d.classList.add("last");
      const t = targets.find((m) => m.to === sq); if (t) { d.classList.add("tgt"); if (t.captured) d.classList.add("cap"); }
      if (p) d.append(h(`<span class="pc ${p.color}">${GLYPH[p.type]}&#xFE0E;</span>`));
      if (rr === 7) d.append(h(`<span class="coord f">${"abcdefgh"[ff]}</span>`));
      if (ff === 0) d.append(h(`<span class="coord r">${8 - rr}</span>`));
      d.onclick = () => click(sq); el.append(d);
    }
  }
  function click(sq) {
    if (edit) { edit.place(sq); draw(); return; }
    if (!interactive) return;
    const p = game.get(sq);
    if (sel) {
      const m = game.moves({ square: sel, verbose: true }).find((x) => x.to === sq);
      if (m) { const mv = game.move({ from: sel, to: sq, promotion: "q" }); sel = null; last = mv; draw(); onMove && onMove(mv, api); return; }
    }
    sel = p && p.color === game.turn() ? sq : null; draw();
  }
  draw(); return api;
}

/* A self-contained mate-in-N puzzle player */
function PuzzlePlayer(boardEl, msgEl, pz, onSolved) {
  let left = pz.n, solving = true;
  const say = (t, cls = "") => { msgEl.className = "msg " + cls; msgEl.textContent = t; };
  const side = () => (new Chess(pz.fen).turn() === "w" ? "White" : "Black");
  say(`${side()} to move: mate in ${pz.n}.`);
  const b = Board(boardEl, { fen: pz.fen, onMove: (mv, api) => {
    if (!solving) return;
    const c = api.game;
    if (c.isCheckmate()) { solving = false; say("CHECKMATE. Puzzle solved.", "good"); onSolved && onSolved(); return; }
    if (left > 1 && forcedMate(c, left - 1)) {
      left--; say("Strong move. The opponent replies…");
      setTimeout(() => { const d = bestDefence(c, left); if (!d) return; c.move(d); api.lastMove(d); say(`${side()} to move: mate in ${left}.`); }, 450);
    } else { setTimeout(() => { c.undo(); api.lastMove(null); say("That doesn't force mate. Try again.", "bad"); }, 500); }
  }});
  return { reset() { left = pz.n; solving = true; b.set(pz.fen); say(`${side()} to move: mate in ${pz.n}.`); },
           hint() { say("Hint: " + (pz.hint || "Look for checks, captures and threats.")); },
           reveal() { const s = solutions(b.game.fen(), left); say(s.length ? "Winning first move: " + s.join(" or ") : "No forced mate from here: reset."); } };
}

/* ---------- views ---------- */
const views = {};
const app = $("#app");

views[""] = () => {
  const streak = store.get("streak", { n: 0, last: "" });
  const solved = store.get("solved", {});
  const pz = PUZZLES[dayIndex() % PUZZLES.length];
  const v = h(`<div class="view">
    <section class="hero">
      <div class="boot" id="boot"></div>
      <div class="glitch" data-t="NOAH//MENON">NOAH//MENON</div>
      <div class="tag">signal station · quizzes · chess · ideas</div>
    </section>
    <div class="grid g3">
      <a class="panel portal" href="#/arcade">${corners}<div class="big" style="color:#38f8c8">◈</div><h3>Quiz Arcade</h3><p>Econ, Psych, Bio, Sport, Game Theory and Chess. A fresh Daily Mix every day.</p></a>
      <a class="panel portal" href="#/chess">${corners}<div class="big" style="color:#4fd6ff">♞</div><h3>Chess Lab</h3><p>Puzzle of the day, plus a puzzle builder that checks every puzzle has a forced mate.</p></a>
      <a class="panel portal" href="#/present">${corners}<div class="big" style="color:#b48cff">▣</div><h3>Club Deck</h3><p>Build chess-club presentations with live puzzle slides. Present full-screen.</p></a>
    </div>
    <div class="grid g3" style="margin-top:16px">
      <div class="panel">${corners}<h3>Oracle transmission</h3><div class="oracle" id="oracle"></div></div>
      <div class="panel">${corners}<h3>Daily streak</h3><div class="stat">${streak.n}</div><div class="label">days in a row · Daily Mix</div>
        <div class="row" style="margin-top:14px"><a class="btn solid" href="#/arcade/daily">Run Daily Mix</a><a class="btn" href="#/links">Link-4</a></div></div>
      <div class="panel">${corners}<h3>Today's puzzle</h3><div class="stat" style="font-size:22px">${esc(pz.name)}</div><div class="label">mate in ${pz.n} · ${solved[tokyoDate()] ? "solved ✓" : "unsolved"}</div>
        <div class="row" style="margin-top:14px"><a class="btn solid" href="#/chess">Solve it</a></div></div>
    </div></div>`);
  app.replaceChildren(v);
  const lines = ["> establishing uplink… ok", "> loading knowledge cores [econ/psych/bio/chess]… ok", "> welcome back, operator."];
  const boot = $("#boot"); let i = 0; (function next() { if (!boot.isConnected || i >= lines.length) return; boot.textContent += (i ? "\n" : "") + lines[i++]; setTimeout(next, 380); })();
  typeOut($("#oracle"), ORACLE[dayIndex() % ORACLE.length]);
};

/* Quiz Arcade */
const getDecks = () => ({ ...DECKS, ...store.get("mydecks", {}) });
const allQ = () => Object.entries(getDecks()).flatMap(([k, d]) => d.q.map((q) => ({ deck: k, q: q[0], opts: q[1], ans: q[2], why: q[3] })));
views["arcade"] = (sub) => {
  if (sub === "edit") return quizEditor();
  if (sub) return runQuiz(sub);
  const best = store.get("best", {});
  const v = h(`<div class="view"><h2 class="title">Quiz Arcade</h2><div class="sub">// 20 seconds a question. Faster answers score more. Read the explanation after each one.</div>
    <div class="grid g3" id="decks"></div></div>`);
  const decks = $("#decks", v);
  decks.append(h(`<a class="panel portal deck" href="#/arcade/daily">${corners}<div class="big" style="color:#fff">✦</div><h3>Daily Mix</h3><p>6 questions from every deck. Keeps your streak alive.</p><div class="label">best ${best.daily ?? "-"}</div></a>`));
  decks.append(h(`<a class="panel portal deck" href="#/arcade/edit">${corners}<div class="big" style="color:#ffb347">✎</div><h3>Quiz Editor</h3><p>Make your own decks or edit a copy of any deck. Export to share.</p><div class="label">${Object.keys(store.get("mydecks", {})).length} custom decks</div></a>`));
  for (const [k, d] of Object.entries(getDecks())) decks.append(h(`<a class="panel portal deck" href="#/arcade/${k}">${corners}<div class="big" style="color:${d.color}">${d.icon}</div><h3>${d.name}</h3><p>${d.q.length} questions</p><div class="label">best ${best[k] ?? "-"}</div></a>`));
  app.replaceChildren(v);
};
function runQuiz(deck) {
  let qs;
  const D = getDecks(), AQ = allQ();
  if (deck === "daily") qs = shuffle(AQ.filter((q) => DECKS[q.deck]), rng(dayIndex())).slice(0, 6);
  else if (D[deck] && D[deck].q.length) qs = shuffle(AQ.filter((q) => q.deck === deck)).slice(0, 10);
  else return go("#/arcade");
  let i = 0, score = 0, right = 0, timer;
  const v = h(`<div class="view"><div class="panel qcard">${corners}<div id="qa"></div></div></div>`); app.replaceChildren(v);
  const qa = $("#qa", v);
  function show() {
    const q = qs[i], d = D[q.deck], order = shuffle(q.opts.map((o, j) => j));
    qa.innerHTML = `<div class="qmeta"><span style="color:${d.color}">${d.icon} ${d.name}</span><span>${i + 1}/${qs.length} · ${score} pts</span></div><div class="timer"><i style="width:100%"></i></div>
      <p class="q">${esc(q.q)}</p><div class="opts">${order.map((j) => `<button class="opt" data-j="${j}">${esc(q.opts[j])}</button>`).join("")}</div><div id="after"></div>`;
    const bar = $(".timer i", qa), t0 = Date.now(), T = 20000;
    clearInterval(timer); timer = setInterval(() => { const left = Math.max(0, 1 - (Date.now() - t0) / T); bar.style.width = left * 100 + "%"; if (!left) answer(-1); }, 100);
    let done = false;
    qa.querySelectorAll(".opt").forEach((b) => b.onclick = () => answer(+b.dataset.j));
    function answer(j) {
      if (done) return; done = true; clearInterval(timer);
      const ok = j === q.ans, pts = ok ? 100 + Math.round(100 * Math.max(0, 1 - (Date.now() - t0) / T)) : 0; score += pts; if (ok) right++;
      qa.querySelectorAll(".opt").forEach((b) => { const k = +b.dataset.j; if (k === q.ans) b.classList.add("ok"); else if (k === j) b.classList.add("bad"); b.disabled = true; });
      $("#after", qa).innerHTML = `<div class="why">${ok ? "✓ +" + pts : j < 0 ? "⌛ Time's up" : "✗ Not quite"} · ${esc(q.why)}</div><div class="row" style="margin-top:16px"><button class="btn solid" id="nx">${i + 1 < qs.length ? "Next →" : "Results"}</button></div>`;
      $("#nx", qa).onclick = () => { i++; i < qs.length ? show() : end(); }; $("#nx", qa).focus();
    }
  }
  function end() {
    const best = store.get("best", {}); const nb = score > (best[deck] ?? 0); if (nb) { best[deck] = score; store.set("best", best); }
    if (deck === "daily") { const s = store.get("streak", { n: 0, last: "" }), today = tokyoDate(), y = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
      if (s.last !== today) { s.n = s.last === y ? s.n + 1 : 1; s.last = today; store.set("streak", s); } }
    qa.innerHTML = `<div class="label" style="text-align:center">transmission complete</div><div class="score">${score}</div>
      <p style="text-align:center">${right}/${qs.length} correct${nb ? " · NEW BEST" : ""}</p>
      <div class="row" style="justify-content:center"><button class="btn solid" id="again">Run again</button><a class="btn" href="#/arcade">All decks</a></div>`;
    $("#again", qa).onclick = () => runQuiz(deck);
  }
  show();
}

/* Quiz editor */
function quizEditor() {
  let my = store.get("mydecks", {}), cur = Object.keys(my)[0] || null;
  const save = () => store.set("mydecks", my);
  const v = h(`<div class="view"><h2 class="title">Quiz Editor</h2><div class="sub">// Your decks are saved in this browser. Export one to back it up or send it to a friend.</div>
    <div class="grid" style="grid-template-columns:minmax(220px,300px) 1fr">
      <div class="panel">${corners}<h3>My decks</h3><div class="slides-list" id="dl"></div>
        <div class="row" style="margin-top:12px"><button class="btn solid" id="nd">+ New deck</button></div>
        <div class="row" style="margin-top:10px"><select id="cp" style="flex:1"><option value="">Copy a built-in deck…</option>${Object.entries(DECKS).map(([k, d]) => `<option value="${k}">${esc(d.name)}</option>`).join("")}</select></div>
        <div class="row" style="margin-top:10px"><button class="btn ghost" id="ex">Export</button><label class="btn ghost">Import<input type="file" id="im" accept=".json" hidden></label></div></div>
      <div class="panel">${corners}<div id="de"></div></div></div></div>`);
  app.replaceChildren(v);
  function list() { const dl = $("#dl", v); dl.innerHTML = ""; for (const [k, d] of Object.entries(my)) { const it = h(`<div class="slide-item ${k === cur ? "on" : ""}"><b style="color:${d.color}">${d.icon}</b><span>${esc(d.name)}</span><span class="label">${d.q.length}q</span></div>`); it.onclick = () => { cur = k; render(); }; dl.append(it); } if (!dl.children.length) dl.innerHTML = '<p class="label">No decks yet.</p>'; }
  function editor() {
    const de = $("#de", v), d = my[cur];
    if (!d) { de.innerHTML = '<h3>Start here</h3><p>Make a new deck, or copy a built-in one and change it however you like.</p>'; return; }
    de.innerHTML = `<div class="row" style="justify-content:space-between"><h3>Edit deck</h3><div class="row"><a class="btn" href="#/arcade/${cur}">▶ Play</a><button class="btn ghost" id="dd">Delete deck</button></div></div>
      <div class="row" style="margin:10px 0"><input id="dn" style="flex:1" value="${esc(d.name)}" placeholder="Deck name"><input id="di" style="width:60px;text-align:center" value="${esc(d.icon)}" maxlength="2"><input id="dc" type="color" value="${d.color}" style="width:50px;padding:2px"></div>
      <div id="ql"></div><div class="row" style="margin-top:12px"><button class="btn solid" id="aq">+ Add question</button></div>`;
    $("#dn", de).oninput = (e) => { d.name = e.target.value; save(); list(); };
    $("#di", de).oninput = (e) => { d.icon = e.target.value || "●"; save(); list(); };
    $("#dc", de).oninput = (e) => { d.color = e.target.value; save(); list(); };
    $("#dd", de).onclick = () => { if (confirm(`Delete "${d.name}"?`)) { delete my[cur]; cur = Object.keys(my)[0] || null; save(); render(); } };
    $("#aq", de).onclick = () => { d.q.push(["", ["", "", "", ""], 0, ""]); save(); editor(); $("#ql", de).lastElementChild.scrollIntoView({ behavior: "smooth" }); };
    const ql = $("#ql", de);
    d.q.forEach((q, qi) => {
      const box = h(`<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:10px">
        <div class="row" style="justify-content:space-between"><span class="label">Question ${qi + 1}</span><button class="btn ghost" data-del>Remove</button></div>
        <textarea data-q placeholder="Question" style="min-height:50px;margin-top:6px">${esc(q[0])}</textarea>
        ${q[1].map((o, oi) => `<div class="row" style="margin-top:6px"><input type="radio" name="a${qi}" data-a="${oi}" ${q[2] === oi ? "checked" : ""} title="Correct answer"><input data-o="${oi}" style="flex:1" placeholder="Option ${oi + 1}${oi === 0 ? "" : ""}" value="${esc(o)}"></div>`).join("")}
        <input data-w style="width:100%;margin-top:6px" placeholder="Explanation shown after answering" value="${esc(q[3])}">
        <div class="label" style="margin-top:6px">● marks the correct answer</div></div>`);
      $("[data-q]", box).oninput = (e) => { q[0] = e.target.value; save(); };
      $("[data-w]", box).oninput = (e) => { q[3] = e.target.value; save(); };
      box.querySelectorAll("[data-o]").forEach((el) => el.oninput = (e) => { q[1][+el.dataset.o] = e.target.value; save(); });
      box.querySelectorAll("[data-a]").forEach((el) => el.onchange = () => { q[2] = +el.dataset.a; save(); });
      $("[data-del]", box).onclick = () => { d.q.splice(qi, 1); save(); editor(); };
      ql.append(box);
    });
  }
  function render() { list(); editor(); }
  $("#nd", v).onclick = () => { const id = "my" + Date.now().toString(36); my[id] = { name: "My deck", icon: "★", color: "#ffb347", q: [["", ["", "", "", ""], 0, ""]] }; cur = id; save(); render(); };
  $("#cp", v).onchange = (e) => { const k = e.target.value; if (!k) return; const src = DECKS[k], id = "my" + Date.now().toString(36);
    my[id] = { name: src.name + " (mine)", icon: src.icon, color: src.color, q: src.q.map((q) => [q[0], q[1].slice(), q[2], q[3]]) }; cur = id; e.target.value = ""; save(); render(); };
  $("#ex", v).onclick = () => { const a = h('<a download="my-quiz-decks.json"></a>'); a.href = URL.createObjectURL(new Blob([JSON.stringify(my, null, 2)], { type: "application/json" })); a.click(); };
  $("#im", v).onchange = async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); for (const [k, x] of Object.entries(d)) if (x && Array.isArray(x.q)) my["my" + Date.now().toString(36) + k.slice(-3)] = x; save(); cur = Object.keys(my).pop(); render(); } catch { alert("Couldn't read that file."); } };
  render();
}

/* Link-4 (connections-style) */
views["links"] = () => {
  const idx = dayIndex() % LINKS.length, grid = LINKS[idx], colors = ["#38f8c8", "#b48cff", "#ffb347", "#ff5fa2"];
  let words = shuffle(grid.flatMap(([, w]) => w), rng(dayIndex() * 7)), sel = new Set(), solved = [], lives = 4;
  const v = h(`<div class="view"><h2 class="title">Link-4</h2><div class="sub">// Find four groups of four. Grid #${idx + 1} · 4 mistakes allowed.</div>
    <div class="panel" style="max-width:700px;margin:0 auto">${corners}<div class="lgrid" id="lg"></div>
    <div class="row" style="justify-content:space-between;margin-top:16px"><div class="lives" id="lv"></div>
    <div class="row"><button class="btn ghost" id="sh">Shuffle</button><button class="btn ghost" id="cl">Clear</button><button class="btn solid" id="sb">Submit</button></div></div>
    <div class="msg" id="lm"></div></div></div>`);
  app.replaceChildren(v);
  const lg = $("#lg", v), msg = $("#lm", v);
  function draw() {
    lg.innerHTML = ""; $("#lv", v).innerHTML = "<i></i>".repeat(lives);
    for (const g of solved) lg.append(h(`<div class="solved" style="background:${colors[g]}"><b>${esc(grid[g][0])}</b><span>${grid[g][1].join(" · ")}</span></div>`));
    for (const w of words) { const t = h(`<div class="tile ${sel.has(w) ? "sel" : ""}">${w}</div>`); t.onclick = () => { if (sel.has(w)) sel.delete(w); else if (sel.size < 4) sel.add(w); draw(); }; lg.append(t); }
  }
  $("#sh", v).onclick = () => { words = shuffle(words); draw(); };
  $("#cl", v).onclick = () => { sel.clear(); draw(); };
  $("#sb", v).onclick = () => {
    if (sel.size !== 4 || !lives) return;
    const g = grid.findIndex(([, w]) => w.every((x) => sel.has(x)));
    if (g >= 0) { solved.push(g); words = words.filter((w) => !sel.has(w)); sel.clear(); msg.className = "msg good"; msg.textContent = solved.length === 4 ? "GRID CLEARED." : "Group locked in."; }
    else { const close = grid.some(([, w]) => w.filter((x) => sel.has(x)).length === 3); lives--; msg.className = "msg bad"; msg.textContent = close ? "One away…" : "Not a group.";
      if (!lives) { msg.textContent = "Out of attempts. Here are the answers."; grid.forEach((_, k) => { if (!solved.includes(k)) solved.push(k); }); words = []; } }
    draw();
  };
  draw();
};

/* Chess Lab */
views["chess"] = (sub, q) => {
  const mode = sub || "daily";
  const v = h(`<div class="view"><h2 class="title">Chess Lab</h2><div class="sub">// The Oracle checks every move. Any line that forces mate counts.</div>
    <div class="tabs"><a class="chip ${mode === "daily" ? "on" : ""}" href="#/chess">Puzzle of the day</a><a class="chip ${mode === "all" ? "on" : ""}" href="#/chess/all">All puzzles</a><a class="chip ${mode === "build" ? "on" : ""}" href="#/chess/build">Puzzle builder</a></div>
    <div id="cl"></div></div>`);
  app.replaceChildren(v); const cl = $("#cl", v);
  if (mode === "build") return builder(cl, q);
  const mine = store.get("mypuzzles", []);
  const list = [...PUZZLES, ...mine];
  let cur = q.get("fen") ? { name: "Shared puzzle", fen: q.get("fen"), n: +q.get("n") || 1, hint: "" } : (mode === "daily" ? PUZZLES[dayIndex() % PUZZLES.length] : list[0]);
  const lay = h(`<div class="grid g2"><div><div id="bd"></div><div class="msg" id="pm"></div></div>
    <div class="panel">${corners}<h3 id="pn"></h3><p id="ph" class="label"></p>
      <div class="row" style="margin:12px 0"><button class="btn" id="hint">Hint</button><button class="btn" id="rev">Oracle: reveal</button><button class="btn ghost" id="rst">Reset</button><button class="btn ghost" id="add">+ Club Deck</button></div>
      <div id="plist" class="slides-list"></div></div></div>`);
  cl.append(lay);
  let player;
  function load(pz) {
    cur = pz; $("#pn").textContent = pz.name; $("#ph").textContent = `mate in ${pz.n}`;
    player = PuzzlePlayer($("#bd"), $("#pm"), pz, () => { if (pz === PUZZLES[dayIndex() % PUZZLES.length]) { const s = store.get("solved", {}); s[tokyoDate()] = 1; store.set("solved", s); } });
  }
  $("#hint").onclick = () => player.hint(); $("#rev").onclick = () => player.reveal(); $("#rst").onclick = () => player.reset();
  $("#add").onclick = () => { addSlide({ type: "board", title: cur.name, text: cur.hint || "", fen: cur.fen, n: cur.n }); $("#pm").className = "msg good"; $("#pm").textContent = "Added to Club Deck."; };
  const pl = $("#plist");
  if (mode === "all") list.forEach((p, i) => { const it = h(`<div class="slide-item"><span>${esc(p.name)}</span><span class="label">m${p.n}${i >= PUZZLES.length ? " · mine" : ""}</span></div>`); it.onclick = () => load(p); pl.append(it); });
  load(cur);
};

function builder(cl, q) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  let tool = { color: "w", type: "k" }, turn = "w", n = 1;
  const setFromFen = (fen) => { const c = new Chess(fen); c.board().forEach((row, r) => row.forEach((p, f) => grid[r][f] = p ? { color: p.color, type: p.type } : null)); turn = c.turn(); };
  const fen = () => { const rows = grid.map((row) => { let s = "", e = 0; for (const p of row) { if (!p) { e++; continue; } if (e) { s += e; e = 0; } s += p.color === "w" ? p.type.toUpperCase() : p.type; } return s + (e || ""); }); return rows.join("/") + ` ${turn} - - 0 1`; };
  setFromFen(q.get("fen") || "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1");
  const lay = h(`<div class="grid g2"><div><div id="bb"></div><div class="msg" id="bm">Pick a piece, then click squares. Click a square again with the same piece to clear it.</div></div>
    <div class="panel">${corners}<h3>Puzzle builder</h3>
      <div class="palette" id="pal" style="margin:10px 0"></div>
      <div class="row" style="margin:10px 0"><label class="label">to move</label><select id="tm"><option value="w">White</option><option value="b">Black</option></select>
        <label class="label">mate in</label><select id="mn"><option>1</option><option>2</option><option>3</option></select></div>
      <div class="row"><input id="nm" placeholder="Puzzle name" style="flex:1"></div>
      <div class="row" style="margin-top:10px"><input id="fen" style="flex:1" spellcheck="false"></div>
      <div class="row" style="margin-top:12px"><button class="btn solid" id="ver">Oracle: verify</button><button class="btn" id="sv" disabled>Save</button><button class="btn" id="dk" disabled>+ Club Deck</button><button class="btn" id="sh" disabled>Copy link</button></div>
      <div class="row" style="margin-top:10px"><button class="btn ghost" id="clr">Empty board</button><button class="btn ghost" id="st">Start position</button></div>
    </div></div>`);
  cl.append(lay);
  const editApi = { grid: () => grid, place(sq) { const f = sq.charCodeAt(0) - 97, r = 8 - +sq[1]; const cur = grid[r][f];
    grid[r][f] = tool.type === "x" || (cur && cur.color === tool.color && cur.type === tool.type) ? null : { ...tool }; sync(); } };
  const bd = Board($("#bb"), { fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", edit: editApi });
  const pal = $("#pal");
  const tools = [..."kqrbnp"].map((t) => ({ color: "w", type: t })).concat([{ type: "x" }], [..."kqrbnp"].map((t) => ({ color: "b", type: t })), [{ type: "x" }]);
  tools.forEach((t) => { const b = h(`<button title="${t.type === "x" ? "eraser" : t.color + t.type}">${t.type === "x" ? '<span style="font-family:var(--mono);color:var(--dim)">✕</span>' : `<span class="pc ${t.color}">${GLYPH[t.type]}&#xFE0E;</span>`}</button>`);
    b.onclick = () => { tool = t; pal.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }; pal.append(b); });
  pal.firstElementChild.classList.add("on");
  let verified = null;
  const say = (t, c = "") => { $("#bm").className = "msg " + c; $("#bm").textContent = t; };
  function sync() { $("#fen").value = fen(); $("#tm").value = turn; verified = null; ["sv", "dk", "sh"].forEach((id) => $("#" + id).disabled = true); bd.draw(); }
  $("#tm").onchange = (e) => { turn = e.target.value; sync(); };
  $("#mn").onchange = (e) => { n = +e.target.value; sync(); };
  $("#fen").onchange = (e) => { try { setFromFen(e.target.value.trim()); sync(); } catch { say("That FEN isn't valid.", "bad"); } };
  $("#clr").onclick = () => { grid.forEach((r) => r.fill(null)); sync(); };
  $("#st").onclick = () => { setFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"); sync(); };
  $("#ver").onclick = () => {
    const f = fen(), ok = validateFen(f);
    if (!ok.ok) return say("Illegal position: " + ok.error, "bad");
    say("Oracle scanning every line…");
    setTimeout(() => { const t0 = performance.now(); const s = solutions(f, n); const ms = Math.round(performance.now() - t0);
      if (!s.length) return say(`No forced mate in ${n}. Adjust the position. (${ms} ms)`, "bad");
      verified = { name: $("#nm").value.trim() || "Custom puzzle", fen: f, n, hint: "" };
      ["sv", "dk", "sh"].forEach((id) => $("#" + id).disabled = false);
      say(`Verified ✓ Mate in ${n}. ${s.length === 1 ? "Unique key move: " + s[0] : s.length + " winning first moves: " + s.slice(0, 4).join(", ")}${s.length > 1 ? ". A unique key move makes a better puzzle." : ""}`, "good"); }, 30);
  };
  $("#sv").onclick = () => { const m = store.get("mypuzzles", []); m.push(verified); store.set("mypuzzles", m); say("Saved to All puzzles.", "good"); };
  $("#dk").onclick = () => { addSlide({ type: "board", title: verified.name, text: "", fen: verified.fen, n: verified.n }); say("Added to Club Deck.", "good"); };
  $("#sh").onclick = async () => { const url = `${location.origin}${location.pathname}#/chess/all?fen=${encodeURIComponent(verified.fen)}&n=${verified.n}`;
    try { await navigator.clipboard.writeText(url); say("Link copied. Send it to the club.", "good"); } catch { say(url); } };
  sync();
}

/* Club Deck: presentation builder */
const STARTER = [
  { type: "title", title: "Chess Club: Checkmate Patterns", text: "Week 1 · learn the patterns, then hunt them" },
  { type: "bullets", title: "Today", text: "Back-rank mate\nThe Arabian mate\nRook ladder\nLive puzzle battle" },
  { type: "board", title: "Back Rank", text: "The king's own pawns are its prison.", fen: PUZZLES[0].fen, n: 1 },
  { type: "board", title: "Arabian Mate", text: "Rook + knight in the corner.", fen: PUZZLES[2].fen, n: 1 },
  { type: "board", title: "Rook Ladder", text: "Two rooks climb, the king falls.", fen: PUZZLES[4].fen, n: 2 },
  { type: "bullets", title: "Homework", text: "3 puzzles a day on the club page\nPlay one long game this week\nBring your most painful loss" }
];
function getSlides() { return store.get("slides", STARTER); }
function addSlide(s) { const a = getSlides(); a.push(s); store.set("slides", a); }

views["present"] = () => {
  let slides = getSlides(), cur = 0;
  const v = h(`<div class="view"><h2 class="title">Club Deck</h2><div class="sub">// Build chess-club sessions. Board slides with "mate in" become live puzzles when you present.</div>
    <div class="grid" style="grid-template-columns:minmax(220px,300px) 1fr">
      <div class="panel">${corners}<h3>Slides</h3><div class="slides-list" id="sl"></div>
        <div class="row" style="margin-top:12px"><button class="btn" data-add="title">+ Title</button><button class="btn" data-add="bullets">+ Points</button><button class="btn" data-add="board">+ Board</button></div>
        <div class="row" style="margin-top:10px"><button class="btn ghost" id="ex">Export</button><label class="btn ghost">Import<input type="file" id="im" accept=".json" hidden></label><button class="btn ghost" id="rs">Reset</button></div></div>
      <div class="panel">${corners}<div class="row" style="justify-content:space-between"><h3>Edit slide</h3><div class="row"><button class="btn ghost" id="up">↑</button><button class="btn ghost" id="dn">↓</button><button class="btn ghost" id="del">Delete</button><button class="btn" id="ppt">⬇ PowerPoint</button><button class="btn solid" id="go">▶ Present</button></div></div>
        <div id="ed" style="margin-top:12px"></div></div></div></div>`);
  app.replaceChildren(v);
  const save = () => store.set("slides", slides);
  function list() { const sl = $("#sl", v); sl.innerHTML = ""; slides.forEach((s, i) => { const it = h(`<div class="slide-item ${i === cur ? "on" : ""}"><b>${i + 1}</b><span>${esc(s.title || "(untitled)")}</span><span class="label">${s.type}</span></div>`); it.onclick = () => { cur = i; render(); }; sl.append(it); }); }
  function editor() {
    const ed = $("#ed", v), s = slides[cur]; if (!s) { ed.innerHTML = '<p class="label">No slides yet.</p>'; return; }
    ed.innerHTML = `<div class="row"><input id="t" style="flex:1" placeholder="Title" value="${esc(s.title)}"></div>
      <div style="margin-top:10px"><textarea id="x" placeholder="${s.type === "bullets" ? "One point per line" : "Subtitle / notes"}">${esc(s.text)}</textarea></div>
      ${s.type === "board" ? `<div class="row" style="margin-top:10px"><input id="f" style="flex:1" value="${esc(s.fen)}" spellcheck="false"><label class="label">mate in</label><select id="n"><option value="0">no puzzle</option><option>1</option><option>2</option><option>3</option></select><a class="btn ghost" href="#/chess/build?fen=${encodeURIComponent(s.fen)}">Open in builder</a></div>` : ""}
      <div style="margin-top:14px" id="pv"></div>`;
    $("#t", ed).oninput = (e) => { s.title = e.target.value; save(); list(); };
    $("#x", ed).oninput = (e) => { s.text = e.target.value; save(); };
    if (s.type === "board") { $("#n", ed).value = String(s.n || 0); $("#n", ed).onchange = (e) => { s.n = +e.target.value; save(); };
      $("#f", ed).onchange = (e) => { if (validateFen(e.target.value.trim()).ok) { s.fen = e.target.value.trim(); save(); prev(); } else e.target.style.borderColor = "#ff5f6d"; }; }
    function prev() { if (s.type === "board") { const d = h('<div style="max-width:300px"></div>'); $("#pv", ed).replaceChildren(d); Board(d, { fen: s.fen, interactive: false }); } }
    prev();
  }
  function render() { list(); editor(); }
  v.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => { const t = b.dataset.add;
    slides.splice(cur + 1, 0, t === "board" ? { type: "board", title: "New position", text: "", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", n: 0 } : { type: t, title: t === "title" ? "New section" : "Key points", text: "" });
    cur++; save(); render(); });
  $("#up", v).onclick = () => { if (cur > 0) { [slides[cur - 1], slides[cur]] = [slides[cur], slides[cur - 1]]; cur--; save(); render(); } };
  $("#dn", v).onclick = () => { if (cur < slides.length - 1) { [slides[cur + 1], slides[cur]] = [slides[cur], slides[cur + 1]]; cur++; save(); render(); } };
  $("#del", v).onclick = () => { slides.splice(cur, 1); cur = Math.max(0, cur - 1); save(); render(); };
  $("#rs", v).onclick = () => { if (confirm("Replace your deck with the starter deck?")) { slides = STARTER.map((s) => ({ ...s })); cur = 0; save(); render(); } };
  $("#ex", v).onclick = () => { const a = h(`<a download="club-deck.json"></a>`); a.href = URL.createObjectURL(new Blob([JSON.stringify(slides, null, 2)], { type: "application/json" })); a.click(); };
  $("#im", v).onchange = async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); if (Array.isArray(d)) { slides = d; cur = 0; save(); render(); } } catch { alert("Couldn't read that file."); } };
  $("#go", v).onclick = () => present(slides, cur);
  $("#ppt", v).onclick = async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = "Building…"; try { await exportPptx(slides); } catch (err) { alert("Export failed: " + err.message); } b.disabled = false; b.textContent = "⬇ PowerPoint"; };
  render();
};
function present(slides, start = 0) {
  let i = start; const o = h(`<div class="present"><button class="btn ghost x">Esc ✕</button><div id="ps" style="width:100%"></div><div class="pnav"></div></div>`); document.body.append(o);
  function show() {
    const s = slides[i], ps = $("#ps", o); $(".pnav", o).textContent = `${i + 1} / ${slides.length} · ← → to move`;
    if (s.type === "title") ps.innerHTML = `<h1>${esc(s.title)}</h1><p style="text-align:center;font-family:var(--mono);color:var(--dim);font-size:clamp(14px,2vw,22px)">${esc(s.text)}</p>`;
    else if (s.type === "bullets") ps.innerHTML = `<h1>${esc(s.title)}</h1><div class="pbody"><ul>${s.text.split("\n").filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`;
    else { ps.innerHTML = `<h1>${esc(s.title)}</h1><div class="pbody"><div style="flex:0 1 min(70vh,560px)"><div id="pb"></div></div><div style="max-width:380px"><p style="font-size:clamp(16px,2vw,24px)">${esc(s.text)}</p><div class="msg" id="pmsg" style="font-size:16px"></div>${s.n ? '<button class="btn" id="prev">Oracle: reveal</button>' : ""}</div></div>`;
      if (s.n) { const pl = PuzzlePlayer($("#pb", ps), $("#pmsg", ps), { fen: s.fen, n: s.n, hint: s.text }); $("#prev", ps).onclick = () => pl.reveal(); } else Board($("#pb", ps), { fen: s.fen, interactive: true }); }
  }
  const key = (e) => { if (e.key === "ArrowRight" || e.key === " ") { if (i < slides.length - 1) { i++; show(); } e.preventDefault(); } else if (e.key === "ArrowLeft") { if (i > 0) { i--; show(); } } else if (e.key === "Escape") close(); };
  const close = () => { removeEventListener("keydown", key); o.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  addEventListener("keydown", key); $(".x", o).onclick = close;
  o.requestFullscreen?.().catch(() => {});
  show();
}

/* PowerPoint export */
function loadScript(src) { return new Promise((res, rej) => { if (window.PptxGenJS) return res(); const sc = document.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error("couldn't load exporter")); document.head.append(sc); }); }
function boardPng(fen, px = 800) {
  const cv = document.createElement("canvas"); cv.width = cv.height = px; const x = cv.getContext("2d"), s = px / 8, b = new Chess(fen).board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    x.fillStyle = (r + f) % 2 ? "#0d1d26" : "#1b3b45"; x.fillRect(f * s, r * s, s, s);
    const p = b[r][f]; if (!p) continue;
    x.font = `${s * 0.78}px "Segoe UI Symbol","Noto Sans Symbols2","DejaVu Sans",serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = s * 0.05; x.strokeStyle = p.color === "w" ? "#06281f" : "#b48cff"; x.fillStyle = p.color === "w" ? "#f2fffb" : "#0a0f14";
    x.shadowColor = p.color === "w" ? "rgba(56,248,200,.7)" : "rgba(180,140,255,.8)"; x.shadowBlur = s * 0.15;
    x.fillText(GLYPH[p.type] + "\uFE0E", f * s + s / 2, r * s + s * 0.54); x.shadowBlur = 0; x.strokeText(GLYPH[p.type] + "\uFE0E", f * s + s / 2, r * s + s * 0.54);
  }
  x.fillStyle = "#7aa59a"; x.font = `${s * 0.16}px monospace`; x.textAlign = "left"; x.textBaseline = "top";
  for (let i = 0; i < 8; i++) { x.fillText("abcdefgh"[i], i * s + s * 0.82, 7 * s + s * 0.8); x.fillText(String(8 - i), s * 0.05, i * s + s * 0.04); }
  return cv.toDataURL("image/png");
}
async function exportPptx(slides) {
  await loadScript("vendor/pptxgen.bundle.js");
  const pptx = new window.PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.title = slides[0]?.title || "Chess Club";
  const BG = "03050A", CY = "38F8C8", TX = "D9FFF4", DIM = "7AA59A", F = "Consolas";
  for (const s of slides) {
    const sl = pptx.addSlide(); sl.background = { color: BG };
    sl.addShape(pptx.ShapeType.line, { x: 0.5, y: 7.0, w: 12.33, h: 0, line: { color: "1E5A4C", width: 1 } });
    sl.addText("NOAH//MENON · CHESS CLUB", { x: 0.5, y: 7.05, w: 6, h: 0.3, fontFace: F, fontSize: 9, color: DIM });
    if (s.type === "title") {
      sl.addText(s.title, { x: 0.5, y: 2.4, w: 12.33, h: 1.4, align: "center", fontFace: F, fontSize: 44, bold: true, color: CY });
      sl.addText(s.text || "", { x: 0.5, y: 3.9, w: 12.33, h: 0.8, align: "center", fontFace: F, fontSize: 20, color: DIM });
    } else if (s.type === "bullets") {
      sl.addText(s.title, { x: 0.6, y: 0.4, w: 12, h: 0.9, fontFace: F, fontSize: 32, bold: true, color: CY });
      const pts = (s.text || "").split("\n").filter(Boolean).map((t) => ({ text: t, options: { bullet: { code: "25B8" }, color: TX, breakLine: true } }));
      if (pts.length) sl.addText(pts, { x: 0.8, y: 1.5, w: 11.5, h: 5.2, fontSize: 26, valign: "top", paraSpaceAfter: 14 });
    } else {
      sl.addText(s.title, { x: 0.6, y: 0.35, w: 12, h: 0.8, fontFace: F, fontSize: 30, bold: true, color: CY });
      sl.addImage({ data: boardPng(s.fen), x: 0.7, y: 1.25, w: 5.6, h: 5.6 });
      const turn = new Chess(s.fen).turn() === "w" ? "White" : "Black";
      const lines = [];
      if (s.n) lines.push({ text: `${turn} to move · mate in ${s.n}`, options: { color: CY, fontFace: F, fontSize: 22, bold: true, breakLine: true } });
      if (s.text) lines.push({ text: s.text, options: { color: TX, fontSize: 22, breakLine: true } });
      if (lines.length) sl.addText(lines, { x: 6.9, y: 1.4, w: 5.8, h: 3, valign: "top", paraSpaceAfter: 12 });
      if (s.n) { const sol = solutions(s.fen, s.n); sl.addNotes(`Solution: ${sol.join(" or ") || "no forced mate found"}`); }
    }
  }
  await pptx.writeFile({ fileName: (slides[0]?.title || "chess-club").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".pptx" });
}

/* Signal: profile */
views["signal"] = () => {
  app.replaceChildren(h(`<div class="view"><h2 class="title">Signal</h2><div class="sub">// operator profile</div>
    <div class="grid g2 profile">
      <div class="panel">${corners}<h3>Noah</h3>
        <div class="k">Studying</div><div class="v">IB Diploma: Economics · Psychology · Biology</div>
        <div class="k">Competing</div><div class="v">Economics World Cup team</div>
        <div class="k">Chess</div><div class="v">Runs the school chess club · rated online · first FIDE-rated tournament played</div>
        <div class="k">Moves</div><div class="v">Cross-country · football · basketball</div>
        <div class="k">Plays</div><div class="v">Pokémon · Fortnite · daily word & quiz puzzles</div></div>
      <div class="panel">${corners}<h3>Mission log</h3>
        <p>▸ Reach a first FIDE rating</p><p>▸ Run a club puzzle battle every week</p><p>▸ Keep the Daily Mix streak alive</p><p>▸ Turn IB notes into quiz decks</p>
        <h3 style="margin-top:20px">Station</h3><p class="label">Content refreshes weekly. Everything you score is saved only in this browser.</p></div>
    </div></div>`));
};

/* ---------- router ---------- */
function go(hash) { location.hash = hash; }
function route() {
  const raw = location.hash.replace(/^#\/?/, ""); const [path, qs] = raw.split("?"); const [top, sub] = path.split("/");
  const q = new URLSearchParams(qs || "");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === (top || "")));
  (views[top] || views[""])(sub, q); scrollTo(0, 0);
}
addEventListener("hashchange", route); route();
