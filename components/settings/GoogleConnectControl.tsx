"use client";

import { useState } from "react";

export function GoogleConnectControl({
  mode = "readonly",
  label,
  quiet = false,
}: {
  mode?: "readonly" | "write";
  label: string;
  quiet?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const href = mode === "write" ? "/api/google/oauth?mode=write" : "/api/google/oauth";

  function startOAuth(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    setBusy(true);
    try {
      window.location.assign(href);
    } catch {
      setBusy(false);
      setError("Google Calendar could not start connecting. Try again.");
    }
  }

  return (
    <form action={href.split("?")[0]} method="get" onSubmit={startOAuth}>
      {mode === "write" ? <input type="hidden" name="mode" value="write" /> : null}
      <button
        type="submit"
        className={quiet ? "btn-quiet" : "btn-solid"}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Connecting…" : label}
      </button>
      {error ? <p className="setting-note mt-2 text-[var(--muted)]">{error}</p> : null}
    </form>
  );
}
