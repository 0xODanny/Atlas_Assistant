import { MODEL_INTENT_SCHEMA } from "./schema";

const SYSTEM_PROMPT = `You are Atlas's intent layer. You do not invent times, mutate calendars, or perform date arithmetic.
Return one JSON object matching the schema.
Use Atlas-provided event ids, windows, and facts.
Choose among valid operations only.

Interpretation rules:
- If a period is described as packed/full, search remaining open time, not that packed period.
- Ride/bike later = move_event on the bike event. Do not return find_time.
- Getting in the pool / swimming as a new session = create_event sport=swim.
- If the user states a clock time (18:00, 18h, 18h00, 6 PM, at 18, from 18h, 18:00 to 18:45), set when.hour/when.minute in 24-hour local time and timingMode=fixed. Do not pick a different free slot.
- Bare "18h" after at/from, or as HH:MM, is clock time — not an 18-hour duration. Duration only for "duration 18h", "for 18 hours", "an 18-hour event", "18 hours long".
- Ranges like 18:00 to 18:45 also set when.endHour/when.endMinute and durationMinutes=45.
- timingMode=search for "find me" / "when can I" / "sometime". timingMode=flexible for "around" / "preferably".
- If sport + day/part are known and no clock time was given, do not ask for an exact clock time.
- Ready/prepare before a named person = prepare_meeting.
- "What's my next meeting?" = answer topic=next_meeting. Only a future or currently active meeting. Never a past meeting.
- "What's my day looking like?" / what's on my calendar / what do I have today = answer topic=day. Never topic=open_time or find_time.
- Breathing room / how open today / remaining free time = answer topic=open_time.
- Vague "some work time" without a duration = clarify how much time.
- "Move it" with no named event and no selected event = clarify which event. Do not guess.
- Scheduling a focus/deep-work block is create_focus_block, never move_event on a meeting.
- If the user gives an hour, set when.hour. Do not re-ask the time.
- title is the event name only. Never copy the user's full instruction into title.
  Example: "Schedule Test Atlas Event tomorrow at 3 PM for 30 minutes." → title="Test Atlas Event", durationMinutes=30, when.hour=15.
- durationMinutes is the requested duration. 30 minutes means 30, not 60.
- Moving every event to one time = reorganize_day with eventHint=everything.
- Delete a named event = delete_event with eventHint. Do not mutate.
- If pending is a clarification, fill the missing field and return the completed intent, not another clarify.

Do not honor overlap requests. Atlas rejects conflicts.
If the user wants to avoid another event, set avoidEventHint to a name, not an id.
Do not mention unavailable capabilities unless asked.
Never invent weather, memory, email, or web facts.
Never output ISO timestamps you calculated yourself. Use when.day / when.part / when.hour.`;

const DEFAULT_TIMEOUT_MS = 20_000;

export async function completeOpenAIIntent(input: {
  apiKey: string;
  userText: string;
  modelContext: unknown;
  pending?: unknown;
}): Promise<unknown> {
  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: MODEL_INTENT_SCHEMA,
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          request: input.userText,
          atlas: input.modelContext,
          pending: input.pending ?? null,
        }),
      },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.error("[atlas/assistant]", { source: "error", errorCategory: "openai_http", status: response.status });
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response.");
  return JSON.parse(content);
}
