import { describe, it, expect } from "vitest";
import { processUserMessage, formatConversationTitle, extractFileNames } from "../MessageProcessor";

describe("MessageProcessor", () => {
  describe("processUserMessage", () => {
    it("processes a simple text message", () => {
      const result = processUserMessage("hello world");
      expect(result.role).toBe("user");
      expect(result.content).toBe("hello world");
      expect(result.files).toBeUndefined();
      expect(result.image).toBeUndefined();
    });

    it("trims content by default", () => {
      const result = processUserMessage("  hello  ");
      expect(result.content).toBe("hello");
    });

    it("uses placeholder when content is empty but files attached", () => {
      const files = JSON.stringify([{ name: "doc.pdf", path: "/path/doc.pdf" }]);
      const result = processUserMessage("", files);
      expect(result.content).toBe("请分析附件中的文件");
      expect(result.files).toEqual(["/path/doc.pdf"]);
    });

    it("truncates content when maxContentLength is set", () => {
      const result = processUserMessage("hello world", undefined, {
        maxContentLength: 5,
      });
      expect(result.content).toBe("hello");
    });

    it("extracts file paths from attached files", () => {
      const files = JSON.stringify([
        { name: "doc.pdf", path: "/path/doc.pdf" },
        { name: "data.csv", path: "/path/data.csv" },
      ]);
      const result = processUserMessage("analyze", files);
      expect(result.files).toEqual(["/path/doc.pdf", "/path/data.csv"]);
    });

    it("detects image files", () => {
      const files = JSON.stringify([
        { name: "photo.png", path: "/path/photo.png" },
        { name: "doc.pdf", path: "/path/doc.pdf" },
      ]);
      const result = processUserMessage("look at this", files);
      expect(result.image).toBe("/path/photo.png");
    });

    it("handles invalid JSON in attached files gracefully", () => {
      const result = processUserMessage("test", "not-json");
      expect(result.content).toBe("test");
      expect(result.files).toBeUndefined();
    });

    it("does not trim when trimContent is false", () => {
      const result = processUserMessage("  hello  ", undefined, {
        trimContent: false,
      });
      expect(result.content).toBe("  hello  ");
    });
  });

  describe("formatConversationTitle", () => {
    it("returns content when short enough", () => {
      expect(formatConversationTitle("hello")).toBe("hello");
    });

    it("truncates long content with ellipsis", () => {
      const long = "a".repeat(50);
      expect(formatConversationTitle(long)).toBe("a".repeat(30) + "...");
    });

    it("uses default max length of 30", () => {
      const long = "a".repeat(40);
      expect(formatConversationTitle(long)).toHaveLength(33);
    });

    it("uses custom max length", () => {
      expect(formatConversationTitle("hello world", 5)).toBe("hello...");
    });

    it("returns default for empty content", () => {
      expect(formatConversationTitle("")).toBe("新对话");
      expect(formatConversationTitle("   ")).toBe("新对话");
    });
  });

  describe("extractFileNames", () => {
    it("extracts file names from valid JSON", () => {
      const files = JSON.stringify([
        { name: "doc.pdf", path: "/path/doc.pdf" },
        { name: "data.csv", path: "/path/data.csv" },
      ]);
      expect(extractFileNames(files)).toEqual(["doc.pdf", "data.csv"]);
    });

    it("returns empty array for invalid JSON", () => {
      expect(extractFileNames("not-json")).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(extractFileNames("")).toEqual([]);
    });
  });
});
