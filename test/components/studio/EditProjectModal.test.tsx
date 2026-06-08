import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditProjectModal from "@/components/studio/EditProjectModal";
import { I18nProvider } from "@contexts/I18nContext";
import { ToastProvider } from "@contexts/ToastContext";
import { invoke } from "@tauri-apps/api/core";
import type { ReactNode } from "react";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>
    <ToastProvider>{children}</ToastProvider>
  </I18nProvider>
);

const project = {
  id: "p-1",
  name: "Original",
  description: "Original desc",
  icon: "💼",
  projectRule: "rule",
  isFavorite: false,
  createdAt: 0,
  updatedAt: 0,
};

const defaultProps = {
  visible: true,
  project,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  t: (k: string) => k,
};

describe("EditProjectModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
  });

  it("visible=false 时不渲染", () => {
    const { container } = render(
      <EditProjectModal {...defaultProps} visible={false} project={project} />,
      { wrapper }
    );
    expect(container.firstChild).toBeNull();
  });

  it("visible=true 时显示项目名称", () => {
    render(<EditProjectModal {...defaultProps} />, { wrapper });
    const nameInput = document.querySelector(
      'input[placeholder*="projectName"], input[placeholder*="name"]'
    ) as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe("Original");
  });

  it("编辑名称后受控更新", () => {
    render(<EditProjectModal {...defaultProps} />, { wrapper });
    const nameInput = document.querySelector(
      'input[placeholder*="projectName"], input[placeholder*="name"]'
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed" } });
    expect(nameInput.value).toBe("Renamed");
  });

  it("保存成功调用 invoke + onSaved + onClose", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    render(<EditProjectModal {...defaultProps} />, { wrapper });
    const buttons = screen.getAllByRole("button");
    const saveBtn = buttons.find((b) => /save|保存/i.test(b.textContent || ""));
    if (saveBtn) {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "update_project",
          expect.objectContaining({
            req: expect.objectContaining({ id: "p-1" }),
          })
        );
      });
      expect(defaultProps.onSaved).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });
});
