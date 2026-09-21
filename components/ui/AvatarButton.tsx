import Link from "next/link";
import { firstName } from "@/lib/format";

export function AvatarButton({ name }: { name: string }) {
  const initial = (firstName(name).trim().charAt(0) || "A").toUpperCase();
  return (
    <Link href="/settings" aria-label={`${name}, account settings`} className="atlas-avatar">
      {initial}
    </Link>
  );
}
