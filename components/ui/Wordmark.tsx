import Link from "next/link";
import { APP_DISPLAY_NAME } from "@/lib/config";

export function Wordmark({ href = "/today" }: { href?: string }) {
  return (
    <Link href={href} className="atlas-wordmark inline-flex min-h-11 items-center">
      {APP_DISPLAY_NAME}
    </Link>
  );
}
