// Loads site content from the published Google Sheet ("noahmenon.com content").
// The Sheet is the source of truth; data.js is only a fallback if Google can't be reached.
export const SHEET = {
  base: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTp9x0dOk9C-WqKtb1nwtm4rbUHRBQDoaxJXQDisBGr_Ap7LmOZrwQTFtuQMs2P0jOwb2emGZtKBtsZ/pub",
  edit: "https://docs.google.com/spreadsheets/d/1boScfsE1IgbGv2msPjkXNdbR5kgnGgLY0bKl2S6v8yQ/edit",
  gids: { Quiz: 0, Decks: 1857731225, Puzzles: 190473002, Link4: 2049526351, Oracle: 525555285 }
};

export function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const objs = (rows) => { const [hd, ...rs] = rows; const k = hd.map((x) => x.trim().toLowerCase()); return rs.map((r, i) => ({ _row: i + 2, ...Object.fromEntries(k.map((h, j) => [h, (r[j] ?? "").trim()])) })); };
const hidden = (v) => /^(no|n|false|hide|hidden|0)$/i.test(v || "");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function tab(name) {
  const url = `${SHEET.base}?gid=${SHEET.gids[name]}&single=true&output=csv&t=${Math.floor(Date.now() / 60000)}`;
  const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const t = await r.text(); if (/^\s*</.test(t)) throw new Error(`${name}: tab not published`);
  return objs(parseCSV(t));
}

// Mutates the content objects in place so the rest of the app picks the Sheet up.
export async function loadSheet({ DECKS, LINKS, PUZZLES, ORACLE }, { validateFen, solutions }) {
  const rep = { ok: false, at: new Date().toISOString(), tabs: {}, problems: [] };
  if (SHEET.base.includes("PUBLISHED_ID")) { rep.problems.push(["Setup", "-", "Sheet not connected yet"]); return rep; }
  const bad = (t, row, msg) => rep.problems.push([t, row, msg]);
  const got = {};
  await Promise.all(Object.keys(SHEET.gids).map(async (n) => { try { got[n] = await tab(n); } catch (e) { bad(n, "-", e.message); } }));

  // Decks
  const decks = {};
  for (const r of got.Decks || []) {
    if (!r.deck) { bad("Decks", r._row, "Missing Deck id"); continue; }
    decks[slug(r.deck)] = { name: r.name || r.deck, icon: r.icon || "●", color: /^#[0-9a-f]{3,8}$/i.test(r.colour || r.color || "") ? (r.colour || r.color) : "#c8ff4d", q: [] };
  }
  // Quiz
  let nq = 0;
  for (const r of got.Quiz || []) {
    if (hidden(r.show)) continue;
    const wrong = [r["wrong 1"], r["wrong 2"], r["wrong 3"]].filter(Boolean);
    if (!r.deck || !r.question || !r["correct answer"]) { bad("Quiz", r._row, "Needs Deck, Question and Correct answer"); continue; }
    if (!wrong.length) { bad("Quiz", r._row, "Needs at least one wrong answer"); continue; }
    const k = slug(r.deck); if (!decks[k]) decks[k] = { name: r.deck, icon: "●", color: "#c8ff4d", q: [] };
    decks[k].q.push([r.question, [r["correct answer"], ...wrong], 0, r.explanation || ""]); nq++;
  }
  if (nq) { for (const k of Object.keys(DECKS)) delete DECKS[k]; for (const [k, d] of Object.entries(decks)) if (d.q.length) DECKS[k] = d; }
  rep.tabs.Quiz = nq; rep.tabs.Decks = Object.values(decks).filter((d) => d.q.length).length;

  // Puzzles (each one is checked for a real forced mate)
  const pz = [];
  for (const r of got.Puzzles || []) {
    if (hidden(r.show)) continue;
    const n = parseInt(r["mate in"], 10), fen = r.fen;
    if (!fen || !(n >= 1 && n <= 3)) { bad("Puzzles", r._row, "Needs FEN and Mate in (1, 2 or 3)"); continue; }
    const v = validateFen(fen); if (!v.ok) { bad("Puzzles", r._row, "Illegal FEN: " + v.error); continue; }
    if (n <= 2 && !solutions(fen, n).length) { bad("Puzzles", r._row, `No forced mate in ${n}`); continue; }
    pz.push({ name: r.name || "Puzzle", fen, n, hint: r.hint || "" });
  }
  if (pz.length) PUZZLES.splice(0, PUZZLES.length, ...pz); rep.tabs.Puzzles = pz.length;

  // Link-4 grids
  const grids = new Map();
  for (const r of got.Link4 || []) { const g = r.grid || "1"; if (!grids.has(g)) grids.set(g, []); grids.get(g).push(r); }
  const lk = [];
  for (const [g, rows] of grids) {
    const groups = rows.map((r) => [r.group, [r["word 1"], r["word 2"], r["word 3"], r["word 4"]].map((w) => (w || "").toUpperCase())]);
    const words = groups.flatMap((x) => x[1]);
    if (groups.length !== 4) { bad("Link4", rows[0]._row, `Grid ${g} has ${groups.length} groups (needs 4)`); continue; }
    if (words.some((w) => !w)) { bad("Link4", rows[0]._row, `Grid ${g} has an empty word`); continue; }
    if (new Set(words).size !== 16) { bad("Link4", rows[0]._row, `Grid ${g} repeats a word`); continue; }
    lk.push(groups);
  }
  if (lk.length) LINKS.splice(0, LINKS.length, ...lk); rep.tabs.Link4 = lk.length;

  // Oracle tips
  const tips = (got.Oracle || []).map((r) => r.tip).filter(Boolean);
  if (tips.length) ORACLE.splice(0, ORACLE.length, ...tips); rep.tabs.Oracle = tips.length;

  rep.ok = Object.keys(got).length > 0;
  return rep;
}
