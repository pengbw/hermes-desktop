import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("three", () => {
  return {
    WebGLRenderer: vi.fn(function (this: any) {
      this.setPixelRatio = vi.fn();
      this.setSize = vi.fn();
      this.setClearColor = vi.fn();
      this.shadowMap = { enabled: false, type: null };
      this.dispose = vi.fn();
    }),
    Scene: vi.fn(function (this: any) {
      this.add = vi.fn();
    }),
    PerspectiveCamera: vi.fn(function (this: any) {
      this.position = { set: vi.fn() };
      this.lookAt = vi.fn();
    }),
    AmbientLight: vi.fn(function (this: any) {}),
    DirectionalLight: vi.fn(function (this: any) {
      this.position = { set: vi.fn() };
    }),
    Clock: vi.fn(function (this: any) {
      return {};
    }),
    PCFSoftShadowMap: 2,
  };
});

vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: vi.fn(function (this: any) {
    this.register = vi.fn();
    this.loadAsync = vi.fn().mockRejectedValue(new Error("No VRM model in test"));
  }),
}));

vi.mock("@pixiv/three-vrm", () => ({
  VRMLoaderPlugin: vi.fn(),
}));

vi.mock("../../../utils/vrmUtils", () => ({
  initBones: vi.fn(() => ({})),
  removeAccessoryObjects: vi.fn(),
  parseGesturesFromDb: vi.fn(() => []),
}));

import { invoke } from "@tauri-apps/api/core";
import { useVrm } from "../useVrm";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

describe("useVrm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue([]);
  });

  it("initializes with default state when no canvas", () => {
    const { result } = renderHook(() => useVrm({ current: null }));

    expect(result.current.isLoaded).toBe(false);
    expect(result.current.loadError).toBeNull();
    expect(result.current.rendererRef.current).toBeNull();
    expect(result.current.vrmRef.current).toBeNull();
  });

  it("loads gestures from DB when canvas is provided", async () => {
    const mockGestures = [
      {
        name: "wave",
        duration: 2000,
        lookAtX: 0,
        lookAtY: 0,
        tilt: 0,
        targetJson: "{}",
      },
    ];
    mockInvoke.mockResolvedValueOnce(mockGestures);

    const mockCanvas = document.createElement("canvas");
    renderHook(() => useVrm({ current: mockCanvas }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_avatar_gestures");
    });
  });

  it("handles gesture loading failure gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValueOnce(new Error("DB error"));

    const mockCanvas = document.createElement("canvas");
    renderHook(() => useVrm({ current: mockCanvas }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_avatar_gestures");
    });

    consoleSpy.mockRestore();
  });

  it("does not load gestures when canvas is null", () => {
    renderHook(() => useVrm({ current: null }));

    expect(mockInvoke).not.toHaveBeenCalledWith("get_avatar_gestures");
  });

  it("exposes required refs", () => {
    const { result } = renderHook(() => useVrm({ current: null }));

    expect(result.current.clockRef).toBeDefined();
    expect(result.current.animIdRef).toBeDefined();
    expect(result.current.bonesRef).toBeDefined();
    expect(result.current.gesturesRef).toBeDefined();
    expect(result.current.mouseRef).toBeDefined();
    expect(result.current.gestureStateRef).toBeDefined();
  });

  it("sets loadError when VRM loading fails", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    const mockCanvas = document.createElement("canvas");
    const { result } = renderHook(() => useVrm({ current: mockCanvas }));

    await waitFor(() => {
      expect(result.current.loadError).not.toBeNull();
    });

    expect(result.current.isLoaded).toBe(false);
  });
});
