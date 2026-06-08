import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// ============== Tauri core ==============
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
  convertFileSrc: vi.fn((p: string) => p),
}));

// ============== Tauri event ==============
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
  once: vi.fn(() => Promise.resolve(() => {})),
}));

// ============== Tauri window ==============
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    label: "main",
    listen: vi.fn(() => Promise.resolve(() => {})),
    onCloseRequested: vi.fn(() => Promise.resolve(() => {})),
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    setTitle: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  })),
  getAllWindows: vi.fn(() => Promise.resolve([])),
  Window: vi.fn(),
}));

// ============== Tauri app ==============
vi.mock("@tauri-apps/api/app", () => ({
  getName: vi.fn(() => Promise.resolve("Hermes")),
  getVersion: vi.fn(() => Promise.resolve("0.4.0")),
  getTauriVersion: vi.fn(() => Promise.resolve("2.0.0")),
}));

// ============== Tauri path ==============
vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...args: string[]) => args.join("/")),
  dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
  basename: vi.fn((p: string) => p.split("/").pop() || ""),
  homeDir: vi.fn(() => Promise.resolve("/Users/test")),
  appDataDir: vi.fn(() => Promise.resolve("/Users/test/.hermes")),
  resolvePath: vi.fn((p: string) => Promise.resolve(p)),
}));

// ============== Tauri plugins ==============
vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: vi.fn(),
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(() => Promise.resolve(true)),
  mkdir: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
  revealItemInDir: vi.fn(),
}));

vi.mock("tauri-plugin-mic-recorder-api", () => ({
  startRecording: vi.fn(() => Promise.resolve()),
  stopRecording: vi.fn(() => Promise.resolve({ path: "/tmp/rec.wav", duration: 1.0 })),
  isRecording: vi.fn(() => Promise.resolve(false)),
}));

// ============== 3D / VRM ==============
vi.mock("@pixiv/three-vrm", () => ({
  VRMLoaderPlugin: vi.fn(),
  VRM: vi.fn(() => ({
    scene: { children: [] },
    humanoid: { getNormalizedBoneNode: vi.fn() },
    expressionManager: { setValue: vi.fn() },
    blendShapeProxy: { setValue: vi.fn() },
    update: vi.fn(),
  })),
  VRMUtils: {
    rotateVRM0: vi.fn(),
    removeUnnecessaryJoints: vi.fn(),
  },
}));

vi.mock("pixi-live2d-display", () => ({
  Live2DModel: vi.fn(() => ({
    internalModel: { motionManager: { stopAllMotions: vi.fn() } },
    motion: vi.fn(),
    expression: vi.fn(),
  })),
}));

// ============== Browser APIs ==============
// matchMedia
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

// ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;

// window.confirm / window.alert
window.confirm = vi.fn(() => true);
window.alert = vi.fn();

// ============== Cleanup ==============
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
