export function EmptyState({ children }: { children: string }) {
  return <p className="py-3 text-[16px] leading-6 text-[var(--atlas-muted)]">{children}</p>;
}

export function InlineStatus({ children }: { children: string }) {
  return <p className="text-[13px] leading-5 text-[var(--atlas-muted)]">{children}</p>;
}
