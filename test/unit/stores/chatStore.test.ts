import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@stores/chatStore";

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

  describe("input", () => {
    it("setInput 应该更新 input", () => {
      useChatStore.getState().setInput("hello");
      expect(useChatStore.getState().input).toBe("hello");
    });
  });

  describe("streaming state", () => {
    it("setIsStreaming 应该设置 isStreaming", () => {
      useChatStore.getState().setIsStreaming(true);
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    it("setIsThinking 应该设置 isThinking", () => {
      useChatStore.getState().setIsThinking(true);
      expect(useChatStore.getState().isThinking).toBe(true);
    });

    it("setThinkingContent 应该设置 thinkingContent", () => {
      useChatStore.getState().setThinkingContent("thinking...");
      expect(useChatStore.getState().thinkingContent).toBe("thinking...");
    });

    it("setStreamedContent 应该设置 streamedContent", () => {
      useChatStore.getState().setStreamedContent("partial");
      expect(useChatStore.getState().streamedContent).toBe("partial");
    });

    it("setToolProgress 应该设置 toolProgress", () => {
      useChatStore.getState().setToolProgress("50%");
      expect(useChatStore.getState().toolProgress).toBe("50%");
    });

    it("resetStreamState 应该重置流相关字段", () => {
      useChatStore.getState().setIsStreaming(true);
      useChatStore.getState().setStreamedContent("data");
      useChatStore.getState().resetStreamState();
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamedContent).toBe("");
    });

    it("resetStreamState 不应该影响 input 和 attachedFiles", () => {
      useChatStore.getState().setInput("keep me");
      useChatStore.getState().setAttachedFiles([{ name: "a.txt", path: "/a.txt" }]);
      useChatStore.getState().resetStreamState();
      expect(useChatStore.getState().input).toBe("keep me");
      expect(useChatStore.getState().attachedFiles).toEqual([{ name: "a.txt", path: "/a.txt" }]);
    });
  });

  describe("attachments", () => {
    it("setAttachedFiles 应该设置附件列表", () => {
      const files = [{ name: "a.txt", path: "/a.txt" }];
      useChatStore.getState().setAttachedFiles(files);
      expect(useChatStore.getState().attachedFiles).toEqual(files);
    });

    it("setIsDragging 应该设置 isDragging", () => {
      useChatStore.getState().setIsDragging(true);
      expect(useChatStore.getState().isDragging).toBe(true);
    });
  });
});
