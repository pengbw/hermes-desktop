import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMHumanBoneName, VRM } from "@pixiv/three-vrm";
import GUI from "lil-gui";
import { useI18n } from "../contexts/I18nContext";
import styles from "./GestureEditor.module.css";

const MODEL_PATH = "/vrm/miko.vrm";

const BONE_MAP: Record<string, VRMHumanBoneName> = {
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

const BONE_KEYS = Object.keys(BONE_MAP);

const BONE_GROUPS: Record<string, string[]> = {
  "gesture.boneTorso": ["hips", "spine", "chest", "upperChest"],
  "gesture.boneHead": ["neck", "head", "leftEye", "rightEye"],
  "gesture.boneLeftArm": ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"],
  "gesture.boneRightArm": ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"],
  "gesture.boneLeftLeg": ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"],
  "gesture.boneRightLeg": ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"],
  "gesture.boneLeftThumb": ["leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal"],
  "gesture.boneLeftIndex": ["leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal"],
  "gesture.boneLeftMiddle": ["leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal"],
  "gesture.boneLeftRing": ["leftRingProximal", "leftRingIntermediate", "leftRingDistal"],
  "gesture.boneLeftLittle": ["leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal"],
  "gesture.boneRightThumb": ["rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal"],
  "gesture.boneRightIndex": ["rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal"],
  "gesture.boneRightMiddle": [
    "rightMiddleProximal",
    "rightMiddleIntermediate",
    "rightMiddleDistal",
  ],
  "gesture.boneRightRing": ["rightRingProximal", "rightRingIntermediate", "rightRingDistal"],
  "gesture.boneRightLittle": [
    "rightLittleProximal",
    "rightLittleIntermediate",
    "rightLittleDistal",
  ],
};

const OLD_TO_NEW_BONE_MAP: Record<string, string> = {
  leftForeArm: "leftLowerArm",
  rightForeArm: "rightLowerArm",
  rightThumb1: "rightThumbMetacarpal",
  rightThumb2: "rightThumbProximal",
  rightThumb3: "rightThumbDistal",
  rightIndex1: "rightIndexProximal",
  rightIndex2: "rightIndexIntermediate",
  rightIndex3: "rightIndexDistal",
  rightMiddle1: "rightMiddleProximal",
  rightMiddle2: "rightMiddleIntermediate",
  rightMiddle3: "rightMiddleDistal",
  rightRing1: "rightRingProximal",
  rightRing2: "rightRingIntermediate",
  rightRing3: "rightRingDistal",
  rightLittle1: "rightLittleProximal",
  rightLittle2: "rightLittleIntermediate",
  rightLittle3: "rightLittleDistal",
  leftThumb1: "leftThumbMetacarpal",
  leftThumb2: "leftThumbProximal",
  leftThumb3: "leftThumbDistal",
  leftIndex1: "leftIndexProximal",
  leftIndex2: "leftIndexIntermediate",
  leftIndex3: "leftIndexDistal",
  leftMiddle1: "leftMiddleProximal",
  leftMiddle2: "leftMiddleIntermediate",
  leftMiddle3: "leftMiddleDistal",
  leftRing1: "leftRingProximal",
  leftRing2: "leftRingIntermediate",
  leftRing3: "leftRingDistal",
  leftLittle1: "leftLittleProximal",
  leftLittle2: "leftLittleIntermediate",
  leftLittle3: "leftLittleDistal",
};

function eulerToQuat(euler: { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  const e = new THREE.Euler(euler.x, euler.y, euler.z, "XYZ");
  const q = new THREE.Quaternion().setFromEuler(e);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function quatToEuler(quat: { x: number; y: number; z: number; w: number }): {
  x: number;
  y: number;
  z: number;
} {
  const q = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w);
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return { x: e.x, y: e.y, z: e.z };
}

function isPoseFormat(v: unknown): v is { rotation: number[] } {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as { rotation: number[] }).rotation) &&
    (v as { rotation: number[] }).rotation.length === 4
  );
}

function isOldQuatFormat(v: unknown): v is { x: number; y: number; z: number; w: number } {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { w: number }).w === "number" &&
    !Array.isArray((v as { rotation: unknown }).rotation)
  );
}

function parseTargetJson(json: string): Record<string, { x: number; y: number; z: number }> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json || "{}");
  } catch {
    return {};
  }

  const result: Record<string, { x: number; y: number; z: number }> = {};
  for (const key of BONE_KEYS) {
    let v = parsed[key];
    if (!v) {
      const oldKey = Object.entries(OLD_TO_NEW_BONE_MAP).find(([, nk]) => nk === key)?.[0];
      if (oldKey) v = parsed[oldKey];
    }
    if (v) {
      if (isPoseFormat(v)) {
        result[key] = quatToEuler({
          x: v.rotation[0],
          y: v.rotation[1],
          z: v.rotation[2],
          w: v.rotation[3],
        });
      } else if (isOldQuatFormat(v)) {
        result[key] = quatToEuler(v);
      } else if (
        typeof v === "object" &&
        v !== null &&
        "x" in v &&
        typeof (v as { x: number }).x === "number"
      ) {
        const obj = v as { x?: number; y?: number; z?: number };
        result[key] = { x: obj.x ?? 0, y: obj.y ?? 0, z: obj.z ?? 0 };
      } else {
        result[key] = { x: 0, y: 0, z: 0 };
      }
    } else {
      result[key] = { x: 0, y: 0, z: 0 };
    }
  }
  return result;
}

interface GestureEditorProps {
  gestureName: string;
  initialTargetJson: string;
  duration: number;
  lookAtX: number;
  lookAtY: number;
  tilt: number;
  readOnly?: boolean;
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
  readOnly = false,
  onSave,
  onCancel,
}: GestureEditorProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guiMountRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState(gestureName);
  const [duration, setDuration] = useState(initDuration);
  const [lookAtX, setLookAtX] = useState(initLookAtX);
  const [lookAtY, setLookAtY] = useState(initLookAtY);
  const [tilt, setTilt] = useState(initTilt);

  const boneParamsRef = useRef<Record<string, { x: number; y: number; z: number }>>({});

  useEffect(() => {
    boneParamsRef.current = parseTargetJson(initialTargetJson);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const guiMount = guiMountRef.current;
    if (!canvas || !guiMount) return;

    let destroyed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      22,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      20
    );
    camera.position.set(0, 1.3, 3.5);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x7c6fff, 0.3);
    backLight.position.set(-2, 1, -2);
    scene.add(backLight);

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

        applyBonesToModel(vrm);

        const gui = new GUI({ container: guiMount, title: t("gesture.boneParams") });
        guiRef.current = gui;

        const params = boneParamsRef.current;
        const PI = Math.PI;

        for (const [groupName, boneKeys] of Object.entries(BONE_GROUPS)) {
          const folder = gui.addFolder(t(groupName));
          for (const key of boneKeys) {
            if (!params[key]) continue;
            const sub = folder.addFolder(key);
            sub.add(params[key], "x", -PI, PI, 0.01).onChange(() => applyBonesToModel(vrm));
            sub.add(params[key], "y", -PI, PI, 0.01).onChange(() => applyBonesToModel(vrm));
            sub.add(params[key], "z", -PI, PI, 0.01).onChange(() => applyBonesToModel(vrm));
            sub.close();
          }
          const isFinger =
            groupName.includes("Thumb") ||
            groupName.includes("Index") ||
            groupName.includes("Middle") ||
            groupName.includes("Ring") ||
            groupName.includes("Little");
          const isLeg = groupName.includes("Leg");
          if (isFinger || isLeg) {
            folder.close();
          }
        }
      },
      undefined,
      (_err) => {
        // console.error("Failed to load VRM for gesture editor:", _err);
        setLoading(false);
      }
    );

    const animate = () => {
      if (destroyed) return;
      animRef.current = requestAnimationFrame(animate);
      if (vrmRef.current) {
        vrmRef.current.update(1 / 60);
      }
      renderer.render(scene, camera);
    };
    animate();

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

  function applyBonesToModel(vrm: VRM) {
    const params = boneParamsRef.current;
    for (const [key, boneName] of Object.entries(BONE_MAP)) {
      const p = params[key];
      if (!p) continue;
      try {
        const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (node) {
          const q = eulerToQuat(p);
          node.quaternion.set(q.x, q.y, q.z, q.w);
        }
      } catch (err) {
// console.warn("Failed to apply gesture pose:", err);
      }
    }
  }

  function handleSave() {
    const eulerParams = boneParamsRef.current;
    const poseData: Record<string, { position: number[]; rotation: number[] }> = {};
    for (const key of BONE_KEYS) {
      const q = eulerToQuat(eulerParams[key]);
      poseData[key] = {
        position: [0, 0, 0],
        rotation: [q.x, q.y, q.z, q.w],
      };
    }
    const targetJson = JSON.stringify(poseData);
    onSave({ name, targetJson, duration, lookAtX, lookAtY, tilt });
  }

  function handleReset() {
    const params = boneParamsRef.current;
    for (const key of Object.keys(params)) {
      params[key] = { x: 0, y: 0, z: 0 };
    }
    if (vrmRef.current) applyBonesToModel(vrmRef.current);
    if (guiRef.current) {
      guiRef.current.controllersRecursive().forEach((c) => c.updateDisplay());
    }
  }

  return (
    <div className={styles.gestureEditorOverlay} onClick={onCancel}>
      <div className={styles.gestureEditorModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.gestureEditorHeader}>
          <h3>
            <span className={styles.gestureNameInput}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("gesture.namePlaceholder")}
              />
            </span>
          </h3>
          <button className={styles.gestureEditorClose} onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className={styles.gestureEditorBody}>
          <div className={styles.gesturePreviewPanel}>
            <div className={styles.gesturePreviewCanvasWrap}>
              <canvas ref={canvasRef} />
              {loading && (
                <div className={styles.gesturePreviewLoading}>
                  <div className={styles.spinner} />
                  <span>{t("gesture.loadingModel")}</span>
                </div>
              )}
            </div>
            <div className={styles.gestureMetaBar}>
              <div className={styles.metaField}>
                <label>{t("gesture.duration")}</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className={styles.metaField}>
                <label>{t("gesture.lookAtX")}</label>
                <input
                  type="number"
                  step="0.1"
                  value={lookAtX}
                  onChange={(e) => setLookAtX(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className={styles.metaField}>
                <label>{t("gesture.lookAtY")}</label>
                <input
                  type="number"
                  step="0.1"
                  value={lookAtY}
                  onChange={(e) => setLookAtY(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className={styles.metaField}>
                <label>{t("gesture.tilt")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={tilt}
                  onChange={(e) => setTilt(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className={styles.gestureGuiPanel}>
            <div className={styles.gestureGuiMount} ref={guiMountRef} />
          </div>
        </div>

        <div className={styles.gestureEditorFooter}>
          {!readOnly && (
            <>
              <button className={styles.gestureBtnReset} onClick={handleReset}>
                🔄 {t("gesture.resetAll")}
              </button>
              <button className={styles.gestureBtnCancel} onClick={onCancel}>
                {t("gesture.cancel")}
              </button>
              <button className={styles.gestureBtnSave} onClick={handleSave}>
                💾 {t("gesture.saveAction")}
              </button>
            </>
          )}
          {readOnly && (
            <button className={styles.gestureBtnCancel} onClick={onCancel}>
              {t("gesture.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
