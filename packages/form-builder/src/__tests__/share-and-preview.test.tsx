import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ShareFormDialog } from "../share-form-dialog";
import { PublishedPreviewModal } from "../published-preview-modal";
import type { FormVersionSummary } from "../types";

afterEach(cleanup);

const mockPublishedVersion: FormVersionSummary = {
  id: "v1-uuid",
  version_number: 1,
  status: "published",
  schema_version: 1,
  schema_jsonb: {
    schemaVersion: 1,
    form: {
      id: "form-synth-123",
      key: "equipment_inspection",
      title: "Equipment Inspection",
      schemaVersion: 1,
    },
    header: {
      columns: 2,
      sections: [],
    },
    tabs: [
      {
        id: "general",
        key: "general",
        title: "General Information",
        type: "form",
        order: 0,
        sections: [
          {
            id: "sec-1",
            key: "sec_1",
            title: "Equipment Details",
            order: 0,
            fields: [
              {
                id: "f1",
                key: "inspector_name",
                label: "Inspector Name",
                type: "text",
                required: true,
                order: 0,
              },
            ],
          },
        ],
      },
    ],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {},
    settings: {
      publicAccess: {
        enabled: true,
        customSlug: "equipment-inspect-link",
      },
    },
  },
  created_at: "2026-11-13T08:00:00Z",
  published_at: "2026-11-13T08:05:00Z",
};

describe("ShareFormDialog", () => {
  it("renders public URL and version tag when public access is enabled", () => {
    render(
      <ShareFormDialog
        isOpen={true}
        onClose={vi.fn()}
        formId="form-synth-123"
        formTitle="Equipment Inspection"
        formKey="equipment_inspection"
        customSlug="equipment-inspect-link"
        publishedVersionNumber={1}
        isPublic={true}
        publicUrlBase="https://workforce.platform"
      />,
    );

    expect(screen.getByRole("heading", { name: "Share Form" })).toBeDefined();
    expect(screen.getByText("● Public Link Active")).toBeDefined();
    expect(screen.getByText("Version 1")).toBeDefined();

    const input = screen.getByLabelText("Public Form URL") as HTMLInputElement;
    expect(input.value).toBe("https://workforce.platform/f/equipment-inspect-link");

    expect(screen.getByRole("button", { name: "Copy Link" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Open in new tab/i })).toBeDefined();
  });

  it("shows disabled notice when public access is disabled", () => {
    render(
      <ShareFormDialog
        isOpen={true}
        onClose={vi.fn()}
        formId="form-synth-123"
        formTitle="Equipment Inspection"
        formKey="equipment_inspection"
        publishedVersionNumber={1}
        isPublic={false}
      />,
    );

    expect(screen.getByText("○ Private (Auth Required)")).toBeDefined();
    expect(
      screen.getByText((content) => content.includes("Public link access is currently")),
    ).toBeDefined();
    expect(screen.queryByLabelText("Public Form URL")).toBeNull();
  });

  it("warns when form is draft-only and not yet published", () => {
    render(
      <ShareFormDialog
        isOpen={true}
        onClose={vi.fn()}
        formId="form-synth-123"
        formTitle="Equipment Inspection"
        formKey="equipment_inspection"
        publishedVersionNumber={null}
        isPublic={false}
      />,
    );

    expect(screen.getByText("This form is not yet published")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  });

  it("calls onTogglePublicAccess when toggle checkbox is changed", () => {
    const onToggle = vi.fn();
    render(
      <ShareFormDialog
        isOpen={true}
        onClose={vi.fn()}
        formId="form-synth-123"
        formTitle="Equipment Inspection"
        formKey="equipment_inspection"
        publishedVersionNumber={1}
        isPublic={false}
        onTogglePublicAccess={onToggle}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe("PublishedPreviewModal", () => {
  it("renders published snapshot with device switcher and zero persistence notice", () => {
    render(
      <PublishedPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        version={mockPublishedVersion}
      />,
    );

    expect(screen.getByText("Published Snapshot v1")).toBeDefined();
    expect(screen.getByText("Preview Mode (Zero Persistence)")).toBeDefined();
    expect(screen.getByText(/Inspector Name/i)).toBeDefined();

    // Verify device buttons
    expect(screen.getByTitle("Desktop View (100% / Max 1024px)")).toBeDefined();
    const tabletBtn = screen.getByTitle("Tablet View (768px)");
    const mobileBtn = screen.getByTitle("Mobile View (375px)");
    expect(tabletBtn).toBeDefined();
    expect(mobileBtn).toBeDefined();

    // Switch to mobile viewport
    fireEvent.click(mobileBtn);
    expect(mobileBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
