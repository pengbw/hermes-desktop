import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface OfficeTheme {
  name: string;
  background: number;
  fog: number;
  floor: number;
  wall: number;
  wallInner: number;
  baseboard: number;
  crown: number;
  windowGlass: number;
  desk: number;
  deskTop: number;
  chair: number;
  sofa: number;
  sofaDark: number;
  cushion: number;
  meetingFloor: number;
  loungeFloor: number;
  watercoolerFloor: number;
  receptionFloor: number;
  whiteboardFloor: number;
  deskFloor: number;
  defaultFloor: number;
  ambientIntensity: number;
  dirLightColor: number;
  hemiSky: number;
  hemiGround: number;
  exposure: number;
}

export interface OfficeLayout {
  name: string;
  meetingRoom: boolean;
  lounge: boolean;
  watercooler: boolean;
  reception: boolean;
  whiteboard: boolean;
  deskRows: number;
  deskCols: number;
}

export const OFFICE_LAYOUTS: Record<string, OfficeLayout> = {
  standard: {
    name: "标准布局",
    meetingRoom: true,
    lounge: true,
    watercooler: true,
    reception: true,
    whiteboard: true,
    deskRows: 2,
    deskCols: 3,
  },
  compact: {
    name: "紧凑布局",
    meetingRoom: false,
    lounge: false,
    watercooler: true,
    reception: false,
    whiteboard: true,
    deskRows: 2,
    deskCols: 4,
  },
  open: {
    name: "开放布局",
    meetingRoom: true,
    lounge: true,
    watercooler: true,
    reception: true,
    whiteboard: false,
    deskRows: 3,
    deskCols: 3,
  },
};

export const DEFAULT_LAYOUT = "standard";

export const OFFICE_THEMES: Record<string, OfficeTheme> = {
  tech: {
    name: "科技风",
    background: 0x0a0e27,
    fog: 0x0a0e27,
    floor: 0x1a1a2e,
    wall: 0x16213e,
    wallInner: 0x1a1a3e,
    baseboard: 0x0f3460,
    crown: 0x533483,
    windowGlass: 0x1a5276,
    desk: 0x2c3e50,
    deskTop: 0x34495e,
    chair: 0x1abc9c,
    sofa: 0x2980b9,
    sofaDark: 0x1f6fa5,
    cushion: 0x3498db,
    meetingFloor: 0x1a252f,
    loungeFloor: 0x1a1a3e,
    watercoolerFloor: 0x0e3d2e,
    receptionFloor: 0x2c1810,
    whiteboardFloor: 0x1c2833,
    deskFloor: 0x1a1a2e,
    defaultFloor: 0x1a1a2e,
    ambientIntensity: 0.4,
    dirLightColor: 0xb0c4de,
    hemiSky: 0x4a69bd,
    hemiGround: 0x2c3e50,
    exposure: 1.3,
  },
  cozy: {
    name: "温馨风",
    background: 0xf5e6d3,
    fog: 0xf5e6d3,
    floor: 0xd4a574,
    wall: 0xf0e0c8,
    wallInner: 0xf5e8d6,
    baseboard: 0x8b6914,
    crown: 0xc9a96e,
    windowGlass: 0x85c1e9,
    desk: 0x8b6914,
    deskTop: 0xc68642,
    chair: 0xa0522d,
    sofa: 0xc0392b,
    sofaDark: 0xa93226,
    cushion: 0xe74c3c,
    meetingFloor: 0xfdebd0,
    loungeFloor: 0xe8daef,
    watercoolerFloor: 0xd5f5e3,
    receptionFloor: 0xfdebd0,
    whiteboardFloor: 0xf2f3f4,
    deskFloor: 0xfaf0e6,
    defaultFloor: 0xe8e0d4,
    ambientIntensity: 0.6,
    dirLightColor: 0xfff5e6,
    hemiSky: 0xf5cba7,
    hemiGround: 0x8b7355,
    exposure: 1.0,
  },
  minimal: {
    name: "极简风",
    background: 0xf0f0f0,
    fog: 0xf0f0f0,
    floor: 0xe0e0e0,
    wall: 0xd0d0d0,
    wallInner: 0xe8e8e8,
    baseboard: 0x505050,
    crown: 0xa0a0a0,
    windowGlass: 0xb0c4de,
    desk: 0x505050,
    deskTop: 0x707070,
    chair: 0x404040,
    sofa: 0x606060,
    sofaDark: 0x505050,
    cushion: 0x808080,
    meetingFloor: 0xd8d8d8,
    loungeFloor: 0xdcdcdc,
    watercoolerFloor: 0xd4d4d4,
    receptionFloor: 0xe0e0e0,
    whiteboardFloor: 0xe8e8e8,
    deskFloor: 0xe4e4e4,
    defaultFloor: 0xe0e0e0,
    ambientIntensity: 0.7,
    dirLightColor: 0xffffff,
    hemiSky: 0xd0d0d0,
    hemiGround: 0xa0a0a0,
    exposure: 1.0,
  },
};

export const DEFAULT_THEME = "cozy";

export interface GameMember {
  id: string;
  name: string;
  color: string;
  isWorking: boolean;
  roleId?: string;
  status?: MemberStatus;
}

export type MemberStatus =
  | "idle"
  | "working"
  | "walking"
  | "resting"
  | "socializing"
  | "delivering"
  | "waiting_approval";

export interface MemberState {
  status: MemberStatus;
  targetZone?: string;
  idleAction?: IdleAction;
  idleActionTimer: number;
}

export type IdleAction = "coffee" | "book" | "stretch" | "chat" | "wander" | "none";

export interface WorkflowStep {
  fromRoleId: string;
  toRoleId: string;
  artifactType: string;
  transitionType: string;
  rejectToRoleId: string;
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
  { key: "reception", label: "前台", col: 5, row: 12, cols: 3, rows: 2, type: "reception" },
  { key: "desk1", label: "工位A", col: 3, row: 1, cols: 2, rows: 2, type: "desk" },
  { key: "desk2", label: "工位B", col: 6, row: 1, cols: 2, rows: 2, type: "desk" },
  { key: "desk3", label: "工位C", col: 9, row: 1, cols: 2, rows: 2, type: "desk" },
  { key: "meeting", label: "会议室", col: 12, row: 0, cols: 4, rows: 4, type: "meeting" },
  { key: "desk4", label: "工位D", col: 3, row: 4, cols: 2, rows: 2, type: "desk" },
  { key: "desk5", label: "工位E", col: 6, row: 4, cols: 2, rows: 2, type: "desk" },
  { key: "desk6", label: "工位F", col: 9, row: 4, cols: 2, rows: 2, type: "desk" },
  { key: "whiteboard", label: "白板区", col: 12, row: 5, cols: 4, rows: 2, type: "whiteboard" },
  { key: "lounge", label: "休息区", col: 0, row: 8, cols: 4, rows: 4, type: "lounge" },
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
  fromRoleId: string;
  toRoleId: string;
  phase: "walk_to" | "face_target" | "hand_over" | "transfer" | "receive" | "walk_back";
  transferT: number;
  homeCol: number;
  homeRow: number;
  artifactMesh: THREE.Group | null;
  particles: THREE.Points | null;
  particleLife: number;
}

interface ParticleSystem {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

export class OfficeScene3D {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  clock: THREE.Clock;
  animId = 0;
  disposed = false;
  theme: OfficeTheme;
  layout: OfficeLayout;

  dirLight!: THREE.DirectionalLight;
  ambLight!: THREE.AmbientLight;
  hemiLight!: THREE.HemisphereLight;

  members: GameMember[] = [];
  charGroups: Map<string, THREE.Group> = new Map();
  charLabelEls: Map<string, HTMLElement> = new Map();
  charStatusLabelEls: Map<string, HTMLElement> = new Map();
  charHomeDesks: Map<string, { col: number; row: number }> = new Map();
  pathGrid: boolean[][] = [];
  walkAnims: WalkAnim[] = [];
  workflows: WorkflowStep[] = [];
  deliveryAnims: DeliveryAnim[] = [];
  artifactMeshes: THREE.Group[] = [];
  particleSystems: ParticleSystem[] = [];
  memberStates: Map<string, MemberState> = new Map();
  idleActionInterval = 8;

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  floorMesh!: THREE.Mesh;
  container: HTMLElement;
  labelContainer!: HTMLElement;

  onZoneClick?: (z: Zone) => void;
  onSpeak?: (id: string, txt: string) => void;
  onDeliverComplete?: (fromRoleId: string, toRoleId: string, artifactType: string) => void;

  tod = 0.3;
  nightOverlay!: THREE.Mesh;
  aiTimer = 0;
  receptionistGroup: THREE.Group | null = null;
  receptionistLabel: HTMLElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    container: HTMLElement,
    members: GameMember[],
    themeKey?: string,
    layoutKey?: string
  ) {
    this.container = container;
    this.members = members;
    this.theme = OFFICE_THEMES[themeKey || DEFAULT_THEME] || OFFICE_THEMES[DEFAULT_THEME];
    this.layout = OFFICE_LAYOUTS[layoutKey || DEFAULT_LAYOUT] || OFFICE_LAYOUTS[DEFAULT_LAYOUT];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.background);
    this.scene.fog = new THREE.FogExp2(this.theme.fog, 0.008);

    const aspect = container.clientWidth / (container.clientHeight || 500) || 1.6;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.camera.position.set(FLOOR_W / 2, 15, FLOOR_D + 15);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight || 500);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.theme.exposure;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.borderRadius = "8px";

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(FLOOR_W / 2, 0, FLOOR_D / 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = 0;
    this.controls.enablePan = false;
    this.controls.minDistance = 8;
    const defaultCamDist = this.camera.position.distanceTo(this.controls.target);
    this.controls.maxDistance = defaultCamDist;
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
    this.labelContainer.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;";
    container.style.position = "relative";
    container.appendChild(this.labelContainer);

    this.createCharacters();
    this.initMemberStates();
    this.setupInteraction();

    this.animate();

    const onResize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    this.resizeHandler = onResize;
    window.addEventListener("resize", onResize);
    this.resizeObserver = new ResizeObserver(onResize);
    this.resizeObserver.observe(container);
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
    this.ambLight = new THREE.AmbientLight(0xffffff, this.theme.ambientIntensity);
    this.scene.add(this.ambLight);

    this.hemiLight = new THREE.HemisphereLight(this.theme.hemiSky, this.theme.hemiGround, 0.4);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(this.theme.dirLightColor, 1.2);
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
      color: this.theme.floor,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(FLOOR_W / 2, 0, FLOOR_D / 2);
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);

    const gridHelper = new THREE.GridHelper(
      Math.max(FLOOR_W, FLOOR_D),
      Math.max(COLS, ROWS),
      0xcccccc,
      0xdddddd
    );
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
      zoneMesh.position.set(
        z.col * CELL + (z.cols * CELL) / 2,
        0.02,
        z.row * CELL + (z.rows * CELL) / 2
      );
      zoneMesh.receiveShadow = true;
      zoneMesh.userData = { zone: z };
      this.scene.add(zoneMesh);
    }
  }

  getZoneColor(type: string): number {
    switch (type) {
      case "meeting":
        return this.theme.meetingFloor;
      case "lounge":
        return this.theme.loungeFloor;
      case "reception":
        return this.theme.receptionFloor;
      case "whiteboard":
        return this.theme.whiteboardFloor;
      case "desk":
        return this.theme.deskFloor;
      default:
        return this.theme.defaultFloor;
    }
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: this.theme.wall,
      roughness: 0.85,
      metalness: 0.05,
    });
    const wallMatInner = new THREE.MeshStandardMaterial({
      color: this.theme.wallInner,
      roughness: 0.9,
      metalness: 0.02,
    });
    const baseboardMat = new THREE.MeshStandardMaterial({
      color: this.theme.baseboard,
      roughness: 0.7,
      metalness: 0.1,
    });
    const crownMat = new THREE.MeshStandardMaterial({
      color: this.theme.crown,
      roughness: 0.6,
      metalness: 0.15,
    });

    const backWallGeo = new THREE.BoxGeometry(FLOOR_W, WALL_H, 0.2);
    const backWall = new THREE.Mesh(backWallGeo, [
      wallMat,
      wallMat,
      crownMat,
      baseboardMat,
      wallMatInner,
      wallMatInner,
    ]);
    backWall.position.set(FLOOR_W / 2, WALL_H / 2, -0.1);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const leftWallGeo = new THREE.BoxGeometry(0.2, WALL_H, FLOOR_D);
    const leftWall = new THREE.Mesh(leftWallGeo, [
      wallMat,
      wallMat,
      crownMat,
      baseboardMat,
      wallMatInner,
      wallMatInner,
    ]);
    leftWall.position.set(-0.1, WALL_H / 2, FLOOR_D / 2);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWallGeo = new THREE.BoxGeometry(0.2, WALL_H, FLOOR_D);
    const rightWall = new THREE.Mesh(rightWallGeo, [
      wallMat,
      wallMat,
      crownMat,
      baseboardMat,
      wallMatInner,
      wallMatInner,
    ]);
    rightWall.position.set(FLOOR_W + 0.1, WALL_H / 2, FLOOR_D / 2);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    this.buildWindows();
  }

  buildWindows() {
    const glassMat = new THREE.MeshStandardMaterial({
      color: this.theme.windowGlass,
      transparent: true,
      opacity: 0.3,
      roughness: 0.02,
      metalness: 0.95,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.3,
      metalness: 0.7,
    });
    const sillMat = new THREE.MeshStandardMaterial({
      color: 0xd5d8dc,
      roughness: 0.5,
      metalness: 0.1,
    });

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
      if (z.type === "meeting" && !this.layout.meetingRoom) continue;
      if (z.type === "lounge" && !this.layout.lounge) continue;
      if (z.type === "watercooler" && !this.layout.watercooler) continue;
      if (z.type === "reception" && !this.layout.reception) continue;
      if (z.type === "whiteboard" && !this.layout.whiteboard) continue;
      switch (z.type) {
        case "desk":
          this.buildDeskZone(z);
          break;
        case "meeting":
          this.buildMeetingZone(z);
          break;
        case "whiteboard":
          this.buildWhiteboardZone(z);
          break;
        case "lounge":
          this.buildLoungeZone(z);
          break;
        case "reception":
          this.buildReceptionZone(z);
          break;
      }
    }
  }

  buildDeskZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const deskMat = new THREE.MeshStandardMaterial({
      color: this.theme.desk,
      roughness: 0.6,
      metalness: 0.1,
    });
    const deskTopMat = new THREE.MeshStandardMaterial({
      color: this.theme.deskTop,
      roughness: 0.5,
      metalness: 0.05,
    });

    const topGeo = new THREE.BoxGeometry(2.8, 0.08, 1.4);
    const top = new THREE.Mesh(topGeo, deskTopMat);
    top.position.y = 0.76;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const legGeo = new THREE.BoxGeometry(0.08, 0.76, 0.08);
    const positions = [
      [-1.3, 0.38, -0.6],
      [1.3, 0.38, -0.6],
      [-1.3, 0.38, 0.6],
      [1.3, 0.38, 0.6],
    ];
    for (const p of positions) {
      const leg = new THREE.Mesh(legGeo, deskMat);
      leg.position.set(p[0], p[1], p[2]);
      leg.castShadow = true;
      group.add(leg);
    }

    this.buildMonitor(group, 0.3, 0.8, 0.4);
    this.buildKeyboard(group, 0.3, 0.82, -0.1);
    this.buildCoffeeCup(group, -0.8, 0.84, -0.3);

    this.buildOfficeChair(group, 0.3, -1.2);

    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildMonitor(parent: THREE.Group, x: number, y: number, z: number) {
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.3,
      metalness: 0.5,
    });
    const screenFaceMat = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: 0x4fc3f7,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.8,
    });
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.4,
      metalness: 0.6,
    });

    const screenGroup = new THREE.Group();

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.04), screenMat);
    bezel.position.y = 0.35;
    bezel.castShadow = true;
    screenGroup.add(bezel);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), screenFaceMat);
    screen.position.set(0, 0.35, -0.025);
    screen.rotation.y = Math.PI;
    screenGroup.add(screen);

    const screenLight = new THREE.PointLight(0x4fc3f7, 0.5, 3, 2);
    screenLight.position.set(0, 0.35, -0.5);
    screenGroup.add(screenLight);

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
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5dc,
      roughness: 0.6,
      metalness: 0.1,
    });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 12), cupMat);
    cup.position.set(x, y, z);
    cup.castShadow = true;
    parent.add(cup);

    const coffeeMat = new THREE.MeshStandardMaterial({
      color: 0x3e2723,
      roughness: 0.3,
      metalness: 0.2,
    });
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), coffeeMat);
    coffee.position.set(x, y + 0.05, z);
    parent.add(coffee);
  }

  buildOfficeChair(parent: THREE.Group, x: number, z: number) {
    const seatMat = new THREE.MeshStandardMaterial({
      color: this.theme.chair,
      roughness: 0.7,
      metalness: 0.1,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x7f8c8d,
      roughness: 0.3,
      metalness: 0.7,
    });

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

    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x8e6f47,
      roughness: 0.5,
      metalness: 0.1,
    });
    const topGeo = new THREE.BoxGeometry(4.5, 0.08, 2.2);
    const top = new THREE.Mesh(topGeo, tableMat);
    top.position.y = 0.76;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const legGeo = new THREE.BoxGeometry(0.1, 0.76, 0.1);
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x5c4528,
      roughness: 0.6,
      metalness: 0.1,
    });
    for (const p of [
      [-2.0, 0.38, -0.9],
      [2.0, 0.38, -0.9],
      [-2.0, 0.38, 0.9],
      [2.0, 0.38, 0.9],
    ]) {
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
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xbdc3c7,
      roughness: 0.4,
      metalness: 0.5,
    });
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
    });

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

    const standMat = new THREE.MeshStandardMaterial({
      color: 0x7f8c8d,
      roughness: 0.4,
      metalness: 0.6,
    });
    const standL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), standMat);
    standL.position.set(-2.2, 0.6, 0);
    group.add(standL);
    const standR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), standMat);
    standR.position.set(2.2, 0.6, 0);
    group.add(standR);

    group.rotation.y = -Math.PI / 2;
    group.position.set(z.col * CELL + z.cols * CELL - 0.04, 0, cz + 2.0);
    this.scene.add(group);
  }

  buildLoungeZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const sofaMat = new THREE.MeshStandardMaterial({
      color: this.theme.sofa,
      roughness: 0.8,
      metalness: 0.05,
    });
    const sofaDarkMat = new THREE.MeshStandardMaterial({
      color: this.theme.sofaDark,
      roughness: 0.8,
      metalness: 0.05,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: this.theme.cushion,
      roughness: 0.9,
    });

    const sofa1 = new THREE.Group();
    const seat1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 1.0), sofaMat);
    seat1.position.set(0, 0.32, 0);
    seat1.castShadow = true;
    sofa1.add(seat1);
    const back1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 0.15), sofaDarkMat);
    back1.position.set(0, 0.62, -0.42);
    back1.castShadow = true;
    sofa1.add(back1);
    for (const px of [-1.5, -0.5, 0.5, 1.5]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 })
      );
      leg.position.set(px, 0.1, 0.3);
      sofa1.add(leg);
    }
    for (const px of [-0.7, 0.7]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.4), cushionMat);
      c.position.set(px, 0.5, 0.05);
      c.rotation.y = px > 0 ? 0.15 : -0.15;
      sofa1.add(c);
    }
    sofa1.rotation.y = Math.PI / 2;
    sofa1.position.set(cx - (z.cols * CELL) / 2 + 1.0, 0, cz);
    group.add(sofa1);

    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x5d4e37,
      roughness: 0.6,
      metalness: 0.1,
    });
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.6), cabMat);
    cabinet.position.set(cx - (z.cols * CELL) / 2 + 1.0, 0.45, cz + 2.2);
    cabinet.castShadow = true;
    group.add(cabinet);
    const cabTopMat = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.5,
      metalness: 0.1,
    });
    const cabTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.65), cabTopMat);
    cabTop.position.set(cx - (z.cols * CELL) / 2 + 1.0, 0.92, cz + 2.2);
    group.add(cabTop);

    const cfMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.3,
      metalness: 0.5,
    });
    const cfBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.3), cfMat);
    cfBody.position.set(cx - (z.cols * CELL) / 2 + 1.0, 1.17, cz + 2.2);
    cfBody.castShadow = true;
    group.add(cfBody);
    const cfTopMat = new THREE.MeshStandardMaterial({
      color: 0x34495e,
      roughness: 0.2,
      metalness: 0.6,
    });
    const cfTop = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.06, 0.32), cfTopMat);
    cfTop.position.set(cx - (z.cols * CELL) / 2 + 1.0, 1.42, cz + 2.2);
    group.add(cfTop);
    const cupMat2 = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.6 });
    const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 10), cupMat2);
    cup2.position.set(cx - (z.cols * CELL) / 2 + 1.15, 1.48, cz + 2.2);
    group.add(cup2);
    const steamMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
    });
    for (let i = 0; i < 3; i++) {
      const steam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.12, 6), steamMat);
      steam.position.set(cx - (z.cols * CELL) / 2 + 1.15 + i * 0.02, 1.56 + i * 0.04, cz + 2.2);
      steam.rotation.z = (i - 1) * 0.15;
      group.add(steam);
    }

    const ctMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.3,
      metalness: 0.1,
    });
    const ctTop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 2.1), ctMat);
    ctTop.position.set(cx - (z.cols * CELL) / 2 + 2.5, 0.38, cz);
    ctTop.castShadow = true;
    group.add(ctTop);
    for (const lz of [-0.85, 0.85]) {
      for (const lx of [-0.3, 0.3]) {
        const ctLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8),
          new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5, roughness: 0.3 })
        );
        ctLeg.position.set(cx - (z.cols * CELL) / 2 + 2.5 + lx, 0.175, cz + lz);
        group.add(ctLeg);
      }
    }
    const magMat1 = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8 });
    const mag1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.4), magMat1);
    mag1.position.set(cx - (z.cols * CELL) / 2 + 2.6, 0.42, cz - 0.3);
    mag1.rotation.y = 0.15;
    group.add(mag1);
    const magMat2 = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.8 });
    const mag2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.38), magMat2);
    mag2.position.set(cx - (z.cols * CELL) / 2 + 2.4, 0.44, cz + 0.25);
    mag2.rotation.y = -0.2;
    group.add(mag2);

    const sofa2Positions = [-1.2, 1.2];
    for (const sx of sofa2Positions) {
      const chair = new THREE.Group();
      const seatC = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), sofaMat);
      seatC.position.set(0, 0.3, 0);
      seatC.castShadow = true;
      chair.add(seatC);
      const backC = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.12), sofaDarkMat);
      backC.position.set(0, 0.58, 0.39);
      backC.castShadow = true;
      chair.add(backC);
      for (const lx of [-0.35, 0.35]) {
        for (const lz of [-0.35, 0.35]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8),
            new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 })
          );
          leg.position.set(lx, 0.09, lz);
          chair.add(leg);
        }
      }
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.35), cushionMat);
      c.position.set(0, 0.47, -0.05);
      c.rotation.y = 0.1;
      chair.add(c);
      chair.position.set(cx + sx, 0, cz + (z.rows * CELL) / 2 - 0.8);
      group.add(chair);
    }

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.5,
      metalness: 0.1,
    });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.6), shelfMat);
    shelf.position.set(cx, 0.3, cz + (z.rows * CELL) / 2 - 0.8);
    shelf.castShadow = true;
    group.add(shelf);

    const potMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.7 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.2, 12), potMat);
    pot.position.set(cx, 0.7, cz + (z.rows * CELL) / 2 - 0.8);
    group.add(pot);

    const soilMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12), soilMat);
    soil.position.set(cx, 0.81, cz + (z.rows * CELL) / 2 - 0.8);
    group.add(soil);

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x27ae60,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const leafDarkMat = new THREE.MeshStandardMaterial({
      color: 0x1e8449,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const leafLen = 0.6 + Math.random() * 0.4;
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, leafLen),
        i % 2 === 0 ? leafMat : leafDarkMat
      );
      leaf.position.set(
        cx + Math.cos(angle) * 0.1,
        0.9 + leafLen * 0.3,
        cz + (z.rows * CELL) / 2 - 0.8 + Math.sin(angle) * 0.1
      );
      leaf.rotation.set(-0.3 + Math.random() * 0.3, angle, 0.8 + Math.random() * 0.4);
      group.add(leaf);
    }
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const droopLen = 0.8 + Math.random() * 0.6;
      const vine = new THREE.Mesh(new THREE.PlaneGeometry(0.06, droopLen), leafDarkMat);
      vine.position.set(
        cx + Math.cos(angle) * 0.15,
        0.85 - droopLen * 0.2,
        cz + (z.rows * CELL) / 2 - 0.8 + Math.sin(angle) * 0.15
      );
      vine.rotation.set(1.2 + Math.random() * 0.4, angle, Math.random() * 0.3 - 0.15);
      group.add(vine);
    }

    this.scene.add(group);
  }

  buildReceptionZone(z: Zone) {
    const cx = z.col * CELL + (z.cols * CELL) / 2;
    const cz = z.row * CELL + (z.rows * CELL) / 2;
    const group = new THREE.Group();

    const deskMat = new THREE.MeshStandardMaterial({
      color: this.theme.deskTop,
      roughness: 0.5,
      metalness: 0.1,
    });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.08, 1.0), deskMat);
    desk.position.y = 0.76;
    desk.castShadow = true;
    desk.receiveShadow = true;
    group.add(desk);

    const panelMat = new THREE.MeshStandardMaterial({
      color: this.theme.desk,
      roughness: 0.6,
      metalness: 0.1,
    });
    const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.76, 0.05), panelMat);
    frontPanel.position.set(0, 0.38, 0.48);
    group.add(frontPanel);

    const screenFaceMat = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: 0x4fc3f7,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.8,
    });
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.3,
      metalness: 0.5,
    });
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.4,
      metalness: 0.6,
    });
    const monGroup = new THREE.Group();
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.04), screenMat);
    bezel.position.y = 0.35;
    bezel.castShadow = true;
    monGroup.add(bezel);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), screenFaceMat);
    scr.position.set(0, 0.35, -0.025);
    scr.rotation.y = Math.PI;
    monGroup.add(scr);
    const monLight = new THREE.PointLight(0x4fc3f7, 0.5, 3, 2);
    monLight.position.set(0, 0.35, -0.5);
    monGroup.add(monLight);
    const mStand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), standMat);
    mStand.position.y = -0.05;
    monGroup.add(mStand);
    const mBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), standMat);
    mBase.position.y = -0.2;
    monGroup.add(mBase);
    monGroup.position.set(-0.5, 0.8, 0.2);
    group.add(monGroup);

    const kbMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.5,
      metalness: 0.3,
    });
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.18), kbMat);
    kb.position.set(-0.5, 0.82, -0.15);
    kb.castShadow = true;
    group.add(kb);

    const mouseMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.5,
      metalness: 0.3,
    });
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.16), mouseMat);
    mouse.position.set(-1.1, 0.82, -0.15);
    mouse.castShadow = true;
    group.add(mouse);

    const chairMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.6,
      metalness: 0.2,
    });
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
    chairSeat.position.set(-0.5, 0.45, -0.5);
    chairSeat.castShadow = true;
    group.add(chairSeat);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), chairMat);
    chairBack.position.set(-0.5, 0.72, -0.75);
    chairBack.castShadow = true;
    group.add(chairBack);
    for (const lx of [-0.2, 0.2]) {
      for (const lz of [-0.3, -0.7]) {
        const cleg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8),
          new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.3 })
        );
        cleg.position.set(-0.5 + lx, 0.21, -0.5 + lz + 0.2);
        group.add(cleg);
      }
    }

    const fileColors = [0x2980b9, 0xe74c3c, 0x27ae60, 0xf39c12];
    for (let i = 0; i < 4; i++) {
      const file = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.02, 0.3),
        new THREE.MeshStandardMaterial({ color: fileColors[i], roughness: 0.8 })
      );
      file.position.set(0.6 + i * 0.25, 0.82, 0.15 - (i % 2) * 0.1);
      file.rotation.y = (i - 1.5) * 0.08;
      group.add(file);
    }

    const potMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.4,
      metalness: 0.1,
    });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.2, 12), potMat);
    pot.position.set(-1.8, 0.86, 0.3);
    pot.castShadow = true;
    group.add(pot);
    const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 16), potMat);
    potRim.rotation.x = Math.PI / 2;
    potRim.position.set(-1.8, 0.96, 0.3);
    group.add(potRim);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12), soilMat);
    soil.position.set(-1.8, 0.95, 0.3);
    group.add(soil);
    const cactusMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.7,
      metalness: 0.05,
    });
    const cactusBody = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), cactusMat);
    cactusBody.scale.set(1, 1.3, 1);
    cactusBody.position.set(-1.8, 1.12, 0.3);
    cactusBody.castShadow = true;
    group.add(cactusBody);
    const cactusArm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), cactusMat);
    cactusArm1.position.set(-1.87, 1.15, 0.3);
    cactusArm1.rotation.z = 0.5;
    group.add(cactusArm1);
    const cactusArm1Tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), cactusMat);
    cactusArm1Tip.position.set(-1.9, 1.22, 0.3);
    group.add(cactusArm1Tip);
    const cactusArm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 8), cactusMat);
    cactusArm2.position.set(-1.72, 1.13, 0.3);
    cactusArm2.rotation.z = -0.4;
    group.add(cactusArm2);
    const cactusArm2Tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), cactusMat);
    cactusArm2Tip.position.set(-1.7, 1.19, 0.3);
    group.add(cactusArm2Tip);

    group.rotation.y = Math.PI;
    group.position.set(cx, 0, cz);
    this.scene.add(group);
  }

  buildBookshelves() {
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.6,
      metalness: 0.1,
    });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x6b4f12, roughness: 0.7 });

    const shelfConfigs = [
      { x: FLOOR_W + 0.05, z: 2 * CELL, rotY: 0, w: 0.4, h: 2.4, d: 1.8 },
      { x: FLOOR_W + 0.05, z: 5 * CELL, rotY: 0, w: 0.4, h: 2.0, d: 1.8 },
      { x: FLOOR_W + 0.05, z: 10 * CELL, rotY: 0, w: 0.4, h: 2.4, d: 1.8 },
      { x: 2 * CELL, z: -0.05, rotY: Math.PI / 2, w: 0.4, h: 2.0, d: 2.0 },
      { x: 11 * CELL, z: -0.05, rotY: Math.PI / 2, w: 0.4, h: 2.0, d: 2.0 },
      { x: -0.05, z: 5 * CELL, rotY: Math.PI, w: 0.4, h: 2.6, d: 3.0 },
    ];

    const bookColors = [
      0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x2c3e50,
    ];

    for (const sc of shelfConfigs) {
      const group = new THREE.Group();

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, sc.h, sc.d), backMat);
      back.position.set(sc.w / 2 - 0.02, sc.h / 2, 0);
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
            if (Math.random() < 0.05) continue;
            const bookH = bookAreaH * (0.6 + Math.random() * 0.35);
            const bookW = 0.03 + Math.random() * 0.04;
            const bookColor = bookColors[Math.floor(Math.random() * bookColors.length)];
            const bookMat = new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.7 });
            const book = new THREE.Mesh(new THREE.BoxGeometry(sc.w * 0.8, bookH, bookW), bookMat);
            book.position.set(
              -sc.w / 2 + (sc.w * 0.8) / 2 + 0.02,
              shelfY + 0.03 + bookH / 2,
              bookZ
            );
            group.add(book);
            bookZ += bookW + 0.01;
          }

          if (i === shelfCount - 1 || (i === 0 && Math.random() > 0.5)) {
            const trophyMat = new THREE.MeshStandardMaterial({
              color: 0xf1c40f,
              roughness: 0.2,
              metalness: 0.8,
            });
            const trophyBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), trophyMat);
            trophyBase.position.set(-sc.w / 2 + 0.08, shelfY + 0.04, bookAreaZ / 2 - 0.15);
            group.add(trophyBase);

            const trophyCup = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.06, 0.12, 12),
              trophyMat
            );
            trophyCup.position.set(-sc.w / 2 + 0.08, shelfY + 0.12, bookAreaZ / 2 - 0.15);
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

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xecf0f1,
      roughness: 0.3,
      metalness: 0.5,
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x5dade2,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      metalness: 0.3,
    });
    const tapMat = new THREE.MeshStandardMaterial({
      color: 0xbdc3c7,
      roughness: 0.2,
      metalness: 0.8,
    });
    const dripMat = new THREE.MeshStandardMaterial({
      color: 0x3498db,
      roughness: 0.1,
      metalness: 0.5,
    });

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

      const cupMat = new THREE.MeshStandardMaterial({
        color: 0xfdfefe,
        roughness: 0.6,
        transparent: true,
        opacity: 0.8,
      });
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
      { col: 0.15, row: 11.5, type: "tall", wall: "left-bottom" },
      { col: 15.3, row: 8.5, type: "potted", wall: "right" },
      { col: 15.3, row: 10.5, type: "tall", wall: "right" },
      { col: 15.3, row: 13.3, type: "potted", wall: "right-bottom" },
      { col: 7, row: 0.3, type: "potted", wall: "back" },
    ];

    for (const pp of wallPlants) {
      const x = pp.col * CELL + CELL / 2;
      const z = pp.row * CELL + CELL / 2;
      switch (pp.type) {
        case "tall":
          this.buildTallPlant(x, z);
          break;
        case "potted":
          this.buildPottedPlant(x, z);
          break;
        case "small":
          this.buildSmallPlant(x, z);
          break;
      }
    }
  }

  buildTallPlant(x: number, z: number) {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7,
      metalness: 0.1,
    });
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

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x27ae60,
      roughness: 0.7,
      metalness: 0.05,
    });
    const leafPositions = [
      { y: 1.5, r: 0.4, s: 0.5 },
      { y: 1.7, r: 0.35, s: 0.45 },
      { y: 1.9, r: 0.3, s: 0.4 },
      { y: 2.1, r: 0.2, s: 0.35 },
    ];
    for (const lp of leafPositions) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(lp.s, 8, 8), leafMat);
      leaf.position.set(Math.sin(lp.y * 2) * 0.1, lp.y, Math.cos(lp.y * 2) * 0.1);
      leaf.castShadow = true;
      group.add(leaf);
    }

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  buildPottedPlant(x: number, z: number) {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xd35400,
      roughness: 0.6,
      metalness: 0.1,
    });
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
      const frameMat = new THREE.MeshStandardMaterial({
        color: p.frameColor,
        roughness: 0.5,
        metalness: 0.2,
      });
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
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x2c3e50,
        roughness: 0.5,
        metalness: 0.2,
      });
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
    const cabinetPositions: { x: number; z: number; w: number; h: number; d: number }[] = [];

    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.6,
      metalness: 0.1,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xbdc3c7,
      roughness: 0.3,
      metalness: 0.7,
    });

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
    const clockMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.4,
      metalness: 0.3,
    });
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

    const minHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.2, 0.01),
      new THREE.MeshStandardMaterial({ color: 0xe74c3c })
    );
    minHand.position.set(0.05, 0, 0.04);
    minHand.rotation.z = -Math.PI / 3;
    group.add(minHand);

    const centerDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), clockMat);
    centerDot.position.z = 0.05;
    group.add(centerDot);

    group.position.set(8 * CELL, WALL_H * 0.7, 0.15);
    this.scene.add(group);
  }

  createReceptionist() {
    if (!this.layout.reception) return;

    const rz = ZONES.find((z) => z.key === "reception");
    if (!rz) return;

    const cx = rz.col * CELL + (rz.cols * CELL) / 2;
    const cz = rz.row * CELL + (rz.rows * CELL) / 2;

    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf5cba7,
      roughness: 0.7,
      metalness: 0.05,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.3 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0xe8b4b8,
      roughness: 0.6,
      metalness: 0.05,
    });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.5,
      metalness: 0.2,
    });
    const handMat = new THREE.MeshStandardMaterial({
      color: 0xf5cba7,
      roughness: 0.7,
      metalness: 0.05,
    });

    const baseY = -0.4;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12), skinMat);
    neck.position.y = baseY + 1.38;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skinMat);
    head.position.y = baseY + 1.58;
    head.scale.set(1, 1.05, 0.95);
    head.castShadow = true;
    group.add(head);

    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat
    );
    hairTop.position.y = baseY + 1.62;
    group.add(hairTop);

    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.5),
      hairMat
    );
    hairBack.position.set(0, baseY + 1.55, -0.02);
    group.add(hairBack);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skinMat);
      ear.position.set(side * 0.19, baseY + 1.56, 0.0);
      ear.scale.set(0.5, 1, 0.7);
      group.add(ear);
    }

    for (const side of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), eyeWhiteMat);
      eyeWhite.position.set(side * 0.07, baseY + 1.6, 0.16);
      eyeWhite.scale.set(1.2, 0.8, 0.5);
      group.add(eyeWhite);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMat);
      eye.position.set(side * 0.07, baseY + 1.6, 0.19);
      group.add(eye);
      const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), hairMat);
      eyebrow.position.set(side * 0.07, baseY + 1.65, 0.17);
      eyebrow.rotation.z = side * 0.1;
      group.add(eyebrow);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 6), skinMat);
    nose.position.set(0, baseY + 1.55, 0.19);
    nose.rotation.x = -0.3;
    group.add(nose);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), lipMat);
    mouth.position.set(0, baseY + 1.5, 0.17);
    group.add(mouth);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.22), shirtMat);
    torso.position.y = baseY + 1.08;
    torso.castShadow = true;
    group.add(torso);

    const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), collarMat);
    collarL.position.set(-0.06, baseY + 1.32, 0.1);
    collarL.rotation.z = 0.3;
    group.add(collarL);
    const collarR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), collarMat);
    collarR.position.set(0.06, baseY + 1.32, 0.1);
    collarR.rotation.z = -0.3;
    group.add(collarR);

    for (const side of [-1, 1]) {
      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), shirtMat);
      upperArm.position.set(side * 0.24, baseY + 1.08, -0.05);
      upperArm.rotation.z = side * 0.15;
      upperArm.rotation.x = -0.3;
      upperArm.castShadow = true;
      group.add(upperArm);

      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), shirtMat);
      forearm.position.set(side * 0.22, 0.82, -0.22);
      forearm.rotation.x = -0.8;
      forearm.castShadow = true;
      forearm.name = side === -1 ? "leftForearm" : "rightForearm";
      group.add(forearm);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.09), handMat);
      hand.position.set(side * 0.18, 0.74, -0.35);
      hand.rotation.x = -0.2;
      hand.name = side === -1 ? "leftHand" : "rightHand";
      group.add(hand);
    }

    const hipMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.13), hipMat);
      thigh.position.set(side * 0.09, baseY + 0.68, 0.1);
      thigh.rotation.x = -1.2;
      thigh.castShadow = true;
      group.add(thigh);

      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.35, 0.11), pantsMat);
      shin.position.set(side * 0.09, 0.38, 0.35);
      shin.rotation.x = -Math.PI / 2.5;
      group.add(shin);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), shoeMat);
      shoe.position.set(side * 0.09, 0.12, 0.48);
      shoe.rotation.x = -Math.PI / 2.5;
      group.add(shoe);
    }

    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0xe8b4b8,
      emissive: 0xe8b4b8,
      emissiveIntensity: 0.3,
    });
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.02), badgeMat);
    badge.position.set(0, baseY + 1.18, 0.12);
    group.add(badge);

    group.position.set(cx + 0.5, 0.17, cz + 0.5);
    group.rotation.y = Math.PI;
    this.scene.add(group);
    this.receptionistGroup = group;

    const label = document.createElement("div");
    label.textContent = "前台·Miko";
    label.style.cssText = `
      position:absolute;
      background:rgba(232,180,184,0.9);
      color:#fff;
      font-size:11px;
      padding:2px 8px;
      border-radius:10px;
      font-family:sans-serif;
      white-space:nowrap;
      pointer-events:none;
      transform:translate(-50%,-100%);
      box-shadow:0 1px 4px rgba(0,0,0,0.15);
    `;
    this.labelContainer.appendChild(label);
    this.receptionistLabel = label;
  }

  createCharacters() {
    this.createReceptionist();

    const desks = ZONES.filter((z) => z.type === "desk");
    this.members.forEach((m, i) => {
      let sc: number, sr: number;
      const seated = false;
      if (i < desks.length) {
        const d = desks[i];
        const deskCx = d.col * CELL + (d.cols * CELL) / 2;
        const deskCz = d.row * CELL + (d.rows * CELL) / 2;
        sc = -1;
        sr = -1;
        const charGroup = this.buildCharacter(m, true);
        charGroup.position.set(deskCx + 0.3, 0, deskCz - 1.2);
        charGroup.userData = {
          col: d.col + 0.5,
          row: d.row + d.rows - 0.3,
          memberId: m.id,
          seated: true,
        };
        this.charHomeDesks.set(m.id, { col: d.col + 0.5, row: d.row + d.rows - 0.3 });
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
        this.labelContainer.appendChild(label);
        this.charLabelEls.set(m.id, label);

        const statusLabel = document.createElement("div");
        statusLabel.textContent = "🟢 空闲";
        statusLabel.style.cssText = `
          position:absolute;
          background:rgba(255,255,255,0.85);
          color:#555;
          font-size:10px;
          padding:1px 6px;
          border-radius:8px;
          font-family:sans-serif;
          white-space:nowrap;
          pointer-events:none;
          transform:translate(-50%,0);
          box-shadow:0 1px 3px rgba(0,0,0,0.1);
          margin-top:2px;
        `;
        this.labelContainer.appendChild(statusLabel);
        this.charStatusLabelEls.set(m.id, statusLabel);

        return;
      } else {
        sc = 3 + i;
        sr = 7;
      }

      this.charHomeDesks.set(m.id, { col: sc, row: sr });

      const charGroup = this.buildCharacter(m, seated);
      const pos = c2w(sc, sr);
      charGroup.position.set(pos.x, 0, pos.z);
      charGroup.userData = { col: sc, row: sr, memberId: m.id, seated };
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
      this.labelContainer.appendChild(label);
      this.charLabelEls.set(m.id, label);

      const statusLabel = document.createElement("div");
      statusLabel.textContent = "🟢 空闲";
      statusLabel.style.cssText = `
        position:absolute;
        background:rgba(255,255,255,0.85);
        color:#555;
        font-size:10px;
        padding:1px 6px;
        border-radius:8px;
        font-family:sans-serif;
        white-space:nowrap;
        pointer-events:none;
        transform:translate(-50%,0);
        box-shadow:0 1px 3px rgba(0,0,0,0.1);
        margin-top:2px;
      `;
      this.labelContainer.appendChild(statusLabel);
      this.charStatusLabelEls.set(m.id, statusLabel);
    });
  }

  buildCharacter(m: GameMember, seated = false): THREE.Group {
    const group = new THREE.Group();
    const color = new THREE.Color(m.color);
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf5cba7,
      roughness: 0.7,
      metalness: 0.05,
    });
    const hairColor = [0x2c3e50, 0x4a3728, 0x1a1a2e, 0x5d4037, 0x212121][
      Math.abs(m.name.charCodeAt(0)) % 5
    ];
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.3 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.5,
      metalness: 0.2,
    });
    const handMat = new THREE.MeshStandardMaterial({
      color: 0xf5cba7,
      roughness: 0.7,
      metalness: 0.05,
    });

    const baseY = seated ? -0.4 : 0;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12), skinMat);
    neck.position.y = baseY + 1.38;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skinMat);
    head.position.y = baseY + 1.58;
    head.scale.set(1, 1.05, 0.95);
    head.castShadow = true;
    group.add(head);

    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat
    );
    hairTop.position.y = baseY + 1.62;
    group.add(hairTop);

    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.5),
      hairMat
    );
    hairBack.position.set(0, baseY + 1.55, -0.02);
    group.add(hairBack);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skinMat);
      ear.position.set(side * 0.19, baseY + 1.56, 0.0);
      ear.scale.set(0.5, 1, 0.7);
      group.add(ear);
    }

    for (const side of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), eyeWhiteMat);
      eyeWhite.position.set(side * 0.07, baseY + 1.6, 0.16);
      eyeWhite.scale.set(1.2, 0.8, 0.5);
      group.add(eyeWhite);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMat);
      eye.position.set(side * 0.07, baseY + 1.6, 0.19);
      group.add(eye);
      const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), hairMat);
      eyebrow.position.set(side * 0.07, baseY + 1.65, 0.17);
      eyebrow.rotation.z = side * 0.1;
      group.add(eyebrow);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 6), skinMat);
    nose.position.set(0, baseY + 1.55, 0.19);
    nose.rotation.x = -0.3;
    group.add(nose);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), lipMat);
    mouth.position.set(0, baseY + 1.5, 0.17);
    group.add(mouth);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.22), shirtMat);
    torso.position.y = baseY + 1.08;
    torso.castShadow = true;
    group.add(torso);

    const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), collarMat);
    collarL.position.set(-0.06, baseY + 1.32, 0.1);
    collarL.rotation.z = 0.3;
    group.add(collarL);
    const collarR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), collarMat);
    collarR.position.set(0.06, baseY + 1.32, 0.1);
    collarR.rotation.z = -0.3;
    group.add(collarR);

    for (const side of [-1, 1]) {
      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), shirtMat);
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), shirtMat);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.09), handMat);

      if (seated) {
        upperArm.position.set(side * 0.24, baseY + 1.08, 0.0);
        upperArm.rotation.z = side * 0.15;
        forearm.position.set(side * 0.22, 0.86, 0.3);
        forearm.rotation.x = -1.3;
        hand.position.set(side * 0.18, 0.82, 0.45);
        hand.rotation.x = -0.5;
      } else {
        upperArm.position.set(side * 0.24, baseY + 1.02, 0.0);
        upperArm.rotation.z = side * 0.08;
        forearm.position.set(side * 0.26, baseY + 0.72, 0.02);
        hand.position.set(side * 0.26, baseY + 0.58, 0.04);
      }
      upperArm.castShadow = true;
      forearm.castShadow = true;
      group.add(upperArm);
      group.add(forearm);
      group.add(hand);
    }

    const hipMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.13), hipMat);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.35, 0.11), pantsMat);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), shoeMat);

      if (seated) {
        thigh.position.set(side * 0.09, baseY + 0.68, 0.1);
        thigh.rotation.x = -1.2;
        shin.position.set(side * 0.09, 0.38, 0.35);
        shin.rotation.x = -Math.PI / 2.5;
        shoe.position.set(side * 0.09, 0.12, 0.48);
        shoe.rotation.x = -Math.PI / 2.5;
      } else {
        thigh.position.set(side * 0.09, baseY + 0.68, 0.0);
        shin.position.set(side * 0.09, baseY + 0.33, 0.0);
        shoe.position.set(side * 0.09, baseY + 0.12, 0.03);
      }
      thigh.castShadow = true;
      shin.castShadow = true;
      group.add(thigh);
      group.add(shin);
      group.add(shoe);
    }

    return group;
  }

  updateReceptionistTyping(elapsed: number, _dt: number) {
    if (!this.receptionistGroup) return;

    const leftForearm = this.receptionistGroup.getObjectByName("leftForearm") as
      | THREE.Mesh
      | undefined;
    const rightForearm = this.receptionistGroup.getObjectByName("rightForearm") as
      | THREE.Mesh
      | undefined;
    const leftHand = this.receptionistGroup.getObjectByName("leftHand") as THREE.Mesh | undefined;
    const rightHand = this.receptionistGroup.getObjectByName("rightHand") as THREE.Mesh | undefined;

    if (leftForearm) {
      leftForearm.rotation.x = -0.8 + Math.sin(elapsed * 6) * 0.08;
    }
    if (rightForearm) {
      rightForearm.rotation.x = -0.8 + Math.sin(elapsed * 6 + Math.PI) * 0.08;
    }
    if (leftHand) {
      leftHand.rotation.x = -0.2 + Math.sin(elapsed * 8) * 0.15;
      leftHand.position.y = 0.74 + Math.sin(elapsed * 8) * 0.01;
    }
    if (rightHand) {
      rightHand.rotation.x = -0.2 + Math.sin(elapsed * 8 + Math.PI) * 0.15;
      rightHand.position.y = 0.74 + Math.sin(elapsed * 8 + Math.PI) * 0.01;
    }
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
          const zone = ZONES.find(
            (z) => col >= z.col && col < z.col + z.cols && row >= z.row && row < z.row + z.rows
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

    this.walkAnims = this.walkAnims.filter((a) => a.memberId !== memberId);
    this.walkAnims.push({ memberId, path, step: 0, t: 0 });
  }

  bfs(fc: number, fr: number, tc: number, tr: number) {
    if (fc === tc && fr === tr) return [];
    const vis = new Set<string>();
    const q: { c: number; r: number; p: { col: number; row: number }[] }[] = [
      { c: fc, r: fr, p: [] },
    ];
    vis.add(`${fc},${fr}`);
    const ds = [
      { dc: 1, dr: 0 },
      { dc: -1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: 0, dr: -1 },
    ];
    while (q.length) {
      const cur = q.shift()!;
      for (const d of ds) {
        const nc = cur.c + d.dc,
          nr = cur.r + d.dr,
          k = `${nc},${nr}`;
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

  initMemberStates() {
    for (const m of this.members) {
      const initialStatus: MemberStatus = m.status || (m.isWorking ? "working" : "idle");
      this.memberStates.set(m.id, {
        status: initialStatus,
        idleAction: "none",
        idleActionTimer: Math.random() * this.idleActionInterval,
      });
      this.updateStatusLabel(m.id, initialStatus);
    }
  }

  setMemberStatus(memberId: string, status: MemberStatus) {
    const state = this.memberStates.get(memberId);
    if (!state) return;
    const prevStatus = state.status;
    state.status = status;

    if (status === "working" && prevStatus !== "working") {
      this.returnToDesk(memberId);
    }

    if (status === "waiting_approval" && prevStatus !== "waiting_approval") {
      this.returnToDesk(memberId);
    }

    if (status === "idle" && (prevStatus === "working" || prevStatus === "waiting_approval")) {
      state.idleActionTimer = 2 + Math.random() * 3;
    }

    const member = this.members.find((m) => m.id === memberId);
    if (member) {
      member.isWorking = status === "working" || status === "waiting_approval";
      member.status = status;
    }

    this.updateStatusLabel(memberId, status);
  }

  setMemberStatusByRoleId(roleId: string, status: MemberStatus) {
    const member = this.members.find((m) => m.roleId === roleId);
    if (member) this.setMemberStatus(member.id, status);
  }

  updateStatusLabel(memberId: string, status: MemberStatus) {
    const label = this.charStatusLabelEls.get(memberId);
    if (!label) return;

    const STATUS_DISPLAY: Record<string, { text: string; bg: string; color: string }> = {
      idle: { text: "🟢 空闲", bg: "rgba(212,237,218,0.9)", color: "#155724" },
      working: { text: "🟡 忙碌", bg: "rgba(255,243,205,0.9)", color: "#856404" },
      waiting_approval: { text: "🟠 待审批", bg: "rgba(255,226,183,0.9)", color: "#9a5b13" },
      walking: { text: "🚶 移动中", bg: "rgba(214,224,240,0.9)", color: "#2c5282" },
      resting: { text: "☕ 休息中", bg: "rgba(230,230,250,0.9)", color: "#555" },
      socializing: { text: "💬 交流中", bg: "rgba(230,230,250,0.9)", color: "#555" },
      delivering: { text: "📦 传递中", bg: "rgba(214,224,240,0.9)", color: "#2c5282" },
    };

    const display = STATUS_DISPLAY[status] || STATUS_DISPLAY["idle"];
    label.textContent = display.text;
    label.style.background = display.bg;
    label.style.color = display.color;
  }

  returnToDesk(memberId: string) {
    const home = this.charHomeDesks.get(memberId);
    if (!home) return;
    const cg = this.charGroups.get(memberId);
    if (!cg) return;
    const cc = cg.userData.col as number;
    const cr = cg.userData.row as number;
    if (cc === home.col && cr === home.row) return;
    this.moveTo(memberId, home.col, home.row);
  }

  performIdleAction(memberId: string) {
    const state = this.memberStates.get(memberId);
    if (!state || state.status !== "idle") return;

    const actions: IdleAction[] = ["coffee", "book", "stretch", "chat", "wander"];
    const action = actions[Math.floor(Math.random() * actions.length)];
    state.idleAction = action;

    const cg = this.charGroups.get(memberId);
    if (!cg) return;

    switch (action) {
      case "coffee": {
        const lounge = ZONES.find((z) => z.type === "lounge");
        if (lounge) {
          this.moveTo(memberId, lounge.col + 1, lounge.row + lounge.rows);
          this.showBubble(memberId, "☕ 喝杯咖啡休息下");
        }
        break;
      }
      case "book": {
        const lounge = ZONES.find((z) => z.type === "lounge");
        if (lounge) {
          this.moveTo(memberId, lounge.col + 1, lounge.row + 1);
          this.showBubble(memberId, "📖 看看书放松一下");
        }
        break;
      }
      case "stretch": {
        this.showBubble(memberId, "🤸 伸个懒腰~");
        break;
      }
      case "chat": {
        const otherMembers = this.members.filter((m) => m.id !== memberId);
        if (otherMembers.length > 0) {
          const other = otherMembers[Math.floor(Math.random() * otherMembers.length)];
          const otherCg = this.charGroups.get(other.id);
          if (otherCg) {
            const tc = otherCg.userData.col as number;
            const tr = otherCg.userData.row as number;
            this.moveTo(memberId, Math.max(0, Math.min(COLS - 1, tc + 1)), tr);
            this.showBubble(memberId, `💬 和${other.name}聊聊天`);
          }
        }
        break;
      }
      case "wander": {
        const walkable: { c: number; r: number }[] = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (this.pathGrid[r][c]) walkable.push({ c, r });
          }
        }
        if (walkable.length) {
          const t = walkable[Math.floor(Math.random() * walkable.length)];
          this.moveTo(memberId, t.c, t.r);
          this.showBubble(memberId, "🚶 随便走走");
        }
        break;
      }
    }
  }

  updateMemberStates(dt: number) {
    for (const [memberId, state] of this.memberStates) {
      const isWalking = this.walkAnims.some((a) => a.memberId === memberId);
      const isDelivering = this.deliveryAnims.some((d) => d.fromMemberId === memberId);

      if (isWalking && state.status !== "delivering") {
        state.status = "walking";
      } else if (isDelivering) {
        state.status = "delivering";
      } else if (state.status === "walking") {
        if (state.idleAction && state.idleAction !== "none") {
          state.status = "resting";
        } else {
          state.status = "idle";
          state.idleActionTimer = 2 + Math.random() * 3;
        }
      }

      if (state.status === "idle") {
        state.idleActionTimer -= dt;
        if (state.idleActionTimer <= 0) {
          this.performIdleAction(memberId);
          state.idleActionTimer = this.idleActionInterval + Math.random() * 5;
        }
      }

      if (
        state.status === "resting" &&
        state.idleAction &&
        state.idleAction !== "none" &&
        state.idleAction !== "stretch"
      ) {
        state.idleActionTimer -= dt;
        if (state.idleActionTimer <= 0) {
          state.idleAction = "none";
          state.status = "idle";
          this.returnToDesk(memberId);
          state.idleActionTimer = this.idleActionInterval + Math.random() * 5;
        }
      }
    }
  }

  deliverArtifact(fromMemberId: string, toMemberId: string, artifactType: string) {
    const fromCg = this.charGroups.get(fromMemberId);
    const toCg = this.charGroups.get(toMemberId);
    if (!fromCg || !toCg) return;

    const fromMember = this.members.find((m) => m.id === fromMemberId);
    const toMember = this.members.find((m) => m.id === toMemberId);

    const home = this.charHomeDesks.get(fromMemberId);
    if (!home) return;

    const existingDelivery = this.deliveryAnims.find((d) => d.fromMemberId === fromMemberId);
    if (existingDelivery) return;

    const toCol = toCg.userData.col as number;
    const toRow = toCg.userData.row as number;
    const nearCol = Math.max(0, Math.min(COLS - 1, toCol));
    const nearRow = Math.max(0, Math.min(ROWS - 1, toRow + 1));

    this.walkAnims = this.walkAnims.filter((a) => a.memberId !== fromMemberId);

    const path = this.bfs(
      fromCg.userData.col as number,
      fromCg.userData.row as number,
      nearCol,
      nearRow
    );
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
      fromRoleId: fromMember?.roleId || "start",
      toRoleId: toMember?.roleId || "end",
      phase: "walk_to",
      transferT: 0,
      homeCol: home.col,
      homeRow: home.row,
      artifactMesh: null,
      particles: null,
      particleLife: 0,
    };
    this.deliveryAnims.push(delivery);
  }

  deliverByRoles(fromRoleId: string, toRoleId: string, artifactType: string) {
    const fromMember =
      fromRoleId && fromRoleId !== "start"
        ? this.members.find((m) => m.roleId === fromRoleId)
        : this.members[0];
    const toMember =
      toRoleId && toRoleId !== "end" ? this.members.find((m) => m.roleId === toRoleId) : undefined;
    if (!fromMember || !toMember) return;
    this.deliverArtifact(fromMember.id, toMember.id, artifactType);
  }

  buildArtifactMesh(artifactType: string): THREE.Group {
    const group = new THREE.Group();
    const type = artifactType.toLowerCase();

    if (type.includes("代码") || type.includes("实现") || type.includes("程序")) {
      const screenMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.3,
        metalness: 0.5,
      });
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.02), screenMat);
      screen.castShadow = true;
      group.add(screen);
      const codeMat = new THREE.MeshStandardMaterial({
        color: 0x27ae60,
        emissive: 0x27ae60,
        emissiveIntensity: 0.4,
      });
      const codeLine1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.01), codeMat);
      codeLine1.position.set(-0.03, 0.06, 0.015);
      group.add(codeLine1);
      const codeLine2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), codeMat);
      codeLine2.position.set(-0.05, 0.02, 0.015);
      group.add(codeLine2);
      const codeLine3 = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.02, 0.01),
        new THREE.MeshStandardMaterial({
          color: 0x3498db,
          emissive: 0x3498db,
          emissiveIntensity: 0.3,
        })
      );
      codeLine3.position.set(-0.02, -0.02, 0.015);
      group.add(codeLine3);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x95a5a6,
        roughness: 0.4,
        metalness: 0.3,
      });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.015), frameMat);
      frame.position.z = -0.005;
      group.add(frame);
    } else if (
      type.includes("文档") ||
      type.includes("需求") ||
      type.includes("规格") ||
      type.includes("报告") ||
      type.includes("论文") ||
      type.includes("综述") ||
      type.includes("大纲") ||
      type.includes("选题") ||
      type.includes("分析")
    ) {
      const pageMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.8 });
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.01), pageMat);
      page.castShadow = true;
      group.add(page);
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7 });
      for (let i = 0; i < 5; i++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.005), lineMat);
        line.position.set(-0.02, 0.1 - i * 0.05, 0.008);
        group.add(line);
      }
      const titleMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
      const title = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.005), titleMat);
      title.position.set(-0.04, 0.14, 0.008);
      group.add(title);
    } else if (
      type.includes("测试") ||
      type.includes("审查") ||
      type.includes("审核") ||
      type.includes("反馈") ||
      type.includes("意见")
    ) {
      const boardMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.7 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.02), boardMat);
      board.castShadow = true;
      group.add(board);
      const checkMat = new THREE.MeshStandardMaterial({
        color: 0x27ae60,
        emissive: 0x27ae60,
        emissiveIntensity: 0.3,
      });
      const check1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), checkMat);
      check1.position.set(-0.08, 0.1, 0.015);
      group.add(check1);
      const check2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), checkMat);
      check2.position.set(-0.08, 0.03, 0.015);
      group.add(check2);
      const crossMat = new THREE.MeshStandardMaterial({
        color: 0xe74c3c,
        emissive: 0xe74c3c,
        emissiveIntensity: 0.3,
      });
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), crossMat);
      cross.position.set(-0.08, -0.04, 0.015);
      group.add(cross);
    } else if (type.includes("数据") || type.includes("数据集") || type.includes("模型")) {
      const chartMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.6 });
      const chart = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), chartMat);
      chart.castShadow = true;
      group.add(chart);
      const barColors = [0x3498db, 0x2ecc71, 0xe74c3c, 0xf39c12];
      for (let i = 0; i < 4; i++) {
        const h = 0.04 + Math.random() * 0.12;
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, h, 0.015),
          new THREE.MeshStandardMaterial({
            color: barColors[i],
            emissive: barColors[i],
            emissiveIntensity: 0.2,
          })
        );
        bar.position.set(-0.08 + i * 0.055, -0.08 + h / 2, 0.015);
        group.add(bar);
      }
    } else if (
      type.includes("设计") ||
      type.includes("美术") ||
      type.includes("素材") ||
      type.includes("创意") ||
      type.includes("视觉")
    ) {
      const canvasMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.01), canvasMat);
      canvas.castShadow = true;
      group.add(canvas);
      const paintColors = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6];
      for (let i = 0; i < 5; i++) {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.025, 12),
          new THREE.MeshStandardMaterial({
            color: paintColors[i],
            emissive: paintColors[i],
            emissiveIntensity: 0.2,
          })
        );
        dot.position.set(-0.08 + i * 0.04, 0.04, 0.008);
        group.add(dot);
      }
    } else {
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
    }

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), glowMat);
    glow.name = "artifactGlow";
    group.add(glow);

    return group;
  }

  spawnParticles(position: THREE.Vector3, color: number, count: number = 20) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      velocities[i * 3] = (Math.random() - 0.5) * 2;
      velocities[i * 3 + 1] = Math.random() * 2 + 0.5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.particleSystems.push({ points, velocities, life: 0, maxLife: 1.5 });
  }

  updateParticleSystems(dt: number) {
    for (let i = this.particleSystems.length - 1; i >= 0; i--) {
      const ps = this.particleSystems[i];
      ps.life += dt;
      if (ps.life >= ps.maxLife) {
        this.scene.remove(ps.points);
        ps.points.geometry.dispose();
        (ps.points.material as THREE.PointsMaterial).dispose();
        this.particleSystems.splice(i, 1);
        continue;
      }

      const positions = ps.points.geometry.attributes.position as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      const count = arr.length / 3;
      for (let j = 0; j < count; j++) {
        arr[j * 3] += ps.velocities[j * 3] * dt;
        arr[j * 3 + 1] += ps.velocities[j * 3 + 1] * dt;
        arr[j * 3 + 2] += ps.velocities[j * 3 + 2] * dt;
        ps.velocities[j * 3 + 1] -= dt * 2;
      }
      positions.needsUpdate = true;

      const progress = ps.life / ps.maxLife;
      (ps.points.material as THREE.PointsMaterial).opacity = 1 - progress;
      (ps.points.material as THREE.PointsMaterial).size = 0.08 * (1 - progress * 0.5);
    }
  }

  showBubble(memberId: string, text: string) {
    this.hideBubble(memberId);
    const cg = this.charGroups.get(memberId);
    if (!cg) return;

    const bubble = document.createElement("div");
    bubble.className = "office3d-bubble";
    bubble.dataset.memberId = memberId;
    const contentEl = document.createElement("div");
    contentEl.className = "office3d-bubble-content";
    contentEl.textContent = text;
    bubble.appendChild(contentEl);
    const arrowEl = document.createElement("div");
    arrowEl.className = "office3d-bubble-arrow";
    bubble.appendChild(arrowEl);
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
        new THREE.Color().lerpColors(
          new THREE.Color(0xd6e4f0),
          new THREE.Color(0x1a1a2e),
          nightFactor
        ),
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
        const isWalking = this.walkAnims.some((a) => a.memberId === da.fromMemberId);
        if (!isWalking) {
          da.phase = "face_target";
          da.transferT = 0;
        }
      } else if (da.phase === "face_target") {
        da.transferT += dt * 3;
        const dx = toCg.position.x - fromCg.position.x;
        const dz = toCg.position.z - fromCg.position.z;
        const targetAngle = Math.atan2(dx, dz);
        fromCg.rotation.y = targetAngle;

        const toDx = fromCg.position.x - toCg.position.x;
        const toDz = fromCg.position.z - toCg.position.z;
        toCg.rotation.y = Math.atan2(toDx, toDz);

        if (da.transferT >= 1) {
          da.phase = "hand_over";
          da.transferT = 0;
          this.showBubble(da.fromMemberId, `📦 交付${da.artifactType}`);

          const artifact = this.buildArtifactMesh(da.artifactType);
          const fromPos = fromCg.position.clone();
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          artifact.position.set(fromPos.x + dir.x * 0.3, 1.3, fromPos.z + dir.z * 0.3);
          this.scene.add(artifact);
          da.artifactMesh = artifact;
          this.artifactMeshes.push(artifact);
        }
      } else if (da.phase === "hand_over") {
        da.transferT += dt * 2;
        const fromPos = fromCg.position.clone();
        const toPos = toCg.position.clone();
        const dx = toPos.x - fromPos.x;
        const dz = toPos.z - fromPos.z;
        const dir = new THREE.Vector3(dx, 0, dz).normalize();

        const rightArm = fromCg.getObjectByName("rightArm");
        if (rightArm) {
          const armAngle = -1.2 + Math.sin(da.transferT * 4) * 0.15;
          rightArm.rotation.x = armAngle;
          rightArm.rotation.z = -0.3;
        }

        if (da.artifactMesh) {
          const holdX = fromPos.x + dir.x * 0.35;
          const holdZ = fromPos.z + dir.z * 0.35;
          da.artifactMesh.position.x = holdX;
          da.artifactMesh.position.z = holdZ;
          da.artifactMesh.position.y = 1.3 + Math.sin(da.transferT * 3) * 0.03;
          da.artifactMesh.rotation.y += dt * 1.5;

          const glow = da.artifactMesh.getObjectByName("artifactGlow");
          if (glow) {
            const pulse = 0.12 + Math.sin(da.transferT * 5) * 0.05;
            (glow as THREE.Mesh).scale.setScalar(1 + Math.sin(da.transferT * 5) * 0.15);
            if ((glow as THREE.Mesh).material instanceof THREE.MeshStandardMaterial) {
              ((glow as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = pulse;
            }
          }
        }

        if (da.transferT >= 1) {
          da.phase = "transfer";
          da.transferT = 0;
        }
      } else if (da.phase === "transfer") {
        da.transferT += dt * 1.0;
        if (da.transferT >= 1) {
          da.transferT = 1;
          da.phase = "receive";

          this.spawnParticles(
            toCg.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
            0xf39c12,
            25
          );
          this.spawnParticles(
            toCg.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
            0x2ecc71,
            15
          );

          if (da.artifactMesh) {
            this.scene.remove(da.artifactMesh);
            const idx = this.artifactMeshes.indexOf(da.artifactMesh);
            if (idx >= 0) this.artifactMeshes.splice(idx, 1);
            da.artifactMesh.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                else obj.material.dispose();
              }
            });
            da.artifactMesh = null;
          }

          this.showBubble(da.toMemberId, `✅ 收到${da.artifactType}`);
          da.transferT = 0;
        } else {
          if (da.artifactMesh) {
            const fromPos = fromCg.position.clone();
            const toPos = toCg.position.clone();
            const t = da.transferT;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            da.artifactMesh.position.x = fromPos.x + (toPos.x - fromPos.x) * eased;
            da.artifactMesh.position.z = fromPos.z + (toPos.z - fromPos.z) * eased;
            da.artifactMesh.position.y = 1.3 + Math.sin(eased * Math.PI) * 1.0;
            da.artifactMesh.rotation.y += dt * 4;
            da.artifactMesh.rotation.x = Math.sin(eased * Math.PI) * 0.3;

            const scale = 1 + Math.sin(eased * Math.PI) * 0.2;
            da.artifactMesh.scale.setScalar(scale);

            const glow = da.artifactMesh.getObjectByName("artifactGlow");
            if (glow && (glow as THREE.Mesh).material instanceof THREE.MeshStandardMaterial) {
              ((glow as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity =
                0.15 + eased * 0.3;
            }
          }

          const rightArm = fromCg.getObjectByName("rightArm");
          if (rightArm) {
            rightArm.rotation.x = -1.2 * (1 - da.transferT);
            rightArm.rotation.z = -0.3 * (1 - da.transferT);
          }
        }
      } else if (da.phase === "receive") {
        da.transferT += dt * 2;
        const leftArm = toCg.getObjectByName("leftArm");
        const rightArm = toCg.getObjectByName("rightArm");
        if (da.transferT < 0.5) {
          if (leftArm) leftArm.rotation.x = -0.8;
          if (rightArm) rightArm.rotation.x = -0.8;
        } else {
          const t = (da.transferT - 0.5) * 2;
          if (leftArm) leftArm.rotation.x = -0.8 * (1 - t);
          if (rightArm) rightArm.rotation.x = -0.8 * (1 - t);
        }

        if (da.transferT >= 1) {
          da.phase = "walk_back";
          const path = this.bfs(
            fromCg.userData.col as number,
            fromCg.userData.row as number,
            da.homeCol,
            da.homeRow
          );
          if (path.length > 0) {
            this.walkAnims = this.walkAnims.filter((a) => a.memberId !== da.fromMemberId);
            this.walkAnims.push({ memberId: da.fromMemberId, path, step: 0, t: 0 });
          }
        }
      } else if (da.phase === "walk_back") {
        const isWalking = this.walkAnims.some((a) => a.memberId === da.fromMemberId);
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
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.deliveryAnims.splice(index, 1);
  }

  aiTick() {
    const delivering = new Set(this.deliveryAnims.map((d) => d.fromMemberId));
    const ai = this.members.filter((m) => !delivering.has(m.id));
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
        "思考中...",
        "正在处理任务...",
        "需要帮助吗？",
        "休息一下☕",
        "代码审查完成✓",
        "方案已更新",
        "在写文档...",
        "测试通过✓",
      ];
      this.showBubble(m.id, phrases[Math.floor(Math.random() * phrases.length)]);
    }
  }

  updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    if (this.receptionistGroup && this.receptionistLabel) {
      const pos = new THREE.Vector3(0, 2.0, 0);
      this.receptionistGroup.localToWorld(pos);
      pos.project(this.camera);

      const x = (pos.x * 0.5 + 0.5) * w;
      const y = (-pos.y * 0.5 + 0.5) * h;

      if (pos.z > 1) {
        this.receptionistLabel.style.display = "none";
      } else {
        this.receptionistLabel.style.display = "block";
        this.receptionistLabel.style.left = `${x}px`;
        this.receptionistLabel.style.top = `${y}px`;
      }
    }

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

    // 状态标签：位于名称标签下方
    for (const [id, statusLabel] of this.charStatusLabelEls) {
      const cg = this.charGroups.get(id);
      if (!cg) continue;

      const pos = new THREE.Vector3(0, 1.7, 0);
      cg.localToWorld(pos);
      pos.project(this.camera);

      const x = (pos.x * 0.5 + 0.5) * w;
      const y = (-pos.y * 0.5 + 0.5) * h;

      if (pos.z > 1) {
        statusLabel.style.display = "none";
      } else {
        statusLabel.style.display = "block";
        statusLabel.style.left = `${x}px`;
        statusLabel.style.top = `${y}px`;
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
      if (!cg) {
        this.walkAnims.splice(i, 1);
        continue;
      }

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
        const cur =
          anim.step === 0
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

    this.updateMemberStates(dt);
    this.updateDeliveryAnims(dt);
    this.updateParticleSystems(dt);

    const elapsed = this.clock.elapsedTime;
    for (const m of this.members) {
      const cg = this.charGroups.get(m.id);
      if (!cg) continue;
      const state = this.memberStates.get(m.id);
      const isWalking = this.walkAnims.some((a) => a.memberId === m.id);
      const leftArm = cg.getObjectByName("leftArm");
      const rightArm = cg.getObjectByName("rightArm");
      const leftLeg = cg.getObjectByName("leftLeg");
      const rightLeg = cg.getObjectByName("rightLeg");

      if (isWalking) {
        if (leftArm) leftArm.rotation.x = Math.sin(elapsed * 8) * 0.5;
        if (rightArm) rightArm.rotation.x = -Math.sin(elapsed * 8) * 0.5;
        if (leftLeg) leftLeg.rotation.x = -Math.sin(elapsed * 8) * 0.4;
        if (rightLeg) rightLeg.rotation.x = Math.sin(elapsed * 8) * 0.4;
      } else if (state?.status === "working") {
        if (leftArm) leftArm.rotation.x = Math.sin(elapsed * 5) * 0.3 - 0.6;
        if (rightArm) rightArm.rotation.x = Math.sin(elapsed * 5 + 1) * 0.3 - 0.6;
        if (leftLeg) leftLeg.rotation.x = 0;
        if (rightLeg) rightLeg.rotation.x = 0;
      } else if (state?.status === "resting") {
        const action = state.idleAction;
        if (action === "coffee") {
          if (leftArm) leftArm.rotation.x = -0.8;
          if (rightArm) rightArm.rotation.x = 0;
          if (leftLeg) leftLeg.rotation.x = 0;
          if (rightLeg) rightLeg.rotation.x = 0;
        } else if (action === "book") {
          if (leftArm) leftArm.rotation.x = -0.5;
          if (rightArm) rightArm.rotation.x = -0.5;
          if (leftLeg) leftLeg.rotation.x = 0;
          if (rightLeg) rightLeg.rotation.x = 0;
        } else if (action === "stretch") {
          if (leftArm) leftArm.rotation.x = -1.2 + Math.sin(elapsed * 2) * 0.2;
          if (rightArm) rightArm.rotation.x = -1.2 + Math.sin(elapsed * 2 + 0.5) * 0.2;
          if (leftLeg) leftLeg.rotation.x = 0;
          if (rightLeg) rightLeg.rotation.x = 0;
        } else if (action === "chat") {
          if (leftArm) leftArm.rotation.x = Math.sin(elapsed * 3) * 0.4;
          if (rightArm) rightArm.rotation.x = Math.sin(elapsed * 3 + 1) * 0.3;
          if (leftLeg) leftLeg.rotation.x = 0;
          if (rightLeg) rightLeg.rotation.x = 0;
        } else {
          if (leftArm) leftArm.rotation.x = 0;
          if (rightArm) rightArm.rotation.x = 0;
          if (leftLeg) leftLeg.rotation.x = 0;
          if (rightLeg) rightLeg.rotation.x = 0;
        }
      } else {
        if (leftArm) leftArm.rotation.x = Math.sin(elapsed * 1.5) * 0.05;
        if (rightArm) rightArm.rotation.x = Math.sin(elapsed * 1.5 + 0.5) * 0.05;
        if (leftLeg) leftLeg.rotation.x = 0;
        if (rightLeg) rightLeg.rotation.x = 0;
      }
    }

    this.updateReceptionistTyping(elapsed, dt);

    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  }

  updateMembers(members: GameMember[]) {
    for (const m of members) {
      const existing = this.members.find((old) => old.id === m.id);
      if (existing && existing.status !== m.status) {
        this.setMemberStatus(m.id, m.status || "idle");
      } else if (!existing) {
        const state = this.memberStates.get(m.id);
        if (state && m.status) {
          this.setMemberStatus(m.id, m.status);
        }
      }
    }
    this.members = members;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animId);

    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const da of this.deliveryAnims) {
      if (da.artifactMesh) {
        this.scene.remove(da.artifactMesh);
        da.artifactMesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
    this.deliveryAnims = [];
    this.artifactMeshes = [];

    for (const ps of this.particleSystems) {
      this.scene.remove(ps.points);
      ps.points.geometry.dispose();
      (ps.points.material as THREE.PointsMaterial).dispose();
    }
    this.particleSystems = [];

    for (const [, label] of this.charLabelEls) {
      label.remove();
    }
    this.charLabelEls.clear();

    for (const [, label] of this.charStatusLabelEls) {
      label.remove();
    }
    this.charStatusLabelEls.clear();

    if (this.receptionistLabel) {
      this.receptionistLabel.remove();
      this.receptionistLabel = null;
    }

    if (this.receptionistGroup) {
      this.scene.remove(this.receptionistGroup);
      this.receptionistGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.receptionistGroup = null;
    }

    if (this.labelContainer) {
      this.labelContainer.remove();
    }

    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
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
