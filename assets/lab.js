// AI Lab: interactive missions where the maths IS the AI.
const sig = (z) => 1 / (1 + Math.exp(-z));
function rng(s) { return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// tiny chart helper: returns draw(fnLines, bars, marker)
function chart(cv, { xmin, xmax, ymin = 0, ymax = 1, xlab, ylab }) {
  const x = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; x.scale(dpr, dpr);
  const L = 44, R = 12, T = 12, B = 34, px = (v) => L + (v - xmin) / (xmax - xmin) * (W - L - R), py = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  return ({ lines = [], bars = [], dots = [] }) => {
    x.clearRect(0, 0, W, H); x.font = "11px Inter, sans-serif"; x.fillStyle = "#8b8a84"; x.strokeStyle = "rgba(255,255,255,.08)";
    for (let i = 0; i <= 4; i++) { const v = ymin + (ymax - ymin) * i / 4; x.beginPath(); x.moveTo(L, py(v)); x.lineTo(W - R, py(v)); x.stroke(); x.fillText(Math.round(v * 100) + "%", 6, py(v) + 4); }
    for (let i = 0; i <= 4; i++) { const v = xmin + (xmax - xmin) * i / 4; x.fillText(Math.round(v), px(v) - 8, H - 16); }
    x.fillText(xlab, W / 2 - 40, H - 2);
    for (const b of bars) { x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(px(b.x0) + 2, py(b.y), px(b.x1) - px(b.x0) - 4, py(ymin) - py(b.y)); }
    for (const l of lines) { x.strokeStyle = l.color; x.lineWidth = l.w || 2.5; x.setLineDash(l.dash || []); x.beginPath(); for (let i = 0; i <= 120; i++) { const v = xmin + (xmax - xmin) * i / 120; const y = l.f(v); i ? x.lineTo(px(v), py(y)) : x.moveTo(px(v), py(y)); } x.stroke(); x.setLineDash([]); }
    for (const d of dots) { x.fillStyle = d.color; x.beginPath(); x.arc(px(d.x), py(d.y), d.r || 6, 0, 6.283); x.fill(); }
  };
}

export const MISSIONS = [
  { id: "elo", n: 1, title: "Your rating is an AI", sub: "Chess · the logistic curve", ready: true },
  { id: "xg", n: 2, title: "Train an xG model", sub: "Soccer · gradient descent", ready: true },
  { id: "pit", n: 3, title: "The perfect pit stop", sub: "F1 · optimisation", ready: false },
  { id: "pen", n: 4, title: "Unbeatable penalties", sub: "Soccer · game theory", ready: false },
  { id: "next", n: 5, title: "How the Oracle thinks", sub: "Language models · next-word prediction", ready: false }
];

export function labView(app, { h, $, esc, store, sub }) {
  const done = store.get("lab", {});
  if (sub === "elo") return elo(app, h, $, store);
  if (sub === "xg") return xg(app, h, $, store);
  app.replaceChildren(h(`<div class="view"><div class="kicker">AI Lab</div><h2 class="title">AI is maths you already know.</h2>
    <div class="sub">Five missions, 5–10 minutes each. No code: sliders, buttons and charts. New missions unlock on Saturdays.</div>
    <div class="grid g2">${MISSIONS.map((m) => m.ready ? `<a class="panel portal" href="#/lab/${m.id}"><div class="kicker">Mission ${m.n}${done[m.id] ? " · complete ✓" : ""}</div><h3 style="font-family:var(--serif);font-size:32px;color:var(--text);text-transform:none;margin:8px 0">${m.title}</h3><p>${m.sub}</p></a>`
      : `<div class="panel" style="opacity:.45"><div class="kicker">Mission ${m.n} · coming soon</div><h3 style="font-family:var(--serif);font-size:32px;color:var(--text);text-transform:none;margin:8px 0">${m.title}</h3><p>${m.sub}</p></div>`).join("")}</div></div>`));
}

function finish(store, id, el, text) { const d = store.get("lab", {}); d[id] = 1; store.set("lab", d); el.className = "msg good"; el.innerHTML = text; }

/* Mission 1: Elo expected score = logistic curve */
function elo(app, h, $, store) {
  const v = h(`<div class="view"><div class="kicker">Mission 1 · Chess</div><h2 class="title">Your rating is an AI.</h2>
    <div class="sub">Chess ratings predict who will win using one formula. That formula, the S-shaped logistic curve, is the same one inside most AI models.</div>
    <div class="grid g2"><div class="panel"><h3>Set the players</h3>
      <p>Your rating: <b id="ra">1200</b></p><input type="range" id="sa" min="400" max="2800" value="1200" style="width:100%">
      <p style="margin-top:14px">Opponent: <b id="rb">1400</b></p><input type="range" id="sb" min="400" max="2800" value="1400" style="width:100%">
      <div class="stat" id="pe" style="margin-top:16px">24%</div><p class="label">your expected score (win = 1, draw = ½)</p>
      <pre style="font-family:var(--mono);font-size:13px;background:#0d0d0f;border:1px solid var(--line2);border-radius:12px;padding:12px;margin-top:14px;white-space:pre-wrap">expected = 1 / (1 + 10^((opponent − you) / 400))</pre></div>
    <div class="panel"><h3>The curve</h3><canvas id="ec" style="width:100%;height:260px"></canvas>
      <p>Every 400 points of difference multiplies the odds by 10. In AI, this S-curve is called the <b>sigmoid</b>: it turns any number into a probability between 0% and 100%.</p></div></div>
    <div class="panel" style="margin-top:16px"><h3>Check: predict it</h3><p>You're rated 1500 and your opponent 1100. Roughly what's your expected score?</p>
      <div class="row" id="eq"><button class="btn" data-a="0">60%</button><button class="btn" data-a="1">91%</button><button class="btn" data-a="0">75%</button><button class="btn" data-a="0">99%</button></div><div class="msg" id="em"></div></div></div>`);
  app.replaceChildren(v);
  const draw = chart($("#ec"), { xmin: -800, xmax: 800, xlab: "opponent − you (rating points)" });
  const E = (d) => 1 / (1 + Math.pow(10, d / 400));
  const upd = () => { const a = +$("#sa").value, b = +$("#sb").value; $("#ra").textContent = a; $("#rb").textContent = b; const p = E(b - a); $("#pe").textContent = Math.round(p * 100) + "%";
    draw({ lines: [{ f: E, color: "#c8ff4d" }], dots: [{ x: Math.max(-800, Math.min(800, b - a)), y: p, color: "#ff9f5a" }] }); };
  $("#sa").oninput = upd; $("#sb").oninput = upd; upd();
  v.querySelectorAll("#eq .btn").forEach((b) => b.onclick = () => { if (b.dataset.a === "1") finish(store, "elo", $("#em"), "Correct: 1 / (1 + 10^(−400/400)) = 1/1.1 ≈ 91%. You just ran a prediction model by hand. <a href='#/lab/xg'>Mission 2 →</a>"); else { $("#em").className = "msg bad"; $("#em").textContent = "Not quite. Try the sliders: you 1500, opponent 1100."; } });
}

/* Mission 2: xG with logistic regression + gradient descent */
function xg(app, h, $, store) {
  const r = rng(7), D = []; for (let i = 0; i < 300; i++) { const d = 5 + r() * 30; D.push([d, r() < sig(1.6 - 0.17 * d) ? 1 : 0]); }
  const goals = D.filter((x) => x[1]).length;
  let w = 0, b = 0, timer;
  const z = (d) => (d - 20) / 10, p = (d) => sig(b + w * z(d));
  const loss = () => D.reduce((s, [d, y]) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p(d))); return s - (y * Math.log(q) + (1 - y) * Math.log(1 - q)); }, 0) / D.length;
  const bins = []; for (let a = 5; a < 35; a += 5) { const s = D.filter(([d]) => d >= a && d < a + 5); bins.push({ x0: a, x1: a + 5, y: s.length ? s.filter((x) => x[1]).length / s.length : 0 }); }
  const v = h(`<div class="view"><div class="kicker">Mission 2 · Soccer</div><h2 class="title">Train an xG model.</h2>
    <div class="sub">Expected goals (xG) is the chance a shot goes in. Here are 300 shots (${goals} goals). Your job: fit a curve that predicts the chance from distance. First by hand, then let the computer learn.</div>
    <div class="grid g2"><div class="panel"><h3>Your model</h3>
      <canvas id="xc" style="width:100%;height:270px"></canvas><p class="label">bars = real goal rate · line = your model</p></div>
    <div class="panel"><h3>Tune it</h3>
      <p>Distance effect (w): <b id="wv">0.00</b></p><input type="range" id="ws" min="-3" max="1" step="0.01" value="0" style="width:100%">
      <p style="margin-top:12px">Starting chance (b): <b id="bv">0.00</b></p><input type="range" id="bs" min="-3" max="3" step="0.01" value="0" style="width:100%">
      <div class="row" style="margin-top:16px;align-items:baseline"><div class="stat" id="lv">0.693</div><span class="label">error (log-loss) · lower is better</span></div>
      <div class="row" style="margin-top:14px"><button class="btn solid" id="tr">▶ Train (gradient descent)</button><button class="btn ghost" id="rs">Reset</button></div>
      <p class="label" id="st" style="margin-top:10px">Step 0</p></div></div>
    <div class="panel" style="margin-top:16px"><h3>What just happened</h3>
      <p>Each step, the computer asks: "if I nudge w and b a tiny bit, does the error go down?" Then it nudges them downhill. That's <b>gradient descent</b>, and it's how almost every AI, including the Oracle's language model, learns. Same idea, billions of numbers instead of two.</p>
      <p style="margin-top:10px"><b>Check:</b> after training, what's the model's xG for a shot from 10 m?</p>
      <div class="row" id="xq"><button class="btn" data-a="0">About 10%</button><button class="btn" data-a="1">About 50%</button><button class="btn" data-a="0">About 90%</button></div><div class="msg" id="xm"></div></div></div>`);
  app.replaceChildren(v);
  const draw = chart($("#xc"), { xmin: 5, xmax: 35, xlab: "shot distance (metres)" });
  const upd = () => { $("#wv").textContent = w.toFixed(2); $("#bv").textContent = b.toFixed(2); $("#ws").value = w; $("#bs").value = b; $("#lv").textContent = loss().toFixed(3); draw({ bars: bins, lines: [{ f: p, color: "#c8ff4d" }] }); };
  $("#ws").oninput = (e) => { w = +e.target.value; upd(); }; $("#bs").oninput = (e) => { b = +e.target.value; upd(); };
  $("#rs").onclick = () => { clearInterval(timer); w = 0; b = 0; $("#st").textContent = "Step 0"; upd(); };
  $("#tr").onclick = () => { clearInterval(timer); let k = 0; timer = setInterval(() => { if (!v.isConnected || k >= 150) return clearInterval(timer);
    let gw = 0, gb = 0; for (const [d, y] of D) { const e = p(d) - y; gw += e * z(d); gb += e; } w -= 0.8 * gw / D.length; b -= 0.8 * gb / D.length; k++;
    $("#st").textContent = `Step ${k} · w ${w.toFixed(2)} · b ${b.toFixed(2)}`; upd(); }, 30); };
  v.querySelectorAll("#xq .btn").forEach((bt) => bt.onclick = () => { const got = Math.round(p(10) * 100);
    if (bt.dataset.a === "1") finish(store, "xg", $("#xm"), `Yes: your trained model says ${got}% from 10 m. You just trained a logistic-regression model, the same kind clubs use for real xG. <a href='#/lab'>Back to the Lab →</a>`);
    else { $("#xm").className = "msg bad"; $("#xm").textContent = `Look at the line at 10 m after training. It currently says ${got}%.`; } });
  upd();
}
