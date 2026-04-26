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

// Find a humanoid bone by VRMHumanBoneName enum, fallback to scene traversal
function getHumanoidBone(vrm: any, boneName: VRMHumanBoneName): THREE.Object3D | null {
  try {
    if (vrm.humanoid) {
      const node = vrm.humanoid.getRawBoneNode(boneName);
      if (node) return node;
    }
  } catch {}
  return null;
}

// Find any bone in scene by name (case-insensitive substring match)
function findBoneInScene(vrm: any, namePart: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  vrm.scene.traverse((obj: THREE.Object3D) => {
    if (!found && (obj as any).isBone && obj.name.toLowerCase().includes(namePart.toLowerCase())) {
      found = obj;
    }
  });
  return found;
}

// Apply arm pose: set shoulder + upper arm + forearm rotations from base
function applyArmRestPose(
  leftUpperArm: THREE.Object3D | null,
  rightUpperArm: THREE.Object3D | null,
  leftForeArm: THREE.Object3D | null,
  rightForeArm: THREE.Object3D | null,
) {
  // Left upper arm: slightly outward (z) + slight forward (x) = natural hanging pose
  if (leftUpperArm) {
    leftUpperArm.rotation.set(0.1, 0, 0.35);
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.set(0.1, 0, -0.35);
  }
  // Forearms hang naturally
  if (leftForeArm) leftForeArm.rotation.set(0.05, 0, 0);
  if (rightForeArm) rightForeArm.rotation.set(0.05, 0, 0);
}

// Apply a gesture pose to arm bones — uses humanoid bones if available
function applyArmPose(
  vrm: any,
  gesture: typeof GESTURES[0],
  t: number,
  leftUpperArm: THREE.Object3D | null,
  rightUpperArm: THREE.Object3D | null,
  leftForeArm: THREE.Object3D | null,
  rightForeArm: THREE.Object3D | null,
) {
  const e = easeInOut(t);

  if (gesture.name === "bounce") {
    const bounce = Math.sin(t * Math.PI) * 0.08;
    vrm.scene.position.y = -bounce;
    return;
  }

  const armBones = gesture.armBones || { left: [], right: [] };

  // Left arm
  if (armBones.left.length > 0 && leftUpperArm) {
    for (const rot of armBones.left) {
      if (rot.axis === "x") leftUpperArm.rotation.x = lerp(leftUpperArm.rotation.x, rot.value, e);
      if (rot.axis === "z") leftUpperArm.rotation.z = lerp(leftUpperArm.rotation.z, rot.value, e);
    }
  }
  if (armBones.left.length > 0 && leftForeArm) {
    for (const rot of armBones.left) {
      if (rot.axis === "x") leftForeArm.rotation.x = lerp(leftForeArm.rotation.x, rot.value * 0.5, e);
    }
  }

  // Right arm
  if (armBones.right.length > 0 && rightUpperArm) {
    for (const rot of armBones.right) {
      if (rot.axis === "x") rightUpperArm.rotation.x = lerp(rightUpperArm.rotation.x, rot.value, e);
      if (rot.axis === "z") rightUpperArm.rotation.z = lerp(rightUpperArm.rotation.z, rot.value, e);
    }
  }
  if (armBones.right.length > 0 && rightForeArm) {
    for (const rot of armBones.right) {
      if (rot.axis === "x") rightForeArm.rotation.x = lerp(rightForeArm.rotation.x, rot.value * 0.5, e);
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

  // Bone refs — resolved once after VRM loads, reused every frame
  const bonesRef = useRef<{
    head: THREE.Object3D | null;
    leftUpperArm: THREE.Object3D | null;
    rightUpperArm: THREE.Object3D | null;
    leftForeArm: THREE.Object3D | null;
    rightForeArm: THREE.Object3D | null;
  }>({ head: null, leftUpperArm: null, rightUpperArm: null, leftForeArm: null, rightForeArm: null });

  const gestureRef = useRef<{ index: number; start: number; active: boolean }>({ index: -1, start: 0, active: false });
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

        // ── Resolve arm + head bones using VRM humanoid API ─────────────────────
        // Primary: use VRMHumanBoneName enum (the spec-correct way)
        // Fallback: scan scene for bones by name pattern
        const b = bonesRef.current;
        b.head         = getHumanoidBone(vrm, VRMHumanBoneName.Head)         || findBoneInScene(vrm, "Head");
        b.leftUpperArm = getHumanoidBone(vrm, VRMHumanBoneName.LeftUpperArm) || findBoneInScene(vrm, "LeftUpperArm") || findBoneInScene(vrm, "LeftArm");
        b.rightUpperArm= getHumanoidBone(vrm, VRMHumanBoneName.RightUpperArm)|| findBoneInScene(vrm, "RightUpperArm")|| findBoneInScene(vrm, "RightArm");
        b.leftForeArm  = getHumanoidBone(vrm, VRMHumanBoneName.LeftLowerArm) || findBoneInScene(vrm, "LeftForeArm")  || findBoneInScene(vrm, "LeftHand");
        b.rightForeArm = getHumanoidBone(vrm, VRMHumanBoneName.RightLowerArm)|| findBoneInScene(vrm, "RightForeArm") || findBoneInScene(vrm, "RightHand");

        console.log("[Avatar] 骨骼:", {
          head:         b.head?.name,
          leftUpperArm: b.leftUpperArm?.name,
          rightUpperArm:b.rightUpperArm?.name,
          leftForeArm:  b.leftForeArm?.name,
          rightForeArm: b.rightForeArm?.name,
        });

        // Apply rest pose so arms hang naturally at startup
        applyArmRestPose(b.leftUpperArm, b.rightUpperArm, b.leftForeArm, b.rightForeArm);

        // ── Remove non-body meshes (UI icons / accessories) ──────────────────
        const toRemove: THREE.Object3D[] = [];
        vrm.scene.traverse((obj: THREE.Object3D) => {
          if ((obj as any).isBone || obj.type === "Scene") return;
          const n = obj.name.toLowerCase();
          const isBody = /^(eye|ear|nose|mouth|brow|hair|head|body|torso|neck|spine|chest|hip|leg|foot|knee|ankle|arm|hand|finger|thumb|shoulder|elbow|cloth|skirt|shirt|pant|shoe|sock)/.test(n);
          const isIcon = /^(email|mail|icon|button|badge|chat|social|notify|talk|bell|home|user|set|gear|tool|star|heart|like|share|msg|call|phone|mess|notif|alarm)/.test(n);
          const isSmallDecorative = obj.type.includes("Mesh") && !isBody && n.length < 25;
          if (isIcon || isSmallDecorative) {
            toRemove.push(obj);
          }
        });
        for (const obj of toRemove) {
          console.log("[Avatar] 移除:", obj.name);
          obj.parent?.remove(obj);
        }

        // Add to scene and face camera
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        vrm.scene.rotation.y = Math.PI;

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

        // ── Animation state (simple let — declared OUTSIDE animate, survive each frame) ─
        let lastFrameTime = performance.now();
        let breathElapsed = 0;
        let idleAccum = 0;
        let lastBlink = 0;
        let isBlinking = false;
        let blinkProgress = 0;

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

          breathElapsed += delta;
          idleAccum += delta;

          try {
            // Idle breathing
            const breathY = Math.sin(breathElapsed * 1.2) * 0.004;
            const breathSway = Math.sin(breathElapsed * 0.8) * 0.002;
            vrm.scene.position.set(breathSway, breathY, 0);

            // Idle sway
            if (!gestureRef.current.active) {
              vrm.scene.rotation.y = Math.PI + Math.sin(elapsed * 0.4) * 0.06;
            }

            // Head look-at
            const b = bonesRef.current;
            const g = GESTURES[gestureRef.current.index];
            let targetRotX = -mouseRef.current.y * 0.2;
            let targetRotY = mouseRef.current.x * 0.35;
            if (g?.lookAt && gestureRef.current.active) {
              targetRotX += g.lookAt.y * 0.3;
              targetRotY += g.lookAt.x * 0.3;
            }
            if (b.head) {
              b.head.rotation.x = lerp(b.head.rotation.x, targetRotX, 0.06);
              b.head.rotation.y = lerp(b.head.rotation.y, targetRotY, 0.06);
            }

            // Gesture animation
            if (gestureRef.current.active && g) {
              const now = performance.now();
              const t = Math.min(1, (now - gestureRef.current.start) / g.duration);
              applyArmPose(vrm, g, t, b.leftUpperArm, b.rightUpperArm, b.leftForeArm, b.rightForeArm);
              if (t >= 1) {
                gestureRef.current.active = false;
                applyArmRestPose(b.leftUpperArm, b.rightUpperArm, b.leftForeArm, b.rightForeArm);
                vrm.scene.position.y = 0;
                vrm.scene.rotation.y = Math.PI;
              }
            } else {
              // Auto-gesture timer
              if (idleAccum > 6 + Math.random() * 4) {
                triggerNextGesture();
                idleAccum = 0;
              }
            }

            // Auto blink
            if (elapsed - lastBlink > 3.5 + Math.random() * 2) {
              isBlinking = true;
              lastBlink = elapsed;
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
                  try { vrm.blendShapeProxy.setValue("Blink", bv); } catch {}
                }
              } catch {}
              if (blinkProgress >= 1) {
                isBlinking = false;
                blinkProgress = 0;
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
