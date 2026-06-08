import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageBubble from "../MessageBubble";
import type { Message } from "@core/types";

vi.mock("@contexts/I18nContext", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@components/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
  __esModule: true,
}));

const baseMessage: Message = {
  id: "msg-1",
  role: "user",
  content: "Hello world",
  timestamp: 1000,
};

describe("MessageBubble", () => {
  it("renders user message with user avatar", () => {
    render(<MessageBubble message={baseMessage} />);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("👤")).toBeInTheDocument();
  });

  it("renders assistant message with bot avatar", () => {
    const msg: Message = { ...baseMessage, role: "assistant", content: "Hi there" };
    render(<MessageBubble message={msg} />);

    expect(screen.getByTestId("markdown")).toHaveTextContent("Hi there");
  });

  it("renders user content as plain text", () => {
    render(<MessageBubble message={baseMessage} />);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
  });

  it("renders assistant content via MarkdownRenderer", () => {
    const msg: Message = { ...baseMessage, role: "assistant", content: "**bold**" };
    render(<MessageBubble message={msg} />);

    expect(screen.getByTestId("markdown")).toHaveTextContent("**bold**");
  });

  it("renders thinking block when present", () => {
    const msg: Message = { ...baseMessage, thinking: "Let me think..." };
    render(<MessageBubble message={msg} />);

    expect(screen.getByText("chat.thinkingProcess")).toBeInTheDocument();
    expect(screen.getByText("Let me think...")).toBeInTheDocument();
  });

  it("does not render thinking block when absent", () => {
    render(<MessageBubble message={baseMessage} />);

    expect(screen.queryByText("chat.thinkingProcess")).not.toBeInTheDocument();
  });

  it("renders attached files", () => {
    const msg: Message = {
      ...baseMessage,
      files: JSON.stringify([{ name: "doc.pdf", path: "/tmp/doc.pdf" }]),
    };
    render(<MessageBubble message={msg} />);

    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
  });

  it("handles invalid files JSON gracefully", () => {
    const msg: Message = { ...baseMessage, files: "not-json" };
    const { container } = render(<MessageBubble message={msg} />);

    expect(container.querySelector(".message-files")).not.toBeInTheDocument();
  });

  it("renders knowledge sources when present", () => {
    const msg: Message = {
      ...baseMessage,
      knowledgeSources: [
        {
          content:
            "This is a relevant passage from the knowledge base that provides context for the answer.",
          kb_name: "Test KB",
          file_name: "doc.txt",
          score: 0.85,
          source_type: "file",
        },
      ],
    };
    render(<MessageBubble message={msg} />);

    expect(screen.getByText("chat.knowledgeSources")).toBeInTheDocument();
    expect(screen.getByText("Test KB")).toBeInTheDocument();
    expect(screen.getByText("doc.txt")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("truncates long knowledge source content", () => {
    const longContent = "A".repeat(200);
    const msg: Message = {
      ...baseMessage,
      knowledgeSources: [
        {
          content: longContent,
          source_type: "file",
        },
      ],
    };
    render(<MessageBubble message={msg} />);

    const preview = screen.getByText(/AAA\.\.\./);
    expect(preview).toBeInTheDocument();
  });

  it("does not render knowledge sources section when absent", () => {
    render(<MessageBubble message={baseMessage} />);

    expect(screen.queryByText("chat.knowledgeSources")).not.toBeInTheDocument();
  });

  it("applies correct CSS class based on role", () => {
    const { container, rerender } = render(<MessageBubble message={baseMessage} />);

    // User messages have flex-row-reverse class to align right
    const userRow = container.querySelector(".flex-row-reverse");
    expect(userRow).toBeInTheDocument();

    const assistantMsg: Message = { ...baseMessage, role: "assistant" };
    rerender(<MessageBubble message={assistantMsg} />);

    // Assistant messages do NOT have flex-row-reverse
    expect(container.querySelector(".flex-row-reverse")).not.toBeInTheDocument();
  });
});
