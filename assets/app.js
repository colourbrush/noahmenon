import { Chess, validateFen } from "../vendor/chess.js";
import { DECKS, LINKS, PUZZLES, ORACLE, UPDATED } from "./data.js";
import { loadSheet, SHEET } from "./sheet.js";
import { WEEKLY } from "./weekly.js";

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

/* ---------- background: reactive dot field ---------- */
(function bg() {
  const c = $("#bg"), x = c.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1); let W, H, t = 0, mx = -1e4, my = -1e4;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches, G = 26;
  const size = () => { W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px"; };
  addEventListener("resize", size); addEventListener("pointermove", (e) => { mx = e.clientX * dpr; my = e.clientY * dpr; }); size();
  function frame() {
    t += 0.01; x.clearRect(0, 0, W, H); const g = G * dpr, R = 150 * dpr;
    for (let y = g / 2; y < H; y += g) for (let X = g / 2; X < W; X += g) {
      const dx = X - mx, dy = y - my, d = Math.hypot(dx, dy), k = Math.max(0, 1 - d / R);
      const wave = 0.5 + 0.5 * Math.sin(X * 0.004 + y * 0.003 + t);
      const px = X + (d ? dx / d : 0) * k * 10 * dpr, py = y + (d ? dy / d : 0) * k * 10 * dpr;
      const r = (0.7 + k * 1.8) * dpr; x.fillStyle = k > 0.02 ? `rgba(200,255,77,${0.15 + k * 0.7})` : `rgba(236,235,230,${0.05 + wave * 0.06})`;
      x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
    }
    if (!still) requestAnimationFrame(frame);
  }
  frame();
})();

/* hero sky: slow nebula + stars, camera locked */
function skyCanvas(cv) {
  const x = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1); let W, H, t = 0, stars = [];
  const blobs = [{ c: [169, 155, 255], x: .25, y: .3, r: .55, s: .7 }, { c: [200, 255, 77], x: .75, y: .35, r: .4, s: 1.1 }, { c: [255, 120, 160], x: .55, y: .7, r: .45, s: .9 }, { c: [80, 140, 255], x: .15, y: .75, r: .5, s: .6 }];
  function size() { const b = cv.getBoundingClientRect(); W = cv.width = b.width * dpr; H = cv.height = b.height * dpr;
    stars = Array.from({ length: Math.floor(b.width * b.height / 2600) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 * dpr + .2, p: Math.random() * 6 })); }
  size(); const ro = new ResizeObserver(size); ro.observe(cv);
  (function frame() {
    if (!cv.isConnected) { ro.disconnect(); return; }
    t += 0.0025; x.fillStyle = "#07070a"; x.fillRect(0, 0, W, H); x.globalCompositeOperation = "lighter";
    for (const b of blobs) { const cx = (b.x + Math.sin(t * b.s + b.x * 9) * .06) * W, cy = (b.y + Math.cos(t * b.s * .8 + b.y * 7) * .05) * H, r = b.r * Math.max(W, H);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${b.c},.22)`); g.addColorStop(.5, `rgba(${b.c},.07)`); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, W, H); }
    for (const s of stars) { const a = .35 + .65 * (0.5 + 0.5 * Math.sin(t * 20 + s.p)); x.fillStyle = `rgba(255,255,255,${a * .8})`; x.fillRect(s.x, s.y, s.r, s.r); }
    x.globalCompositeOperation = "source-over";
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(frame);
  })();
}

/* hero shader: endless chessboard to the horizon (GPU), mouse-reactive light, film grain */
function shaderSky(cv) {
  const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) return skyCanvas(cv);
  const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const fs = `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float hz=-.02+m.y*.02;vec3 col;
    vec3 lime=vec3(.784,1.,.302),warm=vec3(1.,.62,.35);
    vec2 sun=vec2(m.x*.18,hz+.06);float sd=length((uv-sun)*vec2(1.,1.6));
    if(uv.y>hz){float sky=uv.y-hz;col=mix(vec3(.10,.07,.05),vec3(.02,.02,.025),smoothstep(0.,.45,sky));
      col+=warm*.55*exp(-sd*5.5)+lime*.18*exp(-sd*14.);
      vec2 g=floor(gl_FragCoord.xy/2.);float st=step(.9975,h(g));col+=st*(.5+.5*sin(t*2.+h(g)*40.))*smoothstep(.05,.3,sky);}
    else{float d=.32/(hz-uv.y+.0001);vec2 w=vec2((uv.x-m.x*.05)*d,d+t*.18);vec2 c=floor(w);float chk=mod(c.x+c.y,2.);
      vec2 f=abs(fract(w)-.5);float line=smoothstep(.47,.5,max(f.x,f.y));float fog=exp(-d*.16);
      col=mix(vec3(.035),vec3(.085,.085,.09),chk)*fog;col+=lime*line*fog*.55;
      col+=warm*.35*exp(-abs(uv.x-sun.x)*3.)*fog*fog*smoothstep(0.,.25,1.-d*.1);
      col+=lime*.08*exp(-length(uv-m*vec2(.9,.5))*3.)*fog;}
    col+=warm*.25*exp(-abs(uv.y-hz)*60.);
    col+=(h(gl_FragCoord.xy+t)-.5)*.05;col*=1.-.35*length(uv*vec2(.8,1.1));
    gl_FragColor=vec4(col,1.);}`;
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return skyCanvas(cv);
  gl.useProgram(pr); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, "r"), uT = gl.getUniformLocation(pr, "t"), uM = gl.getUniformLocation(pr, "m");
  const dpr = Math.min(1.5, devicePixelRatio || 1); let mx = 0, my = 0, tx = 0, ty = 0;
  const size = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr; gl.viewport(0, 0, cv.width, cv.height); };
  size(); const ro = new ResizeObserver(size); ro.observe(cv);
  const mv = (e) => { const r = cv.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width * 2 - 1; ty = -((e.clientY - r.top) / r.height * 2 - 1); };
  addEventListener("pointermove", mv);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now();
  (function frame() {
    if (!cv.isConnected) { ro.disconnect(); removeEventListener("pointermove", mv); return; }
    mx += (tx - mx) * .05; my += (ty - my) * .05;
    gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, still ? 0 : (performance.now() - t0) / 1000); gl.uniform2f(uM, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3); if (!still) requestAnimationFrame(frame);
  })();
}
function splitWords(el, base = 0, step = 90) {
  const walk = (node) => { for (const n of [...node.childNodes]) {
    if (n.nodeType === 3) { const f = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; if (/^\s+$/.test(w)) f.append(w); else { const sp = document.createElement("span"); sp.className = "w"; sp.textContent = w; f.append(sp); } }); n.replaceWith(f); }
    else if (n.nodeType === 1 && n.tagName !== "BR") walk(n); } };
  walk(el); el.classList.add("split"); el.querySelectorAll(".w").forEach((w, i) => w.style.animationDelay = base + i * step + "ms");
}
function mission(k) { const m = store.get("missions", {}); if (!m[k]) { m[k] = tokyoDate(); store.set("missions", m); } }
(function cursor() {
  if (!matchMedia("(pointer:fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.body.classList.add("cc"); const d = h('<div class="cur-dot"></div>'), r = h('<div class="cur-ring"></div>'); document.body.append(d, r);
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; d.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    const t = e.target.closest("a,button,.opt,.sq,.tile,.sticker,textarea,input,select"); r.classList.toggle("big", !!t && !t.matches("textarea,input,select"));
    r.dataset.l = t ? (t.matches(".sticker") ? "DRAG" : t.matches(".sq") ? "MOVE" : t.matches("a") ? "OPEN" : "") : ""; });
  (function loop() { rx += (x - rx) * .18; ry += (y - ry) * .18; r.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`; requestAnimationFrame(loop); })();
})();
(function intro() {
  let seen = false; try { seen = sessionStorage.getItem("noah.intro"); sessionStorage.setItem("noah.intro", "1"); } catch {}
  if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const l = h('<div class="loader"><div class="n">0</div><div class="t">ACQUIRING SIGNAL</div></div>'); document.body.append(l);
  let n = 0; const iv = setInterval(() => { n = Math.min(100, n + Math.ceil(Math.random() * 14)); $(".n", l).textContent = n; if (n >= 100) { clearInterval(iv); $(".t", l).textContent = "SIGNAL LOCKED"; setTimeout(() => { l.classList.add("out"); setTimeout(() => l.remove(), 950); }, 250); } }, 60);
})();
function draggable(el) {
  let sx, sy, ox, oy;
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; });
  el.addEventListener("pointermove", (e) => { if (!el.hasPointerCapture(e.pointerId)) return; el.style.left = ox + e.clientX - sx + "px"; el.style.top = oy + e.clientY - sy + "px"; });
}
function reveals(root = document) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  root.querySelectorAll(".reveal").forEach((el, i) => { el.style.transitionDelay = (el.dataset.d || 0) + "ms"; io.observe(el); });
}

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
  const streak = store.get("streak", { n: 0, last: "" }), pz = PUZZLES[dayIndex() % PUZZLES.length];
  const grid = LINKS[dayIndex() % LINKS.length], words = shuffle(grid.flatMap(([, w]) => w), rng(3)).slice(0, 12);
  const sample = shuffle(Object.entries(DECKS).flatMap(([k, d]) => d.q.map((q) => ({ k, q }))), rng(dayIndex() + 11))[0];
  const ticker = "ECONOMICS ✦ PSYCHOLOGY ✦ BIOLOGY ✦ CHESS ✦ GAME THEORY ✦ FOOTBALL ✦ BASKETBALL ✦ CROSS-COUNTRY ✦ ";
  const v = h(`<div class="view">
    <section class="sky"><canvas></canvas>
      <span class="sticker w" style="left:9%;top:22%">♞&#xFE0E;</span><span class="sticker b" style="right:11%;top:28%">♛&#xFE0E;</span><span class="sticker w" style="left:16%;bottom:20%">♜&#xFE0E;</span><span class="sticker b" style="right:17%;bottom:24%">♝&#xFE0E;</span>
      <div class="inner">
        <div class="kicker">Signal Station · Tokyo · <span id="sclock"></span></div>
        <h1 class="display" id="hl">Sharpen the mind.<br><em>Own the board.</em></h1>
        <p class="lead">Daily IB quizzes, word grids and chess puzzles. Ask the Oracle where to start.</p>
        <div class="thread" id="thread"></div><div class="composer"><textarea id="ask" rows="2" aria-label="Ask the Oracle"></textarea>
          <div class="bar"><button class="pill" data-p="Quiz me on economics">Econ quiz</button><button class="pill" data-p="Give me a chess puzzle">Chess puzzle</button><button class="pill" data-p="Build a club presentation">Club deck</button>
            <button class="send" id="send" aria-label="Send">↑</button></div></div>
        <div class="missions" id="ms"></div><div class="mbar"><i id="mb" style="width:0"></i></div>
      </div>
      <div class="scrollcue">SCROLL ↓</div>
    </section>

    <section class="tryit reveal" style="margin-top:40px">
      <div><div class="kicker">Try it now · puzzle of the day</div><h2 class="section" style="margin:12px 0 14px">${esc(pz.name)}<br><em>mate in ${pz.n}.</em></h2>
        <p style="color:var(--dim);line-height:1.6;max-width:380px">Click a piece, then a square. The Oracle checks every line, so any move that forces mate counts.</p>
        <div class="row" style="margin-top:20px"><button class="btn" id="th">Hint</button><a class="btn" href="#/chess/all">More puzzles →</a></div></div>
      <div class="boardwrap"><div id="hb"></div><div class="msg" id="hm"></div></div>
    </section>

    <section class="story">
      <div class="stick reveal"><div class="kicker">A week at the station</div><h2 class="section" style="margin-top:12px">Small reps.<br><em>Every day.</em></h2>
        <p style="color:var(--dim);line-height:1.6;max-width:380px">Five minutes a day beats a three-hour cram. The station gives you a reason to show up.</p></div>
      <div class="steps">
        <div class="step"><div class="d">MON–FRI · 2 MIN</div><h4>Daily Mix</h4><p>Six questions across Econ, Psych, Bio, sport and game theory. Explanations after every answer. Keep the streak alive.</p></div>
        <div class="step"><div class="d">EVERY DAY · 3 MIN</div><h4>Puzzle of the day</h4><p>A forced mate, checked by the Oracle. Any winning line counts, so think instead of memorising.</p></div>
        <div class="step"><div class="d">CLUB DAY</div><h4>Build the session</h4><p>Make puzzles, drop them into a deck, present them full-screen, or export to PowerPoint in one click.</p></div>
        <div class="step"><div class="d">SATURDAY</div><h4>New signal drops</h4><p>Fresh questions, puzzles, a new Link-4 grid and Oracle tips land automatically every week.</p></div>
      </div>
    </section>

    <div class="marquee"><div><span>${ticker}</span><span>${ticker}</span><span>${ticker}</span><span>${ticker}</span></div></div>

    <div class="kicker reveal">The station</div>
    <h2 class="section reveal">Everything in one place. <em>Nothing you don't need.</em></h2>
    <div class="bento">
      <div class="tilecard glow s2 r2 reveal qmini"><div class="kicker">Daily Mix · ${DECKS[sample.k].name}</div><h3 style="font-size:28px">${esc(sample.q[0])}</h3>
        <div class="opts" id="mq" style="margin-top:10px">${shuffle(sample.q[1].map((o, j) => j)).map((j) => `<button class="opt" data-j="${j}">${esc(sample.q[1][j])}</button>`).join("")}</div>
        <div class="why" id="mw" style="display:none"></div><a class="go" href="#/arcade/daily" style="text-decoration:none">RUN TODAY'S 6-QUESTION MIX →</a></div>
      <a class="tilecard s2 reveal" data-d="80" href="#/links"><div class="kicker">Link-4</div><h3>Four groups. Sixteen words.</h3><p>Today's grid, in the style of NYT Connections.</p><div class="mini4" id="m4">${words.map((w) => `<i>${w}</i>`).join("")}</div></a>
      <a class="tilecard glow2 reveal" data-d="120" href="#/present"><div class="kicker">Club Deck</div><h3>Present. Export.</h3><div class="mockslide"><b>Back Rank</b><span style="width:70%"></span><span style="width:45%"></span></div><div class="go">⬇ ONE-CLICK POWERPOINT</div></a>
      <div class="tilecard reveal" data-d="160"><div class="kicker">Streak</div><div class="bignum" style="margin-top:auto">${streak.n}</div><p>days in a row</p></div>
      <div class="tilecard s2 reveal"><div class="kicker">Oracle transmission</div><div class="oracle" id="oracle" style="margin-top:14px"></div></div>
      <a class="tilecard reveal" data-d="80" href="#/chess/build"><div class="kicker">Builder</div><h3>Make puzzles.</h3><p>The Oracle checks they really are a forced mate.</p><div class="more">Set up a position, pick mate-in-1 to 3, verify, share the link.</div><div class="go">OPEN <span>→</span></div></a>
      <a class="tilecard reveal" data-d="140" href="#/arcade/edit"><div class="kicker">Quiz editor</div><h3>Write your own.</h3><p>Copy any deck and change it.</p><div class="more">Questions, answers, explanations, colour and icon: all yours.</div><div class="go">OPEN <span>→</span></div></a>
    </div></div>`);
  app.replaceChildren(v);
  shaderSky($(".sky canvas", v)); v.querySelectorAll(".sticker").forEach(draggable);
  const tick = () => { const el = $("#sclock"); if (el) { el.textContent = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }); setTimeout(tick, 20000); } }; tick();
  // composer with typing placeholder
  const ask = $("#ask"), send = $("#send");
  const prompts = ["Quiz me on price elasticity…", "Give me a mate-in-2…", "Test my psychology studies…", "Make a slide deck for chess club…", "What's today's word grid?"];
  let pi = 0, ci = 0, del = false;
  (function typer() { if (!ask.isConnected) return; if (ask.value) { setTimeout(typer, 600); return; }
    const p = prompts[pi]; ci += del ? -1 : 1; ask.placeholder = p.slice(0, ci);
    if (!del && ci === p.length) { del = true; return setTimeout(typer, 1600); } if (del && ci === 0) { del = false; pi = (pi + 1) % prompts.length; }
    setTimeout(typer, del ? 25 : 55); })();
  ask.oninput = () => send.classList.toggle("on", !!ask.value.trim());
  const routes = [[/chess|puzzle|mate|check/, "#/chess", "Loading today's puzzle…"], [/deck|slide|present|club|powerpoint|ppt/, "#/present", "Opening the Club Deck…"], [/grid|link|word|connection/, "#/links", "Today's Link-4 grid…"],
    [/build|make.*puzzle/, "#/chess/build", "Opening the puzzle builder…"], [/write|edit|own quiz|my quiz/, "#/arcade/edit", "Opening the quiz editor…"], [/econ|elastic|market|inflation|gdp|tariff|tax|duty|excise|subsid|price|demand|supply|monopol|externalit|unemploy|interest rate|trade|money|fiscal|monetary/, "#/arcade/econ", "Economics deck, go."], [/psych|memory|bias|study|studies/, "#/arcade/psych", "Psychology deck, go."],
    [/bio|cell|dna|enzyme|photo/, "#/arcade/bio", "Biology deck, go."], [/sport|football|basketball|run|fitness/, "#/arcade/sport", "Sport Lab, go."], [/game|nash|loot|fortnite|pokemon|pokémon/, "#/arcade/game", "Game Theory deck, go."], [/^(daily|mix|quiz me|random|anything|surprise)/, "#/arcade/daily", "Running today's Daily Mix…"], [/./, "#/arcade/daily", "I don't have a deck on that yet, so here's today's Daily Mix instead."]];
  function go2() { const raw = ask.value.trim(), q = raw.toLowerCase(); if (!raw) return; const r = routes.find(([re]) => re.test(q)), th = $("#thread");
    th.replaceChildren(h(`<div class="bubble me"></div>`)); th.firstChild.textContent = raw; ask.value = ""; ask.oninput();
    setTimeout(() => { th.append(h(`<div class="bubble ai"><b>Oracle</b> · ${esc(r[2])}</div>`)); }, 450); setTimeout(() => go(r[1]), r[2].startsWith("I don") ? 2600 : 1500); }
  send.onclick = go2; ask.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go2(); } };
  v.querySelectorAll(".pill").forEach((b) => b.onclick = () => { ask.value = b.dataset.p; ask.oninput(); ask.focus(); });
  // try-it puzzle
  const pl = PuzzlePlayer($("#hb"), $("#hm"), pz, () => { const s = store.get("solved", {}); s[tokyoDate()] = 1; store.set("solved", s); mission("puzzle"); }); $("#th").onclick = () => pl.hint();
  // mini quiz
  let done = false; v.querySelectorAll("#mq .opt").forEach((b) => b.onclick = () => { if (done) return; done = true; const j = +b.dataset.j;
    v.querySelectorAll("#mq .opt").forEach((o) => { if (+o.dataset.j === sample.q[2]) o.classList.add("ok"); else if (o === b) o.classList.add("bad"); });
    const w = $("#mw"); w.style.display = "block"; w.textContent = (j === sample.q[2] ? "✓ " : "✗ ") + sample.q[3]; });
  // link-4 shimmer
  const tiles = [...v.querySelectorAll("#m4 i")]; let k = 0; const lit = setInterval(() => { if (!v.isConnected) return clearInterval(lit); tiles.forEach((t) => t.classList.remove("g")); for (let i = 0; i < 4; i++) tiles[(k + i * 3) % tiles.length].classList.add("g"); k++; }, 1400);
  const orc = $("#oracle"); const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { typeOut(orc, ORACLE[dayIndex() % ORACLE.length]); io.disconnect(); } }); io.observe(orc);
  const ms = store.get("missions", {}), ML = [["puzzle", "Solve a puzzle", "#/chess"], ["mix", "Run the Daily Mix", "#/arcade/daily"], ["links", "Clear a Link-4", "#/links"]];
  $("#ms").innerHTML = ML.map(([k, t, u]) => `<a class="mission ${ms[k] ? "done" : ""}" href="${u}"><i class="ck">${ms[k] ? "✓" : ""}</i><span>${t}</span></a>`).join("");
  setTimeout(() => { const el = $("#mb"); if (el) el.style.width = ML.filter(([k]) => ms[k]).length / 3 * 100 + "%"; }, 400);
  splitWords($("#hl"), 150); const lead = $(".sky .lead"); lead.style.opacity = 0; setTimeout(() => { lead.style.transition = "opacity 1s"; lead.style.opacity = 1; }, 900);
  const sio = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("on", e.isIntersecting)), { rootMargin: "-40% 0px -40% 0px" });
  v.querySelectorAll(".story .step").forEach((st) => sio.observe(st));
  reveals(v);
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
    if (deck === "daily") { mission("mix"); const s = store.get("streak", { n: 0, last: "" }), today = tokyoDate(), y = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
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
        <div class="row" style="margin-top:10px"><button class="btn ghost" id="ex">Export</button><label class="btn ghost">Import<input type="file" id="im" accept=".json" hidden></label></div>
        <div class="row" style="margin-top:10px"><button class="btn" id="tsv">Copy rows for the Sheet</button></div><p class="label" id="tsvm" style="margin-top:8px">Drafts live in this browser. To publish, copy the rows and paste them at the bottom of the Quiz tab.</p></div>
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
  $("#tsv", v).onclick = async () => { const d = my[cur]; if (!d) return; const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const rows = d.q.filter((q) => q[0] && q[1][q[2]]).map((q) => { const w = q[1].filter((o, i) => i !== q[2] && o); return [id, q[0], q[1][q[2]], w[0] || "", w[1] || "", w[2] || "", q[3] || "", "yes"].map((x) => String(x).replace(/[\t\n]/g, " ")).join("\t"); }).join("\n");
    try { await navigator.clipboard.writeText(rows); $("#tsvm").textContent = `Copied ${d.q.length} rows. In the Sheet: click the first empty cell in column A of the Quiz tab, then paste.`; } catch { $("#tsvm").textContent = rows; } };
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
    if (g >= 0) { solved.push(g); words = words.filter((w) => !sel.has(w)); sel.clear(); msg.className = "msg good"; msg.textContent = solved.length === 4 ? "GRID CLEARED." : "Group locked in."; if (solved.length === 4) mission("links"); }
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
    player = PuzzlePlayer($("#bd"), $("#pm"), pz, () => { mission("puzzle"); if (pz === PUZZLES[dayIndex() % PUZZLES.length]) { const s = store.get("solved", {}); s[tokyoDate()] = 1; store.set("solved", s); } });
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
      <div class="row" style="margin-top:12px"><button class="btn solid" id="ver">Oracle: verify</button><button class="btn" id="sv" disabled>Save</button><button class="btn" id="dk" disabled>+ Club Deck</button><button class="btn" id="sh" disabled>Copy link</button><button class="btn" id="row" disabled>Copy row for the Sheet</button></div>
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
  function sync() { $("#fen").value = fen(); $("#tm").value = turn; verified = null; ["sv", "dk", "sh", "row"].forEach((id) => $("#" + id).disabled = true); bd.draw(); }
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
      ["sv", "dk", "sh", "row"].forEach((id) => $("#" + id).disabled = false);
      say(`Verified ✓ Mate in ${n}. ${s.length === 1 ? "Unique key move: " + s[0] : s.length + " winning first moves: " + s.slice(0, 4).join(", ")}${s.length > 1 ? ". A unique key move makes a better puzzle." : ""}`, "good"); }, 30);
  };
  $("#row").onclick = async () => { const t = [verified.name, verified.fen, verified.n, "", "yes"].join("\t"); try { await navigator.clipboard.writeText(t); say("Copied. Paste it into the first empty row of the Puzzles tab, and add a hint in column D.", "good"); } catch { say(t); } };
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

/* Sheet Check: what loaded from the Google Sheet and what was skipped */
views["sheet"] = () => {
  const r = window.SHEET_REPORT || { tabs: {}, problems: [["Setup", "-", "Not loaded"]] };
  app.replaceChildren(h(`<div class="view"><div class="kicker">Maintenance</div><h2 class="title">Sheet Check</h2>
    <div class="sub">${r.ok ? "Content is coming from the Google Sheet." : "Using the built-in backup content: the Sheet could not be read."} Loaded ${r.at ? new Date(r.at).toLocaleString("en-GB", { timeZone: "Asia/Tokyo" }) : "-"} (Tokyo).</div>
    <div class="grid g3">${["Quiz", "Decks", "Puzzles", "Link4", "Oracle"].map((t) => `<div class="panel"><h3>${t}</h3><div class="stat">${r.tabs[t] ?? 0}</div><p class="label">${t === "Quiz" ? "questions live" : t === "Link4" ? "grids live" : t === "Oracle" ? "tips live" : t.toLowerCase() + " live"}</p></div>`).join("")}</div>
    <div class="panel" style="margin-top:16px"><h3>Rows skipped (${r.problems.length})</h3>
      ${r.problems.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${r.problems.map(([t, row, m]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:8px 6px;color:var(--acc)">${esc(t)}</td><td style="padding:8px 6px;color:var(--dim)">row ${esc(row)}</td><td style="padding:8px 6px">${esc(m)}</td></tr>`).join("")}</table>` : "<p>Nothing skipped. Every row is live.</p>"}
      <div class="row" style="margin-top:16px"><a class="btn solid" href="${SHEET.edit}" target="_blank" rel="noopener">Open the Sheet</a><button class="btn" id="rl">Reload from Sheet</button></div>
      <p class="label" style="margin-top:12px">Google refreshes the published copy about every 5 minutes.</p></div></div>`));
  $("#rl").onclick = () => { location.hash = "#/sheet"; location.reload(); };
};

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
  const render = () => { (views[top] || views[""])(sub, q); scrollTo(0, 0);
    if (top) { app.querySelectorAll(".panel, .grid > .portal").forEach((p, i) => { p.classList.add("reveal"); p.dataset.d = Math.min(i, 6) * 60; }); reveals(app); } };
  if (document.startViewTransition && route.ran && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(render); else render();
  route.ran = true;
}
function mergeWeekly() {
  for (const [deck, q, c, wrong, why] of WEEKLY.quiz) { if (!DECKS[deck]) continue; if (!DECKS[deck].q.some((x) => x[0] === q)) DECKS[deck].q.push([q, [c, ...wrong], 0, why]); }
  for (const p of WEEKLY.puzzles) if (!PUZZLES.some((x) => x.fen === p.fen)) PUZZLES.push(p);
  LINKS.push(...WEEKLY.links); ORACLE.push(...WEEKLY.oracle);
}
addEventListener("hashchange", route);
(async () => {
  const timeout = new Promise((r) => setTimeout(() => r({ ok: false, at: new Date().toISOString(), tabs: {}, problems: [["Sheet", "-", "Timed out after 5 s, using backup content"]] }), 5000));
  try { window.SHEET_REPORT = await Promise.race([loadSheet({ DECKS, LINKS, PUZZLES, ORACLE }, { validateFen, solutions }), timeout]); }
  catch (e) { window.SHEET_REPORT = { ok: false, tabs: {}, problems: [["Sheet", "-", e.message]] }; }
  mergeWeekly(); route();
})();
