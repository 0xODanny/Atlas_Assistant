"use client";

import { useEffect } from "react";
import { initTelegramWebApp } from "@/lib/telegram/webapp";

export function TelegramReady() {
  useEffect(() => {
    void initTelegramWebApp();
  }, []);
  return null;
}
