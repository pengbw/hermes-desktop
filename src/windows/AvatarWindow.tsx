import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as THREE from "three";
import "./AvatarWindow.css";

const GREETING = "主人您好，我是小跃";

export default function AvatarWindow() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      40,
      280 / 380,
      0.1,
      100
    );
    camera.position.set(0, 0.3, 3.5);

    // Renderer with transparency
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(280, 380);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ─── Lighting ───────────────────────────────────────
    // Ambient
    const ambient = new THREE.AmbientLight(0x4a4a6a, 0.4);
    scene.add(ambient);

    // Key light (warm)
    const keyLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    keyLight.position.set(2, 3, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    // Fill light (cool blue)
    const fillLight = new THREE.DirectionalLight(0x6688ff, 0.5);
    fillLight.position.set(-3, 1, 2);
    scene.add(fillLight);

    // Rim light (back, creates silhouette)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, 2, -4);
    scene.add(rimLight);

    // Bottom accent
    const bottomLight = new THREE.PointLight(0x3344ff, 1.5, 5);
    bottomLight.position.set(0, -2, 1);
    scene.add(bottomLight);

    // ─── Materials ───────────────────────────────────────
    const skinMat = new THREE.MeshPhysicalMaterial({
      color: 0xf5c5a3,
      roughness: 0.45,
      metalness: 0.0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.4,
    });

    const hairMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a1810,
      roughness: 0.6,
      metalness: 0.1,
    });

    const dressMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8f4ff,
      roughness: 0.2,
      metalness: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      sheen: 1.0,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0xdde8ff),
    });

    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a1a0a,
      roughness: 0.1,
      metalness: 0.3,
    });

    const teethMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.0,
    });

    // ─── Avatar Group ────────────────────────────────────
    const avatar = new THREE.Group();

    // Head (slightly oval sphere)
    const headGeo = new THREE.SphereGeometry(0.42, 32, 32);
    headGeo.scale(1, 1.12, 0.95);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.35;
    head.castShadow = true;
    avatar.add(head);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 0.88;
    neck.castShadow = true;
    avatar.add(neck);

    // Hair base (sphere cap)
    const hairBaseGeo = new THREE.SphereGeometry(0.45, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hairBase = new THREE.Mesh(hairBaseGeo, hairMat);
    hairBase.position.y = 1.45;
    hairBase.castShadow = true;
    avatar.add(hairBase);

    // Hair volume sides (long hair flowing down)
    const hairSideGeo = new THREE.CylinderGeometry(0.18, 0.38, 1.1, 16);
    const hairSideL = new THREE.Mesh(hairSideGeo, hairMat);
    hairSideL.position.set(-0.35, 1.1, -0.05);
    hairSideL.rotation.z = 0.15;
    hairSideL.castShadow = true;
    avatar.add(hairSideL);

    const hairSideR = new THREE.Mesh(hairSideGeo, hairMat);
    hairSideR.position.set(0.35, 1.1, -0.05);
    hairSideR.rotation.z = -0.15;
    hairSideR.castShadow = true;
    avatar.add(hairSideR);

    // Hair back (flowing down)
    const hairBackGeo = new THREE.CylinderGeometry(0.38, 0.42, 1.4, 24);
    const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
    hairBack.position.set(0, 0.85, -0.18);
    hairBack.castShadow = true;
    avatar.add(hairBack);

    // Hair front/bangs
    const bangsGeo = new THREE.SphereGeometry(0.44, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.2);
    const bangs = new THREE.Mesh(bangsGeo, hairMat);
    bangs.position.set(0, 1.6, 0.15);
    bangs.rotation.x = 0.3;
    avatar.add(bangs);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.075, 16, 16);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15, 1.4, 0.36);
    avatar.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.15, 1.4, 0.36);
    avatar.add(eyeR);

    // Eye highlights
    const highlightGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hlL = new THREE.Mesh(highlightGeo, highlightMat);
    hlL.position.set(-0.13, 1.42, 0.42);
    avatar.add(hlL);
    const hlR = new THREE.Mesh(highlightGeo, highlightMat);
    hlR.position.set(0.17, 1.42, 0.42);
    avatar.add(hlR);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.04, 0.1, 8);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, 1.32, 0.4);
    nose.rotation.x = -0.2;
    avatar.add(nose);

    // Mouth (small)
    const mouthGeo = new THREE.SphereGeometry(0.06, 16, 8);
    mouthGeo.scale(1.5, 0.5, 0.5);
    const mouth = new THREE.Mesh(mouthGeo, teethMat);
    mouth.position.set(0, 1.2, 0.38);
    avatar.add(mouth);

    // Lips color overlay
    const lipGeo = new THREE.SphereGeometry(0.065, 16, 8);
    lipGeo.scale(1.4, 0.4, 0.5);
    const lipMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4837a,
      roughness: 0.3,
    });
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.position.set(0, 1.22, 0.385);
    avatar.add(lip);

    // Ears
    const earGeo = new THREE.SphereGeometry(0.08, 8, 12);
    earGeo.scale(0.5, 1, 0.6);
    const earL = new THREE.Mesh(earGeo, skinMat);
    earL.position.set(-0.42, 1.35, 0);
    avatar.add(earL);
    const earR = new THREE.Mesh(earGeo, skinMat);
    earR.position.set(0.42, 1.35, 0);
    avatar.add(earR);

    // Earrings (small spheres)
    const earringGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const earringMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd700,
      roughness: 0.1,
      metalness: 0.9,
    });
    const erL = new THREE.Mesh(earringGeo, earringMat);
    erL.position.set(-0.44, 1.28, 0.02);
    avatar.add(erL);
    const erR = new THREE.Mesh(earringGeo, earringMat);
    erR.position.set(0.44, 1.28, 0.02);
    avatar.add(erR);

    // Shoulders / upper body (torso)
    const torsoGeo = new THREE.CylinderGeometry(0.32, 0.26, 0.55, 20);
    const torso = new THREE.Mesh(torsoGeo, dressMat);
    torso.position.y = 0.48;
    torso.castShadow = true;
    avatar.add(torso);

    // Dress chest area
    const chestGeo = new THREE.SphereGeometry(0.38, 32, 24);
    chestGeo.scale(1, 0.7, 0.85);
    const chest = new THREE.Mesh(chestGeo, dressMat);
    chest.position.set(0, 0.68, 0.02);
    chest.castShadow = true;
    avatar.add(chest);

    // Dress skirt (flowing)
    const skirtGeo = new THREE.CylinderGeometry(0.26, 0.55, 1.0, 32);
    const skirt = new THREE.Mesh(skirtGeo, dressMat);
    skirt.position.y = -0.15;
    skirt.castShadow = true;
    avatar.add(skirt);

    // Dress hem (ruffle detail)
    const hemGeo = new THREE.TorusGeometry(0.55, 0.05, 8, 48);
    const hem = new THREE.Mesh(hemGeo, dressMat);
    hem.position.y = -0.65;
    hem.rotation.x = Math.PI / 2;
    avatar.add(hem);

    // Necklace
    const necklaceGeo = new THREE.TorusGeometry(0.18, 0.015, 8, 48, Math.PI);
    const necklaceMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd700,
      roughness: 0.1,
      metalness: 0.9,
    });
    const necklace = new THREE.Mesh(necklaceGeo, necklaceMat);
    necklace.position.set(0, 0.78, 0.1);
    necklace.rotation.x = 0.3;
    avatar.add(necklace);

    // Pendant
    const pendantGeo = new THREE.OctahedronGeometry(0.04, 0);
    const pendant = new THREE.Mesh(pendantGeo, necklaceMat);
    pendant.position.set(0, 0.72, 0.22);
    avatar.add(pendant);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.55, 12);
    const armL = new THREE.Mesh(armGeo, dressMat);
    armL.position.set(-0.42, 0.48, 0);
    armL.rotation.z = 0.3;
    armL.castShadow = true;
    avatar.add(armL);

    const armR = new THREE.Mesh(armGeo, dressMat);
    armR.position.set(0.42, 0.48, 0);
    armR.rotation.z = -0.3;
    armR.castShadow = true;
    avatar.add(armR);

    // Forearms
    const forearmGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.5, 12);
    const forearmL = new THREE.Mesh(forearmGeo, skinMat);
    forearmL.position.set(-0.58, 0.22, 0.12);
    forearmL.rotation.z = 0.4;
    forearmL.rotation.x = -0.3;
    avatar.add(forearmL);

    const forearmR = new THREE.Mesh(forearmGeo, skinMat);
    forearmR.position.set(0.58, 0.22, 0.12);
    forearmR.rotation.z = -0.4;
    forearmR.rotation.x = -0.3;
    avatar.add(forearmR);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const handL = new THREE.Mesh(handGeo, skinMat);
    handL.position.set(-0.66, 0.0, 0.25);
    handL.scale.set(0.8, 1, 0.6);
    avatar.add(handL);

    const handR = new THREE.Mesh(handGeo, skinMat);
    handR.position.set(0.66, 0.0, 0.25);
    handR.scale.set(0.8, 1, 0.6);
    avatar.add(handR);

    // Floating platform / glow
    const platformGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.02, 64);
    const platformMat = new THREE.MeshPhysicalMaterial({
      color: 0xaaccff,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.4,
      emissive: 0x2244ff,
      emissiveIntensity: 0.3,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -1.1;
    scene.add(platform);

    // Platform glow ring
    const ringGeo = new THREE.TorusGeometry(0.62, 0.02, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = -1.09;
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Particles (floating dots)
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x88aaff,
      size: 0.03,
      transparent: true,
      opacity: 0.7,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Background gradient sphere
    const bgGeo = new THREE.SphereGeometry(15, 32, 32);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x080818,
      side: THREE.BackSide,
    });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    scene.add(bg);

    avatar.position.y = 0.2;
    scene.add(avatar);

    // ─── Animation ───────────────────────────────────────
    let frame = 0;
    let animId: number;

    function animate() {
      animId = requestAnimationFrame(animate);
      frame += 0.008;

      // Subtle idle sway
      avatar.rotation.y = Math.sin(frame * 0.5) * 0.06;
      avatar.position.y = 0.2 + Math.sin(frame) * 0.03;

      // Hair sway
      hairSideL.rotation.z = 0.15 + Math.sin(frame * 0.7) * 0.04;
      hairSideR.rotation.z = -0.15 - Math.sin(frame * 0.7) * 0.04;
      hairBack.rotation.z = Math.sin(frame * 0.5) * 0.02;

      // Rim light flicker (subtle pulse)
      rimLight.intensity = 0.8 + Math.sin(frame * 2) * 0.05;

      // Particle drift
      particles.rotation.y += 0.001;

      // Ring pulse
      ring.scale.setScalar(1 + Math.sin(frame * 1.5) * 0.05);

      // Platform glow pulse
      platformMat.emissiveIntensity = 0.3 + Math.sin(frame * 2) * 0.1;

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Hide greeting after 4s
  useEffect(() => {
    const t = setTimeout(() => setShowGreeting(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = () => setShowMenu(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [showMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const win = getCurrentWindow();
    win.startDragging();
  };

  const handleDoubleClick = () => {
    openMainWindow("chat");
  };

  const menuItems: Array<{ label: string; action: () => void } | { separator: true }> = [
    { label: "🏠 首页", action: () => openMainWindow("home") },
    { label: "🗨️ 对话", action: () => openMainWindow("chat") },
    { label: "⚙️ 设置", action: () => openMainWindow("settings") },
    { separator: true },
    { label: "🔄 重启 Agent", action: () => restartAgent() },
    { label: "📋 查看日志", action: () => openLogDir() },
    { separator: true },
    { label: "❌ 退出", action: () => quitApp() },
  ];

  return (
    <div
      className="avatar-window"
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Three.js mount point */}
      <div ref={mountRef} className="three-canvas-mount" />

      {/* Greeting bubble */}
      {showGreeting && (
        <div className="greeting-bubble">
          <span>{GREETING}</span>
          <div className="bubble-tail" />
        </div>
      )}

      {/* Context menu */}
      {showMenu && (
        <div
          className="context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuItems.map((item, i) =>
            "separator" in item ? (
              <div key={i} className="menu-separator" />
            ) : (
              <div
                key={i}
                className="menu-item"
                onClick={() => {
                  setShowMenu(false);
                  item.action();
                }}
              >
                {item.label}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

async function openMainWindow(tab: string) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const mainWin = new WebviewWindow("main", {
      url: `index.html?tab=${tab}`,
    });
    mainWin.once("tauri://error", (e) => {
      console.error("main window error:", e);
    });
  } catch (err) {
    console.error("openMainWindow error:", err);
  }
}

async function restartAgent() {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("restart_hermes");
  } catch (e) {
    console.error("restart agent error:", e);
  }
}

async function openLogDir() {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("open_log_dir");
  } catch (e) {
    console.error("open log dir error:", e);
  }
}

async function quitApp() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
