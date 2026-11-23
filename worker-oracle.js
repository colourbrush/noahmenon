// noah-oracle: Cloudflare Worker that writes quiz questions with Workers AI.
// Only answers requests coming from noahmenon.com. Read-only: it cannot change the site or the Sheet.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ALLOWED = ["https://noahmenon.com", "http://noahmenon.com", "https://www.noahmenon.com", "http://www.noahmenon.com"];
const PER_HOUR = 15;
const hits = new Map();

const SCHEMA = {
  type: "object",
  properties: {
    refused: { type: "boolean" },
    questions: { type: "array", items: { type: "object", properties: {
      q: { type: "string" }, correct: { type: "string" },
      wrong: { type: "array", items: { type: "string" } }, why: { type: "string" } },
      required: ["q", "correct", "wrong", "why"] } }
  },
  required: ["questions"]
};

const SYSTEM = `You write short multiple-choice revision quizzes for a 16-year-old IB Diploma student (Economics, Psychology, Biology; loves chess, soccer, Formula One, basketball).
Rules:
- Exactly 5 questions on the topic given. IB-level accuracy. Only include facts you are confident are true; prefer core concepts over obscure trivia.
- Each question: one correct answer, three plausible wrong answers, and a one-sentence explanation of why the correct answer is right.
- Keep each question under 25 words and each answer under 12 words.
- Where natural, use an example from soccer, F1, chess or basketball.
- If the topic is unsafe or inappropriate for a teenager, return {"refused": true, "questions": []}.
Reply with JSON only.`;

const json = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0], "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || !ALLOWED.includes(origin)) return json({ error: "Not allowed" }, 403, cors);

    const ip = req.headers.get("CF-Connecting-IP") || "anon", now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
    if (recent.length >= PER_HOUR) return json({ error: `Limit reached: ${PER_HOUR} AI quizzes an hour. Try a built-in deck.` }, 429, cors);
    recent.push(now); hits.set(ip, recent);

    let { topic } = await req.json().catch(() => ({}));
    topic = String(topic || "").replace(/[^\p{L}\p{N} ,.'&()\-]/gu, "").trim().slice(0, 80);
    if (topic.length < 2) return json({ error: "Give me a topic, e.g. 'excise duty'." }, 400, cors);

    try {
      const out = await env.AI.run(MODEL, {
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Topic: ${topic}` }],
        max_tokens: 1400, temperature: 0.3,
        response_format: { type: "json_schema", json_schema: SCHEMA }
      });
      let data = out.response ?? out;
      if (typeof data === "string") { const m = data.match(/\{[\s\S]*\}/); data = JSON.parse(m ? m[0] : data); }
      if (data.refused) return json({ error: "The Oracle won't make a quiz on that topic." }, 422, cors);
      const questions = (data.questions || []).filter((x) => x && x.q && x.correct && Array.isArray(x.wrong) && x.wrong.length >= 2)
        .slice(0, 5).map((x) => ({ q: String(x.q), correct: String(x.correct), wrong: x.wrong.slice(0, 3).map(String), why: String(x.why || "") }));
      if (!questions.length) throw new Error("empty");
      return json({ topic, model: MODEL, questions }, 200, cors);
    } catch (e) {
      return json({ error: "The Oracle couldn't build that quiz. Try rephrasing, or try again later (the free daily allowance may be used up)." }, 502, cors);
    }
  }
};
