import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM } from "@pixiv/three-vrm";
import { invoke } from "@tauri-apps/api/core";
import {
  initBones as sharedInitBones,
  removeAccessoryObjects as sharedRemoveAccessoryObjects,
  parseGesturesFromDb,
  type GestureData,
} from "../../utils/vrmUtils";

const MODEL_PATH = "/vrm/miko.vrm";

export function useVrm(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
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
  const bonesRef = useRef<Record<string, THREE.Object3D | null>>({});
  const gesturesRef = useRef<GestureData[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const gestureStateRef = useRef<{ index: number; start: number; active: boolean }>({
    index: -1,
    start: 0,
    active: false,
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadGestures = useCallback(async () => {
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
        gesturesRef.current = parseGesturesFromDb(gestures);
      }
    } catch (e) {
      console.error("Failed to load gestures from DB", e);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    const init = async () => {
      try {
        await loadGestures();

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
        const bones = sharedInitBones(vrm);
        Object.assign(bonesRef.current, bones);
        sharedRemoveAccessoryObjects(vrm);

        scene.add(vrm.scene);
        vrmRef.current = vrm;
        vrm.scene.rotation.y = Math.PI;

        if (!destroyed) {
          setIsLoaded(true);
        }
      } catch (err) {
        if (!destroyed) {
          console.error("[Avatar] Init failed:", err);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    init();

    return () => {
      destroyed = true;
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      vrmRef.current = null;
    };
  }, [canvasRef, loadGestures]);

  return {
    rendererRef,
    sceneRef,
    cameraRef,
    vrmRef,
    clockRef,
    animIdRef,
    bonesRef,
    gesturesRef,
    mouseRef,
    gestureStateRef,
    isLoaded,
    loadError,
  };
}
