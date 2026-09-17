"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY } from "../config";
import { createMemoryStore } from "../data/memory-store";
import { presentAppState } from "../data/sample";
import { createSeedState } from "../data/seed";
import { deserializeState, serializeState } from "../data/serialize";
import type { AppState, StateStore } from "../data/state";
import {
  applyDestinationToCreateInput,
  mergeGoogleConnection,
  resolveCreateDestinationFromState,
} from "../calendar/destination";
import {
  createEventInputFromGoogle,
  executeAssistantWrite,
  googleWriteRequestForDestination,
  googleWriteRequestForPayload,
  postGoogleWrite,
} from "../google/applyWrite";
import { mergeCalendarEvents, removeProviderEvents, type CalendarReadScope } from "../google/merge";
import { isGoogleSyncStale } from "../google/stale";
import { createCalendarRepository } from "../repositories/calendar";
import { createProfileRepository } from "../repositories/profile";
import { createTaskRepository } from "../repositories/tasks";
import type { AssistantAction } from "../types/assistant";
import type { CreateEventInput, UpdateEventInput } from "../types/event";
import type { ConnectionState } from "../types/profile";

export type SheetState =
  | { name: "event"; mode: "create" | "edit"; eventId?: string; start?: string }
  | { name: "move"; eventId: string }
  | { name: "prepare"; eventId: string }
  | null;

export type MutationResult = { ok: boolean; error?: string };

type AppContextValue = {
  ready: boolean;
  state: AppState;
  store: StateStore;
  calendar: ReturnType<typeof createCalendarRepository>;
  tasks: ReturnType<typeof createTaskRepository>;
  profile: ReturnType<typeof createProfileRepository>;
  sheet: SheetState;
  googleWriteEnabled: boolean;
  googleSyncing: boolean;
  openSheet: (sheet: SheetState) => void;
  closeSheet: () => void;
  createEvent: (input: CreateEventInput) => Promise<MutationResult>;
  updateEvent: (id: string, patch: UpdateEventInput) => Promise<MutationResult>;
  deleteEvent: (id: string) => Promise<MutationResult>;
  applyAction: (action: AssistantAction) => Promise<AssistantAction>;
  resetSampleData: () => void;
  updateProfile: (patch: Parameters<ReturnType<typeof createProfileRepository>["updateProfile"]>[0]) => void;
  refreshGoogle: (force?: boolean) => Promise<void>;
  disconnectGoogle: () => Promise<void>;
  setGoogleCalendars: (includedCalendarIds: string[]) => Promise<void>;
  setDefaultWriteCalendar: (calendarId: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function readPersistedState(): AppState {
  if (typeof window === "undefined") return createSeedState();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createSeedState();
  return deserializeState(raw) ?? createSeedState();
}

function persist(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeState(state));
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [googleWriteEnabled, setGoogleWriteEnabled] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [store] = useState<StateStore>(() => createMemoryStore(createSeedState()));
  const syncSeq = useRef(0);
  const writeSeq = useRef(0);
  const appliedSyncSeq = useRef(0);

  const markLocalWrite = useCallback(() => {
    writeSeq.current += 1;
  }, []);

  const refresh = useCallback(() => {
    persist(store.getState());
    setVersion((value) => value + 1);
  }, [store]);

  const applyConnection = useCallback(
    (connection: ConnectionState, events?: AppState["events"], scope?: CalendarReadScope) => {
      const current = store.getState();
      const google = mergeGoogleConnection(current.connections.google, connection);
      const canMerge =
        connection.status === "connected" &&
        events !== undefined &&
        Boolean(scope?.complete);
      store.setState({
        ...current,
        connections: { ...current.connections, google },
        events: canMerge ? mergeCalendarEvents(current.events, events, scope) : current.events,
      });
      refresh();
    },
    [refresh, store],
  );

  const refreshGoogle = useCallback(
    async (force = false) => {
      const current = store.getState();
      if (!force && current.connections.google.status === "disconnected") return;
      if (!force && !isGoogleSyncStale(current.connections.google.lastSyncedAt)) return;
      const requestSeq = ++syncSeq.current;
      const writeAtStart = writeSeq.current;
      const includedKey = (current.connections.google.calendars ?? [])
        .filter((calendar) => calendar.included)
        .map((calendar) => calendar.id)
        .sort()
        .join(",");
      const emailAtStart = current.connections.google.email;
      setGoogleSyncing(true);
      try {
        const knownIds = new Set((current.connections.google.calendars ?? []).map((calendar) => calendar.id));
        const included = current.connections.google.calendars
          ?.filter((calendar) => calendar.included && knownIds.has(calendar.id))
          .map((calendar) => calendar.id);
        const response = await fetch("/api/google/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone: current.profile.timezone,
            includedCalendarIds: included?.length ? included : undefined,
            privacyDefault: current.profile.privacyDefault,
          }),
        });
        const data = (await response.json()) as {
          connection?: ConnectionState;
          events?: AppState["events"];
          writeEnabled?: boolean;
          complete?: boolean;
          rangeStart?: string;
          rangeEnd?: string;
          calendarIds?: string[];
          accountEmail?: string;
        };
        const latest = store.getState();
        const latestIncluded = (latest.connections.google.calendars ?? [])
          .filter((calendar) => calendar.included)
          .map((calendar) => calendar.id)
          .sort()
          .join(",");
        const stale =
          requestSeq !== syncSeq.current ||
          requestSeq < appliedSyncSeq.current ||
          writeSeq.current !== writeAtStart ||
          latestIncluded !== includedKey ||
          (emailAtStart && latest.connections.google.email && emailAtStart !== latest.connections.google.email);
        setGoogleWriteEnabled(Boolean(data.writeEnabled));
        if (data.connection?.status === "error" || data.connection?.status === "disconnected") {
          applyConnection({
            ...data.connection,
            writeEnabled: data.writeEnabled ?? data.connection.writeEnabled,
          });
          return;
        }
        if (data.connection) {
          const complete = Boolean(data.complete) && data.connection.status === "connected" && !stale;
          if (complete) appliedSyncSeq.current = requestSeq;
          applyConnection(
            { ...data.connection, writeEnabled: data.writeEnabled ?? data.connection.writeEnabled },
            complete ? data.events ?? [] : undefined,
            complete
              ? {
                  complete: true,
                  calendarIds: data.calendarIds,
                  rangeStart: data.rangeStart,
                  rangeEnd: data.rangeEnd,
                  accountEmail: data.accountEmail,
                  generation: requestSeq,
                  appliedGeneration: appliedSyncSeq.current,
                }
              : { complete: false },
          );
        }
      } catch {
        applyConnection({
          ...store.getState().connections.google,
          status: store.getState().connections.google.status === "connected" ? "connected" : "error",
          syncError: "google_sync_failed",
        });
      } finally {
        setGoogleSyncing(false);
      }
    },
    [applyConnection, store],
  );

  useEffect(() => {
    const persisted = readPersistedState();
    store.setState(persisted);
    if (persisted.connections.google.writeEnabled) setGoogleWriteEnabled(true);
    setReady(true);
    setVersion((value) => value + 1);
  }, [store]);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      try {
        const response = await fetch("/api/google/status");
        const data = (await response.json()) as { writeEnabled?: boolean; connection?: ConnectionState };
        setGoogleWriteEnabled(Boolean(data.writeEnabled));
        if (data.connection?.status === "connected" || data.connection?.status === "error") {
          const current = store.getState();
          store.setState({
            ...current,
            connections: {
              ...current.connections,
              google: mergeGoogleConnection(current.connections.google, {
                ...data.connection,
                writeEnabled: data.writeEnabled ?? data.connection.writeEnabled,
              }),
            },
          });
          refresh();
          await refreshGoogle(true);
        }
      } catch {
        // keep local calendar
      }
    })();
  }, [ready, refresh, refreshGoogle, store]);

  const calendar = useMemo(() => createCalendarRepository(store), [store]);
  const tasks = useMemo(() => createTaskRepository(store), [store]);
  const profileRepo = useMemo(() => createProfileRepository(store), [store]);
  const state = presentAppState(store.getState());
  void version;

  const createEvent = useCallback(
    async (input: CreateEventInput): Promise<MutationResult> => {
      const current = store.getState();
      const destination = resolveCreateDestinationFromState(current, input.calendarId);
      const next = applyDestinationToCreateInput(input, destination);
      if (destination.provider === "google") {
        const request = googleWriteRequestForDestination({ type: "createEvent", event: next }, current, destination);
        if (!request) return { ok: false, error: "Could not create this event in Google Calendar." };
        const written = await postGoogleWrite(request);
        if (!written.ok || !written.event?.providerEventId) {
          return { ok: false, error: written.ok ? "Could not create this event in Google Calendar." : written.error };
        }
        calendar.createEvent(createEventInputFromGoogle(written.event));
        markLocalWrite();
        refresh();
        return { ok: true };
      }
      calendar.createEvent({ ...next, demo: false });
      markLocalWrite();
      refresh();
      return { ok: true };
    },
    [calendar, markLocalWrite, refresh, store],
  );

  const updateEvent = useCallback(
    async (id: string, patch: UpdateEventInput): Promise<MutationResult> => {
      const request = googleWriteRequestForPayload({ type: "updateEvent", id, patch }, store.getState());
      if (request) {
        const written = await postGoogleWrite(request);
        if (!written.ok || !written.event?.providerEventId) {
          return { ok: false, error: written.ok ? "Could not update this event in Google Calendar." : written.error };
        }
        calendar.updateEvent(id, written.event);
        markLocalWrite();
        refresh();
        return { ok: true };
      }
      calendar.updateEvent(id, patch);
      markLocalWrite();
      refresh();
      return { ok: true };
    },
    [calendar, markLocalWrite, refresh, store],
  );

  const deleteEvent = useCallback(
    async (id: string): Promise<MutationResult> => {
      const request = googleWriteRequestForPayload({ type: "deleteEvent", id }, store.getState());
      if (request) {
        const written = await postGoogleWrite(request);
        if (!written.ok) return { ok: false, error: written.error };
      }
      calendar.deleteEvent(id);
      markLocalWrite();
      refresh();
      return { ok: true };
    },
    [calendar, markLocalWrite, refresh, store],
  );

  const applyAction = useCallback(
    async (action: AssistantAction): Promise<AssistantAction> => {
      const result = await executeAssistantWrite(store, action);
      if (result.status === "applied") markLocalWrite();
      refresh();
      return result;
    },
    [markLocalWrite, refresh, store],
  );

  const persistWriteEnabled = useCallback(
    (enabled: boolean) => {
      setGoogleWriteEnabled(enabled);
      const current = store.getState();
      store.setState({
        ...current,
        connections: {
          ...current.connections,
          google: { ...current.connections.google, writeEnabled: enabled },
        },
      });
      refresh();
    },
    [refresh, store],
  );

  const setDefaultWriteCalendar = useCallback(
    (calendarId: string) => {
      const current = store.getState();
      store.setState({
        ...current,
        connections: {
          ...current.connections,
          google: { ...current.connections.google, defaultWriteCalendarId: calendarId },
        },
      });
      refresh();
    },
    [refresh, store],
  );

  const writesEnabled = googleWriteEnabled || Boolean(state.connections.google.writeEnabled);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      state,
      store,
      calendar,
      tasks,
      profile: profileRepo,
      sheet,
      googleWriteEnabled: writesEnabled,
      googleSyncing,
      openSheet: setSheet,
      closeSheet: () => setSheet(null),
      createEvent,
      updateEvent,
      deleteEvent,
      applyAction,
      resetSampleData: () => {
        const current = store.getState();
        const seed = createSeedState();
        store.setState({
          ...seed,
          profile: {
            ...seed.profile,
            displayName: current.profile.displayName,
            timezone: current.profile.timezone,
            workingHours: current.profile.workingHours,
            schedulingHours: current.profile.schedulingHours,
            morningBriefTime: current.profile.morningBriefTime,
            privacyDefault: current.profile.privacyDefault,
            showSampleData: current.profile.showSampleData,
            sampleDataExplicit: current.profile.sampleDataExplicit,
            afterWorkoutBufferMinutes: current.profile.afterWorkoutBufferMinutes,
          },
          connections: { ...seed.connections, google: current.connections.google },
          events: mergeCalendarEvents(
            seed.events,
            current.events.filter((event) => event.source === "google"),
          ),
        });
        refresh();
      },
      updateProfile: (patch) => {
        profileRepo.updateProfile(patch);
        refresh();
      },
      refreshGoogle,
      disconnectGoogle: async () => {
        await fetch("/api/google/disconnect", { method: "POST" });
        const current = store.getState();
        store.setState({
          ...current,
          connections: { ...current.connections, google: { status: "disconnected" } },
          events: removeProviderEvents(current.events),
        });
        setGoogleWriteEnabled(false);
        refresh();
      },
      setGoogleCalendars: async (includedCalendarIds) => {
        const current = store.getState();
        const response = await fetch("/api/google/calendars", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone: current.profile.timezone,
            includedCalendarIds,
            privacyDefault: current.profile.privacyDefault,
          }),
        });
        const data = (await response.json()) as {
          connection?: ConnectionState;
          events?: AppState["events"];
          writeEnabled?: boolean;
          complete?: boolean;
          rangeStart?: string;
          rangeEnd?: string;
          calendarIds?: string[];
          accountEmail?: string;
        };
        persistWriteEnabled(Boolean(data.writeEnabled));
        if (data.connection) {
          const complete = Boolean(data.complete) && data.connection.status === "connected";
          applyConnection(
            { ...data.connection, writeEnabled: data.writeEnabled ?? data.connection.writeEnabled },
            complete ? data.events ?? [] : undefined,
            complete
              ? {
                  complete: true,
                  calendarIds: data.calendarIds,
                  rangeStart: data.rangeStart,
                  rangeEnd: data.rangeEnd,
                  accountEmail: data.accountEmail,
                }
              : { complete: false },
          );
        }
      },
      setDefaultWriteCalendar,
    }),
    [
      applyAction,
      applyConnection,
      calendar,
      createEvent,
      deleteEvent,
      googleSyncing,
      persistWriteEnabled,
      profileRepo,
      ready,
      refresh,
      refreshGoogle,
      setDefaultWriteCalendar,
      sheet,
      state,
      store,
      tasks,
      updateEvent,
      writesEnabled,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return value;
}
