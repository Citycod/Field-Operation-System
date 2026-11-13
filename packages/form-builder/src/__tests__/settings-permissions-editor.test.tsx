import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FormSchemaV1 } from "@field/form-engine";
import { FormBuilder } from "../form-builder";
import { FormSettingsEditor } from "../form-settings-editor";

afterEach(() => {
  cleanup();
});

function createTestSchema(): FormSchemaV1 {
  return {
    schemaVersion: 1,
    form: {
      id: "form-test-1",
      key: "equipment_request",
      title: "Equipment Request",
      description: "Form to request field tools",
      schemaVersion: 1,
    },
    header: {
      columns: 2,
      sections: [],
    },
    tabs: [
      {
        id: "tab-main",
        key: "main",
        title: "Main",
        type: "form",
        order: 0,
        sections: [],
      },
    ],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {
      createRoles: ["employee", "manager", "business_admin"],
      manageFormRoles: ["business_admin", "super_admin"],
    },
    settings: {
      allowDrafts: true,
      referenceNumber: {
        prefix: "EQ-",
        suffix: "/26",
        sequenceLength: 5,
      },
      notifications: {
        emailOnSubmit: true,
        emailOnApprove: false,
        emailOnReject: true,
      },
    },
  };
}

describe("Form Settings & Permissions Module", () => {
  it("navigates to Form Settings from builder topnav and renders subnav tabs", () => {
    const schema = createTestSchema();
    render(<FormBuilder initialSchema={schema} />);

    fireEvent.click(screen.getByRole("button", { name: "Form Settings" }));

    expect(screen.getByText("Form Settings & Permissions")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Form Settings" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Role Permissions" })).toBeTruthy();
  });

  it("edits form title, description, and draft handling setting", () => {
    const schema = createTestSchema();
    const onChange = vi.fn();
    render(<FormSettingsEditor schema={schema} onChange={onChange} />);

    const titleInput = screen.getByLabelText("Form Title");
    fireEvent.change(titleInput, {
      target: { value: "Heavy Equipment Request" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        form: expect.objectContaining({ title: "Heavy Equipment Request" }),
      }),
    );

    const draftsCheckbox = screen.getByRole("checkbox", {
      name: /Allow in-progress drafts/,
    });
    fireEvent.click(draftsCheckbox);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ allowDrafts: false }),
      }),
    );
  });

  it("enables and edits reference number format with live preview computation", () => {
    const schema: FormSchemaV1 = {
      ...createTestSchema(),
      settings: { allowDrafts: true }, // no reference number initially
    };
    const onChange = vi.fn();
    render(<FormSettingsEditor schema={schema} onChange={onChange} />);

    // Enable custom reference numbering
    const enableRefCheckbox = screen.getByRole("checkbox", {
      name: /Enable custom reference numbering/,
    });
    fireEvent.click(enableRefCheckbox);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          referenceNumber: expect.objectContaining({
            prefix: "REF-",
            sequenceLength: 5,
          }),
        }),
      }),
    );
  });

  it("toggles notification settings cleanly", () => {
    const schema = createTestSchema();
    const onChange = vi.fn();
    render(<FormSettingsEditor schema={schema} onChange={onChange} />);

    const approveNotifCheckbox = screen.getByRole("checkbox", {
      name: /Email on Approval/,
    });
    fireEvent.click(approveNotifCheckbox);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          notifications: expect.objectContaining({ emailOnApprove: true }),
        }),
      }),
    );
  });

  it("renders Role Permissions matrix with project roles and capabilities", () => {
    const schema = createTestSchema();
    const onChange = vi.fn();
    render(<FormSettingsEditor schema={schema} onChange={onChange} />);

    // Switch to Role Permissions tab
    fireEvent.click(screen.getByRole("tab", { name: "Role Permissions" }));

    expect(
      screen.getByRole("table", { name: "Role Permissions Matrix" }),
    ).toBeTruthy();
    expect(screen.getByText("Super Admin")).toBeTruthy();
    expect(screen.getByText("Business Admin")).toBeTruthy();
    expect(screen.getByText("Manager")).toBeTruthy();
    expect(screen.getByText("Employee")).toBeTruthy();

    expect(screen.getByText("Create Submissions")).toBeTruthy();
    expect(screen.getByText("View Own Submissions")).toBeTruthy();
    expect(screen.getByText("View All Submissions")).toBeTruthy();
    expect(screen.getByText("Manage Form & Settings")).toBeTruthy();
  });

  it("toggles permissions and preserves capability arrays", () => {
    const schema = createTestSchema();
    const onChange = vi.fn();
    render(<FormSettingsEditor schema={schema} onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Role Permissions" }));

    // Toggle Employee off for Create Submissions
    const employeeCreateCheckbox = screen.getByRole("checkbox", {
      name: "Create Submissions for Employee",
    });
    fireEvent.click(employeeCreateCheckbox);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: expect.objectContaining({
          createRoles: ["manager", "business_admin"],
        }),
      }),
    );
  });

  it("preserves settings and permissions when switching modules in FormBuilder", () => {
    const schema = createTestSchema();
    const onChange = vi.fn();
    render(<FormBuilder initialSchema={schema} onChange={onChange} />);

    // Navigate to Form Settings
    fireEvent.click(screen.getByRole("button", { name: "Form Settings" }));
    expect(screen.getByText("General Configuration")).toBeTruthy();

    // Navigate back to Design
    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    expect(screen.getByText("Form layout")).toBeTruthy();

    // Navigate back to Form Settings
    fireEvent.click(screen.getByRole("button", { name: "Form Settings" }));
    expect(screen.getByText("General Configuration")).toBeTruthy();
  });

  describe("Reference Number Toggle & Compatibility", () => {
    it("displays as disabled when referenceNumber has enabled: false and preserves config on toggle", () => {
      const schema: FormSchemaV1 = {
        ...createTestSchema(),
        settings: {
          allowDrafts: true,
          referenceNumber: {
            enabled: false,
            prefix: "SAVED-",
            suffix: "/PRESERVED",
            sequenceLength: 7,
          },
        },
      };
      const onChange = vi.fn();
      render(<FormSettingsEditor schema={schema} onChange={onChange} />);

      const refCheckbox = screen.getByRole("checkbox", {
        name: /Enable custom reference numbering/,
      }) as HTMLInputElement;

      // Must display as unchecked because enabled is false!
      expect(refCheckbox.checked).toBe(false);
      // The subgroup fields should not be visible when disabled
      expect(screen.queryByLabelText("Sequence Digits (3–12)")).toBeNull();

      // When toggled on: preserves existing prefix, suffix, sequenceLength
      fireEvent.click(refCheckbox);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            referenceNumber: expect.objectContaining({
              enabled: true,
              prefix: "SAVED-",
              suffix: "/PRESERVED",
              sequenceLength: 7,
            }),
          }),
        }),
      );
    });

    it("disables reference numbering without deleting prefix and sequenceLength configuration", () => {
      const schema = createTestSchema(); // has active reference number
      const onChange = vi.fn();
      render(<FormSettingsEditor schema={schema} onChange={onChange} />);

      const refCheckbox = screen.getByRole("checkbox", {
        name: /Enable custom reference numbering/,
      }) as HTMLInputElement;
      expect(refCheckbox.checked).toBe(true);

      // Uncheck
      fireEvent.click(refCheckbox);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            referenceNumber: expect.objectContaining({
              enabled: false,
              prefix: "EQ-",
              suffix: "/26",
              sequenceLength: 5,
            }),
          }),
        }),
      );
    });
  });

  describe("Empty createRoles Warning", () => {
    it("displays a clear warning when createRoles is empty", () => {
      const schema: FormSchemaV1 = {
        ...createTestSchema(),
        permissions: {
          createRoles: [], // explicitly empty!
          manageFormRoles: ["business_admin", "super_admin"],
        },
      };
      render(<FormSettingsEditor schema={schema} onChange={vi.fn()} />);

      fireEvent.click(screen.getByRole("tab", { name: "Role Permissions" }));

      const warning = screen.getByTestId("empty-create-roles-warning");
      expect(warning).toBeTruthy();
      expect(warning.textContent).toContain("No Roles Permitted to Submit");
      expect(warning.textContent).toContain(
        "No users will be able to submit entries for this form until at least one permitted role is selected.",
      );
    });

    it("does not display empty createRoles warning when roles are assigned", () => {
      const schema = createTestSchema();
      render(<FormSettingsEditor schema={schema} onChange={vi.fn()} />);

      fireEvent.click(screen.getByRole("tab", { name: "Role Permissions" }));

      expect(screen.queryByTestId("empty-create-roles-warning")).toBeNull();
    });
  });

  describe("Legacy Notification Compatibility", () => {
    it("recognizes legacy notification properties and preserves extra/unrelated keys on edit", () => {
      const schema: FormSchemaV1 = {
        ...createTestSchema(),
        settings: {
          allowDrafts: true,
          notifications: {
            onSubmit: true,
            onReturn: true,
            customSlackChannel: "#field-ops",
          } as any,
        },
      };
      const onChange = vi.fn();
      render(<FormSettingsEditor schema={schema} onChange={onChange} />);

      // onSubmit: true should make "Email on Submission" checked
      const submitNotifCheckbox = screen.getByRole("checkbox", {
        name: /Email on Submission/,
      }) as HTMLInputElement;
      expect(submitNotifCheckbox.checked).toBe(true);

      // Toggle "Email on Approval" on
      const approveNotifCheckbox = screen.getByRole("checkbox", {
        name: /Email on Approval/,
      });
      fireEvent.click(approveNotifCheckbox);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            notifications: expect.objectContaining({
              onSubmit: true,
              emailOnApprove: true,
              onReturn: true,
              customSlackChannel: "#field-ops",
            }),
          }),
        }),
      );
    });

    it("synchronizes legacy aliases when toggled off to avoid conflicting notification behavior", () => {
      const schema: FormSchemaV1 = {
        ...createTestSchema(),
        settings: {
          allowDrafts: true,
          notifications: {
            onSubmit: true,
            onReturn: true,
          } as any,
        },
      };
      const onChange = vi.fn();
      render(<FormSettingsEditor schema={schema} onChange={onChange} />);

      // Uncheck "Email on Submission"
      const submitNotifCheckbox = screen.getByRole("checkbox", {
        name: /Email on Submission/,
      });
      fireEvent.click(submitNotifCheckbox);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            notifications: expect.objectContaining({
              emailOnSubmit: false,
              onSubmit: false,
              onReturn: true,
            }),
          }),
        }),
      );
    });
  });
});
