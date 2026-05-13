import { useEffect, useRef, useCallback } from "react";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../contexts/I18nContext";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM } from "@pixiv/three-vrm";
import {
  lerp,
  easeInOut,
  applyGestureSlerp as sharedApplyGestureSlerp,
  initBones,
  removeAccessoryObjects,
  parseGesturesFromDb,
  applyExpression as sharedApplyExpression,
  type GestureData,
} from "../utils/vrmUtils";
import { useAvatarChat } from "../hooks/vrm/useAvatarChat";
import { useVrmStore } from "../stores/vrmStore";
import { useChatStore } from "../stores/chatStore";
import type { AttachedFile } from "../stores/chatStore";
import { useUiStore } from "../stores/uiStore";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import styles from "./AvatarWindow.module.css";

const MODEL_PATH = "/vrm/miko.vrm";

let GESTURES: GestureData[] = [];

function getSilentTarget(): Record<string, { x: number; y: number; z: number; w: number }> {
  const silent = GESTURES.find((g) => g.name === "silent");
  return silent?.target || {};
}

function applySilentPose(bones: Record<string, THREE.Object3D | null>) {
  const target = getSilentTarget();
  if (Object.keys(target).length > 0) {
    sharedApplyGestureSlerp(bones, target, target, 1);
  }
}

function applyGestureSlerp(
  bones: Record<string, THREE.Object3D | null>,
  target: Record<string, { x: number; y: number; z: number; w: number }>,
  t: number
) {
  sharedApplyGestureSlerp(bones, target, getSilentTarget(), t);
}

const typewriterEffect = (element: HTMLElement, text: string, speed = 50) => {
  let index = 0;
  element.textContent = "";

  const type = () => {
    if (index < text.length && element.style.opacity !== "0") {
      element.textContent += text.charAt(index);
      index++;
      setTimeout(type, speed);
    }
  };

  type();
};

export default function AvatarWindow() {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<
    | (VRM & {
        blendShapeProxy?: {
          getValue: (name: string) => number | null;
          setValue: (name: string, value: number) => void;
        };
      })
    | null
  >(null);
  const clockRef = useRef(new THREE.Clock());
  const animIdRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  const bonesRef = useRef<Record<string, THREE.Object3D | null>>({});

  const gestureRef = useRef<{ index: number; start: number; active: boolean }>({
    index: -1,
    start: 0,
    active: false,
  });
  const greetingRef = useRef(t("avatar.greeting"));
  useEffect(() => {
    greetingRef.current = t("avatar.greeting");
  }, [t]);
  const isLoaded = useVrmStore((s) => s.isLoaded);
  const setIsLoaded = useVrmStore((s) => s.setIsLoaded);
  const loadError = useVrmStore((s) => s.loadError);
  const setLoadError = useVrmStore((s) => s.setLoadError);

  const inputText = useChatStore((s) => s.input);
  const setInputText = useChatStore((s) => s.setInput);
  const attachedFiles = useChatStore((s) => s.attachedFiles);
  const setAttachedFiles = useChatStore((s) => s.setAttachedFiles);
  const isDragging = useChatStore((s) => s.isDragging);
  const setIsDragging = useChatStore((s) => s.setIsDragging);
  const isInputFocused = useUiStore((s) => s.isInputFocused);
  const setIsInputFocused = useUiStore((s) => s.setIsInputFocused);
  const isHovering = useUiStore((s) => s.isHovering);
  const setIsHovering = useUiStore((s) => s.setIsHovering);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatWindowRef = useRef<WebviewWindow | null>(null);
  const chatSideRef = useRef<"right" | "left">("right");
  const gesturesRef = useRef<GestureData[]>([]);

  const {
    isThinking,
    isThinkingRef,
    isWaitingResponse,
    sendMessage: avatarChatSend,
  } = useAvatarChat({
    applyExpression: (name, val, duration) =>
      sharedApplyExpression(vrmRef.current, name, val, duration),
    triggerGesture: (name) => {
      const idx = GESTURES.findIndex((g) => g.name === name);
      if (idx >= 0) gestureRef.current = { index: idx, start: performance.now(), active: true };
    },
    gestures: gesturesRef,
    gestureStateRef: gestureRef,
  });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, []);

  const hasGreetedRef = useRef(false);

  const triggerGreeting = useCallback(() => {
    const greetIdx = GESTURES.findIndex((g) => g.name === "greeting");
    if (greetIdx >= 0) {
      gestureRef.current = { index: greetIdx, start: performance.now(), active: true };
      hasGreetedRef.current = true;
    }
  }, []);

  const applyExpression = useCallback((name: string, val: number, duration?: number) => {
    sharedApplyExpression(vrmRef.current, name, val, duration, () => {
      sharedApplyExpression(vrmRef.current, "neutral", 0);
      if (name === "happy") sharedApplyExpression(vrmRef.current, "happy", 0.3);
    });
  }, []);

  const CHAT_WIDTH = 300;
  const CHAT_HEIGHT = 500;
  const CHAT_GAP = 0;

  const calcChatPosition = useCallback(async () => {
    const avatarWin = getCurrentWindow();
    const pos = await avatarWin.outerPosition();
    const size = await avatarWin.outerSize();
    const monitor = await primaryMonitor();
    const screenWidth = monitor?.size.width ?? 1920;
    const scaleFactor = monitor?.scaleFactor ?? 1;

    const chatWidthPhysical = CHAT_WIDTH * scaleFactor;
    const chatGapPhysical = CHAT_GAP * scaleFactor;

    const avatarRight = pos.x + size.width;
    const spaceRight = screenWidth - avatarRight;
    const spaceLeft = pos.x;

    let side: "right" | "left";
    if (spaceRight >= chatWidthPhysical + chatGapPhysical) {
      side = "right";
    } else if (spaceLeft >= chatWidthPhysical + chatGapPhysical) {
      side = "left";
    } else {
      side = spaceRight >= spaceLeft ? "right" : "left";
    }

    const chatX =
      side === "right"
        ? avatarRight + chatGapPhysical
        : pos.x - chatWidthPhysical - chatGapPhysical;

    chatSideRef.current = side;
    return { x: chatX, y: pos.y };
  }, []);

  const openChatWindow = useCallback(async () => {
    try {
      const existing = await WebviewWindow.getByLabel("chat");
      if (existing) {
        await existing.setFocus();
        chatWindowRef.current = existing;
        existing.once("tauri://destroyed", () => {
          if (chatWindowRef.current === existing) {
            chatWindowRef.current = null;
          }
        });
        return;
      }
    } catch {
      chatWindowRef.current = null;
    }

    const chatPos = await calcChatPosition();
    const monitor = await primaryMonitor();
    const scaleFactor = monitor?.scaleFactor ?? 1;

    const chatWin = new WebviewWindow("chat", {
      url: "index.html",
      width: CHAT_WIDTH,
      height: CHAT_HEIGHT,
      x: chatPos.x / scaleFactor,
      y: chatPos.y / scaleFactor,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: true,
    });

    chatWindowRef.current = chatWin;

    chatWin.once("tauri://destroyed", () => {
      chatWindowRef.current = null;
    });
  }, [calcChatPosition]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if ((!text && attachedFiles.length === 0) || isWaitingResponse) return;

    setInputText("");
    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);

    await avatarChatSend(text, filesToSend, openChatWindow);
  }, [inputText, isWaitingResponse, attachedFiles, avatarChatSend, openChatWindow]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    const init = async () => {
      try {
        try {
          const gestures = await invoke<
            Array<{
              name: string;
              duration: number;
              lookAtX: number;
              lookAtY: number;
              tilt: number;
              targetJson: string;
            }>
          >("get_avatar_gestures");
          if (gestures && gestures.length > 0) {
            GESTURES = parseGesturesFromDb(gestures);
            gesturesRef.current = GESTURES;
          }
        } catch (e) {
          console.error("Failed to load gestures from DB", e);
        }

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(350, 500);
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(36, 350 / 500, 0.1, 100);
        camera.position.set(0, 1.0, 2.8);
        camera.lookAt(0, 0.8, 0);
        cameraRef.current = camera;

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const key = new THREE.DirectionalLight(0xffeedd, 1.6);
        key.position.set(2, 4, 3);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
        fill.position.set(-3, 2, 1);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffddaa, 0.3);
        rim.position.set(0, 2, -3);
        scene.add(rim);

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(MODEL_PATH);
        const vrm = gltf.userData.vrm;
        if (destroyed || !vrm) throw new Error("No VRM");

        vrm.userData = vrm.userData || {};

        const b = initBones(vrm);
        Object.assign(bonesRef.current, b);

        removeAccessoryObjects(vrm);

        scene.add(vrm.scene);
        vrmRef.current = vrm;
        vrm.scene.rotation.y = Math.PI;

        const hasVRM1 = !!vrm.expressionManager;
        const hasVRM0 = !!vrm.blendShapeProxy;

        setTimeout(() => {
          if (!destroyed) {
            applyExpression("happy", 0.3);
          }
        }, 100);

        applySilentPose(bonesRef.current);

        let lastFrameTime = performance.now();
        let breathElapsed = 0;
        let lastBlink = 0;
        let isBlinking = false;
        let blinkProgress = 0;
        let waveOscillator = 0;
        let bubbleShown = false;
        let greetingScheduled = false;
        const greetingDelay = 800;
        const initTime = performance.now();

        const animate = () => {
          if (destroyed) return;
          animIdRef.current = requestAnimationFrame(animate);

          const now = performance.now();
          const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
          lastFrameTime = now;
          const elapsed = clockRef.current.elapsedTime;

          if (!greetingScheduled && !hasGreetedRef.current && now - initTime >= greetingDelay) {
            greetingScheduled = true;
            const greetingIdx = GESTURES.findIndex((g) => g.name === "greeting");
            if (greetingIdx >= 0) {
              gestureRef.current = { index: greetingIdx, start: now, active: true };
              hasGreetedRef.current = true;
              applyExpression("happy", 0.8);
            }
          }

          breathElapsed += delta;

          try {
            const breathY = Math.sin(breathElapsed * 1.2) * 0.004;
            const breathSway = Math.sin(breathElapsed * 0.8) * 0.002;
            vrm.scene.position.set(breathSway, breathY, 0);

            if (!gestureRef.current.active) {
              vrm.scene.rotation.y = Math.PI + Math.sin(elapsed * 0.4) * 0.06;
            }

            let targetRotX = -mouseRef.current.y * 0.2;
            let targetRotY = mouseRef.current.x * 0.35;
            let targetRotZ = 0;
            const g = GESTURES[gestureRef.current.index];
            if (g?.lookAt && gestureRef.current.active) {
              targetRotX += g.lookAt.y * 0.3;
              targetRotY += g.lookAt.x * 0.3;
              if (g.tilt) targetRotZ = g.tilt;
            }
            if (g?.name === "think" && isThinkingRef.current) {
              targetRotY += Math.sin(now * 0.0007) * 0.08;
              targetRotX += Math.sin(now * 0.0005 + 1.2) * 0.03;
            }

            if (bonesRef.current.head) {
              bonesRef.current.head.rotation.x = lerp(
                bonesRef.current.head.rotation.x,
                targetRotX,
                0.06
              );
              bonesRef.current.head.rotation.y = lerp(
                bonesRef.current.head.rotation.y,
                targetRotY,
                0.06
              );
              bonesRef.current.head.rotation.z = lerp(
                bonesRef.current.head.rotation.z,
                targetRotZ,
                0.06
              );
            }

            if (vrm.update) vrm.update(delta);

            if (!gestureRef.current.active || (g && g.name !== "greeting")) {
              applyExpression("happy", 0.5);
            }

            // 手臂姿势控制
            if (!gestureRef.current.active) {
              applySilentPose(bonesRef.current);
            } else if (g) {
              const t = Math.min(1, (now - gestureRef.current.start) / g.duration);
              const e = easeInOut(t);

              if (g.name === "greeting") {
                let talkIntensity = 0;
                let waveIntensity = 1;

                if (t < 0.1) {
                  waveIntensity = t / 0.1;
                } else if (t > 0.85) {
                  waveIntensity = (1 - t) / 0.15;
                }

                if (t > 0.08 && t < 0.92) {
                  talkIntensity = 1;
                }

                const enterE = Math.min(1, t / 0.15);
                const exitE = t > 0.85 ? Math.max(0, (1 - t) / 0.15) : 1;
                const greetE = enterE * exitE;
                applyGestureSlerp(bonesRef.current, g.target, greetE);

                waveOscillator += delta * 6;
                const waveAmt = Math.sin(waveOscillator) * 0.3 * waveIntensity;
                const waveRotX = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(1, 0, 0),
                  waveAmt * 0.4
                );
                const waveRotZ = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(0, 0, 1),
                  waveAmt * 0.15
                );
                const rightUABone = bonesRef.current.rightUpperArm;
                const rightFABone = bonesRef.current.rightLowerArm;
                if (rightUABone) {
                  const q = rightUABone.quaternion.clone();
                  q.multiply(
                    new THREE.Quaternion().setFromAxisAngle(
                      new THREE.Vector3(0, 0, 1),
                      waveAmt * 0.1
                    )
                  );
                  rightUABone.quaternion.copy(q);
                }
                if (rightFABone) {
                  const q = rightFABone.quaternion.clone();
                  q.multiply(waveRotX).multiply(waveRotZ);
                  rightFABone.quaternion.copy(q);
                }

                applyExpression("fun", 0.6);
                applyExpression("winkLeft", 0.8);

                if (talkIntensity > 0) {
                  const mouthOpen = Math.max(0, Math.sin(now * 0.015)) * 0.3 * talkIntensity;
                  applyExpression("aa", mouthOpen);
                }

                const bubble = bubbleRef.current;
                if (g.greeting && bubble) {
                  if (t > 0.08 && !bubbleShown) {
                    bubbleShown = true;
                    bubble.textContent = greetingRef.current;
                    bubble.style.opacity = "1";
                    bubble.style.transform = "translateX(-50%) scale(1)";
                    typewriterEffect(bubble, greetingRef.current, 40);
                  }
                  if (t > 0.6 && bubbleShown) {
                    bubbleShown = false;
                    bubble.style.opacity = "0";
                    bubble.style.transform = "translateX(-50%) scale(0.7)";
                  }
                }

                if (t >= 1) {
                  gestureRef.current.active = false;
                  waveOscillator = 0;
                  vrm.scene.position.y = 0;
                  vrm.scene.rotation.y = Math.PI;
                  applyExpression("fun", 0);
                  applyExpression("winkLeft", 0);
                  applyExpression("happy", 0.5);
                  if (bubble) {
                    bubbleShown = false;
                    bubble.style.opacity = "0";
                    bubble.style.transform = "translateX(-50%) scale(0.7)";
                  }
                  applySilentPose(bonesRef.current);
                }
              } else if (g.name === "think") {
                let currentT = (now - gestureRef.current.start) / g.duration;
                if (isThinkingRef.current && currentT >= 0.8) {
                  gestureRef.current.start = now - g.duration * 0.8;
                  currentT = 0.8;
                }
                const thinkE = Math.min(1, currentT * 2);
                applyGestureSlerp(bonesRef.current, g.target, thinkE);

                if (currentT >= 1) {
                  gestureRef.current.active = false;
                  waveOscillator = 0;
                  vrm.scene.position.y = 0;
                  vrm.scene.rotation.y = Math.PI;
                  applySilentPose(bonesRef.current);
                }
              } else {
                applyGestureSlerp(bonesRef.current, g.target, e);

                if (t >= 1) {
                  gestureRef.current.active = false;
                  waveOscillator = 0;
                  vrm.scene.position.y = 0;
                  vrm.scene.rotation.y = Math.PI;
                  applySilentPose(bonesRef.current);
                }
              }
            }

            // 眨眼动画
            const nowSec = elapsed;
            if (nowSec - lastBlink > 3.5 + Math.random() * 2) {
              isBlinking = true;
              lastBlink = nowSec;
            }
            if (isBlinking) {
              blinkProgress += delta * 14;
              const bv = Math.max(0, Math.sin(blinkProgress * Math.PI));
              try {
                if (hasVRM1 && vrm.expressionManager) {
                  const bl = vrm.expressionManager.getExpression("blinkLeft");
                  const br = vrm.expressionManager.getExpression("blinkRight");
                  if (bl) bl.value = bv;
                  if (br) br.value = bv;
                } else if (hasVRM0 && vrm.blendShapeProxy) {
                  try {
                    vrm.blendShapeProxy.setValue("Blink", bv);
                  } catch {}
                }
              } catch {}
              if (blinkProgress >= 1) {
                isBlinking = false;
                blinkProgress = 0;
              }
            }

            renderer.render(scene, camera);
          } catch (e) {
            console.warn("[Avatar] render:", e);
          }
        };

        animate();
        setIsLoaded(true);
      } catch (err) {
        console.error("[Avatar] VRM failed:", err);
        setLoadError(String(err));
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    init();

    return () => {
      destroyed = true;
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animIdRef.current);
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch {}
        rendererRef.current = null;
      }
    };
  }, [handleMouseMove, triggerGreeting, applyExpression]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const result = await invoke<boolean>("sync_chat_window");
        if (!result) return;
      } catch {
        // ignore
      }
    }, 50);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && !gestureRef.current.active) {
        hasGreetedRef.current = false;
        const greetIdx = GESTURES.findIndex((g) => g.name === "greeting");
        if (greetIdx >= 0) {
          gestureRef.current = { index: greetIdx, start: performance.now(), active: true };
          hasGreetedRef.current = true;
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".chat-input-wrapper")) return;
    getCurrentWindow().startDragging();
  };

  return (
    <ErrorBoundary title={t("avatar.loadError")}>
      <div
        className={styles["avatar-window"]}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <canvas ref={canvasRef} className={styles["vrm-canvas"]} />

        <button
          className={`${styles["avatar-close-btn"]} ${isHovering ? styles.visible : ""}`}
          onClick={() => invoke("hide_avatar_window")}
          onMouseDown={(e) => e.stopPropagation()}
          title={t("avatar.close")}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div ref={bubbleRef} className={styles["speech-bubble"]} />

        {isThinking && (
          <div className={styles["thinking-bubbles"]}>
            <div className={styles["thinking-bubble-sm"]} />
            <div className={styles["thinking-bubble-md"]} />
            <div className={styles["thinking-bubble-lg"]}>?</div>
          </div>
        )}

        {(isHovering || isWaitingResponse) && attachedFiles.length > 0 && (
          <div className={styles["avatar-file-display-area"]}>
            <div className={styles["avatar-file-display-list"]}>
              {attachedFiles.map((f, i) => (
                <div key={i} className={styles["avatar-file-display-item"]}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <span className={styles["avatar-file-display-name"]}>{f.name}</span>
                  <button
                    className={styles["avatar-file-display-remove"]}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttachedFiles(
                        useChatStore
                          .getState()
                          .attachedFiles.filter((_: AttachedFile, j: number) => j !== i)
                      );
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={`${styles["chat-input-wrapper"]} ${isHovering || isWaitingResponse || isInputFocused || inputText.length > 0 ? styles.visible : ""} ${isDragging ? styles.dragging : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const files = e.dataTransfer.files;
            const newFiles: AttachedFile[] = [];
            for (let i = 0; i < files.length; i++) {
              const f = files[i];
              newFiles.push({ name: f.name, path: (f as File & { path?: string }).path || f.name });
            }
            if (newFiles.length > 0)
              setAttachedFiles([...useChatStore.getState().attachedFiles, ...newFiles]);
          }}
        >
          {isDragging && (
            <div className={styles["avatar-drag-overlay"]}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{t("avatar.dropFiles")}</span>
            </div>
          )}
          <div className={styles["avatar-input-row"]}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                const newFiles: AttachedFile[] = [];
                for (let i = 0; i < files.length; i++) {
                  const f = files[i];
                  try {
                    const buffer = await f.arrayBuffer();
                    const bytes = Array.from(new Uint8Array(buffer));
                    const tempPath = await invoke<string>("save_temp_file", {
                      fileName: f.name,
                      fileBytes: bytes,
                    });
                    newFiles.push({ name: f.name, path: tempPath });
                  } catch (err) {
                    console.error("Failed to save temp file:", f.name, err);
                  }
                }
                if (newFiles.length > 0) {
                  setAttachedFiles([...useChatStore.getState().attachedFiles, ...newFiles]);
                }
                e.target.value = "";
              }}
            />
            <button
              className={styles["avatar-attach-btn"]}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isWaitingResponse}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={inputRef}
              className={styles["chat-input"]}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                queueMicrotask(() => {
                  isComposingRef.current = false;
                });
              }}
              placeholder={t("avatar.inputPlaceholder")}
              disabled={isWaitingResponse}
            />
            <button
              className={styles["chat-send-btn"]}
              onClick={(e) => {
                e.stopPropagation();
                handleSendMessage();
              }}
              disabled={isWaitingResponse || (!inputText.trim() && attachedFiles.length === 0)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {!isLoaded && !loadError && (
          <div className={styles["loading-indicator"]}>
            <div className={styles["loading-spinner-avatar"]} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
