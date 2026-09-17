"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/register";

export function PwaRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
