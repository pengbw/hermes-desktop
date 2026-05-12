import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      input: "",
      isStreaming: false,
      isThinking: false,
      thinkingContent: "",
      streamedContent: "",
      toolProgress: "",
      attachedFiles: [],
      isDragging: false,
    });
  });

  it("has correct initial state", () => {
    const state = useChatStore.getState();
    expect(state.input).toBe("");
    expect(state.isStreaming).toBe(false);
    expect(state.isThinking).toBe(false);
    expect(state.thinkingContent).toBe("");
    expect(state.streamedContent).toBe("");
    expect(state.toolProgress).toBe("");
    expect(state.attachedFiles).toEqual([]);
    expect(state.isDragging).toBe(false);
  });

  it("sets input", () => {
    useChatStore.getState().setInput("hello");
    expect(useChatStore.getState().input).toBe("hello");
  });

  it("sets streaming state", () => {
    useChatStore.getState().setIsStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);
  });

  it("sets thinking state", () => {
    useChatStore.getState().setIsThinking(true);
    expect(useChatStore.getState().isThinking).toBe(true);
  });

  it("sets thinking content", () => {
    useChatStore.getState().setThinkingContent("analyzing...");
    expect(useChatStore.getState().thinkingContent).toBe("analyzing...");
  });

  it("sets streamed content", () => {
    useChatStore.getState().setStreamedContent("Hello world");
    expect(useChatStore.getState().streamedContent).toBe("Hello world");
  });

  it("sets tool progress", () => {
    useChatStore.getState().setToolProgress("searching...");
    expect(useChatStore.getState().toolProgress).toBe("searching...");
  });

  it("sets attached files", () => {
    const files = [{ name: "doc.pdf", path: "/path/doc.pdf" }];
    useChatStore.getState().setAttachedFiles(files);
    expect(useChatStore.getState().attachedFiles).toEqual(files);
  });

  it("sets dragging state", () => {
    useChatStore.getState().setIsDragging(true);
    expect(useChatStore.getState().isDragging).toBe(true);
  });

  it("resets stream state", () => {
    useChatStore.getState().setIsStreaming(true);
    useChatStore.getState().setIsThinking(true);
    useChatStore.getState().setThinkingContent("thinking");
    useChatStore.getState().setStreamedContent("streamed");
    useChatStore.getState().setToolProgress("progress");

    useChatStore.getState().resetStreamState();

    const state = useChatStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.isThinking).toBe(false);
    expect(state.thinkingContent).toBe("");
    expect(state.streamedContent).toBe("");
    expect(state.toolProgress).toBe("");
  });
});
