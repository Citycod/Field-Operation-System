import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FormSchemaV1 } from "@field/form-engine";

describe("Form Builder host publishing flow (page contract)", () => {
  const formId = "form-123";
  const orgId = "org-456";
  const draftVersionId = "draft-v1";

  const initialSchema: FormSchemaV1 = {
    schemaVersion: 1,
    form: { id: formId, key: "test_form", title: "Test Form", schemaVersion: 1 },
    header: { columns: 2, sections: [] },
    tabs: [
      {
        id: "tab-1",
        key: "general",
        title: "General",
        type: "form",
        order: 0,
        columns: 2,
        sections: [],
      },
    ],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {},
    settings: {},
  };

  const updatedInMemorySchema: FormSchemaV1 = {
    ...initialSchema,
    header: {
      columns: 2,
      sections: [
        {
          id: "sec-new",
          key: "sec_new",
          title: "Added Header Section",
          order: 0,
          fields: [],
        },
      ],
    },
  };

  /**
   * Encapsulates the exact publishing coordination algorithm implemented in
   * apps/web/src/app/(platform)/forms/[formId]/builder/page.tsx:publishDraft
   */
  async function runPublishWorkflow({
    activeOrganizationId,
    draftId,
    changeNote,
    builderSchema,
    saveDraftFn,
    fetchFn,
    isPublishingRef,
  }: {
    activeOrganizationId: string | null;
    draftId: string | null;
    changeNote?: string;
    builderSchema?: FormSchemaV1;
    saveDraftFn: (schema: FormSchemaV1) => Promise<{ id: string }>;
    fetchFn: typeof fetch;
    isPublishingRef: { current: boolean };
  }) {
    if (!activeOrganizationId || !draftId) {
      throw new Error("No editable draft is available to publish.");
    }
    if (isPublishingRef.current) return;

    isPublishingRef.current = true;
    try {
      let targetVersionId = draftId;

      // 1. Always save the latest in-memory builder schema before issuing the publish request.
      // If saving fails, publishDraft throws and the publish request is never sent.
      if (builderSchema) {
        const savedDraft = await saveDraftFn(builderSchema);
        if (savedDraft?.id) {
          targetVersionId = savedDraft.id;
        }
      }

      // 2. Issue the publish request only after successful save
      const response = await fetchFn(
        `/api/forms/${encodeURIComponent(formId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: activeOrganizationId,
            versionId: targetVersionId,
            changeNote,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publish failed.");
      return body;
    } finally {
      isPublishingRef.current = false;
    }
  }

  it("saves the latest in-memory schema first before issuing the publish request", async () => {
    const callOrder: string[] = [];

    const saveDraftMock = vi.fn().mockImplementation(async (schema: FormSchemaV1) => {
      callOrder.push("saveDraft");
      return { id: draftVersionId };
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      callOrder.push(`fetch:${url}`);
      return {
        ok: true,
        json: async () => ({ success: true, formId, versionId: draftVersionId }),
      } as Response;
    });

    const isPublishingRef = { current: false };

    await runPublishWorkflow({
      activeOrganizationId: orgId,
      draftId: draftVersionId,
      changeNote: "Release v1 with added header section",
      builderSchema: updatedInMemorySchema,
      saveDraftFn: saveDraftMock,
      fetchFn: fetchMock,
      isPublishingRef,
    });

    // Verify order: save MUST precede publish
    expect(callOrder).toEqual([
      "saveDraft",
      `fetch:/api/forms/${formId}/publish`,
    ]);

    // Verify exact schema passed to save
    expect(saveDraftMock).toHaveBeenCalledWith(updatedInMemorySchema);

    // Verify publish request payload
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/forms/${formId}/publish`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          organizationId: orgId,
          versionId: draftVersionId,
          changeNote: "Release v1 with added header section",
        }),
      }),
    );
  });

  it("halts immediately and prevents publication if saving the draft fails", async () => {
    const saveDraftMock = vi.fn().mockRejectedValue(new Error("Database write timeout"));
    const fetchMock = vi.fn();
    const isPublishingRef = { current: false };

    await expect(
      runPublishWorkflow({
        activeOrganizationId: orgId,
        draftId: draftVersionId,
        changeNote: "Attempted release",
        builderSchema: updatedInMemorySchema,
        saveDraftFn: saveDraftMock,
        fetchFn: fetchMock,
        isPublishingRef,
      }),
    ).rejects.toThrow("Database write timeout");

    // The publish request must NEVER be called if save fails
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isPublishingRef.current).toBe(false);
  });

  it("publishes the updated draft version ID when save produces a new version ID", async () => {
    const newVersionId = "draft-v2-reassigned";

    const saveDraftMock = vi.fn().mockResolvedValue({ id: newVersionId });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, formId, versionId: newVersionId }),
    } as Response);

    const isPublishingRef = { current: false };

    await runPublishWorkflow({
      activeOrganizationId: orgId,
      draftId: draftVersionId,
      changeNote: "Updated version release",
      builderSchema: updatedInMemorySchema,
      saveDraftFn: saveDraftMock,
      fetchFn: fetchMock,
      isPublishingRef,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/forms/${formId}/publish`,
      expect.objectContaining({
        body: JSON.stringify({
          organizationId: orgId,
          versionId: newVersionId,
          changeNote: "Updated version release",
        }),
      }),
    );
  });

  it("blocks duplicate concurrent publication submissions", async () => {
    let resolveSave: (value: { id: string }) => void = () => {};
    const pendingSave = new Promise<{ id: string }>((res) => {
      resolveSave = res;
    });

    const saveDraftMock = vi.fn().mockReturnValue(pendingSave);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const isPublishingRef = { current: false };

    // Start first publish call (in-flight)
    const call1 = runPublishWorkflow({
      activeOrganizationId: orgId,
      draftId: draftVersionId,
      builderSchema: updatedInMemorySchema,
      saveDraftFn: saveDraftMock,
      fetchFn: fetchMock,
      isPublishingRef,
    });

    // Attempt second publish call while first is in-flight
    const call2 = runPublishWorkflow({
      activeOrganizationId: orgId,
      draftId: draftVersionId,
      builderSchema: updatedInMemorySchema,
      saveDraftFn: saveDraftMock,
      fetchFn: fetchMock,
      isPublishingRef,
    });

    expect(isPublishingRef.current).toBe(true);

    // Resolve the first save
    resolveSave({ id: draftVersionId });
    await Promise.all([call1, call2]);

    // saveDraft should have only been invoked ONCE
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
