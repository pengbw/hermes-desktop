import { describe, it, expect, vi, beforeEach } from "vitest";
import { TauriCommands } from "@services/tauri/TauriCommands";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

describe("TauriCommands", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it("checkHermesInstalled 调用 'check_hermes_installed'", async () => {
    mockInvoke.mockResolvedValueOnce({ installed: true });
    await TauriCommands.checkHermesInstalled();
    expect(mockInvoke).toHaveBeenCalledWith("check_hermes_installed");
  });

  it("toggleAvatarWindow 调用 'toggle_avatar_window'", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    await TauriCommands.toggleAvatarWindow();
    expect(mockInvoke).toHaveBeenCalledWith("toggle_avatar_window");
  });

  it("hideAvatarWindow 调用 'hide_avatar_window'", async () => {
    await TauriCommands.hideAvatarWindow();
    expect(mockInvoke).toHaveBeenCalledWith("hide_avatar_window");
  });

  it("错误应该直接抛出 (不像 SafeTauriCommands 包装)", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("boom"));
    await expect(TauriCommands.toggleAvatarWindow()).rejects.toThrow("boom");
  });
});
