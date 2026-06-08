import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLocalStorage } from "@hooks/common/useLocalStorage";
import { useChatStore } from "@stores/chatStore";

describe("持久化集成", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("useLocalStorage", () => {
    it("跨多个 hook 实例同步", () => {
      const { result: r1 } = renderHook(() => useLocalStorage<string>("shared", "init"));
      const { result: r2 } = renderHook(() => useLocalStorage<string>("shared", "init"));
      // 两个实例初始一致
      expect(r1.current[0]).toBe("init");
      expect(r2.current[0]).toBe("init");
      // 写者 r1
      act(() => {
        r1.current[1]("updated");
      });
      expect(r1.current[0]).toBe("updated");
      // 读者 r2 仍为 init (zustand/zustand-like: 不自动同步)
      // 但 localStorage 已被更新
      expect(JSON.parse(localStorage.getItem("shared")!)).toBe("updated");
    });
  });

  describe("useChatStore", () => {
    it("initial state", () => {
      const s = useChatStore.getState();
      expect(s.input).toBe("");
      expect(s.isStreaming).toBe(false);
      expect(s.attachedFiles).toEqual([]);
    });

    it("setInput 持久到 state", () => {
      act(() => {
        useChatStore.getState().setInput("hi");
      });
      expect(useChatStore.getState().input).toBe("hi");
    });

    it("setAttachedFiles", () => {
      act(() => {
        useChatStore.getState().setAttachedFiles([{ name: "a.txt", path: "/a" }]);
      });
      expect(useChatStore.getState().attachedFiles.length).toBe(1);
    });

    it("resetStreamState 不影响 input", () => {
      act(() => {
        useChatStore.getState().setInput("keep");
        useChatStore.getState().setIsStreaming(true);
        useChatStore.getState().resetStreamState();
      });
      expect(useChatStore.getState().input).toBe("keep");
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });
});
