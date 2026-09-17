import { createSeedState } from "../lib/data/seed.ts";

const now = new Date();
const state = createSeedState(now);
const context = {
  now: now.toISOString(),
  timezone: state.profile.timezone,
  profile: state.profile,
  events: state.events,
  tasks: state.tasks,
  workouts: state.workouts,
  meetings: state.meetings,
};

async function ask(text, pending) {
  const started = Date.now();
  const response = await fetch("http://localhost:3002/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      context,
      pending,
    }),
  });
  const data = await response.json();
  return {
    request: text,
    http: response.status,
    latencyMs: Date.now() - started,
    source: data.source ?? null,
    intent: data.intentType ?? null,
    error: data.error ?? null,
    errorCategory: data.errorCategory ?? null,
    message: data.message ?? "",
    pending: data.pending ?? null,
    resume: data.resume ?? null,
    choices: (data.choices ?? []).map((item) => item.label),
    windows: (data.windows ?? []).map((item) => `${item.start} ${item.minutes}m`),
    propose: (data.actions ?? [])
      .filter((item) => item.kind === "propose")
      .map((item) => item.summary),
    read: (data.actions ?? []).filter((item) => item.kind === "read").map((item) => item.summary),
  };
}

const cases = [
  ["A", "My morning feels kind of packed. Where can I squeeze in an uninterrupted hour and a half?"],
  ["B", "I really don't want to ride that early. What can you do later?"],
  ["C", "Can you get me in the pool tomorrow before lunch?"],
  ["D", "I need a solid three-hour block tomorrow where nobody bothers me."],
  ["E", "What should I have ready before I talk to Marcus?"],
  ["F", "Clean up tomorrow so I can get real work done but still train."],
  ["G", "Anything athletic coming up?"],
  ["H", "How much breathing room do I actually have today?"],
  ["I", "Push the ride back, but don't put it too close to the swim."],
  ["J", "I want to train tomorrow morning. Swimming would probably be best."],
  ["K", "Move it later."],
  ["L", "Give me some work time."],
  ["S1a", "Schedule training tomorrow."],
  ["S2a", "Move my bike ride later."],
  ["S3a", "Find me two hours to work tomorrow."],
  ["C1", "Put my swim at 11 even if Marcus is there."],
  ["C2", "Schedule a three-hour focus block starting at 10."],
  ["C3", "Move everything to noon."],
  ["C4", "Book two things at the same time."],
];

const results = [];
for (const [id, text] of cases) {
  const row = await ask(text);
  results.push({ id, ...row });
  console.log(JSON.stringify({ id, ...row }, null, 2));
}

const s1 = results.find((item) => item.id === "S1a");
if (s1?.pending) {
  const follow = await ask("Swim.", s1.pending);
  results.push({ id: "S1b", ...follow });
  console.log(JSON.stringify({ id: "S1b", ...follow }, null, 2));
}

const s2 = results.find((item) => item.id === "S2a");
if (s2) {
  const follow = await ask("The evening one.", s2.pending ?? s2.resume ?? undefined);
  results.push({ id: "S2b", ...follow });
  console.log(JSON.stringify({ id: "S2b", ...follow }, null, 2));
}

const s3 = results.find((item) => item.id === "S3a");
if (s3) {
  const follow = await ask("Actually make it three.", s3.pending ?? s3.resume ?? undefined);
  results.push({ id: "S3b", ...follow });
  console.log(JSON.stringify({ id: "S3b", ...follow }, null, 2));
}

const summary = results.map((item) => ({
  id: item.id,
  source: item.source,
  intent: item.intent,
  latencyMs: item.latencyMs,
  error: item.error,
  propose: item.propose,
  choices: item.choices,
  message: item.message.slice(0, 220),
}));
console.log("SUMMARY", JSON.stringify(summary, null, 2));
