import { vi, expect } from "vitest";
import { invoke } from "@tauri-apps/api/core";

/**
 * 设置 invoke 的返回值（一次性）
 */
export function mockInvokeOnce<T>(value: T) {
  return (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(value);
}

/**
 * 设置 invoke 的返回值（多次，连续）
 */
export function mockInvokeMany<T>(values: T[]) {
  const fn = invoke as unknown as ReturnType<typeof vi.fn>;
  values.forEach((v) => fn.mockResolvedValueOnce(v));
}

/**
 * 设置 invoke 在某些命令下返回特定值
 * @example
 * mockInvokeByCommand({ list_providers: [...], get_hermes_config: {...} })
 */
export function mockInvokeByCommand<T = unknown>(map: Record<string, T>) {
  const fn = invoke as unknown as ReturnType<typeof vi.fn>;
  fn.mockImplementation((cmd: string) => {
    if (cmd in map) return Promise.resolve(map[cmd]);
    return Promise.resolve(null);
  });
}

/**
 * 让 invoke 抛出错误
 */
export function mockInvokeError(error: unknown) {
  const fn = invoke as unknown as ReturnType<typeof vi.fn>;
  fn.mockRejectedValueOnce(error);
}

/**
 * 验证 invoke 是否被以指定命令调用
 */
export function expectInvokeCalledWith(cmd: string, payload?: Record<string, unknown>) {
  const fn = invoke as unknown as ReturnType<typeof vi.fn>;
  if (payload) {
    expect(fn).toHaveBeenCalledWith(cmd, expect.objectContaining(payload));
  } else {
    expect(fn).toHaveBeenCalledWith(cmd, expect.anything());
  }
}

/**
 * 重置所有 invoke mock
 */
export function resetInvokeMock() {
  const fn = invoke as unknown as ReturnType<typeof vi.fn>;
  fn.mockReset();
  fn.mockResolvedValue(null);
}
