"use client";

import { useState } from "react";

export function WeatherCityForm({
  id,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  id: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (query: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");

  return (
    <form
      className="weather-city-form"
      onSubmit={(event) => {
        event.preventDefault();
        const next = query.trim();
        if (!next || pending) return;
        void onSubmit(next);
      }}
    >
      <label className="weather-city-label" htmlFor={id}>
        City
      </label>
      <div className="weather-city-row">
        <input
          id={id}
          name="city"
          value={query}
          autoComplete="address-level2"
          enterKeyHint="search"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="San Francisco"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })}
        />
        <button type="submit" className="btn-quiet" disabled={pending}>
          Save
        </button>
        {onCancel ? (
          <button type="button" className="btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="weather-status" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
