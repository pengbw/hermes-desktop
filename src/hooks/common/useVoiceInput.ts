import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { startRecording, stopRecording } from "tauri-plugin-mic-recorder-api";

interface UseVoiceInputOptions {
  onResult: (text: string) => void;
  onFinalResult?: (text: string, audioPath?: string, audioDuration?: number) => void;
  onRecordingComplete?: (audioPath: string) => void;
  onSttComplete?: (text: string, audioPath: string, audioDuration?: number) => void;
  lang?: string;
}

type VoiceState =
  | "checking"
  | "ready"
  | "recording"
  | "transcribing"
  | "not-installed"
  | "installing"
  | "install-error"
  | "mic-error";

interface UseVoiceInputReturn {
  voiceState: VoiceState;
  installError: string | null;
  progressText: string | null;
  micError: string | null;
  toggleRecording: () => void;
  installStt: () => Promise<void>;
}

interface TranscribeResult {
  success: boolean;
  text: string;
  error: string | null;
  audioPath: string | null;
  audioDuration: number | null;
}

interface SttAvailableResult {
  available: boolean;
  pythonPath: string | null;
  error: string | null;
}

interface SttProgress {
  line: string;
  done: boolean;
  success: boolean;
}

export function useVoiceInput({
  onResult,
  onFinalResult,
  onRecordingComplete,
  onSttComplete,
  lang = "zh",
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("checking");
  const [installError, setInstallError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  const onFinalResultRef = useRef(onFinalResult);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const onSttCompleteRef = useRef(onSttComplete);
  const langRef = useRef(lang);
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onFinalResultRef.current = onFinalResult; });
  useEffect(() => { onRecordingCompleteRef.current = onRecordingComplete; });
  useEffect(() => { onSttCompleteRef.current = onSttComplete; });
  useEffect(() => { langRef.current = lang; });

  useEffect(() => {
    (async () => {
      try {
        const result = await invoke<SttAvailableResult>("check_stt_available");
        setVoiceState(result.available ? "ready" : "not-installed");
      } catch {
        setVoiceState("not-installed");
      }
    })();
  }, []);

  useEffect(() => {
    const unlistenInstall = listen<SttProgress>("stt-install-progress", (event) => {
      const { line, done, success } = event.payload;
      setProgressText(line);
      if (done) {
        if (success) {
          setVoiceState("ready");
          setInstallError(null);
        } else {
          setVoiceState("install-error");
          setInstallError(line);
        }
        setTimeout(() => setProgressText(null), 3000);
      }
    });

    const unlistenTranscribe = listen<SttProgress>("stt-transcribe-progress", (event) => {
      const { line, done } = event.payload;
      if (done) {
        setProgressText(null);
        return;
      }
      setProgressText(line || "正在发送...");
    });

    return () => {
      unlistenInstall.then((fn) => fn());
      unlistenTranscribe.then((fn) => fn());
    };
  }, []);

  const startListening = useCallback(async () => {
    try {
      setMicError(null);
      await startRecording();
      setVoiceState("recording");
    } catch (e: unknown) {
      console.warn("Failed to start mic recording:", e);
      const errMsg = e instanceof Error ? e.message : String(e ?? "Unknown error");
      const lowerMsg = errMsg.toLowerCase();
      // 检测麦克风权限相关错误（macOS/Windows 通用）
      const isPermissionError =
        lowerMsg.includes("permission") ||
        lowerMsg.includes("denied") ||
        lowerMsg.includes("not authorized") ||
        lowerMsg.includes("no default input device") ||
        lowerMsg.includes("coreaudio") ||
        lowerMsg.includes("microphone") ||
        lowerMsg.includes("无法访问") ||
        lowerMsg.includes("权限");
      if (isPermissionError) {
        setMicError(errMsg);
        setVoiceState("mic-error");
      } else {
        setVoiceState("ready");
      }
    }
  }, []);

  const stopListening = useCallback(async () => {
    let audioPath: string;
    try {
      audioPath = await stopRecording();
    } catch (e) {
      console.warn("Failed to stop mic recording:", e);
      setVoiceState("ready");
      return;
    }

    if (!audioPath) {
      console.warn("No audio path returned from stopRecording");
      setVoiceState("ready");
      return;
    }

    if (onRecordingCompleteRef.current) {
      onRecordingCompleteRef.current(audioPath);
    }

    setVoiceState("transcribing");
    setProgressText("正在发送...");
    try {
      const result = await invoke<TranscribeResult>("transcribe_audio", {
        audioPath,
        lang: langRef.current,
        keepAudio: true,
      });

      if (result.success && result.text.trim()) {
        const resultAudioPath = result.audioPath ?? audioPath;
        const resultAudioDuration = result.audioDuration ?? undefined;

        if (onSttCompleteRef.current) {
          onSttCompleteRef.current(
            result.text.trim(),
            resultAudioPath,
            resultAudioDuration
          );
        } else if (onFinalResultRef.current) {
          onFinalResultRef.current(
            result.text.trim(),
            resultAudioPath,
            resultAudioDuration
          );
        } else {
          onResultRef.current(result.text.trim());
        }
      } else if (result.success && !result.text.trim()) {
        if (onSttCompleteRef.current) {
          onSttCompleteRef.current("", result.audioPath ?? audioPath, result.audioDuration ?? undefined);
        }
      } else if (result.error) {
        console.warn("Transcription failed:", result.error);
      }
    } catch (e) {
      console.warn("Transcription error:", e);
    } finally {
      setVoiceState("ready");
      setProgressText(null);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (voiceState === "recording") {
      stopListening();
    } else if (voiceState === "ready" || voiceState === "mic-error") {
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  const installStt = useCallback(async () => {
    setVoiceState("installing");
    setInstallError(null);
    setProgressText(null);
    try {
      await invoke("install_stt");
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.toString() || "Unknown error";
      console.warn("Failed to install STT:", msg);
      setInstallError(msg);
      setVoiceState("install-error");
    }
  }, []);

  // 组件卸载时确保停止录音，释放麦克风资源
  useEffect(() => {
    return () => {
      if (voiceState === "recording") {
        try { stopRecording(); } catch { /* 静默处理，避免卸载时报错 */ }
      }
    };
  }, [voiceState]);

  return { voiceState, installError, progressText, micError, toggleRecording, installStt };
}
