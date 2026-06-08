import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConversationList from "../ConversationList";
import type { Conversation } from "@core/types";

vi.mock("@contexts/I18nContext", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    title: "Chat about React",
    status: "active",
    lastActiveAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "conv-2",
    title: "Chat about Rust",
    status: "active",
    lastActiveAt: Date.now() - 86400000,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: "conv-3",
    title: "Old conversation",
    status: "active",
    lastActiveAt: Date.now() - 30 * 86400000,
    createdAt: Date.now() - 30 * 86400000,
    updatedAt: Date.now() - 30 * 86400000,
  },
];

const defaultProps = {
  conversations: mockConversations,
  currentConversationId: null,
  onSelectConversation: vi.fn(),
  onNewConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onRenameConversation: vi.fn(),
  collapsed: false,
  onToggleCollapse: vi.fn(),
};

describe("ConversationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all conversations", () => {
    render(<ConversationList {...defaultProps} />);

    expect(screen.getByText("Chat about React")).toBeInTheDocument();
    expect(screen.getByText("Chat about Rust")).toBeInTheDocument();
    expect(screen.getByText("Old conversation")).toBeInTheDocument();
  });

  it("calls onNewConversation when new chat button is clicked", () => {
    render(<ConversationList {...defaultProps} />);

    fireEvent.click(screen.getByText("chat.newChat"));

    expect(defaultProps.onNewConversation).toHaveBeenCalled();
  });

  it("calls onSelectConversation when a conversation is clicked", () => {
    render(<ConversationList {...defaultProps} />);

    fireEvent.click(screen.getByText("Chat about React"));

    expect(defaultProps.onSelectConversation).toHaveBeenCalledWith("conv-1");
  });

  it("calls onDeleteConversation when delete button is clicked", () => {
    const { container } = render(<ConversationList {...defaultProps} />);

    // Delete button is the trash icon (lucide Trash2) - find via class
    const deleteButtons = container.querySelectorAll("button");
    // First matching delete button belongs to first conv
    const deleteBtn = Array.from(deleteButtons).find((b) =>
      b.className.includes("group-hover:opacity-60")
    );
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);

    expect(defaultProps.onDeleteConversation).toHaveBeenCalled();
  });

  it("highlights the current conversation", () => {
    const { container } = render(
      <ConversationList {...defaultProps} currentConversationId="conv-1" />
    );

    // Active item has border-l-primary class
    const activeItem = Array.from(container.querySelectorAll("div")).find((el) =>
      el.className.includes("border-l-primary")
    );
    expect(activeItem).toBeTruthy();
  });

  it("filters conversations by search", () => {
    render(<ConversationList {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText("chat.search");
    fireEvent.change(searchInput, { target: { value: "React" } });

    expect(screen.getByText("Chat about React")).toBeInTheDocument();
    expect(screen.queryByText("Chat about Rust")).not.toBeInTheDocument();
    expect(screen.queryByText("Old conversation")).not.toBeInTheDocument();
  });

  it("renders collapsed state", () => {
    render(<ConversationList {...defaultProps} collapsed={true} />);

    expect(screen.queryByText("chat.newChat")).not.toBeInTheDocument();
    expect(screen.queryByText("Chat about React")).not.toBeInTheDocument();
  });

  it("calls onToggleCollapse when toggle button is clicked", () => {
    render(<ConversationList {...defaultProps} />);

    const toggleBtn = screen.getByTitle("chat.collapse");
    fireEvent.click(toggleBtn);

    expect(defaultProps.onToggleCollapse).toHaveBeenCalled();
  });

  it("groups conversations by time period", () => {
    render(<ConversationList {...defaultProps} />);

    expect(screen.getByText("chat.today")).toBeInTheDocument();
    expect(screen.getByText("chat.yesterday")).toBeInTheDocument();
    expect(screen.getByText("chat.earlier")).toBeInTheDocument();
  });

  it("enters rename mode on double click", () => {
    const { container } = render(<ConversationList {...defaultProps} />);

    fireEvent.doubleClick(screen.getByText("Chat about React"));

    // Rename input is a bare <input> with border-primary class (distinguishes from search Input component)
    const input = container.querySelector("input.border-primary") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input?.value).toBe("Chat about React");
  });

  it("commits rename on Enter key", () => {
    const { container } = render(<ConversationList {...defaultProps} />);

    fireEvent.doubleClick(screen.getByText("Chat about React"));

    const input = container.querySelector("input.border-primary") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Renamed Chat" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onRenameConversation).toHaveBeenCalledWith("conv-1", "Renamed Chat");
  });

  it("cancels rename on Escape key", () => {
    const { container } = render(<ConversationList {...defaultProps} />);

    fireEvent.doubleClick(screen.getByText("Chat about React"));

    // Rename input has the border-primary class (distinguishes from search input)
    const input = container.querySelector("input.border-primary") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(defaultProps.onRenameConversation).not.toHaveBeenCalled();
    // After Escape, rename input is removed
    expect(container.querySelector("input.border-primary")).not.toBeInTheDocument();
  });
});
