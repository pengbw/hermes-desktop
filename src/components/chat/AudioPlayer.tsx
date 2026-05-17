import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import styles from "./AudioPlayer.module.css";

interface AudioPlayerProps {
  audioPath?: string;
  audioDuration?: number;
  isUser?: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ audioPath, audioDuration, isUser = false }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [probedDuration, setProbedDuration] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const duration = (audioDuration && audioDuration > 0) ? audioDuration : probedDuration;
  const audioUrl = useMemo(() => (audioPath ? convertFileSrc(audioPath) : null), [audioPath]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playGenerationRef = useRef(0);

  useEffect(() => {
    if (!audioUrl) return;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;

    const doProbe = () => {
      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = audioUrl;
      probe.onloadedmetadata = () => {
        if (!cancelled && probe.duration && isFinite(probe.duration) && probe.duration > 0) {
          setProbedDuration(probe.duration);
          setLoadError(false);
        }
      };
      probe.onerror = () => {
        if (cancelled) return;
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(() => {
            if (!cancelled) doProbe();
          }, 500 * retryCount);
        } else {
          setLoadError(true);
        }
      };
    };

    doProbe();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      setCurrentTime(0);
      setLoadError(false);
    };
  }, [audioUrl]);

  const handlePlay = useCallback(() => {
    if (!audioUrl) return;

    setLoadError(false);

    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const generation = ++playGenerationRef.current;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (playGenerationRef.current !== generation) return;
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setProbedDuration(audio.duration);
      }
    };

    audio.ontimeupdate = () => {
      if (playGenerationRef.current !== generation) return;
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      if (playGenerationRef.current !== generation) return;
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.onerror = () => {
      if (playGenerationRef.current !== generation) return;
      setPlaying(false);
      setLoadError(true);
    };

    audio.play().catch(() => {
      if (playGenerationRef.current !== generation) return;
      setPlaying(false);
    });
    setPlaying(true);
  }, [audioUrl, playing]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const canPlay = !!audioUrl;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`${styles.audioPlayer} ${isUser ? styles.audioPlayerUser : styles.audioPlayerAssistant}`}>
      <button
        className={styles.playBtn}
        onClick={handlePlay}
        disabled={!canPlay}
        title={loadError ? "音频加载失败" : undefined}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21" />
          </svg>
        )}
      </button>
      <div className={styles.waveform}>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <span className={styles.duration}>
        {playing ? formatDuration(currentTime) : formatDuration(duration)}
      </span>
    </div>
  );
}
