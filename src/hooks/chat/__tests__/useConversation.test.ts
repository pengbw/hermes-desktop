import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useConversation } from "../useConversation";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const mockConversation = {
  id: "conv-1",
  title: "Test Conversation",
  hermesSessionId: null,
  status: "active",
  kbIds: null,
  lastActiveAt: 1000,
  createdAt: 1000,
  updatedAt: 1000,
};

const mockMessage = {
  id: "msg-1",
  role: "user" as const,
  content: "Hello",
  timestamp: 1000,
};

describe("useConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads conversations on mount", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    expect(mockInvoke).toHaveBeenCalledWith("list_conversations");
    expect(result.current.conversations).toEqual([mockConversation]);
  });

  it("creates a new conversation", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce(mockConversation);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toEqual([]);
    });

    let newId: string | null = null;
    await act(async () => {
      newId = await result.current.createNewConversation("New Chat");
    });

    expect(mockInvoke).toHaveBeenCalledWith("create_conversation", {
      req: { title: "New Chat" },
    });
    expect(newId).toBe("conv-1");
    expect(result.current.currentConversationId).toBe("conv-1");
    expect(result.current.conversations).toHaveLength(1);
  });

  it("deletes a conversation", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.handleSelectConversation("conv-1");
    });

    await act(async () => {
      await result.current.deleteConversation("conv-1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("delete_conversation", { id: "conv-1" });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.currentConversationId).toBeNull();
  });

  it("renames a conversation", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    await act(async () => {
      await result.current.renameConversation("conv-1", "Renamed");
    });

    expect(mockInvoke).toHaveBeenCalledWith("rename_conversation", {
      id: "conv-1",
      title: "Renamed",
    });
    expect(result.current.conversations[0].title).toBe("Renamed");
  });

  it("loads messages when selecting a conversation", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);
    mockInvoke.mockResolvedValueOnce([mockMessage]);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.handleSelectConversation("conv-1");
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    expect(mockInvoke).toHaveBeenCalledWith("list_messages", {
      conversationId: "conv-1",
    });
    expect(result.current.messages).toEqual([mockMessage]);
  });

  it("caches messages and avoids re-fetching", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);
    mockInvoke.mockResolvedValueOnce([mockMessage]);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.handleSelectConversation("conv-1");
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    const callCountAfterFirstLoad = mockInvoke.mock.calls.length;

    act(() => {
      result.current.setCurrentConversation(null as unknown as string);
    });

    act(() => {
      result.current.handleSelectConversation("conv-1");
    });

    await act(async () => {});

    expect(mockInvoke.mock.calls.length).toBe(callCountAfterFirstLoad);
  });

  it("adds message to cache", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.handleSelectConversation("conv-1");
    });

    const newMsg = {
      id: "msg-2",
      role: "assistant" as const,
      content: "Hi there",
      timestamp: 2000,
    };

    act(() => {
      result.current.addMessageToCache("conv-1", newMsg);
    });

    expect(result.current.messages).toContainEqual(newMsg);
  });

  it("updates conversation kb_ids", async () => {
    mockInvoke.mockResolvedValueOnce([mockConversation]);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    await act(async () => {
      await result.current.updateConversationKbIds("conv-1", "kb-1,kb-2");
    });

    expect(mockInvoke).toHaveBeenCalledWith("update_conversation_kb_ids", {
      id: "conv-1",
      kbIds: "kb-1,kb-2",
    });
    expect(result.current.conversations[0].kbIds).toBe("kb-1,kb-2");
  });

  it("handles invoke errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useConversation());

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    expect(result.current.conversations).toEqual([]);
    consoleSpy.mockRestore();
  });
});
