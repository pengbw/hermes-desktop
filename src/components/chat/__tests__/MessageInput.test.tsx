import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MessageInput from "../MessageInput";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@contexts/I18nContext", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const defaultProps = {
  input: "",
  setInput: vi.fn(),
  onSend: vi.fn(),
  isStreaming: false,
  voiceEnabled: true,
  kbGlobalAutoRetrieve: false,
  kbList: [
    { id: "kb-1", name: "Test KB", icon: "📚", status: "ready" },
    { id: "kb-2", name: "Another KB", icon: "📖", status: "ready" },
  ],
  pendingKbIds: [],
  setPendingKbIds: vi.fn(),
};

describe("MessageInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({});
  });

  it("renders textarea and toolbar", () => {
    render(<MessageInput {...defaultProps} />);

    expect(screen.getByPlaceholderText("chat.inputPlaceholder")).toBeInTheDocument();
    expect(screen.getByTitle("切换模型")).toBeInTheDocument();
  });

  it("calls setInput when typing", () => {
    render(<MessageInput {...defaultProps} />);

    const textarea = screen.getByPlaceholderText("chat.inputPlaceholder");
    fireEvent.change(textarea, { target: { value: "Hello" } });

    expect(defaultProps.setInput).toHaveBeenCalledWith("Hello");
  });

  it("calls onSend when send button is clicked with input", () => {
    render(<MessageInput {...defaultProps} input="Hello" />);

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons[sendButtons.length - 1];
    fireEvent.click(sendButton);

    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it("does not call onSend when input is empty and no files attached", () => {
    render(<MessageInput {...defaultProps} />);

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons[sendButtons.length - 1];
    expect(sendButton).toBeDisabled();
  });

  it("disables send button when streaming", () => {
    render(<MessageInput {...defaultProps} isStreaming={true} />);

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons[sendButtons.length - 1];
    expect(sendButton).toBeDisabled();
  });

  it("shows streaming indicator when streaming", () => {
    render(<MessageInput {...defaultProps} isStreaming={true} />);

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons[sendButtons.length - 1];
    expect(sendButton.textContent).toContain("...");
  });

  it("sends on Enter key without Shift", () => {
    render(<MessageInput {...defaultProps} input="Hello" />);

    const textarea = screen.getByPlaceholderText("chat.inputPlaceholder");
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it("does not send on Shift+Enter", () => {
    render(<MessageInput {...defaultProps} input="Hello" />);

    const textarea = screen.getByPlaceholderText("chat.inputPlaceholder");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it("loads providers and model config on mount", () => {
    mockInvoke.mockResolvedValueOnce([
      { id: "p1", name: "OpenAI", value: "openai", baseUrl: "", apiKey: "" },
    ]);
    mockInvoke.mockResolvedValueOnce({ model: "gpt-4", provider: "openai" });

    render(<MessageInput {...defaultProps} />);

    expect(mockInvoke).toHaveBeenCalledWith("list_providers");
    expect(mockInvoke).toHaveBeenCalledWith("get_hermes_config");
  });

  it("displays KB selector when KB button is clicked", () => {
    render(<MessageInput {...defaultProps} />);

    const kbBtn = screen.getByTitle("chat.kbRetrieve");
    fireEvent.click(kbBtn);

    expect(screen.getByText("chat.kbSelect")).toBeInTheDocument();
    expect(screen.getByText("Test KB")).toBeInTheDocument();
    expect(screen.getByText("Another KB")).toBeInTheDocument();
  });

  it("does not show KB selector when kbGlobalAutoRetrieve is true", () => {
    render(<MessageInput {...defaultProps} kbGlobalAutoRetrieve={true} />);

    const kbBtn = screen.getByTitle("chat.kbRetrieve");
    expect(kbBtn).toBeDisabled();
  });

  it("shows KB count badge when pendingKbIds has items", () => {
    render(<MessageInput {...defaultProps} pendingKbIds={["kb-1"]} />);

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("toggles KB selection in dropdown", () => {
    render(<MessageInput {...defaultProps} />);

    const kbBtn = screen.getByTitle("chat.kbRetrieve");
    fireEvent.click(kbBtn);

    const kbItem = screen.getByText("Test KB");
    fireEvent.click(kbItem);

    expect(defaultProps.setPendingKbIds).toHaveBeenCalled();
  });

  it("shows drag overlay when dragging", () => {
    const { container } = render(<MessageInput {...defaultProps} />);

    const dropZone = container.querySelector(".chat-input-area");
    expect(dropZone).toBeInTheDocument();

    fireEvent.dragOver(dropZone!, { dataTransfer: { types: ["Files"] } });

    expect(screen.getByText("chat.dropFiles")).toBeInTheDocument();
  });
});
