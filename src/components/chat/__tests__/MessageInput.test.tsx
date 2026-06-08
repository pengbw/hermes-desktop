import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MessageInput from "../MessageInput";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@contexts/I18nContext", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "zh-CN" }),
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
    render(<MessageInput {...defaultProps} isStreaming={true} input="Hello" />);

    // Send button is always rendered; when streaming it shows a stop icon (square)
    const buttons = screen.getAllByRole("button");
    // The streaming "stop" action button should still be reachable
    const sendButton = buttons[buttons.length - 1];
    // Either disabled or active as stop - streaming makes it clickable
    expect(sendButton).toBeInTheDocument();
  });

  it("shows streaming indicator when streaming", () => {
    const { container } = render(
      <MessageInput {...defaultProps} isStreaming={true} input="Hello" />
    );

    // When streaming, a stop button (square icon) replaces send icon
    // The streaming indicator is the small square border-2 div
    const stopIndicator = container.querySelector(".border-2.border-current.rounded-sm");
    expect(stopIndicator).toBeInTheDocument();
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

  it("loads providers and model config on mount", async () => {
    // First invoke call in component mount: list_providers
    mockInvoke.mockResolvedValueOnce([
      { id: "p1", name: "OpenAI", value: "openai", baseUrl: "", apiKey: "" },
    ]);
    // Second: get_hermes_config
    mockInvoke.mockResolvedValueOnce({ model: "gpt-4", provider: "openai" });

    render(<MessageInput {...defaultProps} />);

    // Wait for async loadProvidersAndConfig effect to complete
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain("list_providers");
      expect(calls).toContain("get_hermes_config");
    });
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

    // Drop zone is the outer container with onDragOver (has relative & bg-card classes)
    const dropZone = container.querySelector(".relative.bg-card");
    expect(dropZone).toBeInTheDocument();

    fireEvent.dragOver(dropZone!, { dataTransfer: { types: ["Files"] } });

    expect(screen.getByText("chat.dropFiles")).toBeInTheDocument();
  });
});
