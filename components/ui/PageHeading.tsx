import type { ReactNode } from "react";

export function PageHeading({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header>
      {kicker ? <p className="section-kicker">{kicker}</p> : null}
      <h1 className={`display-title ${kicker ? "mt-2" : ""}`}>{title}</h1>
      {children}
    </header>
  );
}
