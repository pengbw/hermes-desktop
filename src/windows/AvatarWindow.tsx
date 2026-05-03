import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMHumanBoneName } from "@pixiv/three-vrm";
import "./AvatarWindow.css";

// 对话消息类型
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  emotion?: string;
  files?: string;
}

interface AttachedFile {
  name: string;
  path: string;
}

// VRM 模型路径
const MODEL_PATH = "/vrm/miko.vrm";

// 角色自然站立时的默认骨骼姿势（四元数旋转值）
// 包含右臂、右手及五指骨骼的初始位置
let GESTURES: any[] = [];

function findGesture(name: string) {
  return GESTURES.find(g => g.name === name);
}

function getSilentTarget(): Record<string, { x: number; y: number; z: number; w: number }> {
  const silent = findGesture("silent");
  return silent?.target || {};
}

function applySilentPose(bones: Record<string, THREE.Object3D | null>) {
  const target = getSilentTarget();
  if (Object.keys(target).length > 0) {
    applyGestureSlerp(bones, target, 1);
  } else {
    applyRestPose(bones);
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function slerpPose(base: { x: number; y: number; z: number; w: number }, target: { x: number; y: number; z: number; w: number }, t: number) {
  const qa = new THREE.Quaternion(base.x, base.y, base.z, base.w);
  const qb = new THREE.Quaternion(target.x, target.y, target.z, target.w);
  const result = new THREE.Quaternion().slerpQuaternions(qa, qb, t);
  return { x: result.x, y: result.y, z: result.z, w: result.w };
}

function getHumanoidBone(vrm: any, boneName: VRMHumanBoneName): THREE.Object3D | null {
  try {
    if (vrm.humanoid) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName);
      if (node) return node;
    }
  } catch { }
  return null;
}

function findBoneInScene(vrm: any, namePart: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  vrm.scene.traverse((obj: THREE.Object3D) => {
    if (!found && (obj as any).isBone && obj.name.toLowerCase().includes(namePart.toLowerCase())) {
      found = obj;
    }
  });
  return found;
}

function setBoneRotation(bone: THREE.Object3D | null, rot: { x: number; y: number; z: number; w: number }) {
  if (bone) bone.quaternion.set(rot.x, rot.y, rot.z, rot.w);
}

function applyRestPose(bones: Record<string, THREE.Object3D | null>) {
  const silentTarget = getSilentTarget();
  if (Object.keys(silentTarget).length > 0) {
    for (const [key, rot] of Object.entries(silentTarget)) {
      setBoneRotation(bones[key], rot as { x: number; y: number; z: number; w: number });
    }
  } else {
    for (const [, bone] of Object.entries(bones)) {
      if (bone) bone.quaternion.set(0, 0, 0, 1);
    }
  }
}

function applyGestureSlerp(
  bones: Record<string, THREE.Object3D | null>,
  target: Record<string, { x: number; y: number; z: number; w: number }>,
  t: number,
) {
  const silentTarget = getSilentTarget();
  const allKeys = new Set([...Object.keys(silentTarget), ...Object.keys(target)]);
  for (const key of allKeys) {
    const restRot = (silentTarget[key] as { x: number; y: number; z: number; w: number }) || { x: 0, y: 0, z: 0, w: 1 };
    const targetRot = target[key] || restRot;
    setBoneRotation(bones[key], slerpPose(restRot, targetRot, t));
  }
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<any>(null);
  const clockRef = useRef(new THREE.Clock());
  const animIdRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  const bonesRef = useRef<Record<string, THREE.Object3D | null>>({});

  const gestureRef = useRef<{ index: number; start: number; active: boolean }>({ index: -1, start: 0, active: false });
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);


  const [inputText, setInputText] = useState("");
  const [isHovering, setIsHovering] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const isThinkingRef = useRef(false);
  const [isWaitingResponse, setIsWaitingResponse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatWindowRef = useRef<WebviewWindow | null>(null);
  const chatSideRef = useRef<"right" | "left">("right");
  const avatarConvIdRef = useRef<string | null>(null);
  const hermesSessionIdRef = useRef<string | null>(null);

  const expressionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, []);

  const hasGreetedRef = useRef(false);

  const triggerGreeting = useCallback(() => {
    const greetIdx = GESTURES.findIndex(g => g.name === "greeting");
    if (greetIdx >= 0) {
      gestureRef.current = { index: greetIdx, start: performance.now(), active: true };
      hasGreetedRef.current = true;
    }
  }, []);

  const applyExpression = useCallback((name: string, val: number, duration?: number) => {
    try {
      const vrm = vrmRef.current;
      if (!vrm) return;

      const hasVRM1 = !!vrm.expressionManager;
      const hasVRM0 = !!vrm.blendShapeProxy;

      const expressionMap: Record<string, string> = {
        happy: hasVRM1 ? "happy" : "Joy",
        fun: hasVRM1 ? "fun" : "Fun",
        angry: hasVRM1 ? "angry" : "Angry",
        sad: hasVRM1 ? "sad" : "Sorrow",
        surprised: hasVRM1 ? "surprised" : "Surprise",
        neutral: hasVRM1 ? "neutral" : "Joy",
        aa: hasVRM1 ? "aa" : "A",
        winkLeft: hasVRM1 ? "blinkLeft" : "Blink_L",
      };

      const mappedName = expressionMap[name] || name;

      if (hasVRM1 && vrm.expressionManager) {
        const expr = vrm.expressionManager.getExpression(mappedName);
        if (expr) {
          expr.value = Math.min(1, Math.max(0, val));
        }
      } else if (hasVRM0 && vrm.blendShapeProxy) {
        const cur = vrm.blendShapeProxy.getValue(mappedName) ?? 0;
        vrm.blendShapeProxy.setValue(mappedName, lerp(cur, val, 0.3));
      }

      if (duration) {
        if (expressionTimeoutRef.current) clearTimeout(expressionTimeoutRef.current);
        expressionTimeoutRef.current = setTimeout(() => {
          applyExpression("neutral", 0);
          if (name === "happy") applyExpression("happy", 0.3);
        }, duration);
      }
    } catch (err) {
      console.warn("[Avatar] Expression failed:", err);
    }
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

    const chatX = side === "right"
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

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if ((!text && attachedFiles.length === 0) || isWaitingResponse) return;

    console.log("[Avatar] 发送消息:", text);
    setInputText("");

    const filesJson = attachedFiles.length > 0 ? JSON.stringify(attachedFiles) : undefined;

    const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
    const firstImage = attachedFiles.find((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && imageExtensions.includes(ext);
    });
    const imagePath = firstImage?.path;

    setAttachedFiles([]);

    let messageContent = text || (filesJson ? "请分析附件中的文件" : "");
    let sendContent = messageContent;

    if (filesJson) {
      try {
        const files: AttachedFile[] = JSON.parse(filesJson);
        const nonImageFiles = files.filter((f) => {
          const ext = f.name.split(".").pop()?.toLowerCase();
          return !imageExtensions.includes(ext || "");
        });
        if (nonImageFiles.length > 0) {
          const fileList = nonImageFiles.map((f) => `- ${f.name}: ${f.path}`).join("\n");
          sendContent = `${sendContent}\n\n附件文件路径：\n${fileList}`;
        }
      } catch {}
    }

    if (!avatarConvIdRef.current) {
      try {
        const existing = await invoke<{ id: string; hermesSessionId: string | null } | null>("get_avatar_conversation");
        if (existing) {
          avatarConvIdRef.current = existing.id;
          hermesSessionIdRef.current = existing.hermesSessionId;
        } else {
          const conv = await invoke<{ id: string; hermesSessionId: string | null }>("create_avatar_conversation");
          avatarConvIdRef.current = conv.id;
          hermesSessionIdRef.current = conv.hermesSessionId;
        }
      } catch (e) {
        console.error("[Avatar] 获取/创建会话失败:", e);
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      files: filesJson,
      timestamp: Date.now(),
    };

    setIsThinking(true);
    isThinkingRef.current = true;
    setIsWaitingResponse(true);

    try {
      await invoke("create_message", {
        req: { conversationId: avatarConvIdRef.current, role: userMsg.role, content: userMsg.content, files: filesJson || null },
      });
    } catch (e) {
      console.error("[Avatar] 保存用户消息失败:", e);
    }
    openChatWindow();

    applyExpression("surprised", 0.5);

    const thinkIdx = GESTURES.findIndex(g => g.name === "think");
    if (thinkIdx >= 0) {
      gestureRef.current = { index: thinkIdx, start: performance.now(), active: true };
    }

    try {
      console.log("[Avatar] 调用 chat_with_hermes_api...");
      const eventId = `avatar_chat_stream_${Date.now()}`;
      let fullContent = "";

      const unlisten = await listen<{
        chunk: string;
        done: boolean;
        event_type?: string;
        tool_name?: string;
        tool_label?: string;
      }>(eventId, (event) => {
        const { chunk, done, event_type, tool_label } = event.payload;

        if (done) {
          const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: fullContent,
            timestamp: Date.now(),
            emotion: "happy",
          };

          setIsThinking(false);
          isThinkingRef.current = false;
          setIsWaitingResponse(false);
          applyExpression("happy", 0.8, 3000);

          (async () => {
            try {
              await invoke("create_message", {
                req: { conversationId: avatarConvIdRef.current, role: aiMsg.role, content: aiMsg.content },
              });
            } catch (e) {
              console.error("[Avatar] 保存AI消息失败:", e);
            }
          })();

          unlisten();
        } else if (event_type === "tool_progress") {
          console.log("[Avatar] 工具进度:", tool_label || chunk);
          applyExpression("surprised", 0.4);
        } else if (event_type === "error") {
          setIsThinking(false);
          isThinkingRef.current = false;
          setIsWaitingResponse(false);
          applyExpression("sad", 0.5, 2000);
        } else {
          fullContent += chunk;
        }
      });

      await invoke("chat_with_hermes_api", {
        message: sendContent,
        sessionId: hermesSessionIdRef.current,
        model: null,
        provider: null,
        image: imagePath || null,
        eventId: eventId,
      });
    } catch (err) {
      console.error("[Avatar] Chat error:", err);
      setIsThinking(false);
      isThinkingRef.current = false;
      setIsWaitingResponse(false);
      applyExpression("sad", 0.5, 2000);

      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "抱歉，出了点问题...",
        timestamp: Date.now(),
      };
      try {
        await invoke("create_message", {
          req: { conversationId: avatarConvIdRef.current, role: errMsg.role, content: errMsg.content },
        });
      } catch (e) {
        console.error("[Avatar] 保存错误消息失败:", e);
      }
    }
  }, [inputText, isWaitingResponse, attachedFiles, applyExpression, openChatWindow]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    const init = async () => {
      try {
        try {
          const gestures = await invoke<any[]>("get_avatar_gestures");
          if (gestures && gestures.length > 0) {
            GESTURES = gestures.map(g => {
              const rawTarget = JSON.parse(g.targetJson || "{}");
              const target: Record<string, { x: number; y: number; z: number; w: number }> = {};
              for (const [boneName, boneData] of Object.entries(rawTarget)) {
                const v = boneData as any;
                if (v && Array.isArray(v.rotation) && v.rotation.length === 4) {
                  target[boneName] = { x: v.rotation[0], y: v.rotation[1], z: v.rotation[2], w: v.rotation[3] };
                } else if (v && typeof v.w === 'number') {
                  target[boneName] = { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0, w: v.w };
                }
              }
              return {
                name: g.name,
                duration: g.duration,
                lookAt: { x: g.lookAtX, y: g.lookAtY },
                tilt: g.tilt,
                target,
                greeting: g.name === "greeting" ? "你好呀！" : undefined,
              };
            });
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

        const b = bonesRef.current;
        const boneMap: Record<string, VRMHumanBoneName> = {
          hips: VRMHumanBoneName.Hips,
          spine: VRMHumanBoneName.Spine,
          chest: VRMHumanBoneName.Chest,
          upperChest: VRMHumanBoneName.UpperChest,
          neck: VRMHumanBoneName.Neck,
          head: VRMHumanBoneName.Head,
          leftEye: VRMHumanBoneName.LeftEye,
          rightEye: VRMHumanBoneName.RightEye,
          leftUpperLeg: VRMHumanBoneName.LeftUpperLeg,
          leftLowerLeg: VRMHumanBoneName.LeftLowerLeg,
          leftFoot: VRMHumanBoneName.LeftFoot,
          leftToes: VRMHumanBoneName.LeftToes,
          rightUpperLeg: VRMHumanBoneName.RightUpperLeg,
          rightLowerLeg: VRMHumanBoneName.RightLowerLeg,
          rightFoot: VRMHumanBoneName.RightFoot,
          rightToes: VRMHumanBoneName.RightToes,
          leftShoulder: VRMHumanBoneName.LeftShoulder,
          leftUpperArm: VRMHumanBoneName.LeftUpperArm,
          leftLowerArm: VRMHumanBoneName.LeftLowerArm,
          leftHand: VRMHumanBoneName.LeftHand,
          rightShoulder: VRMHumanBoneName.RightShoulder,
          rightUpperArm: VRMHumanBoneName.RightUpperArm,
          rightLowerArm: VRMHumanBoneName.RightLowerArm,
          rightHand: VRMHumanBoneName.RightHand,
          leftThumbMetacarpal: VRMHumanBoneName.LeftThumbMetacarpal,
          leftThumbProximal: VRMHumanBoneName.LeftThumbProximal,
          leftThumbDistal: VRMHumanBoneName.LeftThumbDistal,
          leftIndexProximal: VRMHumanBoneName.LeftIndexProximal,
          leftIndexIntermediate: VRMHumanBoneName.LeftIndexIntermediate,
          leftIndexDistal: VRMHumanBoneName.LeftIndexDistal,
          leftMiddleProximal: VRMHumanBoneName.LeftMiddleProximal,
          leftMiddleIntermediate: VRMHumanBoneName.LeftMiddleIntermediate,
          leftMiddleDistal: VRMHumanBoneName.LeftMiddleDistal,
          leftRingProximal: VRMHumanBoneName.LeftRingProximal,
          leftRingIntermediate: VRMHumanBoneName.LeftRingIntermediate,
          leftRingDistal: VRMHumanBoneName.LeftRingDistal,
          leftLittleProximal: VRMHumanBoneName.LeftLittleProximal,
          leftLittleIntermediate: VRMHumanBoneName.LeftLittleIntermediate,
          leftLittleDistal: VRMHumanBoneName.LeftLittleDistal,
          rightThumbMetacarpal: VRMHumanBoneName.RightThumbMetacarpal,
          rightThumbProximal: VRMHumanBoneName.RightThumbProximal,
          rightThumbDistal: VRMHumanBoneName.RightThumbDistal,
          rightIndexProximal: VRMHumanBoneName.RightIndexProximal,
          rightIndexIntermediate: VRMHumanBoneName.RightIndexIntermediate,
          rightIndexDistal: VRMHumanBoneName.RightIndexDistal,
          rightMiddleProximal: VRMHumanBoneName.RightMiddleProximal,
          rightMiddleIntermediate: VRMHumanBoneName.RightMiddleIntermediate,
          rightMiddleDistal: VRMHumanBoneName.RightMiddleDistal,
          rightRingProximal: VRMHumanBoneName.RightRingProximal,
          rightRingIntermediate: VRMHumanBoneName.RightRingIntermediate,
          rightRingDistal: VRMHumanBoneName.RightRingDistal,
          rightLittleProximal: VRMHumanBoneName.RightLittleProximal,
          rightLittleIntermediate: VRMHumanBoneName.RightLittleIntermediate,
          rightLittleDistal: VRMHumanBoneName.RightLittleDistal,
        };
        for (const [key, boneName] of Object.entries(boneMap)) {
          b[key] = getHumanoidBone(vrm, boneName);
        }
        b.head = b.head || findBoneInScene(vrm, "Head");
        b.leftUpperArm = b.leftUpperArm || findBoneInScene(vrm, "LeftArm");
        b.rightUpperArm = b.rightUpperArm || findBoneInScene(vrm, "RightArm");
        b.leftLowerArm = b.leftLowerArm || findBoneInScene(vrm, "LeftForeArm");
        b.rightLowerArm = b.rightLowerArm || findBoneInScene(vrm, "RightForeArm");
        b.leftHand = b.leftHand || findBoneInScene(vrm, "J_Bip_L_Hand");
        b.rightHand = b.rightHand || findBoneInScene(vrm, "J_Bip_R_Hand");

        console.log("[Avatar] bones:", {
          head: b.head?.name ?? "NULL",
          leftUpperArm: b.leftUpperArm?.name ?? "NULL",
          rightUpperArm: b.rightUpperArm?.name ?? "NULL",
          leftLowerArm: b.leftLowerArm?.name ?? "NULL",
          rightLowerArm: b.rightLowerArm?.name ?? "NULL",
          rightHand: b.rightHand?.name ?? "NULL",
        });

        const toRemove: THREE.Object3D[] = [];
        vrm.scene.traverse((obj: THREE.Object3D) => {
          if ((obj as any).isBone || obj.type === "Scene" || obj.type === "Group" || obj.type === "Object3D") return;
          const n = obj.name.toLowerCase();
          if (/^(email|mail|icon|button|badge|chat|social|notify|talk|bell|home|gear|tool|star|heart|like|share|msg|call|phone|mess|notif|alarm)/.test(n)) {
            toRemove.push(obj);
          }
        });
        for (const obj of toRemove) {
          obj.parent?.remove(obj);
        }

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

          if (!greetingScheduled && !hasGreetedRef.current && (now - initTime) >= greetingDelay) {
            greetingScheduled = true;
            const greetingIdx = GESTURES.findIndex(g => g.name === "greeting");
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
              if ((g as any).tilt) targetRotZ = (g as any).tilt;
            }
            if (g?.name === "think" && isThinkingRef.current) {
              targetRotY += Math.sin(now * 0.0007) * 0.08;
              targetRotX += Math.sin(now * 0.0005 + 1.2) * 0.03;
            }

            if (bonesRef.current.head) {
              bonesRef.current.head.rotation.x = lerp(bonesRef.current.head.rotation.x, targetRotX, 0.06);
              bonesRef.current.head.rotation.y = lerp(bonesRef.current.head.rotation.y, targetRotY, 0.06);
              bonesRef.current.head.rotation.z = lerp(bonesRef.current.head.rotation.z, targetRotZ, 0.06);
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
                const waveRotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), waveAmt * 0.4);
                const waveRotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), waveAmt * 0.15);
                const rightUABone = bonesRef.current.rightUpperArm;
                const rightFABone = bonesRef.current.rightLowerArm;
                if (rightUABone) {
                  const q = rightUABone.quaternion.clone();
                  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), waveAmt * 0.1));
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
                    bubble.textContent = g.greeting;
                    bubble.style.opacity = "1";
                    bubble.style.transform = "translateX(-50%) scale(1)";
                    typewriterEffect(bubble, g.greeting, 40);
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
                  try { vrm.blendShapeProxy.setValue("Blink", bv); } catch { }
                }
              } catch { }
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
      if (expressionTimeoutRef.current) clearTimeout(expressionTimeoutRef.current);
      if (rendererRef.current) {
        try { rendererRef.current.dispose(); } catch { }
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
        const greetIdx = GESTURES.findIndex(g => g.name === "greeting");
        if (greetIdx >= 0) {
          gestureRef.current = { index: greetIdx, start: performance.now(), active: true };
          hasGreetedRef.current = true;
        }
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".chat-input-wrapper")) return;
    getCurrentWindow().startDragging();
  };

  return (
    <div
      className="avatar-window"
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <canvas ref={canvasRef} className="vrm-canvas" />

      <button
        className={`avatar-close-btn ${isHovering ? "visible" : ""}`}
        onClick={() => invoke("hide_avatar_window")}
        onMouseDown={(e) => e.stopPropagation()}
        title="关闭数字人"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div ref={bubbleRef} className="speech-bubble" />

      {isThinking && (
        <div className="thinking-bubbles">
          <div className="thinking-bubble-sm" />
          <div className="thinking-bubble-md" />
          <div className="thinking-bubble-lg">?</div>
        </div>
      )}

      {(isHovering || isWaitingResponse) && attachedFiles.length > 0 && (
        <div className="avatar-file-display-area">
          <div className="avatar-file-display-list">
            {attachedFiles.map((f, i) => (
              <div key={i} className="avatar-file-display-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <span className="avatar-file-display-name">{f.name}</span>
                <button className="avatar-file-display-remove" onClick={(e) => { e.stopPropagation(); setAttachedFiles(prev => prev.filter((_, j) => j !== i)); }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className={`chat-input-wrapper ${isHovering || isWaitingResponse ? "visible" : ""} ${isDragging ? "dragging" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          const files = e.dataTransfer.files;
          const newFiles: AttachedFile[] = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            newFiles.push({ name: f.name, path: (f as any).path || f.name });
          }
          if (newFiles.length > 0) setAttachedFiles(prev => [...prev, ...newFiles]);
        }}
      >
        {isDragging && (
          <div className="avatar-drag-overlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>释放文件</span>
          </div>
        )}
        <div className="avatar-input-row">
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
                setAttachedFiles(prev => [...prev, ...newFiles]);
              }
              e.target.value = "";
            }}
          />
          <button
            className="avatar-attach-btn"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            disabled={isWaitingResponse}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            disabled={isWaitingResponse}
          />
          <button
            className="chat-send-btn"
            onClick={(e) => { e.stopPropagation(); handleSendMessage(); }}
            disabled={isWaitingResponse || (!inputText.trim() && attachedFiles.length === 0)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {!isLoaded && !loadError && (
        <div className="loading-indicator">
          <div className="loading-spinner-avatar" />
        </div>
      )}
    </div>
  );
}