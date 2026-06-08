import { describe, it, expect } from "vitest";
import {
  processUserMessage,
  formatConversationTitle,
  extractFileNames,
} from "@core/agent/MessageProcessor";

describe("processUserMessage", () => {
  it("应该返回 user role 和 content", () => {
    const r = processUserMessage("Hello");
    expect(r.role).toBe("user");
    expect(r.content).toBe("Hello");
  });

  it("默认 trim content", () => {
    expect(processUserMessage("  Hi  ").content).toBe("Hi");
  });

  it("关闭 trim 应保留空白", () => {
    expect(processUserMessage("  Hi  ", undefined, { trimContent: false }).content).toBe("  Hi  ");
  });

  it("空 content + 附件 → 使用 placeholder", () => {
    const r = processUserMessage("", '[{"name":"a.txt","path":"/a.txt"}]');
    expect(r.content).toBe("请分析附件中的文件");
  });

  it("空 content + 附件 + 自定义 placeholder", () => {
    const r = processUserMessage("", '[{"name":"a.txt","path":"/a.txt"}]', {
      placeholderForEmptyFile: "Look at file",
    });
    expect(r.content).toBe("Look at file");
  });

  it("maxContentLength 截断", () => {
    const r = processUserMessage("Hello World", undefined, { maxContentLength: 5 });
    expect(r.content).toBe("Hello");
  });

  it("maxContentLength=0 不截断", () => {
    const longContent = "a".repeat(1000);
    const r = processUserMessage(longContent);
    expect(r.content.length).toBe(1000);
  });

  it("解析附件 JSON 提取 path 到 files", () => {
    const r = processUserMessage("see", '[{"name":"a.txt","path":"/a.txt"}]');
    expect(r.files).toEqual(["/a.txt"]);
  });

  it("识别图片文件并填到 image", () => {
    const r = processUserMessage("see", '[{"name":"a.png","path":"/a.png"}]');
    expect(r.image).toBe("/a.png");
  });

  it("多个图片文件时取第一个", () => {
    const r = processUserMessage(
      "see",
      '[{"name":"a.png","path":"/a.png"},{"name":"b.jpg","path":"/b.jpg"}]'
    );
    expect(r.image).toBe("/a.png");
  });

  it("非图片文件不设置 image", () => {
    const r = processUserMessage("see", '[{"name":"a.pdf","path":"/a.pdf"}]');
    expect(r.image).toBeUndefined();
  });

  it("附件 JSON 解析失败不应抛错", () => {
    const r = processUserMessage("see", "not-json");
    expect(r.files).toBeUndefined();
    expect(r.image).toBeUndefined();
  });

  it("无附件时不应设置 files/image", () => {
    const r = processUserMessage("hi");
    expect(r.files).toBeUndefined();
    expect(r.image).toBeUndefined();
  });

  it("图片扩展名大小写不敏感", () => {
    const r = processUserMessage("see", '[{"name":"A.PNG","path":"/A.PNG"}]');
    expect(r.image).toBe("/A.PNG");
  });
});

describe("formatConversationTitle", () => {
  it("空内容返回 '新对话'", () => {
    expect(formatConversationTitle("")).toBe("新对话");
  });

  it("纯空白返回 '新对话'", () => {
    expect(formatConversationTitle("   ")).toBe("新对话");
  });

  it("短内容原样返回", () => {
    expect(formatConversationTitle("Hello")).toBe("Hello");
  });

  it("长内容截断", () => {
    const long = "a".repeat(50);
    expect(formatConversationTitle(long, 10)).toBe("aaaaaaaaaa...");
  });

  it("trim 后再判断", () => {
    expect(formatConversationTitle("  Hi  ", 5)).toBe("Hi");
  });
});

describe("extractFileNames", () => {
  it("应该从 JSON 提取 name 列表", () => {
    const r = extractFileNames('[{"name":"a.txt","path":"/a"},{"name":"b.md","path":"/b"}]');
    expect(r).toEqual(["a.txt", "b.md"]);
  });

  it("JSON 解析失败返回空数组", () => {
    expect(extractFileNames("not-json")).toEqual([]);
  });

  it("空 JSON 数组返回空数组", () => {
    expect(extractFileNames("[]")).toEqual([]);
  });
});
