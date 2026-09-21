"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export type SpeechDictationStatus =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "processing"
  | "unsupported"
  | "denied"
  | "error";

function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(speechRecognitionCtor());
}

export function useSpeechDictation(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<SpeechDictationStatus>(() =>
    typeof window === "undefined" ? "idle" : isSpeechRecognitionSupported() ? "idle" : "unsupported",
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const baseRef = useRef("");
  const startedRef = useRef(false);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      recognition?.abort();
    }
    setStatus((current) => {
      if (current === "listening") return "processing";
      if (current === "requesting-permission") return "idle";
      return current;
    });
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(
    async (currentText: string) => {
      const Ctor = speechRecognitionCtor();
      if (!Ctor) {
        setStatus("unsupported");
        return;
      }
      stop();
      baseRef.current = currentText.trim();
      startedRef.current = false;
      setStatus("requesting-permission");

      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          setStatus("denied");
          return;
        }
      }

      const recognition = new Ctor();
      recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      const markListening = () => {
        if (recognitionRef.current !== recognition) return;
        startedRef.current = true;
        setStatus("listening");
      };
      recognition.onstart = markListening;
      recognition.onaudiostart = markListening;
      recognition.onresult = (event) => {
        if (!startedRef.current) markListening();
        let finalText = "";
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const piece = event.results[index]![0]?.transcript ?? "";
          if (event.results[index]!.isFinal) finalText += piece;
          else interim += piece;
        }
        const next = [baseRef.current, (finalText || interim).trim()].filter(Boolean).join(" ");
        if (finalText) baseRef.current = next;
        onTranscriptRef.current(next);
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setStatus("denied");
        } else if (event.error === "aborted") {
          setStatus("idle");
        } else {
          setStatus("error");
        }
        recognitionRef.current = null;
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
          setStatus((current) =>
            current === "listening" || current === "processing" || current === "requesting-permission"
              ? "idle"
              : current,
          );
        } else {
          setStatus((current) => (current === "processing" ? "idle" : current));
        }
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        recognitionRef.current = null;
        const name = error instanceof DOMException ? error.name : "";
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      }
    },
    [stop],
  );

  const toggle = useCallback(
    (currentText: string) => {
      if (status === "listening" || status === "requesting-permission" || status === "processing") {
        stop();
        return;
      }
      void start(currentText);
    },
    [start, status, stop],
  );

  return {
    status,
    supported: status !== "unsupported" && isSpeechRecognitionSupported(),
    listening: status === "listening",
    requesting: status === "requesting-permission",
    toggle,
    stop,
  };
}
