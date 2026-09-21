"use client";

export function BackControl({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="atlas-back" data-atlas-back onClick={onClick}>
      <ChevronLeft />
      <span className="atlas-back-label">{label}</span>
    </button>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.25 4.75 6.75 10l5.5 5.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
