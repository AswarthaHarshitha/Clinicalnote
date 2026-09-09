import { useCallback, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function pickMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [levels, setLevels] = useState<number[]>(new Array(48).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanupVisualizer = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const tickVisualizer = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bucketSize = Math.floor(data.length / 48) || 1;
    const next: number[] = [];
    for (let i = 0; i < 48; i++) {
      const start = i * bucketSize;
      let sum = 0;
      for (let j = start; j < start + bucketSize && j < data.length; j++) sum += data[j];
      next.push(sum / bucketSize / 255);
    }
    setLevels(next);
    rafRef.current = requestAnimationFrame(tickVisualizer);
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedMs(pausedDurationRef.current + (Date.now() - startTimeRef.current));
    }, 200);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      tickVisualizer();

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setAudioBlob(blob);
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;

      pausedDurationRef.current = 0;
      setElapsedMs(0);
      startTimer();
      setState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access was denied.");
      setState("error");
    }
  }, [startTimer, tickVisualizer]);

  const pause = useCallback(() => {
    mediaRecorderRef.current?.pause();
    stopTimer();
    pausedDurationRef.current = elapsedMs;
    setState("paused");
  }, [elapsedMs, stopTimer]);

  const resume = useCallback(() => {
    mediaRecorderRef.current?.resume();
    startTimer();
    setState("recording");
  }, [startTimer]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopTimer();
    cleanupVisualizer();
    setState("stopped");
  }, [cleanupVisualizer, stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    cleanupVisualizer();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setElapsedMs(0);
    setAudioBlob(null);
    setError(null);
    setLevels(new Array(48).fill(0));
    setState("idle");
  }, [cleanupVisualizer, stopTimer]);

  return { state, elapsedMs, error, audioBlob, levels, start, pause, resume, stop, reset };
}
