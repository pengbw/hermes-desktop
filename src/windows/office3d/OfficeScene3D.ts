import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface GameMember {
  id: string;
  name: string;
  color: string;
  isUser: boolean;
  isWorking: boolean;
  roleId?: string;
}

export interface WorkflowStep {
  fromRoleId: string | null;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
}

export interface Zone {
  key: string;
  label: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  type: string;
}

const CELL = 2;
const COLS = 16;
const ROWS = 14;
const FLOOR_W = COLS * CELL;
const FLOOR_D = ROWS * CELL;
const WALL_H = 3.2;

const ZONES: Zone[] = [
  { key: "reception", label: "前台", col: 0, row: 0, cols: 2, rows: 2, type: "reception" },
  { key: "desk1", label: "工位A", col: 3, row: 1, cols: 2, rows: 2, type: "desk" },
  { key: "desk2", label: "工位B", col: 6, row: 1, cols: 2, rows: 2, type: "desk" },
  { key: "desk3", label: "工位C", col: 9, row: 1, cols: 2, rows: 2, type: "desk" },
  { key: "meeting", label: "会议室", col: 12, row: 0, cols: 4, rows: 4, type: "meeting" },
  { key: "desk4", label: "工位D", col: 3, row: 4, cols: 2, rows: 2, type: "desk" },
  { key: "desk5", label: "工位E", col: 6, row: 4, cols: 2, rows: 2, type: "desk" },
  { key: "desk6", label: "工位F", col: 9, row: 4, cols: 2, rows: 2, type: "desk" },
  { key: "whiteboard", label: "白板区", col: 12, row: 5, cols: 4, rows: 2, type: "whiteboard" },
  { key: "lounge", label: "休息区", col: 0, row: 8, cols: 4, rows: 4, type: "lounge" },
  { key: "watercooler", label: "茶水间", col: 5, row: 8, cols: 3, rows: 3, type: "watercooler" },
];

function c2w(col: number, row: number) {
  return { x: col * CELL + CELL / 2, z: row * CELL + CELL / 2 };
}

interface WalkAnim {
  memberId: string;
  path: { col: number; row: number }[];
  step: number;
  t: number;
}

interface DeliveryAnim {
  fromMemberId: string;
  toMemberId: string;
  artifactType: string;
  fromRoleId: string | null;
  toRoleId: string;
  phase: "walk_to" | "transfer" | "walk_back";
  transferT: number;
  homeCol: number;
  homeRow: number;
  artifactMesh: THREE.Group | null;
}

export class OfficeScene3D {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  clock: THREE.Clock;
  animId = 0;
  disposed = false;

  dirLight!: THREE.DirectionalLight;
  ambLight!: THREE.AmbientLight;
  hemiLight!: THREE.HemisphereLight;

  members: GameMember[] = [];
  charGroups: Map<string, THREE.Group> = new Map();
  charLabelEls: Map<string, HTMLElement> = new Map();
  charHomeDesks: Map<string, { col: number; row: number }> = new Map();
  pathGrid: boolean[][] = [];
  walkAnims: WalkAnim[] = [];
  workflows: WorkflowStep[] = [];
  deliveryAnims: DeliveryAnim[] = [];
  artifactMeshes: THREE.Group[] = [];

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  floorMesh!: THREE.Mesh;
  container: HTMLElement;
  labelContainer!: HTMLElement;

  onZoneClick?: (z: Zone) => void;
  onSpeak?: (id: string, txt: string) => void;
  onDeliverComplete?: (fromRoleId: string | null, toRoleId: string, artifactType: string) => void;

  tod = 0.3;
  nightOverlay!: THREE.Mesh;
  aiTimer = 0;

  constructor(container: HTMLElement, members: GameMember[]) {
    this.container = container;
    this.members = members;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd6e4f0);
    this.scene.fog = new THREE.FogExp2(0xd6e4f0, 0.008);

    const aspect = container.clientWidth / (container.clientHeight || 500) || 1.6;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.camera.position.set(FLOOR_W * 0.6, 24, FLOOR_D * 0.9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight || 500);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.borderRadius = "8px";

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(FLOOR_W / 2, 0, FLOOR_D / 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 50;
    this.controls.update();

    this.clock = new THREE.Clock();

    this.initPathGrid();
    this.setupLighting();
    this.buildFloor();
    this.buildWalls();
    this.buildFurniture();
    this.buildPlants();
    this.buildDecorations();

    this.labelContainer = document.createElement("div");
    this.labelContainer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;";
    container.style.position = "relative";
    container.appendChild(this.labelContainer);

    this.createCharacters();
    this.setupInteraction();

    this.animate();

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const obs = new ResizeObserver(onResize);
    obs.observe(container);
  }

  initPathGrid() {
    this.pathGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(true));
    for (const z of ZONES) {
      for (let r = z.row; r < z.row + z.rows; r++) {
        for (let c = z.col; c < z.col + z.cols; c++) {
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
            this.pathGrid[r][c] = false;
          }
        }
      }
    }
  }

  setupLighting() {
    this.ambLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambLight);

    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.4);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    this.dirLight.position.set(FLOOR_W * 0.7, 18, FLOOR_D * 0.3);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 60;
    this.dirLight.shadow.camera.left = -FLOOR_W;
    this.dirLight.shadow.camera.right = FLOOR_W;
    this.dirLight.shadow.camera.top = FLOOR_D;
    this.dirLight.shadow.camera.bottom = -FLOOR_D;
    this.dirLight.shadow.bias = -0.001;
    this.scene.add(this.dirLight);

    const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.3);
    fillLight.position.set(-5, 10, FLOOR_D);
    this.scene.add(fillLight);
  }

  buildFloor() {
    const floorGeo = new THREE.PlaneGeometry(FLOOR_W, FLOOR_D);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe8e0d4,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(FLOOR_W / 2, 0, FLOOR_D / 2);
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);

    const gridHelper = new THREE.GridHelper(Math.max(FLOOR_W, FLOOR_D), Math.max(COLS, ROWS), 0xcccccc, 0xdddddd);
    gridHelper.position.set(FLOOR_W / 2, 0.01, FLOOR_D / 2);
    (gridHelper.material as THREE.Material).opacity = 0.15;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);

    for (const z of ZONES) {
      const zoneColor = this.getZoneColor(z.type);
      const zoneGeo = new THREE.PlaneGeometry(z.cols * CELL - 0.1, z.rows * CELL - 0.1);
      const zoneMat = new THREE.MeshStandardMaterial({
        color: zoneColor,
        roughness: 0.9,
        metalness: 0.02,
        transparent: true,
        opacity: 0.6,
      });
      const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
      zoneMesh.rotation.x = -Math.PI / 2;
      zoneMesh.position.set(z.col * CELL + (z.cols * CELL) / 2, 0.02, z.row * CELL + (z.rows * CELL) / 2);
      zoneMesh.receiveShadow = true;
      zoneMesh.userData = { zone: z };
      this.scene.add(zoneMesh);
    }
  }

  getZoneColor(type: string): number {
    switch (type) {
      case "meeting": return 0xd4e6f1;
      case "lounge": return 0xe8daef;
      case "watercooler": return 0xd5f5e3;
      case "reception": return 0xfdebd0;
      case "whiteboard": return 0xf2f3f4;
      case "desk": return 0xfaf0e6;
      default: return 0xe8e8e8;
    }
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.85, metalness: 0.05 });
    const wallMatInner = new THREE.MeshStandardMaterial({ color: 0xeaecee, roughness: 0.9, metalness: 0.02 });
    const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.7, metalness: 0.1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x8e9eae, roughness: 0.6, metalness: 0.15 });

    const backWallGeo = new THREE.BoxGeometry(FLOOR_W, WALL_H, 0.2);
    const backWall = new THREE.Mesh(backWallGeo, [wallMat, wallMat, crownMat, baseboardMat, wallMatInner, wallMatInner]);
    backWall.position.set(FLOOR_W / 2, WALL_H / 2, -0.1);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const leftWallGeo = new THREE.BoxGeometry(0.2, WALL_H, FLOOR_D);
    const leftWall = new THREE.Mesh(leftWallGeo, [wallMat, wallMat, crownMat, baseboardMat, wallMatInner, wallMatInner]);
    leftWall.position.set(-0.1, WALL_H / 2, FLOOR_D / 2);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWallGeo = new THREE.BoxGeometry(0.2, WALL_H, FLOOR_D);
    const rightWall = new THREE.Mesh(rightWallGeo, [wallMat, wallMat, crownMat, baseboardMat, wallMatInner, wallMatInner]);
    rightWall.position.set(FLOOR_W + 0.1, WALL_H / 2, FLOOR_D / 2);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    this.buildWindows();
  }

  buildWindows() {
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x85c1e9,
      transparent: true,
      opacity: 0.3,
      roughness: 0.02,
      metalness: 0.95,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.3, metalness: 0.7 });
    const sillMat = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.5, metalness: 0.1 });

    const windowConfigs = [
      { x: 3 * CELL, z: -0.1, rotY: 0, w: 4 * CELL, h: WALL_H - 0.3 },
      { x: 8 * CELL, z: -0.1, rotY: 0, w: 4 * CELL, h: WALL_H - 0.3 },
      { x: 13 * CELL, z: -0.1, rotY: 0, w: 4 * CELL, h: WALL_H - 0.3 },
      { x: -0.1, z: 2 * CELL, rotY: Math.PI / 2, w: 4 * CELL, h: WALL_H - 0.3 },
      { x: -0.1, z: 7 * CELL, rotY: Math.PI / 2, w: 4 * CELL, h: WALL_H - 0.3 },
      { x: -0.1, z: 11 * CELL, rotY: Math.PI / 2, w: 4 * CELL, h: WALL_H - 0.3 },
    ];

    for (const wc of windowConfigs) {
      const frameGroup = new THREE.Group();

      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(wc.w + 0.1, 0.06, 0.1), frameMat);
      topFrame.position.y = wc.h + 0.15;
      frameGroup.add(topFrame);

      const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(wc.w + 0.1, 0.06, 0.1), frameMat);
      bottomFrame.position.y = 0.15;
      frameGroup.add(bottomFrame);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(wc.w + 0.2, 0.04, 0.15), sillMat);
      sill.position.set(0, 0.12, 0.08);
      frameGroup.add(sill);

      const panelCount = Math.floor(wc.w / (CELL * 1.0));
      const panelW = (wc.w - 0.04 * (panelCount + 1)) / panelCount;
      for (let p = 0; p < panelCount; p++) {
        const px = -wc.w / 2 + 0.04 + panelW / 2 + p * (panelW + 0.04);

        const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, wc.h, 0.06), frameMat);
        mullion.position.set(px - panelW / 2 - 0.02, wc.h / 2 + 0.15, 0);
        frameGroup.add(mullion);

        const glass = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 0.02, wc.h - 0.04), glassMat);
        glass.position.set(px, wc.h / 2 + 0.15, 0.04);
        frameGroup.add(glass);

        const midBar = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.02, 0.03, 0.04), frameMat);
        midBar.position.set(px, wc.h * 0.45 + 0.15, 0.05);
        frameGroup.add(midBar);
      }

      const leftMullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, wc.h, 0.06), frameMat);
      leftMullion.position.set(-wc.w / 2, wc.h / 2 + 0.15, 0);
      frameGroup.add(leftMullion);

      const rightMullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, wc.h, 0.06), frameMat);
      rightMullion.position.set(wc.w / 2, wc.h / 2 + 0.15, 0);
      frameGroup.add(rightMullion);

      frameGroup.position.set(wc.x, 0, wc.z);
      frameGroup.rotation.y = wc.rotY;
      this.scene.add(frameGroup);
    }
  }

  buildFurniture() {
    for (const z of ZONES) {
      switch (z.type) {
        case "desk": this.buildDeskZone(z); break;
        case "meeting": this.buildMeetingZone(z); break;
        case "whiteboard": this.buildWhiteboardZone(z); break;
        case "lounge": this.buildLoungeZone(z); break;
        case "watercooler": this.buildWatercoolerZone(z); break;
        case "reception": this.buildReceptionZone(z); break;
      }
    }
  }

  buildDeskZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const deskMat = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.6, metalness: 0.1 });
    const deskTopMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.5, metalness: 0.05 });

    const topGeo = new THREE.BoxGeometry(2.8, 0.08, 1.4);
    const top = new THREE.Mesh(topGeo, deskTopMat);
    top.position.y = 0.76;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const legGeo = new THREE.BoxGeometry(0.08, 0.76, 0.08);
    const positions = [
      [-1.3, 0.38, -0.6], [1.3, 0.38, -0.6],
      [-1.3, 0.38, 0.6], [1.3, 0.38, 0.6],
    ];
    for (const p of positions) {
      const leg = new THREE.Mesh(legGeo, deskMat);
      leg.position.set(p[0], p[1], p[2]);
      leg.castShadow = true;
      group.add(leg);
    }

    this.buildMonitor(group, -0.5, 0.8, -0.4);
    this.buildKeyboard(group, 0.3, 0.82, 0);
    this.buildCoffeeCup(group, 1.0, 0.84, 0.3);

    this.buildOfficeChair(group, 0, 1.2);

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildMonitor(parent: THREE.Group, x: number, y: number, z: number) {
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3, metalness: 0.5 });
    const screenFaceMat = new THREE.MeshStandardMaterial({
      color: 0x0f3460,
      emissive: 0x1a5276,
      emissiveIntensity: 0.3,
      roughness: 0.1,
      metalness: 0.8,
    });
    const standMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4, metalness: 0.6 });

    const screenGroup = new THREE.Group();

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.04), screenMat);
    bezel.position.y = 0.35;
    bezel.castShadow = true;
    screenGroup.add(bezel);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), screenFaceMat);
    screen.position.set(0, 0.35, 0.025);
    screenGroup.add(screen);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), standMat);
    stand.position.y = -0.05;
    stand.castShadow = true;
    screenGroup.add(stand);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), standMat);
    base.position.y = -0.2;
    base.castShadow = true;
    screenGroup.add(base);

    screenGroup.position.set(x, y, z);
    parent.add(screenGroup);
  }

  buildKeyboard(parent: THREE.Group, x: number, y: number, z: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5, metalness: 0.3 });
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.18), mat);
    kb.position.set(x, y, z);
    kb.castShadow = true;
    parent.add(kb);
  }

  buildCoffeeCup(parent: THREE.Group, x: number, y: number, z: number) {
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.6, metalness: 0.1 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 12), cupMat);
    cup.position.set(x, y, z);
    cup.castShadow = true;
    parent.add(cup);

    const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.3, metalness: 0.2 });
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), coffeeMat);
    coffee.position.set(x, y + 0.05, z);
    parent.add(coffee);
  }

  buildOfficeChair(parent: THREE.Group, x: number, z: number) {
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, metalness: 0.1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.3, metalness: 0.7 });

    const chairGroup = new THREE.Group();

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), seatMat);
    seat.position.y = 0.48;
    seat.castShadow = true;
    chairGroup.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.05), seatMat);
    back.position.set(0, 0.78, -0.22);
    back.castShadow = true;
    chairGroup.add(back);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), metalMat);
    pole.position.y = 0.28;
    chairGroup.add(pole);

    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.04, 5), metalMat);
    baseMesh.position.y = 0.1;
    baseMesh.castShadow = true;
    chairGroup.add(baseMesh);

    const wheelGeo = new THREE.SphereGeometry(0.04, 8, 8);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const wheel = new THREE.Mesh(wheelGeo, metalMat);
      wheel.position.set(Math.cos(angle) * 0.28, 0.04, Math.sin(angle) * 0.28);
      chairGroup.add(wheel);
    }

    chairGroup.position.set(x, 0, z);
    parent.add(chairGroup);
  }

  buildMeetingZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const tableMat = new THREE.MeshStandardMaterial({ color: 0x8e6f47, roughness: 0.5, metalness: 0.1 });
    const topGeo = new THREE.BoxGeometry(4.5, 0.08, 2.2);
    const top = new THREE.Mesh(topGeo, tableMat);
    top.position.y = 0.76;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const legGeo = new THREE.BoxGeometry(0.1, 0.76, 0.1);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5c4528, roughness: 0.6, metalness: 0.1 });
    for (const p of [[-2.0, 0.38, -0.9], [2.0, 0.38, -0.9], [-2.0, 0.38, 0.9], [2.0, 0.38, 0.9]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(p[0], p[1], p[2]);
      leg.castShadow = true;
      group.add(leg);
    }

    for (let i = -2; i <= 2; i++) {
      this.buildOfficeChair(group, i * 0.9, i % 2 === 0 ? -1.3 : 1.3);
    }

    const notepadMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.8 });
    const notepad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.4), notepadMat);
    notepad.position.set(-0.5, 0.82, 0);
    group.add(notepad);

    const markerMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 8), markerMat);
    marker.rotation.z = Math.PI / 2;
    marker.position.set(-0.3, 0.83, 0.1);
    group.add(marker);

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildWhiteboardZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + 0.5;
    const group = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.4, metalness: 0.5 });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 0.08), frameMat);
    frame.position.set(0, 2.0, 0);
    frame.castShadow = true;
    group.add(frame);

    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.0), boardMat);
    board.position.set(0, 2.0, 0.05);
    group.add(board);

    const lineMat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.03, 0.01), lineMat);
      line.position.set(-0.3, 2.5 - i * 0.3, 0.06);
      group.add(line);
    }

    const standMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.4, metalness: 0.6 });
    const standL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), standMat);
    standL.position.set(-2.2, 0.6, 0);
    group.add(standL);
    const standR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), standMat);
    standR.position.set(2.2, 0.6, 0);
    group.add(standR);

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildLoungeZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x6c5ce7, roughness: 0.8, metalness: 0.05 });
    const sofaDarkMat = new THREE.MeshStandardMaterial({ color: 0x5b4cdb, roughness: 0.8, metalness: 0.05 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.6, metalness: 0.1 });

    const sofaSeat = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 1.2), sofaMat);
    sofaSeat.position.set(0, 0.35, 0);
    sofaSeat.castShadow = true;
    group.add(sofaSeat);

    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.7, 0.2), sofaDarkMat);
    sofaBack.position.set(0, 0.7, -0.5);
    sofaBack.castShadow = true;
    group.add(sofaBack);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.2), sofaDarkMat);
    armL.position.set(-1.65, 0.5, 0);
    group.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.2), sofaDarkMat);
    armR.position.set(1.65, 0.5, 0);
    group.add(armR);

    for (const px of [-1.4, -0.5, 0.5, 1.4]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), legMat);
      leg.position.set(px, 0.1, 0.4);
      group.add(leg);
    }

    const cushionMat = new THREE.MeshStandardMaterial({ color: 0xa29bfe, roughness: 0.9 });
    for (const px of [-0.8, 0.8]) {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.35), cushionMat);
      cushion.position.set(px, 0.56, 0.1);
      cushion.rotation.y = px > 0 ? 0.2 : -0.2;
      group.add(cushion);
    }

    const tableMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.5, metalness: 0.1 });
    const coffeeTable = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16), tableMat);
    coffeeTable.position.set(0, 0.2, 1.5);
    coffeeTable.castShadow = true;
    group.add(coffeeTable);

    const mugMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 12), mugMat);
    mug.position.set(0.15, 0.45, 1.5);
    group.add(mug);

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildWatercoolerZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const counterMat = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.4, metalness: 0.2 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 0.8), counterMat);
    counter.position.set(0, 0.45, -0.5);
    counter.castShadow = true;
    group.add(counter);

    const machineMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.3, metalness: 0.5 });
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), machineMat);
    machine.position.set(-0.8, 1.5, -0.5);
    machine.castShadow = true;
    group.add(machine);

    const waterMat = new THREE.MeshStandardMaterial({ color: 0x5dade2, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.3 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12), waterMat);
    water.position.set(-0.8, 2.25, -0.5);
    group.add(water);

    const cupMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 8), cupMat);
      cup.position.set(0.5 + i * 0.12, 0.95, -0.5);
      group.add(cup);
    }

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildReceptionZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const deskMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.5, metalness: 0.1 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.0), deskMat);
    desk.position.y = 0.76;
    desk.castShadow = true;
    desk.receiveShadow = true;
    group.add(desk);

    const panelMat = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.6, metalness: 0.1 });
    const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.76, 0.05), panelMat);
    frontPanel.position.set(0, 0.38, 0.48);
    group.add(frontPanel);

    this.buildMonitor(group, -0.4, 0.8, -0.2);

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildBookshelves() {
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.6, metalness: 0.1 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x6b4f12, roughness: 0.7 });

    const shelfConfigs = [
      { x: FLOOR_W + 0.05, z: 2 * CELL, rotY: 0, w: 0.4, h: 2.4, d: 1.8 },
      { x: FLOOR_W + 0.05, z: 5 * CELL, rotY: 0, w: 0.4, h: 2.0, d: 1.8 },
      { x: FLOOR_W + 0.05, z: 10 * CELL, rotY: 0, w: 0.4, h: 2.4, d: 1.8 },
      { x: 2 * CELL, z: -0.05, rotY: Math.PI / 2, w: 0.4, h: 2.0, d: 2.0 },
      { x: 11 * CELL, z: -0.05, rotY: Math.PI / 2, w: 0.4, h: 2.0, d: 2.0 },
    ];

    const bookColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x2c3e50];

    for (const sc of shelfConfigs) {
      const group = new THREE.Group();

      const back = new THREE.Mesh(new THREE.BoxGeometry(sc.w, sc.h, sc.d), backMat);
      back.position.y = sc.h / 2;
      back.castShadow = true;
      group.add(back);

      const sideL = new THREE.Mesh(new THREE.BoxGeometry(sc.w, sc.h, 0.04), shelfMat);
      sideL.position.set(0, sc.h / 2, -sc.d / 2 + 0.02);
      group.add(sideL);

      const sideR = new THREE.Mesh(new THREE.BoxGeometry(sc.w, sc.h, 0.04), shelfMat);
      sideR.position.set(0, sc.h / 2, sc.d / 2 - 0.02);
      group.add(sideR);

      const shelfCount = Math.floor(sc.h / 0.5);
      for (let i = 0; i <= shelfCount; i++) {
        const shelfY = i * (sc.h / shelfCount);
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(sc.w + 0.02, 0.03, sc.d), shelfMat);
        shelf.position.y = shelfY;
        shelf.castShadow = true;
        group.add(shelf);

        if (i < shelfCount) {
          const bookAreaH = sc.h / shelfCount - 0.06;
          const bookAreaZ = sc.d - 0.1;
          const booksPerShelf = Math.floor(bookAreaZ / 0.12);
          let bookZ = -bookAreaZ / 2 + 0.06;

          for (let b = 0; b < booksPerShelf; b++) {
            if (Math.random() < 0.15) continue;
            const bookH = bookAreaH * (0.6 + Math.random() * 0.35);
            const bookW = 0.03 + Math.random() * 0.04;
            const bookColor = bookColors[Math.floor(Math.random() * bookColors.length)];
            const bookMat = new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.7 });
            const book = new THREE.Mesh(new THREE.BoxGeometry(sc.w * 0.8, bookH, bookW), bookMat);
            book.position.set(0, shelfY + 0.03 + bookH / 2, bookZ);
            group.add(book);
            bookZ += bookW + 0.01;
          }

          if (i === shelfCount - 1 || (i === 0 && Math.random() > 0.5)) {
            const trophyMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.2, metalness: 0.8 });
            const trophyBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), trophyMat);
            trophyBase.position.set(0, shelfY + 0.04, bookAreaZ / 2 - 0.15);
            group.add(trophyBase);

            const trophyCup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.12, 12), trophyMat);
            trophyCup.position.set(0, shelfY + 0.12, bookAreaZ / 2 - 0.15);
            group.add(trophyCup);

            const trophyTop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), trophyMat);
            trophyTop.position.set(0, shelfY + 0.2, bookAreaZ / 2 - 0.15);
            group.add(trophyTop);
          }
        }
      }

      group.position.set(sc.x, 0, sc.z);
      group.rotation.y = sc.rotY;
      this.scene.add(group);
    }
  }

  buildCornerWaterDispenser() {
    const corners = [
      { x: FLOOR_W - 0.5, z: FLOOR_D - 0.5 },
      { x: 0.5, z: FLOOR_D - 0.5 },
    ];

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.3, metalness: 0.5 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x5dade2, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.3 });
    const tapMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.2, metalness: 0.8 });
    const dripMat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.1, metalness: 0.5 });

    for (const corner of corners) {
      const group = new THREE.Group();

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), bodyMat);
      body.position.y = 0.5;
      body.castShadow = true;
      group.add(body);

      const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), bodyMat);
      top.position.y = 1.025;
      group.add(top);

      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12), waterMat);
      bottle.position.y = 1.27;
      group.add(bottle);

      const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.1, 12), waterMat);
      bottleNeck.position.y = 1.52;
      group.add(bottleNeck);

      const tapL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8), tapMat);
      tapL.rotation.z = Math.PI / 2;
      tapL.position.set(0.22, 0.75, 0);
      group.add(tapL);

      const tapR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8), tapMat);
      tapR.rotation.z = Math.PI / 2;
      tapR.position.set(0.22, 0.6, 0);
      group.add(tapR);

      const drip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), dripMat);
      drip.position.set(0.25, 0.72, 0);
      group.add(drip);

      const cupHolder = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.15), tapMat);
      cupHolder.position.set(0.22, 0.5, 0);
      group.add(cupHolder);

      const cupMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.6, transparent: true, opacity: 0.8 });
      for (let i = 0; i < 2; i++) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.06, 8), cupMat);
        cup.position.set(0.22, 0.54, -0.03 + i * 0.06);
        group.add(cup);
      }

      group.position.set(corner.x, 0, corner.z);
      this.scene.add(group);
    }
  }

  buildPlants() {
    const wallPlants = [
      { col: 0.3, row: 0.3, type: "tall", wall: "back-left" },
      { col: 15.3, row: 0.3, type: "tall", wall: "back-right" },
      { col: 0.3, row: 5, type: "potted", wall: "left" },
      { col: 0.3, row: 13.3, type: "tall", wall: "left-bottom" },
      { col: 15.3, row: 5, type: "potted", wall: "right" },
      { col: 15.3, row: 8, type: "tall", wall: "right" },
      { col: 15.3, row: 13.3, type: "potted", wall: "right-bottom" },
      { col: 7, row: 0.3, type: "potted", wall: "back" },
    ];

    for (const pp of wallPlants) {
      const x = pp.col * CELL + CELL / 2;
      const z = pp.row * CELL + CELL / 2;
      switch (pp.type) {
        case "tall": this.buildTallPlant(x, z); break;
        case "potted": this.buildPottedPlant(x, z); break;
        case "small": this.buildSmallPlant(x, z); break;
      }
    }
  }

  buildTallPlant(x: number, z: number) {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.1 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 12), potMat);
    pot.position.y = 0.2;
    pot.castShadow = true;
    group.add(pot);

    const soilMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 12), soilMat);
    soil.position.y = 0.4;
    group.add(soil);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 0.8 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 8), trunkMat);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    group.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.7, metalness: 0.05 });
    const leafPositions = [
      { y: 1.5, r: 0.4, s: 0.5 },
      { y: 1.7, r: 0.35, s: 0.45 },
      { y: 1.9, r: 0.3, s: 0.4 },
      { y: 2.1, r: 0.2, s: 0.35 },
    ];
    for (const lp of leafPositions) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(lp.s, 8, 8), leafMat);
      leaf.position.set(
        Math.sin(lp.y * 2) * 0.1,
        lp.y,
        Math.cos(lp.y * 2) * 0.1
      );
      leaf.castShadow = true;
      group.add(leaf);
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  buildPottedPlant(x: number, z: number) {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.6, metalness: 0.1 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 12), potMat);
    pot.position.y = 0.15;
    pot.castShadow = true;
    group.add(pot);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), leafMat);
      leaf.position.set(
        Math.cos(angle) * 0.15,
        0.45 + Math.random() * 0.15,
        Math.sin(angle) * 0.15
      );
      leaf.scale.set(1, 0.7, 1);
      leaf.castShadow = true;
      group.add(leaf);
    }

    const topLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), leafMat);
    topLeaf.position.y = 0.6;
    group.add(topLeaf);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  buildSmallPlant(x: number, z: number) {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.7 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.15, 10), potMat);
    pot.position.y = 0.075;
    group.add(pot);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), leafMat);
      leaf.position.set(Math.cos(angle) * 0.06, 0.2, Math.sin(angle) * 0.06);
      group.add(leaf);
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  buildDecorations() {
    this.buildWallArt();
    this.buildCabinets();
    this.buildWallClock();
    this.buildBookshelves();
    this.buildCornerWaterDispenser();
  }

  buildWallArt() {
    const paintings = [
      { x: 4 * CELL, z: 0.15, w: 1.2, h: 0.8, frameColor: 0x5d4e37, artColor: 0x85c1e9 },
      { x: 9 * CELL, z: 0.15, w: 1.0, h: 0.7, frameColor: 0x2c1810, artColor: 0xe74c3c },
      { x: 13 * CELL, z: 0.15, w: 1.2, h: 0.8, frameColor: 0x5d4e37, artColor: 0x27ae60 },
    ];

    for (const p of paintings) {
      const group = new THREE.Group();
      const frameMat = new THREE.MeshStandardMaterial({ color: p.frameColor, roughness: 0.5, metalness: 0.2 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.1, p.h + 0.1, 0.05), frameMat);
      frame.position.y = WALL_H * 0.6;
      group.add(frame);

      const artMat = new THREE.MeshStandardMaterial({ color: p.artColor, roughness: 0.6 });
      const art = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), artMat);
      art.position.set(0, WALL_H * 0.6, 0.03);
      group.add(art);

      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.8 });
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 0.1, p.h - 0.1), whiteMat);
      inner.position.set(0, WALL_H * 0.6, 0.031);
      group.add(inner);

      group.position.set(p.x, 0, p.z);
      this.scene.add(group);
    }

    const sidePaintings = [
      { x: 0.15, z: 3 * CELL, w: 0.7, h: 0.9 },
      { x: 0.15, z: 8 * CELL, w: 0.6, h: 0.8 },
    ];
    for (const p of sidePaintings) {
      const group = new THREE.Group();
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5, metalness: 0.2 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, p.h + 0.1, p.w + 0.1), frameMat);
      frame.position.y = WALL_H * 0.6;
      group.add(frame);

      const artMat = new THREE.MeshStandardMaterial({ color: 0x5dade2, roughness: 0.6 });
      const art = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), artMat);
      art.position.set(0.03, WALL_H * 0.6, 0);
      art.rotation.y = Math.PI / 2;
      group.add(art);

      group.position.set(p.x, 0, p.z);
      this.scene.add(group);
    }
  }

  buildCabinets() {
    const cabinetPositions = [
      { x: 15 * CELL, z: 6 * CELL, w: 0.8, h: 1.8, d: 0.5 },
      { x: 15 * CELL, z: 7 * CELL, w: 0.8, h: 1.2, d: 0.5 },
      { x: 8 * CELL, z: 11 * CELL, w: 1.2, h: 1.0, d: 0.5 },
    ];

    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.6, metalness: 0.1 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.3, metalness: 0.7 });

    for (const cp of cabinetPositions) {
      const group = new THREE.Group();

      const body = new THREE.Mesh(new THREE.BoxGeometry(cp.w, cp.h, cp.d), cabinetMat);
      body.position.y = cp.h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const shelfCount = Math.floor(cp.h / 0.6);
      for (let i = 1; i <= shelfCount; i++) {
        const shelf = new THREE.Mesh(
          new THREE.BoxGeometry(cp.w - 0.05, 0.02, cp.d - 0.05),
          cabinetMat
        );
        shelf.position.y = i * (cp.h / (shelfCount + 1));
        group.add(shelf);

        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8), handleMat);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0, i * (cp.h / (shelfCount + 1)) + 0.08, cp.d / 2 + 0.01);
        group.add(handle);
      }

      group.position.set(cp.x, 0, cp.z);
      this.scene.add(group);
    }
  }

  buildWallClock() {
    const group = new THREE.Group();
    const clockMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4, metalness: 0.3 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.5 });

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), clockMat);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), faceMat);
    face.position.z = 0.03;
    group.add(face);

    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.01), clockMat);
    hourHand.position.set(0, 0.07, 0.04);
    group.add(hourHand);

    const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.01), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
    minHand.position.set(0.05, 0, 0.04);
    minHand.rotation.z = -Math.PI / 3;
    group.add(minHand);

    const centerDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), clockMat);
    centerDot.position.z = 0.05;
    group.add(centerDot);

    group.position.set(8 * CELL, WALL_H * 0.7, 0.15);
    this.scene.add(group);
  }

  createCharacters() {
    const desks = ZONES.filter(z => z.type === "desk");
    this.members.forEach((m, i) => {
      let sc: number, sr: number;
      if (m.isUser) {
        sc = 7; sr = 7;
      } else if (i < desks.length) {
        const d = desks[i - (m.isUser ? 0 : 0)];
        sc = d.col; sr = d.row + d.rows;
      } else {
        sc = 3 + i; sr = 7;
      }

      this.charHomeDesks.set(m.id, { col: sc, row: sr });

      const charGroup = this.buildCharacter(m);
      const pos = c2w(sc, sr);
      charGroup.position.set(pos.x, 0, pos.z);
      charGroup.userData = { col: sc, row: sr, memberId: m.id };
      this.scene.add(charGroup);
      this.charGroups.set(m.id, charGroup);

      const label = document.createElement("div");
      label.textContent = m.name;
      label.style.cssText = `
        position:absolute;
        background:rgba(255,255,255,0.9);
        color:#2c3e50;
        font-size:11px;
        padding:2px 8px;
        border-radius:10px;
        font-family:sans-serif;
        white-space:nowrap;
        pointer-events:none;
        transform:translate(-50%,-100%);
        box-shadow:0 1px 4px rgba(0,0,0,0.15);
      `;
      if (m.isUser) {
        label.style.background = "rgba(231,76,60,0.9)";
        label.style.color = "#fff";
      }
      this.labelContainer.appendChild(label);
      this.charLabelEls.set(m.id, label);
    });
  }

  buildCharacter(m: GameMember): THREE.Group {
    const group = new THREE.Group();
    const color = new THREE.Color(m.color);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xfdebd0, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    hair.position.y = 1.58;
    group.add(hair);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe });
    for (const side of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeWhiteMat);
      eyeWhite.position.set(side * 0.08, 1.55, 0.18);
      group.add(eyeWhite);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
      eye.position.set(side * 0.08, 1.55, 0.21);
      group.add(eye);
    }

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), bodyMat);
    body.position.y = 1.1;
    body.castShadow = true;
    group.add(body);

    const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), armMat);
      arm.position.set(side * 0.26, 1.05, 0);
      arm.castShadow = true;
      group.add(arm);
    }

    const legMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), legMat);
      leg.position.set(side * 0.1, 0.55, 0);
      leg.castShadow = true;
      group.add(leg);

      const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6 });
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), shoeMat);
      shoe.position.set(side * 0.1, 0.28, 0.03);
      group.add(shoe);
    }

    if (m.isUser) {
      const badgeMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xe74c3c, emissiveIntensity: 0.3 });
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.02), badgeMat);
      badge.position.set(0, 1.82, 0.2);
      group.add(badge);
    }

    return group;
  }

  setupInteraction() {
    this.renderer.domElement.addEventListener("click", (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.floorMesh);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const col = Math.floor(point.x / CELL);
        const row = Math.floor(point.z / CELL);

        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
          const zone = ZONES.find(z =>
            col >= z.col && col < z.col + z.cols &&
            row >= z.row && row < z.row + z.rows
          );
          if (zone) {
            this.onZoneClick?.(zone);
            this.moveTo("user", zone.col, zone.row + zone.rows);
          } else {
            this.moveTo("user", col, row);
          }
        }
      }
    });
  }

  moveTo(memberId: string, tc: number, tr: number) {
    const cg = this.charGroups.get(memberId);
    if (!cg) return;
    const cc = cg.userData.col as number;
    const cr = cg.userData.row as number;
    const path = this.bfs(cc, cr, tc, tr);
    if (path.length === 0) return;

    this.walkAnims = this.walkAnims.filter(a => a.memberId !== memberId);
    this.walkAnims.push({ memberId, path, step: 0, t: 0 });
  }

  bfs(fc: number, fr: number, tc: number, tr: number) {
    if (fc === tc && fr === tr) return [];
    const vis = new Set<string>();
    const q: { c: number; r: number; p: { col: number; row: number }[] }[] = [{ c: fc, r: fr, p: [] }];
    vis.add(`${fc},${fr}`);
    const ds = [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 }];
    while (q.length) {
      const cur = q.shift()!;
      for (const d of ds) {
        const nc = cur.c + d.dc, nr = cur.r + d.dr, k = `${nc},${nr}`;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || vis.has(k)) continue;
        const isT = nc === tc && nr === tr;
        if (!this.pathGrid[nr]?.[nc] && !isT) continue;
        const np = [...cur.p, { col: nc, row: nr }];
        if (isT) return np;
        vis.add(k);
        q.push({ c: nc, r: nr, p: np });
      }
    }
    return [];
  }

  setWorkflows(workflows: WorkflowStep[]) {
    this.workflows = workflows;
  }

  deliverArtifact(fromMemberId: string, toMemberId: string, artifactType: string) {
    const fromCg = this.charGroups.get(fromMemberId);
    const toCg = this.charGroups.get(toMemberId);
    if (!fromCg || !toCg) return;

    const fromMember = this.members.find(m => m.id === fromMemberId);
    const toMember = this.members.find(m => m.id === toMemberId);

    const home = this.charHomeDesks.get(fromMemberId);
    if (!home) return;

    const existingDelivery = this.deliveryAnims.find(d => d.fromMemberId === fromMemberId);
    if (existingDelivery) return;

    const toCol = toCg.userData.col as number;
    const toRow = toCg.userData.row as number;
    const nearCol = Math.max(0, Math.min(COLS - 1, toCol));
    const nearRow = Math.max(0, Math.min(ROWS - 1, toRow + 1));

    this.walkAnims = this.walkAnims.filter(a => a.memberId !== fromMemberId);

    const path = this.bfs(fromCg.userData.col as number, fromCg.userData.row as number, nearCol, nearRow);
    if (path.length === 0) {
      const directPath = [{ col: nearCol, row: nearRow }];
      this.walkAnims.push({ memberId: fromMemberId, path: directPath, step: 0, t: 0 });
    } else {
      this.walkAnims.push({ memberId: fromMemberId, path, step: 0, t: 0 });
    }

    const delivery: DeliveryAnim = {
      fromMemberId,
      toMemberId,
      artifactType: artifactType || "文档",
      fromRoleId: fromMember?.roleId || null,
      toRoleId: toMember?.roleId || "",
      phase: "walk_to",
      transferT: 0,
      homeCol: home.col,
      homeRow: home.row,
      artifactMesh: null,
    };
    this.deliveryAnims.push(delivery);
  }

  deliverByRoles(fromRoleId: string | null, toRoleId: string, artifactType: string) {
    const fromMember = fromRoleId
      ? this.members.find(m => m.roleId === fromRoleId)
      : this.members.find(m => m.isUser);
    const toMember = this.members.find(m => m.roleId === toRoleId);
    if (!fromMember || !toMember) return;
    this.deliverArtifact(fromMember.id, toMember.id, artifactType);
  }

  buildArtifactMesh(_artifactType: string): THREE.Group {
    const group = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xf39c12,
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xf39c12,
      emissiveIntensity: 0.15,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.22), boxMat);
    box.castShadow = true;
    group.add(box);

    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
    const ribbonH = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.04, 0.23), ribbonMat);
    ribbonH.position.y = 0;
    group.add(ribbonH);
    const ribbonV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.23, 0.23), ribbonMat);
    ribbonV.position.y = 0;
    group.add(ribbonV);

    const labelMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.8 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.1), labelMat);
    label.position.set(0, 0, 0.115);
    group.add(label);

    return group;
  }

  showBubble(memberId: string, text: string) {
    this.hideBubble(memberId);
    const cg = this.charGroups.get(memberId);
    if (!cg) return;

    const bubble = document.createElement("div");
    bubble.className = "office3d-bubble";
    bubble.dataset.memberId = memberId;
    bubble.innerHTML = `<div class="office3d-bubble-content">${text}</div><div class="office3d-bubble-arrow"></div>`;
    bubble.style.cssText = `
      position:absolute;
      background:rgba(255,255,255,0.95);
      color:#2c3e50;
      font-size:12px;
      padding:6px 12px;
      border-radius:12px;
      max-width:180px;
      box-shadow:0 2px 8px rgba(0,0,0,0.15);
      pointer-events:none;
      transform:translate(-50%,-100%);
      z-index:20;
      font-family:sans-serif;
    `;
    this.labelContainer.appendChild(bubble);

    setTimeout(() => this.hideBubble(memberId), 4000);
  }

  hideBubble(memberId: string) {
    const existing = this.labelContainer.querySelector(`[data-member-id="${memberId}"]`);
    if (existing) existing.remove();
  }

  setTimeOfDay(t: number) {
    this.tod = Math.max(0, Math.min(1, t));
    this.updateLighting();
  }

  updateLighting() {
    const isNight = this.tod > 0.6;
    const nightFactor = isNight ? Math.min(1, (this.tod - 0.6) / 0.3) : 0;

    this.ambLight.intensity = 0.5 - nightFactor * 0.3;
    this.dirLight.intensity = 1.2 - nightFactor * 0.8;
    this.hemiLight.intensity = 0.4 - nightFactor * 0.2;

    if (isNight) {
      this.scene.background = new THREE.Color().lerpColors(
        new THREE.Color(0xd6e4f0),
        new THREE.Color(0x1a1a2e),
        nightFactor
      );
      this.scene.fog = new THREE.FogExp2(
        new THREE.Color().lerpColors(new THREE.Color(0xd6e4f0), new THREE.Color(0x1a1a2e), nightFactor),
        0.008 + nightFactor * 0.005
      );
    } else {
      this.scene.background = new THREE.Color(0xd6e4f0);
      this.scene.fog = new THREE.FogExp2(0xd6e4f0, 0.008);
    }
  }

  updateDeliveryAnims(dt: number) {
    for (let i = this.deliveryAnims.length - 1; i >= 0; i--) {
      const da = this.deliveryAnims[i];
      const fromCg = this.charGroups.get(da.fromMemberId);
      const toCg = this.charGroups.get(da.toMemberId);
      if (!fromCg || !toCg) {
        this.cleanupDelivery(da, i);
        continue;
      }

      if (da.phase === "walk_to") {
        const isWalking = this.walkAnims.some(a => a.memberId === da.fromMemberId);
        if (!isWalking) {
          da.phase = "transfer";
          da.transferT = 0;
          this.showBubble(da.fromMemberId, `📦 交付${da.artifactType}`);

          const artifact = this.buildArtifactMesh(da.artifactType);
          const fromPos = fromCg.position.clone();
          artifact.position.set(fromPos.x, 1.5, fromPos.z);
          this.scene.add(artifact);
          da.artifactMesh = artifact;
          this.artifactMeshes.push(artifact);

          fromCg.rotation.y = Math.atan2(
            toCg.position.x - fromCg.position.x,
            toCg.position.z - fromCg.position.z
          );
        }
      } else if (da.phase === "transfer") {
        da.transferT += dt * 1.2;
        if (da.transferT >= 1) {
          da.transferT = 1;
          da.phase = "walk_back";

          if (da.artifactMesh) {
            this.scene.remove(da.artifactMesh);
            const idx = this.artifactMeshes.indexOf(da.artifactMesh);
            if (idx >= 0) this.artifactMeshes.splice(idx, 1);
            da.artifactMesh.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
              }
            });
            da.artifactMesh = null;
          }

          this.showBubble(da.toMemberId, `✅ 收到${da.artifactType}`);

          const path = this.bfs(
            fromCg.userData.col as number,
            fromCg.userData.row as number,
            da.homeCol,
            da.homeRow
          );
          if (path.length > 0) {
            this.walkAnims = this.walkAnims.filter(a => a.memberId !== da.fromMemberId);
            this.walkAnims.push({ memberId: da.fromMemberId, path, step: 0, t: 0 });
          }
        } else {
          if (da.artifactMesh) {
            const fromPos = fromCg.position.clone();
            const toPos = toCg.position.clone();
            const t = da.transferT;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            da.artifactMesh.position.x = fromPos.x + (toPos.x - fromPos.x) * eased;
            da.artifactMesh.position.z = fromPos.z + (toPos.z - fromPos.z) * eased;
            da.artifactMesh.position.y = 1.5 + Math.sin(eased * Math.PI) * 0.8;
            da.artifactMesh.rotation.y += dt * 3;
          }
        }
      } else if (da.phase === "walk_back") {
        const isWalking = this.walkAnims.some(a => a.memberId === da.fromMemberId);
        if (!isWalking) {
          this.onDeliverComplete?.(da.fromRoleId, da.toRoleId, da.artifactType);
          this.cleanupDelivery(da, i);
        }
      }
    }
  }

  cleanupDelivery(da: DeliveryAnim, index: number) {
    if (da.artifactMesh) {
      this.scene.remove(da.artifactMesh);
      const idx = this.artifactMeshes.indexOf(da.artifactMesh);
      if (idx >= 0) this.artifactMeshes.splice(idx, 1);
      da.artifactMesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.deliveryAnims.splice(index, 1);
  }

  aiTick() {
    const delivering = new Set(this.deliveryAnims.map(d => d.fromMemberId));
    const ai = this.members.filter(m => !m.isUser && !delivering.has(m.id));
    if (!ai.length) return;
    const m = ai[Math.floor(Math.random() * ai.length)];
    const walkable: { c: number; r: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.pathGrid[r][c]) walkable.push({ c, r });
      }
    }
    if (walkable.length) {
      const t = walkable[Math.floor(Math.random() * walkable.length)];
      this.moveTo(m.id, t.c, t.r);
    }
    if (Math.random() < 0.3) {
      const phrases = [
        "思考中...", "正在处理任务...", "需要帮助吗？", "休息一下☕",
        "代码审查完成✓", "方案已更新", "在写文档...", "测试通过✓",
      ];
      this.showBubble(m.id, phrases[Math.floor(Math.random() * phrases.length)]);
    }
  }

  updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    for (const [id, label] of this.charLabelEls) {
      const cg = this.charGroups.get(id);
      if (!cg) continue;

      const pos = new THREE.Vector3(0, 2.0, 0);
      cg.localToWorld(pos);
      pos.project(this.camera);

      const x = (pos.x * 0.5 + 0.5) * w;
      const y = (-pos.y * 0.5 + 0.5) * h;

      if (pos.z > 1) {
        label.style.display = "none";
      } else {
        label.style.display = "block";
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
      }
    }

    const bubbles = this.labelContainer.querySelectorAll("[data-member-id]");
    for (const bubble of bubbles) {
      const memberId = (bubble as HTMLElement).dataset.memberId!;
      const cg = this.charGroups.get(memberId);
      if (!cg) continue;

      const pos = new THREE.Vector3(0, 2.3, 0);
      cg.localToWorld(pos);
      pos.project(this.camera);

      const x = (pos.x * 0.5 + 0.5) * w;
      const y = (-pos.y * 0.5 + 0.5) * h;

      if (pos.z > 1) {
        (bubble as HTMLElement).style.display = "none";
      } else {
        (bubble as HTMLElement).style.display = "block";
        (bubble as HTMLElement).style.left = `${x}px`;
        (bubble as HTMLElement).style.top = `${y}px`;
      }
    }
  }

  animate() {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();
    this.controls.update();

    const speed = 3.0;
    for (let i = this.walkAnims.length - 1; i >= 0; i--) {
      const anim = this.walkAnims[i];
      const cg = this.charGroups.get(anim.memberId);
      if (!cg) { this.walkAnims.splice(i, 1); continue; }

      anim.t += dt * speed;
      if (anim.t >= 1) {
        const wp = anim.path[anim.step];
        const pos = c2w(wp.col, wp.row);
        cg.position.set(pos.x, 0, pos.z);
        cg.userData.col = wp.col;
        cg.userData.row = wp.row;
        anim.step++;
        anim.t = 0;
        if (anim.step >= anim.path.length) {
          this.walkAnims.splice(i, 1);
          continue;
        }
      }

      if (anim.step < anim.path.length) {
        const cur = anim.step === 0
          ? { col: cg.userData.col as number, row: cg.userData.row as number }
          : anim.path[anim.step - 1];
        const next = anim.path[anim.step];
        const from = c2w(cur.col, cur.row);
        const to = c2w(next.col, next.row);
        cg.position.x = from.x + (to.x - from.x) * anim.t;
        cg.position.z = from.z + (to.z - from.z) * anim.t;

        const dx = to.x - from.x;
        const dz = to.z - from.z;
        if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
          cg.rotation.y = Math.atan2(dx, dz);
        }

        const bobPhase = anim.t * Math.PI * 2;
        cg.position.y = Math.abs(Math.sin(bobPhase)) * 0.05;
      }
    }

    this.aiTimer += dt;
    if (this.aiTimer > 5) {
      this.aiTimer = 0;
      this.aiTick();
    }

    this.updateDeliveryAnims(dt);

    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  }

  updateMembers(members: GameMember[]) {
    this.members = members;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animId);

    for (const da of this.deliveryAnims) {
      if (da.artifactMesh) {
        this.scene.remove(da.artifactMesh);
        da.artifactMesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
    this.deliveryAnims = [];
    this.artifactMeshes = [];

    for (const [, label] of this.charLabelEls) {
      label.remove();
    }
    this.charLabelEls.clear();

    if (this.labelContainer) {
      this.labelContainer.remove();
    }

    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
