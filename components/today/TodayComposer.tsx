"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TodayComposer() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      className="today-composer"
      onSubmit={(event) => {
        event.preventDefault();
        const prompt = value.trim();
        if (!prompt) return;
        router.push(`/assistant?prompt=${encodeURIComponent(prompt)}`);
      }}
    >
      <label className="sr-only" htmlFor="today-plan">
        Plan with Atlas
      </label>
      <div className="composer-shell">
        <input
          id="today-plan"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="What would you like to plan?"
        />
        <button type="submit" className="composer-send" aria-label="Ask Atlas">
          →
        </button>
      </div>
    </form>
  );
}
