import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
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
}

// VRM 模型路径
const MODEL_PATH = "/vrm/miko.vrm";

// 角色自然站立时的默认骨骼姿势（欧拉角旋转值，单位：弧度）
// 包含右臂、右手及五指骨骼的初始位置
const REST_POSE = {
  // 左大臂
  leftUpperArm: { x: 0, y: 0, z: 1.30 },
  // 右大臂
  rightUpperArm: { x: 0, y: 0, z: -1.30 },
  // 左前臂
  leftForeArm: { x: 0, y: 0, z: 0.1 },
  // 右前臂
  rightForeArm: { x: 0, y: 0, z: -0.1 },
  // 右手腕
  rightHand: { x: 0, y: 0.1, z: -0.2 },
  // 左手腕
  leftHand: { x: 0, y: 0.1, z: 0.2 },
  // 右手拇指三节骨骼
  rightThumb1: { x: 0, y: 0, z: 0 },
  rightThumb2: { x: 0, y: 0, z: 0 },
  rightThumb3: { x: 0, y: 0, z: 0 },
  // 右手食指三节骨骼
  rightIndex1: { x: 0, y: 0, z: 0 },
  rightIndex2: { x: 0, y: 0, z: 0 },
  rightIndex3: { x: 0, y: 0, z: 0 },
  // 右手中指三节骨骼
  rightMiddle1: { x: 0, y: 0, z: 0 },
  rightMiddle2: { x: 0, y: 0, z: 0 },
  rightMiddle3: { x: 0, y: 0, z: 0 },
  // 右手无名指三节骨骼
  rightRing1: { x: 0, y: 0, z: 0 },
  rightRing2: { x: 0, y: 0, z: 0 },
  rightRing3: { x: 0, y: 0, z: 0 },
  // 右手小指三节骨骼
  rightLittle1: { x: 0, y: 0, z: 0 },
  rightLittle2: { x: 0, y: 0, z: 0 },
  rightLittle3: { x: 0, y: 0, z: 0 },
};

// 角色动作定义数组
// 每个动作包含：名称、持续时间、目标骨骼姿势、视线方向、问候语等
let GESTURES: any[] = [
  {
    name: "initialGreeting",
    duration: 6000,
    target: {
      // --- 核心修改：直接复制了 think 动作的托腮参数 ---
    leftUpperArm: { x: 0, y: 0, z: 1.30 },   // 左大臂保持基础位置（不乱动）
    rightUpperArm: { x: -1, y: 1, z: 0.5 },  // 右大臂：抬起向脸部靠拢
    leftForeArm: { x: 0, y: 0, z: 0.1 },     // 左前臂保持
    rightForeArm: { x: 2, y: 2, z: 0 },      // 右前臂：大幅弯曲（关键！让手肘向后）
    rightHand: { x: -0.2, y: 0.1, z: -0.2 }, // 右手：手掌贴向脸颊
    
    // --- 手指姿势：保持自然或微握 ---
    // （保留了原本 think 动作里手指微握的参数，看起来更像托腮）
    rightThumb1: { x: 0.3, y: 0.3, z: 0.2 },
    rightThumb2: { x: 0.2, y: 0, z: 0 },
    rightThumb3: { x: 0.2, y: 0, z: 0 },
    rightIndex1: { x: 0, y: 0, z: -0.3 },
    rightIndex2: { x: 0, y: 0, z: -0.2 },
    rightIndex3: { x: 0, y: 0, z: -0.2 },
    rightMiddle1: { x: 0, y: 0, z: -0.3 },
    rightMiddle2: { x: 0, y: 0, z: -0.2 },
    rightMiddle3: { x: 0, y: 0, z: -0.2 },
    rightRing1: { x: 0, y: 0, z: -0.3 },
    rightRing2: { x: 0, y: 0, z: -0.2 },
    rightRing3: { x: 0, y: 0, z: -0.2 },
    rightLittle1: { x: 0, y: 0, z: -0.3 },
    rightLittle2: { x: 0, y: 0, z: -0.2 },
    rightLittle3: { x: 0, y: 0, z: -0.2 },
    },
    lookAt: { x: 0, y: 0 },
    greeting: "你好呀！",
  },
  {
    name: "think",
    duration: 5000,
    target: {
      // --- 右臂：抬起，前臂大幅度弯曲，使手部靠近下巴 ---
      rightUpperArm: { x: -0.4, y: 0.2, z: -0.2 },
      rightForeArm: { x: 2.2, y: 0.2, z: 0.2 },
      rightHand: { x: -0.3, y: 0, z: -0.2 },
      
      // --- 右手手指：收拢形成微握拳状，贴合下巴 ---
      rightThumb1: { x: 0.3, y: -0.1, z: 0.2 },
      rightThumb2: { x: 0.2, y: 0, z: 0 },
      rightThumb3: { x: 0.2, y: 0, z: 0 },
      
      rightIndex1: { x: 0.5, y: 0, z: -0.1 },
      rightIndex2: { x: 0.4, y: 0, z: 0 },
      rightIndex3: { x: 0.3, y: 0, z: 0 },
      
      rightMiddle1: { x: 0.5, y: 0, z: 0.1 },
      rightMiddle2: { x: 0.4, y: 0, z: 0 },
      rightMiddle3: { x: 0.3, y: 0, z: 0 },
      
      rightRing1: { x: 0.5, y: 0, z: 0.2 },
      rightRing2: { x: 0.4, y: 0, z: 0 },
      rightRing3: { x: 0.3, y: 0, z: 0 },
      
      rightLittle1: { x: 0.5, y: 0, z: 0.3 },
      rightLittle2: { x: 0.4, y: 0, z: 0 },
      rightLittle3: { x: 0.3, y: 0, z: 0 },

      // --- 左臂：横跨腹部/胸下，手部托住右臂手肘 ---
      leftUpperArm: { x: 0.2, y: 0.4, z: 0.4 },
      leftForeArm: { x: 1.8, y: -0.2, z: -0.2 },
      leftHand: { x: 0.1, y: 0.2, z: 0.1 },
    },
    // 眼神微侧下方，头部微微倾斜，增加沉思感
    lookAt: { x: 0.2, y: -0.2 }, 
    tilt: -0.1,
  },
];

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpPose(base: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, t: number) {
  return {
    x: lerp(base.x, target.x, t),
    y: lerp(base.y, target.y, t),
    z: lerp(base.z, target.z, t),
  };
}

function getHumanoidBone(vrm: any, boneName: VRMHumanBoneName): THREE.Object3D | null {
  try {
    if (vrm.humanoid) {
      const node = vrm.humanoid.getRawBoneNode(boneName);
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

function setBoneRotation(bone: THREE.Object3D | null, rot: { x: number; y: number; z: number }) {
  if (bone) bone.rotation.set(rot.x, rot.y, rot.z);
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

  useEffect(() => {
    const fetchGestures = async () => {
      try {
        const gestures = await invoke<any[]>("get_avatar_gestures");
        if (gestures && gestures.length > 0) {
          GESTURES = gestures.map(g => ({
            name: g.name,
            duration: g.duration,
            lookAt: { x: g.lookAtX, y: g.lookAtY },
            tilt: g.tilt,
            target: JSON.parse(g.targetJson || "{}"),
            greeting: g.name === "initialGreeting" ? "你好呀！" : undefined,
          }));
        }
      } catch (e) {
        console.error("Failed to load gestures", e);
      }
    };
    fetchGestures();
  }, []);

  const bonesRef = useRef<{
    head: THREE.Object3D | null;
    leftUpperArm: THREE.Object3D | null;
    rightUpperArm: THREE.Object3D | null;
    leftForeArm: THREE.Object3D | null;
    rightForeArm: THREE.Object3D | null;
    leftHand: THREE.Object3D | null;
    rightHand: THREE.Object3D | null;
    rightThumb1: THREE.Object3D | null;
    rightThumb2: THREE.Object3D | null;
    rightThumb3: THREE.Object3D | null;
    rightIndex1: THREE.Object3D | null;
    rightIndex2: THREE.Object3D | null;
    rightIndex3: THREE.Object3D | null;
    rightMiddle1: THREE.Object3D | null;
    rightMiddle2: THREE.Object3D | null;
    rightMiddle3: THREE.Object3D | null;
    rightRing1: THREE.Object3D | null;
    rightRing2: THREE.Object3D | null;
    rightRing3: THREE.Object3D | null;
    rightLittle1: THREE.Object3D | null;
    rightLittle2: THREE.Object3D | null;
    rightLittle3: THREE.Object3D | null;
  }>({ head: null, leftUpperArm: null, rightUpperArm: null, leftForeArm: null, rightForeArm: null, leftHand: null, rightHand: null, rightThumb1: null, rightThumb2: null, rightThumb3: null, rightIndex1: null, rightIndex2: null, rightIndex3: null, rightMiddle1: null, rightMiddle2: null, rightMiddle3: null, rightRing1: null, rightRing2: null, rightRing3: null, rightLittle1: null, rightLittle2: null, rightLittle3: null });

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

  const triggerNextGesture = useCallback(() => {
    // 打过招呼后不再自动触发动作
    if (hasGreetedRef.current) return;
    const greetIdx = GESTURES.findIndex(g => g.name === "initialGreeting");
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

  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isWaitingResponse) return;

    console.log("[Avatar] 发送消息:", text);
    setInputText("");

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
      content: text,
      timestamp: Date.now(),
    };

    setIsThinking(true);
    isThinkingRef.current = true;
    setIsWaitingResponse(true);

    try {
      await invoke("create_message", {
        req: { conversationId: avatarConvIdRef.current, role: userMsg.role, content: userMsg.content },
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
      console.log("[Avatar] 调用 chat_with_agent...");
      const result = await invoke<{ content: string; sessionId: string | null }>("chat_with_agent", {
        message: text,
        sessionId: hermesSessionIdRef.current,
      });
      console.log("[Avatar] 收到回复:", result.content);

      if (result.sessionId && result.sessionId !== hermesSessionIdRef.current) {
        hermesSessionIdRef.current = result.sessionId;
        try {
          await invoke("update_conversation_session_id", {
            id: avatarConvIdRef.current,
            hermesSessionId: result.sessionId,
          });
        } catch (e) {
          console.error("[Avatar] 保存 sessionId 失败:", e);
        }
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.content,
        timestamp: Date.now(),
        emotion: "happy",
      };

      setIsThinking(false);
      isThinkingRef.current = false;
      setIsWaitingResponse(false);
      applyExpression("happy", 0.8, 3000);

      try {
        await invoke("create_message", {
          req: { conversationId: avatarConvIdRef.current, role: aiMsg.role, content: aiMsg.content },
        });
      } catch (e) {
        console.error("[Avatar] 保存AI消息失败:", e);
      }
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
  }, [inputText, isWaitingResponse, applyExpression, openChatWindow]);

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
        b.head = getHumanoidBone(vrm, VRMHumanBoneName.Head) || findBoneInScene(vrm, "Head");
        b.leftUpperArm = getHumanoidBone(vrm, VRMHumanBoneName.LeftUpperArm) || findBoneInScene(vrm, "LeftUpperArm") || findBoneInScene(vrm, "LeftArm");
        b.rightUpperArm = getHumanoidBone(vrm, VRMHumanBoneName.RightUpperArm) || findBoneInScene(vrm, "RightUpperArm") || findBoneInScene(vrm, "RightArm");
        b.leftForeArm = getHumanoidBone(vrm, VRMHumanBoneName.LeftLowerArm) || findBoneInScene(vrm, "LeftForeArm") || findBoneInScene(vrm, "LeftLowerArm");
        b.rightForeArm = getHumanoidBone(vrm, VRMHumanBoneName.RightLowerArm) || findBoneInScene(vrm, "RightForeArm") || findBoneInScene(vrm, "RightLowerArm");
        b.leftHand = getHumanoidBone(vrm, VRMHumanBoneName.LeftHand) || findBoneInScene(vrm, "LeftHand") || findBoneInScene(vrm, "J_Bip_L_Hand");
        b.rightHand = getHumanoidBone(vrm, VRMHumanBoneName.RightHand) || findBoneInScene(vrm, "RightHand") || findBoneInScene(vrm, "J_Bip_R_Hand");
        b.rightThumb1 = findBoneInScene(vrm, "J_Bip_R_Thumb1");
        b.rightThumb2 = findBoneInScene(vrm, "J_Bip_R_Thumb2");
        b.rightThumb3 = findBoneInScene(vrm, "J_Bip_R_Thumb3");
        b.rightIndex1 = findBoneInScene(vrm, "J_Bip_R_Index1");
        b.rightIndex2 = findBoneInScene(vrm, "J_Bip_R_Index2");
        b.rightIndex3 = findBoneInScene(vrm, "J_Bip_R_Index3");
        b.rightMiddle1 = findBoneInScene(vrm, "J_Bip_R_Middle1");
        b.rightMiddle2 = findBoneInScene(vrm, "J_Bip_R_Middle2");
        b.rightMiddle3 = findBoneInScene(vrm, "J_Bip_R_Middle3");
        b.rightRing1 = findBoneInScene(vrm, "J_Bip_R_Ring1");
        b.rightRing2 = findBoneInScene(vrm, "J_Bip_R_Ring2");
        b.rightRing3 = findBoneInScene(vrm, "J_Bip_R_Ring3");
        b.rightLittle1 = findBoneInScene(vrm, "J_Bip_R_Little1");
        b.rightLittle2 = findBoneInScene(vrm, "J_Bip_R_Little2");
        b.rightLittle3 = findBoneInScene(vrm, "J_Bip_R_Little3");

        console.log("[Avatar] bones:", {
          head: b.head?.name ?? "NULL",
          leftUpperArm: b.leftUpperArm?.name ?? "NULL",
          rightUpperArm: b.rightUpperArm?.name ?? "NULL",
          leftForeArm: b.leftForeArm?.name ?? "NULL",
          rightForeArm: b.rightForeArm?.name ?? "NULL",
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

        // 初始设置为自然下垂姿势
        setBoneRotation(bonesRef.current.leftUpperArm, REST_POSE.leftUpperArm);
        setBoneRotation(bonesRef.current.rightUpperArm, REST_POSE.rightUpperArm);
        setBoneRotation(bonesRef.current.leftForeArm, REST_POSE.leftForeArm);
        setBoneRotation(bonesRef.current.rightForeArm, REST_POSE.rightForeArm);
        setBoneRotation(bonesRef.current.rightHand, REST_POSE.rightHand);
        setBoneRotation(bonesRef.current.rightThumb1, REST_POSE.rightThumb1);
        setBoneRotation(bonesRef.current.rightThumb2, REST_POSE.rightThumb2);
        setBoneRotation(bonesRef.current.rightThumb3, REST_POSE.rightThumb3);
        setBoneRotation(bonesRef.current.rightIndex1, REST_POSE.rightIndex1);
        setBoneRotation(bonesRef.current.rightIndex2, REST_POSE.rightIndex2);
        setBoneRotation(bonesRef.current.rightIndex3, REST_POSE.rightIndex3);
        setBoneRotation(bonesRef.current.rightMiddle1, REST_POSE.rightMiddle1);
        setBoneRotation(bonesRef.current.rightMiddle2, REST_POSE.rightMiddle2);
        setBoneRotation(bonesRef.current.rightMiddle3, REST_POSE.rightMiddle3);
        setBoneRotation(bonesRef.current.rightRing1, REST_POSE.rightRing1);
        setBoneRotation(bonesRef.current.rightRing2, REST_POSE.rightRing2);
        setBoneRotation(bonesRef.current.rightRing3, REST_POSE.rightRing3);
        setBoneRotation(bonesRef.current.rightLittle1, REST_POSE.rightLittle1);
        setBoneRotation(bonesRef.current.rightLittle2, REST_POSE.rightLittle2);
        setBoneRotation(bonesRef.current.rightLittle3, REST_POSE.rightLittle3);

        let lastFrameTime = performance.now();
        let breathElapsed = 0;
        let lastBlink = 0;
        let isBlinking = false;
        let blinkProgress = 0;
        let waveOscillator = 0;
        let bubbleShown = false;

        setTimeout(() => {
          if (!destroyed) {
            const initialGreetingIdx = GESTURES.findIndex(g => g.name === "initialGreeting");
            if (initialGreetingIdx >= 0) {
              gestureRef.current = { index: initialGreetingIdx, start: performance.now(), active: true };
              hasGreetedRef.current = true;
              applyExpression("happy", 0.8);
            }
          }
        }, 500);

        const animate = () => {
          if (destroyed) return;
          animIdRef.current = requestAnimationFrame(animate);

          const now = performance.now();
          const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
          lastFrameTime = now;
          const elapsed = clockRef.current.elapsedTime;

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

            if (!gestureRef.current.active || (g && g.name !== "initialGreeting")) {
              applyExpression("happy", 0.5);
            }

            // 手臂姿势控制
            if (!gestureRef.current.active) {
              // 空闲状态：自然下垂
              setBoneRotation(bonesRef.current.leftUpperArm, REST_POSE.leftUpperArm);
              setBoneRotation(bonesRef.current.rightUpperArm, REST_POSE.rightUpperArm);
              setBoneRotation(bonesRef.current.leftForeArm, REST_POSE.leftForeArm);
              setBoneRotation(bonesRef.current.rightForeArm, REST_POSE.rightForeArm);
              setBoneRotation(bonesRef.current.leftHand, REST_POSE.leftHand);
              setBoneRotation(bonesRef.current.rightHand, REST_POSE.rightHand);
              setBoneRotation(bonesRef.current.rightThumb1, REST_POSE.rightThumb1);
              setBoneRotation(bonesRef.current.rightThumb2, REST_POSE.rightThumb2);
              setBoneRotation(bonesRef.current.rightThumb3, REST_POSE.rightThumb3);
              setBoneRotation(bonesRef.current.rightIndex1, REST_POSE.rightIndex1);
              setBoneRotation(bonesRef.current.rightIndex2, REST_POSE.rightIndex2);
              setBoneRotation(bonesRef.current.rightIndex3, REST_POSE.rightIndex3);
              setBoneRotation(bonesRef.current.rightMiddle1, REST_POSE.rightMiddle1);
              setBoneRotation(bonesRef.current.rightMiddle2, REST_POSE.rightMiddle2);
              setBoneRotation(bonesRef.current.rightMiddle3, REST_POSE.rightMiddle3);
              setBoneRotation(bonesRef.current.rightRing1, REST_POSE.rightRing1);
              setBoneRotation(bonesRef.current.rightRing2, REST_POSE.rightRing2);
              setBoneRotation(bonesRef.current.rightRing3, REST_POSE.rightRing3);
              setBoneRotation(bonesRef.current.rightLittle1, REST_POSE.rightLittle1);
              setBoneRotation(bonesRef.current.rightLittle2, REST_POSE.rightLittle2);
              setBoneRotation(bonesRef.current.rightLittle3, REST_POSE.rightLittle3);
            } else if (g) {
              const t = Math.min(1, (now - gestureRef.current.start) / g.duration);
              const e = easeInOut(t);

              if (g.name === "initialGreeting") {
                let talkIntensity = 0;
                let waveIntensity = 1;

                if (t < 0.2) {
                  waveIntensity = t / 0.2;
                } else if (t > 0.8) {
                  waveIntensity = (1 - t) / 0.2;
                }

                if (t > 0.1 && t < 0.9) {
                  talkIntensity = 1;
                }

                const leftUA = lerpPose(REST_POSE.leftUpperArm, g.target.leftUpperArm, e);
                const rightUA = lerpPose(REST_POSE.rightUpperArm, g.target.rightUpperArm, e);
                const leftFA = lerpPose(REST_POSE.leftForeArm, g.target.leftForeArm, e);
                const forearmE = easeInOut(Math.min(1, t * 1.8));
                const rightFA = lerpPose(REST_POSE.rightForeArm, g.target.rightForeArm, forearmE);
                const rightH = lerpPose(REST_POSE.rightHand, g.target.rightHand, forearmE);
                const rightT1 = lerpPose(REST_POSE.rightThumb1, g.target.rightThumb1, e);
                const rightT2 = lerpPose(REST_POSE.rightThumb2, g.target.rightThumb2, e);
                const rightT3 = lerpPose(REST_POSE.rightThumb3, g.target.rightThumb3, e);
                const rightI1 = lerpPose(REST_POSE.rightIndex1, g.target.rightIndex1, e);
                const rightI2 = lerpPose(REST_POSE.rightIndex2, g.target.rightIndex2, e);
                const rightI3 = lerpPose(REST_POSE.rightIndex3, g.target.rightIndex3, e);
                const rightM1 = lerpPose(REST_POSE.rightMiddle1, g.target.rightMiddle1, e);
                const rightM2 = lerpPose(REST_POSE.rightMiddle2, g.target.rightMiddle2, e);
                const rightM3 = lerpPose(REST_POSE.rightMiddle3, g.target.rightMiddle3, e);
                const rightR1 = lerpPose(REST_POSE.rightRing1, g.target.rightRing1, e);
                const rightR2 = lerpPose(REST_POSE.rightRing2, g.target.rightRing2, e);
                const rightR3 = lerpPose(REST_POSE.rightRing3, g.target.rightRing3, e);
                const rightL1 = lerpPose(REST_POSE.rightLittle1, g.target.rightLittle1, e);
                const rightL2 = lerpPose(REST_POSE.rightLittle2, g.target.rightLittle2, e);
                const rightL3 = lerpPose(REST_POSE.rightLittle3, g.target.rightLittle3, e);

                waveOscillator += delta * 6;
                const waveAmt = Math.sin(waveOscillator) * 0.3 * waveIntensity;
                rightUA.z += waveAmt * 0.1;
                rightFA.x += waveAmt * 0.4;
                rightFA.z += waveAmt * 0.15;

                setBoneRotation(bonesRef.current.leftUpperArm, leftUA);
                setBoneRotation(bonesRef.current.rightUpperArm, rightUA);
                setBoneRotation(bonesRef.current.leftForeArm, leftFA);
                setBoneRotation(bonesRef.current.rightForeArm, rightFA);
                setBoneRotation(bonesRef.current.rightHand, rightH);
                setBoneRotation(bonesRef.current.rightThumb1, rightT1);
                setBoneRotation(bonesRef.current.rightThumb2, rightT2);
                setBoneRotation(bonesRef.current.rightThumb3, rightT3);
                setBoneRotation(bonesRef.current.rightIndex1, rightI1);
                setBoneRotation(bonesRef.current.rightIndex2, rightI2);
                setBoneRotation(bonesRef.current.rightIndex3, rightI3);
                setBoneRotation(bonesRef.current.rightMiddle1, rightM1);
                setBoneRotation(bonesRef.current.rightMiddle2, rightM2);
                setBoneRotation(bonesRef.current.rightMiddle3, rightM3);
                setBoneRotation(bonesRef.current.rightRing1, rightR1);
                setBoneRotation(bonesRef.current.rightRing2, rightR2);
                setBoneRotation(bonesRef.current.rightRing3, rightR3);
                setBoneRotation(bonesRef.current.rightLittle1, rightL1);
                setBoneRotation(bonesRef.current.rightLittle2, rightL2);
                setBoneRotation(bonesRef.current.rightLittle3, rightL3);

                applyExpression("fun", 0.6);
                applyExpression("winkLeft", 0.8);

                if (talkIntensity > 0) {
                  const mouthOpen = Math.max(0, Math.sin(now * 0.015)) * 0.3 * talkIntensity;
                  applyExpression("aa", mouthOpen);
                }

                const bubble = bubbleRef.current;
                if (g.greeting && bubble) {
                  if (t > 0.1 && !bubbleShown) {
                    bubbleShown = true;
                    bubble.textContent = g.greeting;
                    bubble.style.opacity = "1";
                    bubble.style.transform = "translateX(-50%) scale(1)";
                    typewriterEffect(bubble, g.greeting, 40);
                  }
                  if (t > 0.9 && bubbleShown) {
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
                  if (bubbleShown && bubble) {
                    bubbleShown = false;
                    bubble.style.opacity = "0";
                    bubble.style.transform = "translateX(-50%) scale(0.7)";
                  }
                  setBoneRotation(bonesRef.current.leftUpperArm, REST_POSE.leftUpperArm);
                  setBoneRotation(bonesRef.current.rightUpperArm, REST_POSE.rightUpperArm);
                  setBoneRotation(bonesRef.current.leftForeArm, REST_POSE.leftForeArm);
                  setBoneRotation(bonesRef.current.rightForeArm, REST_POSE.rightForeArm);
                }
              } else if (g.name === "think") {
                let currentT = (now - gestureRef.current.start) / g.duration;
                if (isThinkingRef.current && currentT >= 0.8) {
                  gestureRef.current.start = now - g.duration * 0.8;
                  currentT = 0.8;
                }
                const thinkE = easeInOut(Math.min(1, currentT));
                const forearmE = easeInOut(Math.min(1, currentT * 1.8));

                const leftUA = lerpPose(REST_POSE.leftUpperArm, g.target.leftUpperArm || REST_POSE.leftUpperArm, thinkE);
                const rightUA = lerpPose(REST_POSE.rightUpperArm, g.target.rightUpperArm || REST_POSE.rightUpperArm, thinkE);
                const leftFA = lerpPose(REST_POSE.leftForeArm, g.target.leftForeArm || REST_POSE.leftForeArm, thinkE);
                const rightFA = lerpPose(REST_POSE.rightForeArm, g.target.rightForeArm || REST_POSE.rightForeArm, forearmE);

                const rightH = lerpPose(REST_POSE.rightHand, g.target.rightHand || REST_POSE.rightHand, forearmE);
                const rightT1 = lerpPose(REST_POSE.rightThumb1, g.target.rightThumb1 || REST_POSE.rightThumb1, thinkE);
                const rightT2 = lerpPose(REST_POSE.rightThumb2, g.target.rightThumb2 || REST_POSE.rightThumb2, thinkE);
                const rightT3 = lerpPose(REST_POSE.rightThumb3, g.target.rightThumb3 || REST_POSE.rightThumb3, thinkE);
                const rightI1 = lerpPose(REST_POSE.rightIndex1, g.target.rightIndex1 || REST_POSE.rightIndex1, thinkE);
                const rightI2 = lerpPose(REST_POSE.rightIndex2, g.target.rightIndex2 || REST_POSE.rightIndex2, thinkE);
                const rightI3 = lerpPose(REST_POSE.rightIndex3, g.target.rightIndex3 || REST_POSE.rightIndex3, thinkE);
                const rightM1 = lerpPose(REST_POSE.rightMiddle1, g.target.rightMiddle1 || REST_POSE.rightMiddle1, thinkE);
                const rightM2 = lerpPose(REST_POSE.rightMiddle2, g.target.rightMiddle2 || REST_POSE.rightMiddle2, thinkE);
                const rightM3 = lerpPose(REST_POSE.rightMiddle3, g.target.rightMiddle3 || REST_POSE.rightMiddle3, thinkE);
                const rightR1 = lerpPose(REST_POSE.rightRing1, g.target.rightRing1 || REST_POSE.rightRing1, thinkE);
                const rightR2 = lerpPose(REST_POSE.rightRing2, g.target.rightRing2 || REST_POSE.rightRing2, thinkE);
                const rightR3 = lerpPose(REST_POSE.rightRing3, g.target.rightRing3 || REST_POSE.rightRing3, thinkE);
                const rightL1 = lerpPose(REST_POSE.rightLittle1, g.target.rightLittle1 || REST_POSE.rightLittle1, thinkE);
                const rightL2 = lerpPose(REST_POSE.rightLittle2, g.target.rightLittle2 || REST_POSE.rightLittle2, thinkE);
                const rightL3 = lerpPose(REST_POSE.rightLittle3, g.target.rightLittle3 || REST_POSE.rightLittle3, thinkE);
                const leftH = lerpPose(REST_POSE.leftHand, g.target.leftHand || REST_POSE.leftHand, thinkE);

                setBoneRotation(bonesRef.current.leftUpperArm, leftUA);
                setBoneRotation(bonesRef.current.rightUpperArm, rightUA);
                setBoneRotation(bonesRef.current.leftForeArm, leftFA);
                setBoneRotation(bonesRef.current.rightForeArm, rightFA);
                setBoneRotation(bonesRef.current.rightHand, rightH);
                setBoneRotation(bonesRef.current.leftHand, leftH);
                setBoneRotation(bonesRef.current.rightThumb1, rightT1);
                setBoneRotation(bonesRef.current.rightThumb2, rightT2);
                setBoneRotation(bonesRef.current.rightThumb3, rightT3);
                setBoneRotation(bonesRef.current.rightIndex1, rightI1);
                setBoneRotation(bonesRef.current.rightIndex2, rightI2);
                setBoneRotation(bonesRef.current.rightIndex3, rightI3);
                setBoneRotation(bonesRef.current.rightMiddle1, rightM1);
                setBoneRotation(bonesRef.current.rightMiddle2, rightM2);
                setBoneRotation(bonesRef.current.rightMiddle3, rightM3);
                setBoneRotation(bonesRef.current.rightRing1, rightR1);
                setBoneRotation(bonesRef.current.rightRing2, rightR2);
                setBoneRotation(bonesRef.current.rightRing3, rightR3);
                setBoneRotation(bonesRef.current.rightLittle1, rightL1);
                setBoneRotation(bonesRef.current.rightLittle2, rightL2);
                setBoneRotation(bonesRef.current.rightLittle3, rightL3);

                if (currentT >= 1) {
                  gestureRef.current.active = false;
                  waveOscillator = 0;
                  vrm.scene.position.y = 0;
                  vrm.scene.rotation.y = Math.PI;
                  setBoneRotation(bonesRef.current.leftUpperArm, REST_POSE.leftUpperArm);
                  setBoneRotation(bonesRef.current.rightUpperArm, REST_POSE.rightUpperArm);
                  setBoneRotation(bonesRef.current.leftForeArm, REST_POSE.leftForeArm);
                  setBoneRotation(bonesRef.current.rightForeArm, REST_POSE.rightForeArm);
                  setBoneRotation(bonesRef.current.leftHand, REST_POSE.leftHand);
                  setBoneRotation(bonesRef.current.rightHand, REST_POSE.rightHand);
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
  }, [handleMouseMove, triggerNextGesture, applyExpression]);

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
        <div className="thinking-bubble">
          <span className="thinking-dot">.</span>
          <span className="thinking-dot">.</span>
          <span className="thinking-dot">.</span>
        </div>
      )}

      <div
        className={`chat-input-wrapper ${isHovering || isWaitingResponse ? "visible" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
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
          disabled={isWaitingResponse || !inputText.trim()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {!isLoaded && !loadError && (
        <div className="loading-indicator">
          <div className="loading-spinner-avatar" />
        </div>
      )}
    </div>
  );
}