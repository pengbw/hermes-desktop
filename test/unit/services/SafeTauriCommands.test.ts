import { describe, it, expect, vi, beforeEach } from "vitest";
import { SafeTauriCommands } from "@services/tauri/SafeTauriCommands";
import { invoke } from "@tauri-apps/api/core";
import { AppError } from "@core/errors/AppError";
import { NetworkError } from "@core/errors/NetworkError";
import { DatabaseError } from "@core/errors/DatabaseError";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

describe("SafeTauriCommands", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  describe("成功路径", () => {
    it("应该返回 ok(value)", async () => {
      mockInvoke.mockResolvedValueOnce({ installed: true });
      const r = await SafeTauriCommands.checkHermesInstalled();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ installed: true });
    });
  });

  describe("错误归类", () => {
    it("包含 'database' 应归为 DatabaseError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("database connection failed"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBeInstanceOf(DatabaseError);
    });

    it("包含 'sql' 应归为 DatabaseError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("sql syntax error"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      if (!r.ok) expect(r.error).toBeInstanceOf(DatabaseError);
    });

    it("包含 'sqlite' 应归为 DatabaseError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("sqlite locked"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      if (!r.ok) expect(r.error).toBeInstanceOf(DatabaseError);
    });

    it("包含 'network' 应归为 NetworkError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("network unreachable"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      if (!r.ok) expect(r.error).toBeInstanceOf(NetworkError);
    });

    it("包含 'fetch' 应归为 NetworkError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fetch failed"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      if (!r.ok) expect(r.error).toBeInstanceOf(NetworkError);
    });

    it("包含 'timeout' 应归为 NetworkError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("request timeout"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      if (!r.ok) expect(r.error).toBeInstanceOf(NetworkError);
    });

    it("包含 'connect' 应归为 NetworkError", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("connect refused"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      if (!r.ok) expect(r.error).toBeInstanceOf(NetworkError);
    });

    it("其他错误应归为 AppError (tauri category)", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("some random error"));
      const r = await SafeTauriCommands.checkHermesInstalled();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBeInstanceOf(AppError);
        expect(r.error.category).toBe("tauri");
        expect(r.error.code).toBe("INVOKE_ERROR");
      }
    });

    it("非 Error 抛出应被包装", async () => {
      mockInvoke.mockRejectedValueOnce("string error");
      const r = await SafeTauriCommands.checkHermesInstalled();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBeInstanceOf(AppError);
        expect(r.error.message).toBe("string error");
      }
    });
  });
});
