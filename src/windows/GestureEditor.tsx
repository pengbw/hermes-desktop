import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMHumanBoneName } from "@pixiv/three-vrm";
import GUI from "lil-gui";
import "./GestureEditor.css";

const MODEL_PATH = "/vrm/miko.vrm";

// 骨骼名称映射到 VRM 人形骨骼
const BONE_MAP: Record<string, VRMHumanBoneName> = {
  leftUpperArm: VRMHumanBoneName.LeftUpperArm,
  rightUpperArm: VRMHumanBoneName.RightUpperArm,
  leftForeArm: VRMHumanBoneName.LeftLowerArm,
  rightForeArm: VRMHumanBoneName.RightLowerArm,
  leftHand: VRMHumanBoneName.LeftHand,
  rightHand: VRMHumanBoneName.RightHand,
  rightThumb1: VRMHumanBoneName.RightThumbMetacarpal,
  rightThumb2: VRMHumanBoneName.RightThumbProximal,
  rightThumb3: VRMHumanBoneName.RightThumbDistal,
  rightIndex1: VRMHumanBoneName.RightIndexProximal,
  rightIndex2: VRMHumanBoneName.RightIndexIntermediate,
  rightIndex3: VRMHumanBoneName.RightIndexDistal,
  rightMiddle1: VRMHumanBoneName.RightMiddleProximal,
  rightMiddle2: VRMHumanBoneName.RightMiddleIntermediate,
  rightMiddle3: VRMHumanBoneName.RightMiddleDistal,
  rightRing1: VRMHumanBoneName.RightRingProximal,
  rightRing2: VRMHumanBoneName.RightRingIntermediate,
  rightRing3: VRMHumanBoneName.RightRingDistal,
  rightLittle1: VRMHumanBoneName.RightLittleProximal,
  rightLittle2: VRMHumanBoneName.RightLittleIntermediate,
  rightLittle3: VRMHumanBoneName.RightLittleDistal,
};

// 骨骼分组（用于 GUI 折叠）
const BONE_GROUPS: Record<string, string[]> = {
  "左臂 Left Arm": ["leftUpperArm", "leftForeArm", "leftHand"],
  "右臂 Right Arm": ["rightUpperArm", "rightForeArm", "rightHand"],
  "右手拇指 Thumb": ["rightThumb1", "rightThumb2", "rightThumb3"],
  "右手食指 Index": ["rightIndex1", "rightIndex2", "rightIndex3"],
  "右手中指 Middle": ["rightMiddle1", "rightMiddle2", "rightMiddle3"],
  "右手无名指 Ring": ["rightRing1", "rightRing2", "rightRing3"],
  "右手小指 Little": ["rightLittle1", "rightLittle2", "rightLittle3"],
};

interface GestureEditorProps {
  gestureName: string;
  initialTargetJson: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
  onSave: (params: {
    name: string;
    targetJson: string;
    duration: number;
    lookAtX: number;
    lookAtY: number;
    tilt: number;
  }) => void;
  onCancel: () => void;
}

export default function GestureEditor({
  gestureName,
  initialTargetJson,
  duration: initDuration,
  lookAtX: initLookAtX,
  lookAtY: initLookAtY,
  tilt: initTilt,
  onSave,
  onCancel,
}: GestureEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guiMountRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const vrmRef = useRef<any>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);

  // 可变参数
  const [name, setName] = useState(gestureName);
  const [duration, setDuration] = useState(initDuration);
  const [lookAtX, setLookAtX] = useState(initLookAtX);
  const [lookAtY, setLookAtY] = useState(initLookAtY);
  const [tilt, setTilt] = useState(initTilt);

  // 骨骼参数（可变 ref，供 lil-gui 直接操作）
  const boneParamsRef = useRef<Record<string, { x: number; y: number; z: number }>>({});

  // 初始化骨骼参数
  useEffect(() => {
    const parsed = (() => {
      try { return JSON.parse(initialTargetJson || "{}"); } catch { return {}; }
    })();
    const params: Record<string, { x: number; y: number; z: number }> = {};
    for (const key of Object.keys(BONE_MAP)) {
      params[key] = parsed[key] ? { ...parsed[key] } : { x: 0, y: 0, z: 0 };
    }
    boneParamsRef.current = params;
  }, []);

  // 3D 场景 + lil-gui
  useEffect(() => {
    const canvas = canvasRef.current;
    const guiMount = guiMountRef.current;
    if (!canvas || !guiMount) return;

    let destroyed = false;

    // ── 场景 ──
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(22, canvas.clientWidth / canvas.clientHeight, 0.1, 20);
    camera.position.set(0, 1.3, 3.5);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x7c6fff, 0.3);
    backLight.position.set(-2, 1, -2);
    scene.add(backLight);

    // ── 加载 VRM ──
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      MODEL_PATH,
      (gltf) => {
        if (destroyed) return;
        const vrm = gltf.userData.vrm;
        if (!vrm) return;
        vrmRef.current = vrm;
        scene.add(vrm.scene);
        vrm.scene.rotation.y = Math.PI;
        setLoading(false);

        // 应用初始骨骼姿态
        applyBonesToModel(vrm);

        // ── 创建 lil-gui ──
        const gui = new GUI({ container: guiMount, title: "骨骼参数" });
        guiRef.current = gui;

        const params = boneParamsRef.current;
        const PI = Math.PI;

        for (const [groupName, boneKeys] of Object.entries(BONE_GROUPS)) {
          const folder = gui.addFolder(groupName);
          for (const key of boneKeys) {
            if (!params[key]) continue;
            const sub = folder.addFolder(key);
            sub.add(params[key], "x", -PI, PI, 0.01).onChange(() => applyBonesToModel(vrm));
            sub.add(params[key], "y", -PI, PI, 0.01).onChange(() => applyBonesToModel(vrm));
            sub.add(params[key], "z", -PI, PI, 0.01).onChange(() => applyBonesToModel(vrm));
            sub.close();
          }
          // 手指分组默认折叠
          if (groupName.includes("Thumb") || groupName.includes("Index") || groupName.includes("Middle") || groupName.includes("Ring") || groupName.includes("Little")) {
            folder.close();
          }
        }
      },
      undefined,
      (err) => {
        console.error("Failed to load VRM for gesture editor:", err);
        setLoading(false);
      }
    );

    // ── 渲染循环 ──
    const animate = () => {
      if (destroyed) return;
      animRef.current = requestAnimationFrame(animate);
      if (vrmRef.current) {
        vrmRef.current.update(1 / 60);
      }
      renderer.render(scene, camera);
    };
    animate();

    // ── 窗口 resize ──
    const onResize = () => {
      if (!canvas || destroyed) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas.parentElement!);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animRef.current);
      if (guiRef.current) {
        guiRef.current.destroy();
        guiRef.current = null;
      }
      renderer.dispose();
      ro.disconnect();
    };
  }, []);

  function applyBonesToModel(vrm: any) {
    const params = boneParamsRef.current;
    for (const [key, boneName] of Object.entries(BONE_MAP)) {
      const p = params[key];
      if (!p) continue;
      try {
        const node = vrm.humanoid?.getRawBoneNode(boneName);
        if (node) {
          node.rotation.set(p.x, p.y, p.z);
        }
      } catch {}
    }
  }

  function handleSave() {
    const targetJson = JSON.stringify(boneParamsRef.current);
    onSave({ name, targetJson, duration, lookAtX, lookAtY, tilt });
  }

  function handleReset() {
    const params = boneParamsRef.current;
    for (const key of Object.keys(params)) {
      params[key] = { x: 0, y: 0, z: 0 };
    }
    if (vrmRef.current) applyBonesToModel(vrmRef.current);
    // 刷新 GUI 显示
    if (guiRef.current) {
      guiRef.current.controllersRecursive().forEach(c => c.updateDisplay());
    }
  }

  return (
    <div className="gesture-editor-overlay" onClick={onCancel}>
      <div className="gesture-editor-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="gesture-editor-header">
          <h3>
            <span className="gesture-name-input">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="动作名称"
              />
            </span>
          </h3>
          <button className="gesture-editor-close" onClick={onCancel}>✕</button>
        </div>

        {/* Body */}
        <div className="gesture-editor-body">
          {/* 左侧：3D 预览 */}
          <div className="gesture-preview-panel">
            <div className="gesture-preview-canvas-wrap">
              <canvas ref={canvasRef} />
              {loading && (
                <div className="gesture-preview-loading">
                  <div className="spinner" />
                  <span>加载模型中...</span>
                </div>
              )}
            </div>
            {/* 基础参数 */}
            <div className="gesture-meta-bar">
              <div className="meta-field">
                <label>时长</label>
                <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} />
              </div>
              <div className="meta-field">
                <label>视线X</label>
                <input type="number" step="0.1" value={lookAtX} onChange={(e) => setLookAtX(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="meta-field">
                <label>视线Y</label>
                <input type="number" step="0.1" value={lookAtY} onChange={(e) => setLookAtY(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="meta-field">
                <label>倾斜</label>
                <input type="number" step="0.01" value={tilt} onChange={(e) => setTilt(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* 右侧：lil-gui */}
          <div className="gesture-gui-panel">
            <div className="gesture-gui-mount" ref={guiMountRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="gesture-editor-footer">
          <button className="gesture-btn-reset" onClick={handleReset}>🔄 重置所有</button>
          <button className="gesture-btn-cancel" onClick={onCancel}>取消</button>
          <button className="gesture-btn-save" onClick={handleSave}>💾 保存动作</button>
        </div>
      </div>
    </div>
  );
}
