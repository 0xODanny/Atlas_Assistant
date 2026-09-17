import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryStore } from "../lib/data/memory-store";
import { createSeedState } from "../lib/data/seed";
import { deserializeState, serializeState } from "../lib/data/serialize";
import { createCalendarRepository } from "../lib/repositories/calendar";

const NOW = new Date("2026-09-17T16:00:00.000Z");

test("create, update, and delete events", () => {
  const store = createMemoryStore(createSeedState(NOW));
  const calendar = createCalendarRepository(store);

  const created = calendar.createEvent({
    title: "Focus block",
    start: "2026-09-17T18:00:00.000Z",
    end: "2026-09-17T20:00:00.000Z",
    category: "focus",
  });
  assert.equal(created.title, "Focus block");
  assert.ok(created.createdAt);
  assert.ok(created.updatedAt);
  assert.ok(calendar.getEvent(created.id));

  const updated = calendar.updateEvent(created.id, { title: "Deep work" });
  assert.equal(updated.title, "Deep work");
  assert.ok(updated.updatedAt >= created.updatedAt);

  const deleted = calendar.deleteEvent(created.id);
  assert.equal(deleted.id, created.id);
  assert.equal(calendar.getEvent(created.id), undefined);
});

test("persistence serialization and deserialization round-trips events", () => {
  const initial = createSeedState(NOW);
  const store = createMemoryStore(initial);
  const calendar = createCalendarRepository(store);

  const created = calendar.createEvent({
    title: "Travel buffer",
    start: "2026-09-18T13:00:00.000Z",
    end: "2026-09-18T14:00:00.000Z",
    category: "travel",
    privacy: "busy-only",
  });
  calendar.updateEvent(created.id, { location: "Airport" });

  const raw = serializeState(store.getState());
  const restored = deserializeState(raw);
  assert.ok(restored);
  const event = restored.events.find((item) => item.id === created.id);
  assert.ok(event);
  assert.equal(event.title, "Travel buffer");
  assert.equal(event.location, "Airport");
  assert.equal(event.category, "travel");

  const restoredStore = createMemoryStore(restored);
  const restoredCalendar = createCalendarRepository(restoredStore);
  restoredCalendar.deleteEvent(created.id);
  const afterDelete = deserializeState(serializeState(restoredStore.getState()));
  assert.ok(afterDelete);
  assert.equal(afterDelete.events.find((item) => item.id === created.id), undefined);
  assert.equal(afterDelete.events.length, initial.events.length);
});
