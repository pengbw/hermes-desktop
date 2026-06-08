import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardManagerPanel } from "@/pages/cards";
import { I18nProvider } from "@contexts/I18nContext";
import { ToastProvider } from "@contexts/ToastContext";
import { CARDS_STORAGE_KEY } from "@constants/config";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>
    <ToastProvider>{children}</ToastProvider>
  </I18nProvider>
);

describe("CardManagerPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("应该渲染管理面板标题", () => {
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    expect(screen.getByText("card.title")).toBeInTheDocument();
  });

  it("应该显示新建按钮", () => {
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    expect(screen.getByText("card.add")).toBeInTheDocument();
  });

  it("空状态应显示提示", () => {
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    expect(screen.getByText("card.empty")).toBeInTheDocument();
  });

  it("点击新建按钮打开模态框", () => {
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    // 点击 header 的 add 按钮
    const addBtn = screen.getAllByText("card.add")[0];
    fireEvent.click(addBtn);
    // 模态框中 input 出现
    expect(document.querySelector('input[placeholder*="name"]')).toBeInTheDocument();
  });

  it("localStorage 已有卡片时显示", () => {
    const cards = [
      { id: "custom_1", name: "My Card", icon: "📌", prompt: "do something", source: "custom" },
    ];
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    expect(screen.getByText("My Card")).toBeInTheDocument();
  });

  it("保存新卡片后写入 localStorage", () => {
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    // 第一个 add 按钮是 header 的 (点击触发 modal)
    const addBtn = screen.getAllByText("card.add")[0];
    fireEvent.click(addBtn);
    // 找 name input (第一个 input)
    const inputs = document.querySelectorAll(
      'input[placeholder*="name"]'
    ) as NodeListOf<HTMLInputElement>;
    const nameInput = inputs[0];
    const promptInput = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(nameInput, { target: { value: "Test Card" } });
    fireEvent.change(promptInput, { target: { value: "Test prompt" } });
    // 找 save 按钮
    const saveBtn = screen.getByText("card.save");
    fireEvent.click(saveBtn);
    const stored = localStorage.getItem(CARDS_STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("Test Card");
    expect(parsed[0].prompt).toBe("Test prompt");
  });

  it("name 或 prompt 为空时不能保存", () => {
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    const addBtn = screen.getAllByText("card.add")[0];
    fireEvent.click(addBtn);
    // 只填 name
    const inputs = document.querySelectorAll("input, textarea");
    const nameInput = inputs[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "OnlyName" } });
    fireEvent.click(screen.getByText("card.save"));
    // localStorage 应未写入
    expect(localStorage.getItem(CARDS_STORAGE_KEY)).toBeNull();
  });

  it("删除卡片", () => {
    const cards = [
      { id: "custom_1", name: "To Delete", icon: "📌", prompt: "x", source: "custom" },
    ];
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    expect(screen.getByText("To Delete")).toBeInTheDocument();
    // 找删除按钮: 🗑️
    const deleteBtn = screen.getByText("🗑️");
    fireEvent.click(deleteBtn);
    expect(screen.queryByText("To Delete")).not.toBeInTheDocument();
    expect(localStorage.getItem(CARDS_STORAGE_KEY)).toBe("[]");
  });

  it("localStorage 解析失败时回退到空", () => {
    localStorage.setItem(CARDS_STORAGE_KEY, "not-json");
    render(<CardManagerPanel t={(k) => k} />, { wrapper });
    expect(screen.getByText("card.empty")).toBeInTheDocument();
  });
});
