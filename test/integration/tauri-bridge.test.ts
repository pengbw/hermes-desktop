import { describe, it, expect, vi, beforeEach } from "vitest";
import { TauriCommands } from "@services/tauri/TauriCommands";
import { SafeTauriCommands } from "@services/tauri/SafeTauriCommands";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

describe("Tauri 桥接", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  describe("TauriCommands 直接调用", () => {
    it("TauriCommands 在 invoke 失败时直接抛出", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("native fail"));
      await expect(TauriCommands.toggleAvatarWindow()).rejects.toThrow("native fail");
    });

    it("TauriCommands 在 invoke 成功时返回值", async () => {
      mockInvoke.mockResolvedValueOnce(true);
      const r = await TauriCommands.toggleAvatarWindow();
      expect(r).toBe(true);
    });
  });

  describe("SafeTauriCommands 包装", () => {
    it("将 'database' 错误归类为 DatabaseError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("database error"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.category).toBe("database");
      }
    });

    it("将 'network' 错误归类为 NetworkError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("network error"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.category).toBe("network");
      }
    });
  });
});
