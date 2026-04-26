import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMHumanBoneName } from "@pixiv/three-vrm";
import "./AvatarWindow.css";

const MODEL_PATH = "/vrm/miko.vrm";

// ─── Gesture definitions ─────────────────────────────────────────────────────
// Each gesture: { name, duration_ms, armBones: { left: rotations, right: rotations } }
// rotations are { x, y, z } offsets in radians applied additively
const GESTURES = [
  {
    name: "heart",
    duration: 3000,
    armBones: {
      left: [
        { axis: "z", value: -0.6, ease: "inOut" },
        { axis: "x", value: 0.3, ease: "inOut" },
      ],
      right: [
        { axis: "z", value: 0.6, ease: "inOut" },
        { axis: "x", value: 0.3, ease: "inOut" },
      ],
    },
    lookAt: { x: 0, y: 0.15 },
  },
  {
    name: "wave",
    duration: 2000,
    armBones: {
      left: [],
      right: [
        { axis: "x", value: -1.2, ease: "inOut" },
        { axis: "z", value: 0.5, ease: "inOut" },
      ],
    },
    lookAt: { x: 0.3, y: 0 },
  },
  {
    name: "shy",
    duration: 2500,
    armBones: {
      left: [{ axis: "x", value: 1.1, ease: "inOut" }],
      right: [{ axis: "x", value: 1.1, ease: "inOut" }],
    },
    lookAt: { x: 0, y: -0.15 },
  },
  {
    name: "think",
    duration: 3000,
    armBones: {
      left: [{ axis: "x", value: 0.8, ease: "inOut" }, { axis: "z", value: 0.3, ease: "inOut" }],
      right: [{ axis: "x", value: 1.1, ease: "inOut" }, { axis: "z", value: -0.2, ease: "inOut" }],
    },
    lookAt: { x: -0.2, y: 0.1 },
  },
  {
    name: "bounce",
    duration: 1500,
    bounce: true,
    lookAt: { x: 0, y: 0.1 },
  },
];

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Find a bone by name pattern in humanoid or scene
function findBone(vrm: any, namePart: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  if (vrm.humanoid) {
    try {
      const bones = vrm.humanoid.humanBones as Map<string, any>;
      bones.forEach((bone: any) => {
        if (!found && bone.node && bone.node.name.includes(namePart)) {
          found = bone.node;
        }
      });
    } catch {}
  }
  if (!found) {
    vrm.scene.traverse((obj: any) => {
      if (!found && obj.isBone && obj.name.includes(namePart)) {
        found = obj;
      }
    });
  }
  return found;
}

// Apply a gesture pose to arm bones
function applyArmPose(
  vrm: any,
  gesture: typeof GESTURES[0],
  t: number, // 0..1
  baseLeftArm: THREE.Euler,
  baseRightArm: THREE.Euler
) {
  const leftShoulder = findBone(vrm, "LeftArm") || findBone(vrm, "left_shoulder");
  const leftUpperArm = findBone(vrm, "LeftForeArm") || findBone(vrm, "left_elbow") || findBone(vrm, "LeftUpperArm");
  const rightShoulder = findBone(vrm, "RightArm") || findBone(vrm, "right_shoulder");
  const rightUpperArm = findBone(vrm, "RightForeArm") || findBone(vrm, "right_elbow") || findBone(vrm, "RightUpperArm");

  const e = easeInOut(t);

  if (gesture.name === "bounce") {
    // Whole body bounce
    const bounce = Math.sin(t * Math.PI) * 0.08;
    vrm.scene.position.y = -bounce;
    // Slight head tilt
    return;
  }

  const armBones = gesture.armBones || { left: [], right: [] };

  // Left arm
  if (armBones.left.length > 0) {
    if (leftUpperArm) {
      leftUpperArm.rotation.x = lerp(baseLeftArm.x, armBones.left[0].axis === "x" ? armBones.left[0].value : 0, e);
      leftUpperArm.rotation.z = lerp(baseLeftArm.z, armBones.left.find((b: any) => b.axis === "z")?.value ?? baseLeftArm.z, e);
    }
    if (leftShoulder) {
      leftShoulder.rotation.z = lerp(baseLeftArm.z, armBones.left.find((b: any) => b.axis === "z")?.value ?? baseLeftArm.z, e);
    }
  }

  // Right arm
  if (armBones.right.length > 0) {
    if (rightUpperArm) {
      rightUpperArm.rotation.x = lerp(baseRightArm.x, armBones.right[0].axis === "x" ? armBones.right[0].value : 0, e);
      rightUpperArm.rotation.z = lerp(baseRightArm.z, armBones.right.find(b => b.axis === "z")?.value ?? baseRightArm.z, e);
    }
    if (rightShoulder) {
      rightShoulder.rotation.z = lerp(baseRightArm.z, armBones.right.find(b => b.axis === "z")?.value ?? baseRightArm.z, e);
    }
  }
}

export default function AvatarWindow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<any>(null);
  const clockRef = useRef(new THREE.Clock());
  const animIdRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const baseArmRef = useRef({ left: new THREE.Euler(), right: new THREE.Euler() });
  const gestureRef = useRef<{ index: number; start: number; active: boolean }>({ index: -1, start: 0, active: false });
  const idleTimerRef = useRef(0);

  // Animation state — kept in refs so they persist across frames
  const breathElapsedRef = useRef(0);
  const lastBlinkRef = useRef(0);
  const isBlinkingRef = useRef(false);
  const blinkProgressRef = useRef(0);
  const idleAccumRef = useRef(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track mouse for head look-at
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, []);

  // Trigger next idle gesture
  const triggerNextGesture = useCallback(() => {
    const next = (gestureRef.current.index + 1) % GESTURES.length;
    gestureRef.current = { index: next, start: performance.now(), active: true };
    idleTimerRef.current = 0;
  }, []);

  // Trigger heart gesture on click
  const handleClick = useCallback(() => {
    // Find heart gesture index
    const heartIdx = GESTURES.findIndex(g => g.name === "heart");
    if (heartIdx >= 0) {
      gestureRef.current = { index: heartIdx, start: performance.now(), active: true };
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    const init = async () => {
      try {
        // Renderer
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(300, 400);
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;
        // Scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(36, 300 / 400, 0.1, 100);
        camera.position.set(0, 1.2, 4.5);
        camera.lookAt(0, 1.0, 0);
        cameraRef.current = camera;

        // Lighting
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

        // Load VRM
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(MODEL_PATH);
        const vrm = gltf.userData.vrm;
        if (destroyed || !vrm) throw new Error("No VRM");

        // Init userData
        vrm.userData = vrm.userData || {};
        vrm.userData.baseRotation = vrm.userData.baseRotation || { x: 0, y: 0, z: 0 };

        // 打印所有 Bone 名称（供调试用）
        const boneNames: string[] = [];
        vrm.scene.traverse((obj: THREE.Object3D) => {
          if ((obj as any).isBone) boneNames.push(obj.name);
        });
        console.log("[Avatar] VRM bones:", boneNames);

        // 移除 VRM 模型中不需要的 UI 元素（图标、邮件按钮等）
        // 递归遍历所有子孙节点，不只看顶层子节点
        const toRemove: THREE.Object3D[] = [];
        vrm.scene.traverse((obj: THREE.Object3D) => {
          const nameLC = obj.name.toLowerCase();
          const isIconMesh = obj.type.includes("Mesh") && (
            nameLC.includes("icon") ||
            nameLC.includes("email") ||
            nameLC.includes("mail") ||
            nameLC.includes("button") ||
            nameLC.includes("social") ||
            nameLC.includes("badge") ||
            nameLC.includes("chat")
          );
          const isSmallIcon = obj.type.includes("Mesh") && (
            (obj as any).isMesh &&
            nameLC.length < 20 &&
            !nameLC.includes("eye") &&
            !nameLC.includes("mouth") &&
            !nameLC.includes("brow") &&
            !nameLC.includes("hair") &&
            !nameLC.includes("head") &&
            !nameLC.includes("body") &&
            !nameLC.includes("arm") &&
            !nameLC.includes("leg") &&
            !nameLC.includes("torso") &&
            !nameLC.includes("neck") &&
            !nameLC.includes("cloth")
          );
          if (isIconMesh || isSmallIcon) {
            toRemove.push(obj);
          }
        });
        for (const obj of toRemove) {
          console.log("[Avatar] 移除:", obj.name, obj.type);
          if (obj.parent) obj.parent.remove(obj);
        }

        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // 模型面向相机（VRM 默认面向 +Z，需要旋转）
        vrm.scene.rotation.y = Math.PI;

        // 设置自然初始姿态（胳膊自然下垂）
        // 尝试多种可能的骨骼名称
        const shoulderBones = ["Shoulder", "shoulder", "Clavicle", "clavicle", "Scapula", "scapula"];
        const upperArmBones = ["UpperArm", "upperarm", "Upper_Arm", "Arm", "arm"];
        const foreArmBones = ["ForeArm", "forearm", "Fore_Arm", "LowerArm", "lowerarm", "Lower_Arm"];

        const getBone = (names: string[]) => {
          for (const n of names) {
            const b = findBone(vrm, n);
            if (b) return b;
          }
          return null;
        };

        const leftShoulder = getBone(shoulderBones.map(n => "Left" + n));
        const rightShoulder = getBone(shoulderBones.map(n => "Right" + n));
        const leftUpperArm = getBone(upperArmBones.map(n => "Left" + n));
        const rightUpperArm = getBone(upperArmBones.map(n => "Right" + n));
        const leftForeArm = getBone(foreArmBones.map(n => "Left" + n));
        const rightForeArm = getBone(foreArmBones.map(n => "Right" + n));

        console.log("[Avatar] 找到的胳膊骨骼:", {
          leftShoulder: leftShoulder?.name,
          rightShoulder: rightShoulder?.name,
          leftUpperArm: leftUpperArm?.name,
          rightUpperArm: rightUpperArm?.name,
          leftForeArm: leftForeArm?.name,
          rightForeArm: rightForeArm?.name,
        });

        // 上臂自然下垂角度
        if (leftUpperArm) {
          leftUpperArm.rotation.z = 0.3; // 向外张开
          leftUpperArm.rotation.x = 0.1; // 轻微前倾
        }
        if (rightUpperArm) {
          rightUpperArm.rotation.z = -0.3;
          rightUpperArm.rotation.x = 0.1;
        }
        // 前臂自然下垂
        if (leftForeArm) {
          leftForeArm.rotation.x = 0.1;
        }
        if (rightForeArm) {
          rightForeArm.rotation.x = 0.1;
        }

        // Store base arm rotations for gesture reset (after setting natural pose)
        if (leftForeArm) baseArmRef.current.left.copy(leftForeArm.rotation);
        if (rightForeArm) baseArmRef.current.right.copy(rightForeArm.rotation);
        console.log("[Avatar] base arm rotations:", baseArmRef.current.left, baseArmRef.current.right);

        // BlendShape check
        const hasVRM1 = !!vrm.expressionManager;
        const hasVRM0 = !!vrm.blendShapeProxy;

        const applyExpr = (name: string, val: number) => {
          try {
            if (hasVRM1 && vrm.expressionManager) {
              const map: Record<string, string> = {
                neutral: "neutral", happy: "happy", fun: "happy",
                angry: "angry", sad: "sad", surprised: "surprised",
              };
              const k = map[name];
              if (!k) return;
              const expr = vrm.expressionManager.getExpression(k);
              if (expr) expr.value = lerp(expr.value, val, 0.3);
            } else if (hasVRM0 && vrm.blendShapeProxy) {
              const map: Record<string, string> = {
                neutral: "Joy", happy: "Fun", fun: "Fun",
                angry: "Angry", sad: "Sorrow", surprised: "Surprise",
              };
              const k = map[name];
              if (!k) return;
              const cur = vrm.blendShapeProxy.getValue(k) ?? 0;
              vrm.blendShapeProxy.setValue(k, lerp(cur, val, 0.3));
            }
          } catch {}
        };

        applyExpr("happy", 0.3);

        // Find head bone
        let headBone: THREE.Object3D | null = null;
        if (vrm.humanoid) {
          try {
            const h = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head);
            if (h) headBone = h;
          } catch {}
        }
        if (!headBone) {
          vrm.scene.traverse((obj: any) => {
            if (!headBone && obj.isBone && /[Hh]ead/i.test(obj.name)) headBone = obj;
          });
        }

        // Animation state refs (declared once, reused every frame)
        let lastFrameTime = performance.now();

        // Trigger first gesture after 5s
        setTimeout(() => {
          if (!destroyed) triggerNextGesture();
        }, 5000);

        const animate = () => {
          if (destroyed) return;
          animIdRef.current = requestAnimationFrame(animate);

          // Calculate delta from last frame (capped at 100ms to avoid huge jumps)
          const now = performance.now();
          const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
          lastFrameTime = now;
          const elapsed = clockRef.current.elapsedTime;

          breathElapsedRef.current += delta;
          idleAccumRef.current += delta;

          try {
            // Idle breathing
            const breathY = Math.sin(breathElapsedRef.current * 1.2) * 0.004;
            const breathSway = Math.sin(breathElapsedRef.current * 0.8) * 0.002;
            vrm.scene.position.set(breathSway, breathY, 0);

            // Idle sway (gentle body rock)
            if (!gestureRef.current.active) {
              vrm.scene.rotation.y = Math.PI + Math.sin(elapsed * 0.4) * 0.06;
            }

            // Head look-at from mouse + gesture
            const g = GESTURES[gestureRef.current.index];
            let targetRotX = -mouseRef.current.y * 0.2;
            let targetRotY = mouseRef.current.x * 0.35;
            if (g?.lookAt && gestureRef.current.active) {
              targetRotX += g.lookAt.y * 0.3;
              targetRotY += g.lookAt.x * 0.3;
            }

            if (headBone) {
              headBone.rotation.x = lerp(headBone.rotation.x, targetRotX, 0.06);
              headBone.rotation.y = lerp(headBone.rotation.y, targetRotY, 0.06);
            }

            // Gesture animation
            if (gestureRef.current.active && g) {
              const now = performance.now();
              const t = Math.min(1, (now - gestureRef.current.start) / g.duration);
              applyArmPose(vrm, g, t, baseArmRef.current.left, baseArmRef.current.right);
              if (t >= 1) {
                gestureRef.current.active = false;
                // Reset arm bones
                const leftA = findBone(vrm, "LeftForeArm") || findBone(vrm, "left_elbow");
                const rightA = findBone(vrm, "RightForeArm") || findBone(vrm, "right_elbow");
                if (leftA) { leftA.rotation.x = lerp(leftA.rotation.x, baseArmRef.current.left.x, 0.5); leftA.rotation.z = lerp(leftA.rotation.z, baseArmRef.current.left.z, 0.5); }
                if (rightA) { rightA.rotation.x = lerp(rightA.rotation.x, baseArmRef.current.right.x, 0.5); rightA.rotation.z = lerp(rightA.rotation.z, baseArmRef.current.right.z, 0.5); }
                vrm.scene.position.y = 0;
                vrm.scene.rotation.y = Math.PI;
              }
            } else {
              // Auto-gesture timer
              if (idleAccumRef.current > 6 + Math.random() * 4) {
                triggerNextGesture();
                idleAccumRef.current = 0;
              }
            }

            // Auto blink
            if (elapsed - lastBlinkRef.current > 3.5 + Math.random() * 2) {
              isBlinkingRef.current = true;
              lastBlinkRef.current = elapsed;
            }
            if (isBlinkingRef.current) {
              blinkProgressRef.current += delta * 14;
              const bv = Math.max(0, Math.sin(blinkProgressRef.current * Math.PI));
              try {
                if (hasVRM1 && vrm.expressionManager) {
                  const bl = vrm.expressionManager.getExpression("blinkLeft");
                  const br = vrm.expressionManager.getExpression("blinkRight");
                  if (bl) bl.value = bv;
                  if (br) br.value = bv;
                } else if (hasVRM0 && vrm.blendShapeProxy) {
                  try { vrm.blendShapeProxy.setValue("Blink", bv); } catch {}
                }
              } catch {}
              if (blinkProgressRef.current >= 1) {
                isBlinkingRef.current = false;
                blinkProgressRef.current = 0;
              }
            }

            if (vrm.update) vrm.update(delta);
            renderer.render(scene, camera);
          } catch (e) { console.warn("[Avatar] render:", e); }
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
        try { rendererRef.current.dispose(); } catch {}
        rendererRef.current = null;
      }
    };
  }, [handleMouseMove, triggerNextGesture]);

  // Drag window
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    getCurrentWindow().startDragging();
  };

  return (
    <div
      className="avatar-window"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="vrm-canvas" />

      {!isLoaded && !loadError && (
        <div className="loading-indicator">
          <div className="loading-spinner-avatar" />
        </div>
      )}

      {loadError && (
        <div className="avatar-fallback">
          <div className="fallback-avatar-circle">
            <span className="fallback-emoji">🎭</span>
          </div>
        </div>
      )}
    </div>
  );
}
