"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  validateDraftSchema,
  validatePublishableSchema,
  type DetailsColumnDefinition,
  type FieldDefinition,
  type FieldType,
  type FormSchemaV1,
  type FormSectionDefinition,
  type FormTabUnion,
  type HeaderSectionDefinition,
  type TabType,
} from "@field/form-engine";
import { FormRenderer } from "@field/form-renderer";
import {
  cloneSchema,
  collectFieldKeys,
  createDetailColumn,
  createField,
  createSection,
  createTab,
  defaultId,
  FIELD_LABELS,
  FIELD_TYPES,
  moveItem,
  normalizeOrder,
  slugify,
  TAB_LABELS,
  TAB_TYPES,
  uniqueKey,
  updateSection,
} from "./state";
import type {
  BuilderDataSourceOption,
  BuilderModuleTab,
  BuilderSelection,
  FormBuilderProps,
  FormVersionSummary,
} from "./types";
import { FormSettingsEditor } from "./form-settings-editor";
import { RulesEditor } from "./rules-editor";
import { ListViewEditor } from "./list-view-editor";
import { WorkflowEditor } from "./workflow-editor";
import { PublishedPreviewModal } from "./published-preview-modal";
import { ShareFormDialog } from "./share-form-dialog";

const WIDTHS = ["full", "half", "third", "quarter"] as const;
const MODULE_TABS: BuilderModuleTab[] = [
  "Design",
  "Form Settings",
  "Workflow",
  "Rules",
  "List View",
  "Versions",
];

function FieldGlyph({ type }: { type: FieldType }) {
  const glyphs: Record<FieldType, string> = {
    text: "T",
    textarea: "¶",
    number: "#",
    currency: "$",
    date: "□",
    dropdown: "⌄",
    checkbox: "✓",
    lookup: "⌕",
    file: "↥",
    calculated: "∑",
  };
  return (
    <span className="fb-glyph" aria-hidden="true">
      {glyphs[type]}
    </span>
  );
}

function OrderButtons({
  label,
  onUp,
  onDown,
}: {
  label: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <span className="fb-order">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        onClick={(event) => {
          event.stopPropagation();
          onUp();
        }}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        onClick={(event) => {
          event.stopPropagation();
          onDown();
        }}
      >
        ↓
      </button>
    </span>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="fb-toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="fb-toggle" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function FormBuilder({
  initialSchema,
  onChange,
  onSave,
  onPublish,
  versions,
  onLoadVersions,
  createId = defaultId,
  dataSources,
  organizationMembers,
  lookupProvider,
  isPublic,
  publicSlug,
  onTogglePublicAccess,
}: FormBuilderProps) {
  const [schema, setSchema] = useState(() => cloneSchema(initialSchema));
  const [activeModule, setActiveModule] = useState<BuilderModuleTab>("Design");
  const [loadedVersions, setLoadedVersions] = useState<
    readonly FormVersionSummary[]
  >(versions ?? []);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [viewingVersionSchema, setViewingVersionSchema] =
    useState<FormVersionSummary | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishChangeNote, setPublishChangeNote] = useState("");
  const [publishError, setPublishError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishValidation, setPublishValidation] = useState<ReturnType<
    typeof validatePublishableSchema
  > | null>(null);

  const [previewPublishedModalOpen, setPreviewPublishedModalOpen] =
    useState(false);
  const [previewingPublishedVersion, setPreviewingPublishedVersion] =
    useState<FormVersionSummary | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const latestPublishedVersion = useMemo(() => {
    const published = loadedVersions
      .filter((v) => v.status === "published")
      .sort((a, b) => b.version_number - a.version_number);
    return published[0] || null;
  }, [loadedVersions]);

  useEffect(() => {
    if (versions) {
      setLoadedVersions(versions);
    }
  }, [versions]);

  const [selection, setSelection] = useState<BuilderSelection>({
    kind: "header",
  });
  const [activeTabId, setActiveTabId] = useState(
    initialSchema.tabs[0]?.id ?? "",
  );
  const [addTabOpen, setAddTabOpen] = useState(false);
  const [tabDraft, setTabDraft] = useState<{ title: string; type: TabType }>({
    title: "",
    type: "form",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validation, setValidation] = useState<ReturnType<
    typeof validateDraftSchema
  > | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const idFactory = useRef(createId);
  const overlayTrigger = useRef<HTMLElement | null>(null);
  const previewClose = useRef<HTMLButtonElement>(null);

  const rememberOverlayTrigger = () => {
    overlayTrigger.current = document.activeElement as HTMLElement | null;
  };
  const restoreOverlayTrigger = () => {
    requestAnimationFrame(() => overlayTrigger.current?.focus());
  };
  const openAddTab = () => {
    rememberOverlayTrigger();
    setAddTabOpen(true);
  };
  const closeAddTab = () => {
    setAddTabOpen(false);
    restoreOverlayTrigger();
  };
  const closePreview = () => {
    setPreviewOpen(false);
    restoreOverlayTrigger();
  };

  useEffect(() => {
    if (!addTabOpen && !previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (previewOpen) previewClose.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewOpen) closePreview();
      else closeAddTab();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [addTabOpen, previewOpen]);

  const activeTab =
    schema.tabs.find((tab) => tab.id === activeTabId) ?? schema.tabs[0];
  const update = (next: FormSchemaV1) => {
    setSchema(next);
    onChange?.(next);
    setValidation(null);
    setNotice("Unsaved local changes");
  };

  const allTabKeys = schema.tabs.map((tab) => tab.key);
  const allFieldKeys = collectFieldKeys(schema);

  const selectedSection = useMemo(() => {
    if (selection.kind !== "section") return undefined;
    if (selection.area === "header")
      return schema.header.sections.find(
        (section) => section.id === selection.sectionId,
      );
    const tab = schema.tabs.find((item) => item.id === selection.tabId);
    return tab?.type === "form"
      ? tab.sections.find((section) => section.id === selection.sectionId)
      : undefined;
  }, [schema, selection]);

  const selectedField = useMemo(() => {
    if (selection.kind !== "field") return undefined;
    if (selection.area === "details") {
      const tab = schema.tabs.find((item) => item.id === selection.tabId);
      return tab?.type === "details"
        ? tab.configuration.columns.find(
            (field) => field.id === selection.fieldId,
          )
        : undefined;
    }
    const sections =
      selection.area === "header"
        ? schema.header.sections
        : schema.tabs.find((item) => item.id === selection.tabId)?.type ===
            "form"
          ? (
              schema.tabs.find(
                (item) => item.id === selection.tabId,
              ) as Extract<FormTabUnion, { type: "form" }>
            ).sections
          : [];
    return sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === selection.fieldId);
  }, [schema, selection]);

  const selectedTab =
    selection.kind === "tab"
      ? schema.tabs.find((tab) => tab.id === selection.tabId)
      : undefined;

  const addSection = (area: "header" | "tab") => {
    const id = idFactory.current("section");
    if (area === "header") {
      const key = uniqueKey(
        "section",
        schema.header.sections.map((section) => section.key),
      );
      update({
        ...schema,
        header: {
          ...schema.header,
          sections: [
            ...schema.header.sections,
            createSection(
              "header",
              id,
              key,
              schema.header.sections.length,
            ) as HeaderSectionDefinition,
          ],
        },
      });
      setSelection({ kind: "section", area, sectionId: id });
      return;
    }
    if (!activeTab || activeTab.type !== "form") return;
    const key = uniqueKey(
      "section",
      activeTab.sections.map((section) => section.key),
    );
    update({
      ...schema,
      tabs: schema.tabs.map((tab) =>
        tab.id === activeTab.id && tab.type === "form"
          ? {
              ...tab,
              sections: [
                ...tab.sections,
                createSection(
                  "tab",
                  id,
                  key,
                  tab.sections.length,
                ) as FormSectionDefinition,
              ],
            }
          : tab,
      ),
    });
    setSelection({ kind: "section", area, sectionId: id, tabId: activeTab.id });
  };

  const removeSection = (
    area: "header" | "tab",
    id: string,
    tabId?: string,
  ) => {
    if (area === "header")
      update({
        ...schema,
        header: {
          ...schema.header,
          sections: normalizeOrder(
            schema.header.sections.filter((section) => section.id !== id),
          ),
        },
      });
    else
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === tabId && tab.type === "form"
            ? {
                ...tab,
                sections: normalizeOrder(
                  tab.sections.filter((section) => section.id !== id),
                ),
              }
            : tab,
        ),
      });
    setSelection({ kind: "header" });
  };

  const reorderSection = (
    area: "header" | "tab",
    id: string,
    direction: -1 | 1,
    tabId?: string,
  ) => {
    if (area === "header")
      update({
        ...schema,
        header: {
          ...schema.header,
          sections: moveItem(schema.header.sections, id, direction),
        },
      });
    else
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === tabId && tab.type === "form"
            ? { ...tab, sections: moveItem(tab.sections, id, direction) }
            : tab,
        ),
      });
  };

  const addField = (type: FieldType) => {
    const isHeaderTarget =
      (selection.kind === "section" || selection.kind === "field") &&
      selection.area === "header";

    if (!isHeaderTarget && activeTab?.type === "details") {
      const id = idFactory.current("column");
      const key = uniqueKey(slugify(FIELD_LABELS[type]), allFieldKeys);
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === activeTab.id && tab.type === "details"
            ? {
                ...tab,
                configuration: {
                  ...tab.configuration,
                  columns: [
                    ...tab.configuration.columns,
                    createDetailColumn(
                      type,
                      id,
                      key,
                      tab.configuration.columns.length,
                    ),
                  ],
                },
              }
            : tab,
        ),
      });
      setSelection({
        kind: "field",
        area: "details",
        fieldId: id,
        tabId: activeTab.id,
      });
      return;
    }

    let targetArea: "header" | "tab" | undefined;
    let targetSectionId: string | undefined;
    let targetTabId: string | undefined;

    if (selection.kind === "section") {
      targetArea = selection.area;
      targetSectionId = selection.sectionId;
      targetTabId = selection.tabId;
    } else if (
      selection.kind === "field" &&
      (selection.area === "header" || selection.area === "tab") &&
      selection.sectionId
    ) {
      targetArea = selection.area;
      targetSectionId = selection.sectionId;
      targetTabId = selection.tabId;
    } else if (
      selection.kind === "header" &&
      schema.header.sections.length > 0
    ) {
      targetArea = "header";
      targetSectionId =
        schema.header.sections[schema.header.sections.length - 1].id;
    } else if (
      selection.kind === "tab" &&
      activeTab?.type === "form" &&
      activeTab.sections.length > 0
    ) {
      targetArea = "tab";
      targetSectionId = activeTab.sections[activeTab.sections.length - 1].id;
      targetTabId = activeTab.id;
    }

    if (!targetArea || !targetSectionId) {
      setNotice("Select a header or form section before adding a field.");
      return;
    }

    const id = idFactory.current("field");
    const key = uniqueKey(slugify(FIELD_LABELS[type]), allFieldKeys);
    const next = updateSection(
      schema,
      targetArea,
      targetSectionId,
      (section) => ({
        ...section,
        fields: [
          ...section.fields,
          createField(type, id, key, section.fields.length),
        ],
      }),
      targetTabId,
    );
    update(next);
    setSelection({
      kind: "field",
      area: targetArea,
      fieldId: id,
      sectionId: targetSectionId,
      tabId: targetTabId,
    });
  };

  const mutateField = (
    changes: Partial<FieldDefinition & DetailsColumnDefinition>,
  ) => {
    if (selection.kind !== "field") return;
    const applyFieldChanges = <
      T extends FieldDefinition | DetailsColumnDefinition,
    >(
      field: T,
    ): T => {
      const resolvedChanges = { ...changes };
      if (
        typeof resolvedChanges.label === "string" &&
        resolvedChanges.key === undefined &&
        resolvedChanges.label.trim().length > 0
      ) {
        const defaultTypeSlug = slugify(FIELD_LABELS[field.type]);
        const prevLabelSlug = slugify(field.label);
        const isAutoGeneratedKey = new RegExp(
          `^(${defaultTypeSlug}|${prevLabelSlug})(_\\d+)?$`,
        ).test(field.key);
        if (isAutoGeneratedKey) {
          const otherKeys = allFieldKeys.filter((k) => k !== field.key);
          resolvedChanges.key = uniqueKey(
            slugify(resolvedChanges.label),
            otherKeys,
          );
        }
      }
      return { ...field, ...resolvedChanges } as T;
    };

    if (selection.area === "details") {
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === selection.tabId && tab.type === "details"
            ? {
                ...tab,
                configuration: {
                  ...tab.configuration,
                  columns: tab.configuration.columns.map((field) =>
                    field.id === selection.fieldId
                      ? applyFieldChanges(field)
                      : field,
                  ),
                },
              }
            : tab,
        ),
      });
      return;
    }
    update(
      updateSection(
        schema,
        selection.area,
        selection.sectionId!,
        (section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === selection.fieldId ? applyFieldChanges(field) : field,
          ),
        }),
        selection.tabId,
      ),
    );
  };

  const removeField = () => {
    if (selection.kind !== "field") return;
    if (selection.area === "details") {
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === selection.tabId && tab.type === "details"
            ? {
                ...tab,
                configuration: {
                  ...tab.configuration,
                  columns: normalizeOrder(
                    tab.configuration.columns.filter(
                      (field) => field.id !== selection.fieldId,
                    ),
                  ),
                },
              }
            : tab,
        ),
      });
      setSelection({ kind: "tab", tabId: selection.tabId! });
      return;
    }
    update(
      updateSection(
        schema,
        selection.area,
        selection.sectionId!,
        (section) => ({
          ...section,
          fields: normalizeOrder(
            section.fields.filter((field) => field.id !== selection.fieldId),
          ),
        }),
        selection.tabId,
      ),
    );
    setSelection({
      kind: "section",
      area: selection.area,
      sectionId: selection.sectionId!,
      tabId: selection.tabId,
    });
  };

  const reorderField = (direction: -1 | 1) => {
    if (selection.kind !== "field") return;
    if (selection.area === "details") {
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === selection.tabId && tab.type === "details"
            ? {
                ...tab,
                configuration: {
                  ...tab.configuration,
                  columns: moveItem(
                    tab.configuration.columns,
                    selection.fieldId,
                    direction,
                  ),
                },
              }
            : tab,
        ),
      });
      return;
    }
    update(
      updateSection(
        schema,
        selection.area,
        selection.sectionId!,
        (section) => ({
          ...section,
          fields: moveItem(section.fields, selection.fieldId, direction),
        }),
        selection.tabId,
      ),
    );
  };

  const addTab = () => {
    const title = tabDraft.title.trim();
    if (!title) return;
    const id = idFactory.current("tab");
    const key = uniqueKey(slugify(title), allTabKeys);
    const tab = createTab(tabDraft.type, title, id, key, schema.tabs.length);
    update({ ...schema, tabs: [...schema.tabs, tab] });
    setActiveTabId(id);
    setSelection({ kind: "tab", tabId: id });
    setTabDraft({ title: "", type: "form" });
    closeAddTab();
  };

  const removeTab = (id: string) => {
    const tabs = normalizeOrder(schema.tabs.filter((tab) => tab.id !== id));
    update({ ...schema, tabs });
    setActiveTabId(tabs[0]?.id ?? "");
    setSelection({ kind: "header" });
  };

  const reorderTab = (id: string, direction: -1 | 1) => {
    const tabs = moveItem(schema.tabs, id, direction);
    update({ ...schema, tabs });
  };

  const mutateTab = (tabId: string, changes: Partial<FormTabUnion>) =>
    update({
      ...schema,
      tabs: schema.tabs.map((tab) =>
        tab.id === tabId ? ({ ...tab, ...changes } as FormTabUnion) : tab,
      ),
    });

  const validateFor = (action: "preview" | "save") => {
    const result = validateDraftSchema(schema);
    setValidation(result);
    if (!result.valid) {
      setNotice(
        `${action === "preview" ? "Preview" : "Save"} blocked: fix ${result.errors.length} schema ${result.errors.length === 1 ? "error" : "errors"}.`,
      );
      return false;
    }
    return true;
  };

  const openPreview = () => {
    if (validateFor("preview")) {
      rememberOverlayTrigger();
      setPreviewOpen(true);
      setNotice("Preview is using the current local draft schema.");
    }
  };

  const save = async () => {
    if (!validateFor("save")) return;
    setSaving(true);
    try {
      await onSave?.(schema);
      setNotice(
        onSave
          ? "Draft save completed through the host callback."
          : "Draft validated. No persistence adapter is connected.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openPublishDialog = () => {
    rememberOverlayTrigger();
    const result = validatePublishableSchema(schema, {
      dataSources: dataSources?.map((ds) => ({
        id: ds.id,
        key: ds.key,
        status: ds.status,
        fields: ds.fields?.map((f) => ({ key: f.key })),
      })),
      activeMemberUserIds: organizationMembers?.length
        ? new Set(organizationMembers.map((m) => m.userId))
        : undefined,
    });
    setPublishValidation(result);
    setPublishChangeNote("");
    setPublishError("");
    setPublishDialogOpen(true);
  };

  const closePublishDialog = () => {
    setPublishDialogOpen(false);
    restoreOverlayTrigger();
  };

  const confirmPublish = async () => {
    if (!onPublish) return;
    setPublishing(true);
    setPublishError("");
    try {
      await onPublish(publishChangeNote.trim() || undefined, schema);
      setPublishDialogOpen(false);
      setNotice("Form version published successfully.");
      if (onLoadVersions) {
        try {
          const list = await onLoadVersions();
          setLoadedVersions(list);
        } catch {
          // ignore background refresh failure
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Publish failed.";
      setPublishError(msg);
      setNotice(`Publish failed: ${msg}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleSelectModule = async (item: BuilderModuleTab) => {
    if (
      item === "Design" ||
      item === "Versions" ||
      item === "Form Settings" ||
      item === "Workflow" ||
      item === "Rules" ||
      item === "List View"
    ) {
      setActiveModule(item);
      if (item === "Versions" && onLoadVersions) {
        setLoadingVersions(true);
        try {
          const list = await onLoadVersions();
          setLoadedVersions(list);
        } catch (err) {
          setNotice(
            err instanceof Error
              ? `Failed to load versions: ${err.message}`
              : "Failed to load versions.",
          );
        } finally {
          setLoadingVersions(false);
        }
      }
    } else {
      setNotice(`${item} belongs to a later implementation phase.`);
    }
  };

  const handleCopySchema = async (jsonString: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonString);
      }
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fb-root">
      <header className="fb-commandbar">
        <div>
          <div className="fb-breadcrumb">Forms / Form Builder</div>
          <h1>
            {schema.form.title} <span>Draft</span>
          </h1>
          <p>
            {schema.form.description ||
              "Configure the structure and fields for this form."}
          </p>
        </div>
        <div className="fb-actions">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" onClick={openPreview}>
            ▷ Preview
          </button>
          {latestPublishedVersion && (
            <>
              <button
                type="button"
                className="fb-btn-preview-published"
                onClick={() => {
                  setPreviewingPublishedVersion(latestPublishedVersion);
                  setPreviewPublishedModalOpen(true);
                }}
                title={`Preview published snapshot v${latestPublishedVersion.version_number}`}
              >
                ▷ Preview Published
              </button>
              <button
                type="button"
                className="fb-btn-share"
                onClick={() => setShareDialogOpen(true)}
                title="Share published form link"
              >
                ↗ Share
              </button>
            </>
          )}
          {onPublish && (
            <button
              type="button"
              className="fb-btn-publish"
              onClick={openPublishDialog}
              disabled={publishing}
            >
              Publish
            </button>
          )}
        </div>
      </header>

      <nav className="fb-topnav" aria-label="Builder modules">
        {MODULE_TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={item === activeModule ? "page" : undefined}
            onClick={() => void handleSelectModule(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {notice && (
        <div className="fb-notice" role="status">
          {notice}
        </div>
      )}
      {validation && !validation.valid && (
        <div className="fb-validation" role="alert">
          <strong>Schema validation failed</strong>
          <ul>
            {validation.errors.map((error, index) => (
              <li key={`${error.path}-${index}`}>
                {error.path || "schema"}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeModule === "Design" && (
        <>
          <section
            className="fb-mobile-state"
            aria-label="Mobile builder guidance"
          >
        <strong>
          Form Builder is optimized for desktop or tablet authoring.
        </strong>
        <p>
          Use Preview to inspect the current draft on this phone, or continue
          editing from a larger screen.
        </p>
        <button type="button" onClick={openPreview}>
          ▷ Preview current draft
        </button>
      </section>

      <div className="fb-workspace">
        <aside className="fb-palette" aria-label="Component palette">
          <div className="fb-panel-heading">
            <h2>Components</h2>
            <p>Add approved schema fields.</p>
          </div>
          <div className="fb-field-grid">
            {FIELD_TYPES.map((type) => (
              <button
                type="button"
                key={type}
                onClick={() => addField(type)}
                aria-label={`Add ${FIELD_LABELS[type]} field`}
              >
                <FieldGlyph type={type} />
                <span>{FIELD_LABELS[type]}</span>
              </button>
            ))}
          </div>
          <div className="fb-structure">
            <h3>Structure</h3>
            <button type="button" onClick={() => addSection("header")}>
              ＋ Header section
            </button>
            <button
              type="button"
              disabled={activeTab?.type !== "form"}
              onClick={() => addSection("tab")}
            >
              ＋ Form section
            </button>
            <button type="button" onClick={openAddTab}>
              ＋ Tab
            </button>
          </div>
          <div className="fb-palette-help">
            Select a section before adding standard fields. Select a Details tab
            before adding grid columns.
          </div>
        </aside>

        <main className="fb-canvas">
          <div className="fb-canvas-title">
            <div>
              <h2>Form layout</h2>
              <p>Build the header and configured tabs.</p>
            </div>
            <button type="button" onClick={openAddTab}>
              ＋ Add Tab
            </button>
          </div>
          <section
            className={`fb-header-card ${selection.kind === "header" ? "is-selected" : ""}`}
            onClick={() => setSelection({ kind: "header" })}
          >
            <div className="fb-card-title">
              <div>
                <strong>Header / Main information</strong>
                <span>{schema.header.columns ?? 1} column layout</span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  addSection("header");
                }}
              >
                ＋ Section
              </button>
            </div>
            {schema.header.sections.length === 0 ? (
              <div className="fb-empty">
                No header sections. Add a section to begin.
              </div>
            ) : (
              <div
                className="fb-section-grid"
                style={{
                  gridTemplateColumns: `repeat(${schema.header.columns ?? 1}, minmax(0, 1fr))`,
                }}
              >
                {schema.header.sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    selected={
                      selection.kind === "section" &&
                      selection.sectionId === section.id
                    }
                    onSelect={() =>
                      setSelection({
                        kind: "section",
                        area: "header",
                        sectionId: section.id,
                      })
                    }
                    onFieldSelect={(fieldId) =>
                      setSelection({
                        kind: "field",
                        area: "header",
                        fieldId,
                        sectionId: section.id,
                      })
                    }
                    onMove={(direction) =>
                      reorderSection("header", section.id, direction)
                    }
                    onRemove={() => removeSection("header", section.id)}
                    selectedFieldId={
                      selection.kind === "field" ? selection.fieldId : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <div
            className="fb-tabstrip"
            role="tablist"
            aria-label="Configured tabs"
          >
            {schema.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab?.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setSelection({ kind: "tab", tabId: tab.id });
                }}
              >
                {tab.title}
                <small>{TAB_LABELS[tab.type]}</small>
              </button>
            ))}
            <button
              type="button"
              className="fb-add-tab"
              aria-label="Add tab"
              onClick={openAddTab}
            >
              ＋
            </button>
          </div>

          <section className="fb-tab-canvas" aria-label="Active tab canvas">
            {!activeTab && (
              <div className="fb-empty fb-large-empty">
                No tabs configured. Add a tab to continue.
              </div>
            )}
            {activeTab && (
              <ActiveTabCanvas
                tab={activeTab}
                selection={selection}
                onSelectTab={() =>
                  setSelection({ kind: "tab", tabId: activeTab.id })
                }
                onSelectSection={(sectionId) =>
                  setSelection({
                    kind: "section",
                    area: "tab",
                    sectionId,
                    tabId: activeTab.id,
                  })
                }
                onSelectField={(fieldId, sectionId) =>
                  setSelection({
                    kind: "field",
                    area: activeTab.type === "details" ? "details" : "tab",
                    fieldId,
                    sectionId,
                    tabId: activeTab.id,
                  })
                }
                onAddSection={() => addSection("tab")}
                onMoveSection={(id, direction) =>
                  reorderSection("tab", id, direction, activeTab.id)
                }
                onRemoveSection={(id) => removeSection("tab", id, activeTab.id)}
              />
            )}
          </section>
        </main>

        <aside className="fb-properties" aria-label="Properties panel">
          <div className="fb-panel-heading">
            <h2>Properties</h2>
            <p>Configure the selected schema item.</p>
          </div>
          {selection.kind === "header" && (
            <HeaderProperties schema={schema} update={update} />
          )}
          {selection.kind === "section" && selectedSection && (
            <SectionProperties
              section={selectedSection}
              area={selection.area}
              onChange={(changes) =>
                update(
                  updateSection(
                    schema,
                    selection.area,
                    selection.sectionId,
                    (section) => ({ ...section, ...changes }) as typeof section,
                    selection.tabId,
                  ),
                )
              }
              onRemove={() =>
                removeSection(
                  selection.area,
                  selection.sectionId,
                  selection.tabId,
                )
              }
            />
          )}
          {selection.kind === "field" && selectedField && (
            <FieldProperties
              field={selectedField}
              details={selection.area === "details"}
              dataSources={dataSources}
              onChange={mutateField}
              onMove={reorderField}
              onRemove={removeField}
            />
          )}
          {selection.kind === "tab" && selectedTab && (
            <TabProperties
              tab={selectedTab}
              onChange={(changes) => mutateTab(selectedTab.id, changes)}
              onMove={(direction) => reorderTab(selectedTab.id, direction)}
              onRemove={() => removeTab(selectedTab.id)}
            />
          )}
        </aside>
      </div>
    </>
  )}

  {activeModule === "Form Settings" && (
    <FormSettingsEditor
      schema={schema}
      disabled={publishing || saving}
      onChange={(nextSchema) => {
        setSchema(nextSchema);
        onChange?.(nextSchema);
      }}
    />
  )}

  {activeModule === "Workflow" && (
    <WorkflowEditor
      schema={schema}
      disabled={publishing || saving}
      organizationMembers={organizationMembers}
      onChange={(nextSchema) => {
        setSchema(nextSchema);
        onChange?.(nextSchema);
      }}
    />
  )}

  {activeModule === "Rules" && (
    <RulesEditor
      schema={schema}
      disabled={publishing || saving}
      onChange={(nextSchema) => {
        setSchema(nextSchema);
        onChange?.(nextSchema);
      }}
    />
  )}

  {activeModule === "List View" && (
    <ListViewEditor
      schema={schema}
      disabled={publishing || saving}
      onChange={(nextSchema) => {
        setSchema(nextSchema);
        onChange?.(nextSchema);
      }}
    />
  )}

  {activeModule === "Versions" && (
    <div className="fb-versions-view">
      <div className="fb-versions-header">
        <div>
          <h2>Version History</h2>
          <p>
            Published versions are permanent and immutable. Previous submissions reference their creation version.
          </p>
        </div>
        <div className="fb-versions-actions">
          {onLoadVersions && (
            <button
              type="button"
              onClick={async () => {
                setLoadingVersions(true);
                try {
                  const list = await onLoadVersions();
                  setLoadedVersions(list);
                } catch (err) {
                  setNotice(
                    err instanceof Error
                      ? `Failed to refresh versions: ${err.message}`
                      : "Failed to refresh versions.",
                  );
                } finally {
                  setLoadingVersions(false);
                }
              }}
              disabled={loadingVersions}
            >
              {loadingVersions ? "Refreshing…" : "↻ Refresh"}
            </button>
          )}
          <button
            type="button"
            className="fb-primary"
            onClick={() => setActiveModule("Design")}
          >
            Back to Design
          </button>
        </div>
      </div>

      {loadingVersions ? (
        <div className="fb-versions-empty" role="status">
          Loading version history…
        </div>
      ) : loadedVersions.length === 0 ? (
        <div className="fb-versions-empty">
          <p>No versions recorded yet for this form.</p>
          <p className="fb-text-muted">
            Once published, form versions and historical snapshots will appear here.
          </p>
        </div>
      ) : (
        <div className="fb-versions-table-container">
          <table className="fb-versions-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Release Date</th>
                <th>Author / Publisher</th>
                <th>Change Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadedVersions.map((v) => (
                <tr key={v.id}>
                  <td className="fb-version-num">v{v.version_number}</td>
                  <td>
                    <span
                      className={`fb-status-badge fb-status-${v.status}`}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td className="fb-version-date">
                    {v.published_at
                      ? new Date(v.published_at).toLocaleString()
                      : v.created_at
                        ? new Date(v.created_at).toLocaleString()
                        : "—"}
                  </td>
                  <td className="fb-version-author">
                    {v.published_by || v.created_by || "System"}
                  </td>
                  <td className="fb-version-note">
                    {v.change_note ? (
                      v.change_note
                    ) : (
                      <span className="fb-muted-dash">—</span>
                    )}
                  </td>
                  <td className="fb-version-actions-cell">
                    <button
                      type="button"
                      className="fb-btn-preview-version"
                      onClick={() => {
                        setPreviewingPublishedVersion(v);
                        setPreviewPublishedModalOpen(true);
                      }}
                      title={`Preview Version ${v.version_number}`}
                    >
                      ▷ Preview
                    </button>
                    <button
                      type="button"
                      className="fb-btn-schema"
                      onClick={() => {
                        rememberOverlayTrigger();
                        setViewingVersionSchema(v);
                      }}
                    >
                      View Schema
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )}

      {addTabOpen && (
        <div
          className="fb-dialog-backdrop"
          role="presentation"
          onMouseDown={closeAddTab}
        >
          <div
            className="fb-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-tab-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="fb-dialog-close"
              type="button"
              aria-label="Close add tab"
              onClick={closeAddTab}
            >
              ×
            </button>
            <h2 id="add-tab-title">Add Tab</h2>
            <p>Create a configured area in the form.</p>
            <label>
              Tab name
              <input
                autoFocus
                value={tabDraft.title}
                onChange={(event) =>
                  setTabDraft({ ...tabDraft, title: event.target.value })
                }
              />
            </label>
            <fieldset>
              <legend>Tab type</legend>
              <div className="fb-tab-types">
                {TAB_TYPES.map((type) => (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={tabDraft.type === type}
                    onClick={() => setTabDraft({ ...tabDraft, type })}
                  >
                    <strong>{TAB_LABELS[type]}</strong>
                    <span>
                      {type === "form"
                        ? "Standard fields"
                        : type === "details"
                          ? "Repeating rows"
                          : type === "notes"
                            ? "Append-only history"
                            : "File collection"}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="fb-dialog-actions">
              <button type="button" onClick={closeAddTab}>
                Cancel
              </button>
              <button
                type="button"
                className="fb-primary"
                disabled={!tabDraft.title.trim()}
                onClick={addTab}
              >
                Add Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div
          className="fb-preview"
          role="dialog"
          aria-modal="true"
          aria-label="Form preview"
        >
          <header>
            <div>
              <strong>Preview</strong>
              <span>Current local draft · Phase 2 renderer</span>
            </div>
            <button ref={previewClose} type="button" onClick={closePreview}>
              Close
            </button>
          </header>
          <div className="fb-preview-body">
            <FormRenderer
              schema={schema}
              mode="preview"
              lookupProvider={lookupProvider ?? (async () => [])}
            />
          </div>
        </div>
      )}

      {publishDialogOpen && (
        <div
          className="fb-dialog-backdrop"
          role="presentation"
          onMouseDown={() => !publishing && closePublishDialog()}
        >
          <div
            className="fb-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="fb-dialog-close"
              type="button"
              aria-label="Close publish dialog"
              disabled={publishing}
              onClick={closePublishDialog}
            >
              ×
            </button>
            <h2 id="publish-dialog-title">Publish Form Version</h2>

            {publishValidation && !publishValidation.valid ? (
              <div className="fb-publish-blocked">
                <div className="fb-validation" role="alert">
                  <strong>Publishing blocked by validation errors</strong>
                  <p>Please resolve these issues before publishing this form:</p>
                  <ul>
                    {publishValidation.errors.map((error, index) => (
                      <li key={`${error.path}-${index}`}>
                        {error.path ? <code>{error.path}</code> : null}{" "}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="fb-dialog-actions" style={{ marginTop: 18 }}>
                  <button
                    type="button"
                    className="fb-primary"
                    onClick={closePublishDialog}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p>
                  Publishing locks the current draft into a permanent, immutable
                  release and makes it available for runtime form submissions.
                </p>
                <label className="fb-dialog-field">
                  <span>Change Note (optional)</span>
                  <textarea
                    value={publishChangeNote}
                    onChange={(event) =>
                      setPublishChangeNote(event.target.value)
                    }
                    placeholder="Describe what changed in this version (e.g. Added emergency contact fields)"
                    rows={3}
                    disabled={publishing}
                  />
                </label>
                {publishError && (
                  <div
                    className="fb-validation"
                    role="alert"
                    style={{ marginTop: 12 }}
                  >
                    <strong>Publish error:</strong> {publishError}
                  </div>
                )}
                <div className="fb-dialog-actions">
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={closePublishDialog}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="fb-primary"
                    disabled={publishing}
                    onClick={confirmPublish}
                  >
                    {publishing ? "Publishing…" : "Confirm & Publish"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewingVersionSchema && (
        <div
          className="fb-dialog-backdrop"
          role="presentation"
          onMouseDown={() => {
            setViewingVersionSchema(null);
            restoreOverlayTrigger();
          }}
        >
          <div
            className="fb-dialog fb-dialog-schema"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schema-viewer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="fb-dialog-close"
              type="button"
              aria-label="Close schema viewer"
              onClick={() => {
                setViewingVersionSchema(null);
                restoreOverlayTrigger();
              }}
            >
              ×
            </button>
            <h2 id="schema-viewer-title">
              Form Schema — v{viewingVersionSchema.version_number} (
              {viewingVersionSchema.status})
            </h2>
            <p>
              Read-only immutable snapshot captured at{" "}
              {viewingVersionSchema.published_at
                ? new Date(viewingVersionSchema.published_at).toLocaleString()
                : new Date(viewingVersionSchema.created_at).toLocaleString()}
            </p>

            <div className="fb-schema-body">
              <pre className="fb-schema-code">
                <code>
                  {JSON.stringify(viewingVersionSchema.schema_jsonb, null, 2)}
                </code>
              </pre>
            </div>

            <div className="fb-dialog-actions">
              <button
                type="button"
                onClick={() =>
                  void handleCopySchema(
                    JSON.stringify(viewingVersionSchema.schema_jsonb, null, 2),
                  )
                }
              >
                {copiedSchema ? "Copied!" : "Copy JSON"}
              </button>
              <button
                type="button"
                className="fb-primary"
                onClick={() => {
                  setViewingVersionSchema(null);
                  restoreOverlayTrigger();
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PublishedPreviewModal
        isOpen={previewPublishedModalOpen}
        onClose={() => {
          setPreviewPublishedModalOpen(false);
          setPreviewingPublishedVersion(null);
        }}
        version={previewingPublishedVersion}
        lookupProvider={lookupProvider}
      />

      <ShareFormDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        formId={schema.form.id || ""}
        formTitle={
          latestPublishedVersion?.schema_jsonb?.form?.title || schema.form.title
        }
        formKey={schema.form.key}
        customSlug={
          publicSlug ||
          latestPublishedVersion?.schema_jsonb?.settings?.publicAccess?.customSlug
        }
        publishedVersionNumber={latestPublishedVersion?.version_number}
        isPublic={
          typeof isPublic === "boolean"
            ? isPublic
            : Boolean(schema.settings?.publicAccess?.enabled)
        }
        onTogglePublicAccess={async (enabled) => {
          if (onTogglePublicAccess) {
            await onTogglePublicAccess(enabled);
          } else {
            const nextSettings = {
              ...schema.settings,
              publicAccess: {
                ...schema.settings?.publicAccess,
                enabled,
              },
            };
            update({
              ...schema,
              settings: nextSettings,
            });
          }
        }}
      />
    </div>
  );
}

function SectionCard({
  section,
  selected,
  selectedFieldId,
  onSelect,
  onFieldSelect,
  onMove,
  onRemove,
}: {
  section: HeaderSectionDefinition | FormSectionDefinition;
  selected: boolean;
  selectedFieldId?: string;
  onSelect: () => void;
  onFieldSelect: (id: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <article
      className={`fb-section-card ${selected ? "is-selected" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <header>
        <div>
          <strong>{section.title || "Untitled section"}</strong>
          <span>
            {section.fields.length}{" "}
            {section.fields.length === 1 ? "field" : "fields"}
          </span>
        </div>
        <OrderButtons
          label={section.title || "section"}
          onUp={() => onMove(-1)}
          onDown={() => onMove(1)}
        />
        <button
          type="button"
          aria-label={`Remove ${section.title || "section"}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </header>
      <div className="fb-field-list">
        {section.fields.length === 0 ? (
          <span className="fb-inline-empty">
            Select this section, then add fields.
          </span>
        ) : (
          section.fields.map((field) => (
            <button
              type="button"
              key={field.id}
              className={selectedFieldId === field.id ? "is-selected" : ""}
              onClick={(event) => {
                event.stopPropagation();
                onFieldSelect(field.id);
              }}
            >
              <FieldGlyph type={field.type} />
              <span>
                <strong>{field.label}</strong>
                <small>
                  {FIELD_LABELS[field.type]} · {field.key}
                </small>
              </span>
              {field.required && <em>Required</em>}
            </button>
          ))
        )}
      </div>
    </article>
  );
}

function ActiveTabCanvas({
  tab,
  selection,
  onSelectTab,
  onSelectSection,
  onSelectField,
  onAddSection,
  onMoveSection,
  onRemoveSection,
}: {
  tab: FormTabUnion;
  selection: BuilderSelection;
  onSelectTab: () => void;
  onSelectSection: (id: string) => void;
  onSelectField: (id: string, sectionId?: string) => void;
  onAddSection: () => void;
  onMoveSection: (id: string, direction: -1 | 1) => void;
  onRemoveSection: (id: string) => void;
}) {
  if (tab.type === "form")
    return (
      <div onClick={onSelectTab}>
        <div className="fb-tab-heading">
          <div>
            <h3>{tab.title}</h3>
            <p>Form / Fields · {tab.columns ?? 1} column layout</p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddSection();
            }}
          >
            ＋ Section
          </button>
        </div>
        {tab.sections.length === 0 ? (
          <div className="fb-empty fb-large-empty">
            No sections in this tab.
          </div>
        ) : (
          <div className="fb-section-grid">
            {tab.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                selected={
                  selection.kind === "section" &&
                  selection.sectionId === section.id
                }
                selectedFieldId={
                  selection.kind === "field" ? selection.fieldId : undefined
                }
                onSelect={() => onSelectSection(section.id)}
                onFieldSelect={(fieldId) => onSelectField(fieldId, section.id)}
                onMove={(direction) => onMoveSection(section.id, direction)}
                onRemove={() => onRemoveSection(section.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  if (tab.type === "details")
    return (
      <div onClick={onSelectTab}>
        <div className="fb-tab-heading">
          <div>
            <h3>{tab.title}</h3>
            <p>Details / Grid · {tab.configuration.columns.length} columns</p>
          </div>
        </div>
        <div className="fb-grid-preview">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {tab.configuration.columns.map((column) => (
                  <th key={column.id}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab.configuration.columns.length === 0 ? (
                <tr>
                  <td colSpan={2}>
                    Select the tab, then add field types as grid columns.
                  </td>
                </tr>
              ) : (
                <tr>
                  <td>1</td>
                  {tab.configuration.columns.map((column) => (
                    <td key={column.id}>
                      <button
                        type="button"
                        className={
                          selection.kind === "field" &&
                          selection.fieldId === column.id
                            ? "is-selected"
                            : ""
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectField(column.id);
                        }}
                      >
                        {FIELD_LABELS[column.type]} settings
                      </button>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  if (tab.type === "notes")
    return (
      <div className="fb-special-preview" onClick={onSelectTab}>
        <span className="fb-special-icon">≡</span>
        <h3>{tab.title}</h3>
        <p>Append-only note history</p>
        <div>No notes yet. Runtime notes will appear here.</div>
      </div>
    );
  return (
    <div className="fb-special-preview" onClick={onSelectTab}>
      <span className="fb-special-icon">↥</span>
      <h3>{tab.title}</h3>
      <p>Document collection</p>
      <div>Drag and drop runtime files here</div>
    </div>
  );
}

function HeaderProperties({
  schema,
  update,
}: {
  schema: FormSchemaV1;
  update: (schema: FormSchemaV1) => void;
}) {
  return (
    <div className="fb-property-form">
      <h3>Header layout</h3>
      <label>
        Columns
        <select
          aria-label="Header columns"
          value={schema.header.columns ?? 1}
          onChange={(event) =>
            update({
              ...schema,
              header: { ...schema.header, columns: Number(event.target.value) },
            })
          }
        >
          {[1, 2, 3, 4].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <p className="fb-help">
        Use a controlled 1–4 column layout. Sections keep stable IDs as layout
        changes.
      </p>
    </div>
  );
}

function SectionProperties({
  section,
  area,
  onChange,
  onRemove,
}: {
  section: HeaderSectionDefinition | FormSectionDefinition;
  area: "header" | "tab";
  onChange: (
    changes: Partial<HeaderSectionDefinition & FormSectionDefinition>,
  ) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fb-property-form">
      <h3>Section properties</h3>
      <label>
        Title
        <input
          aria-label="Section title"
          value={section.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>
      <label>
        Key
        <input
          aria-label="Section key"
          value={section.key}
          onChange={(event) => onChange({ key: slugify(event.target.value) })}
        />
      </label>
      {area === "header" ? (
        <label>
          Width
          <select
            aria-label="Section width"
            value={(section as HeaderSectionDefinition).width ?? "full"}
            onChange={(event) =>
              onChange({
                width: event.target.value as HeaderSectionDefinition["width"],
              })
            }
          >
            {WIDTHS.map((width) => (
              <option key={width}>{width}</option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Columns
          <select
            aria-label="Section columns"
            value={(section as FormSectionDefinition).columns ?? 1}
            onChange={(event) =>
              onChange({ columns: Number(event.target.value) })
            }
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="fb-danger" onClick={onRemove}>
        Remove section
      </button>
    </div>
  );
}

function FieldProperties({
  field,
  details,
  dataSources,
  onChange,
  onMove,
  onRemove,
}: {
  field: FieldDefinition | DetailsColumnDefinition;
  details: boolean;
  dataSources?: readonly BuilderDataSourceOption[];
  onChange: (
    changes: Partial<FieldDefinition & DetailsColumnDefinition>,
  ) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const options = "options" in field ? field.options : undefined;
  const validation =
    !details && "validation" in field ? field.validation : undefined;
  const fileValidation = validation as
    | { allowedFileExtensions?: string[]; maxFileSizeMb?: number }
    | undefined;
  const activeDataSources = (dataSources ?? []).filter(
    (ds) => !ds.status || ds.status === "active",
  );
  const selectedDataSource =
    field.type === "lookup"
      ? activeDataSources.find(
          (ds) =>
            ds.key === field.lookupConfig?.targetEntity ||
            (ds.id && ds.id === field.lookupConfig?.targetEntity),
        )
      : undefined;
  return (
    <div className="fb-property-form">
      <h3>{details ? "Grid column" : "Field properties"}</h3>
      <div className="fb-readonly-type">
        <FieldGlyph type={field.type} />
        <span>{FIELD_LABELS[field.type]}</span>
      </div>
      <label>
        Label
        <input
          aria-label="Field label"
          value={field.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </label>
      <label>
        Key
        <input
          aria-label="Field key"
          value={field.key}
          onChange={(event) => onChange({ key: slugify(event.target.value) })}
        />
      </label>
      <Toggle
        label="Required"
        checked={field.required ?? false}
        onChange={(required) => onChange({ required })}
      />
      <Toggle
        label="Read only"
        checked={field.readOnly ?? false}
        onChange={(readOnly) => onChange({ readOnly })}
      />
      {!details && "hidden" in field && (
        <Toggle
          label="Hidden"
          checked={field.hidden ?? false}
          onChange={(hidden) => onChange({ hidden })}
        />
      )}
      {!details && "placeholder" in field && (
        <label>
          Placeholder
          <input
            aria-label="Field placeholder"
            value={field.placeholder ?? ""}
            onChange={(event) => onChange({ placeholder: event.target.value })}
          />
        </label>
      )}
      {!details && "width" in field && (
        <label>
          Width
          <select
            aria-label="Field width"
            value={field.width ?? "full"}
            onChange={(event) =>
              onChange({
                width: event.target.value as FieldDefinition["width"],
              })
            }
          >
            {WIDTHS.map((width) => (
              <option key={width}>{width}</option>
            ))}
          </select>
        </label>
      )}
      {field.type === "currency" && !details && (
        <label>
          Currency code
          <input
            aria-label="Currency code"
            value={
              (field as Extract<FieldDefinition, { type: "currency" }>)
                .currencyCode ?? ""
            }
            onChange={(event) =>
              onChange({
                currencyCode: event.target.value.toUpperCase(),
              } as Partial<FieldDefinition>)
            }
          />
        </label>
      )}
      {field.type === "dropdown" && (
        <label>
          Options <small>One `Label = value` per line</small>
          <textarea
            aria-label="Dropdown options"
            rows={5}
            value={(options ?? [])
              .map((option) => `${option.label} = ${option.value}`)
              .join("\n")}
            onChange={(event) =>
              onChange({
                options: event.target.value
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => {
                    const [label, rawValue] = line.split("=");
                    return {
                      label: label.trim(),
                      value: (rawValue ?? label).trim(),
                    };
                  }),
              } as Partial<FieldDefinition>)
            }
          />
        </label>
      )}
      {field.type === "lookup" && (
        <>
          {activeDataSources.length > 0 && (
            <label>
              Data source
              <select
                aria-label="Lookup data source"
                value={selectedDataSource?.key ?? ""}
                onChange={(event) => {
                  const chosen = activeDataSources.find(
                    (ds) => ds.key === event.target.value,
                  );
                  if (!chosen) return;
                  onChange({
                    lookupConfig: {
                      targetEntity: chosen.key,
                      displayField: chosen.displayFieldKey,
                      valueField: chosen.valueFieldKey,
                    },
                  } as Partial<FieldDefinition>);
                }}
              >
                <option value="">Select a tenant data source</option>
                {activeDataSources.map((ds) => (
                  <option key={ds.key} value={ds.key}>
                    {ds.name} ({ds.key})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Lookup entity
            <input
              aria-label="Lookup entity"
              value={field.lookupConfig?.targetEntity ?? ""}
              onChange={(event) =>
                onChange({
                  lookupConfig: {
                    ...(field.lookupConfig ?? {
                      displayField: "label",
                      valueField: "value",
                    }),
                    targetEntity: event.target.value,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          <label>
            Display field
            <input
              aria-label="Lookup display field"
              list={
                selectedDataSource?.fields?.length
                  ? `fb-ds-fields-${field.id}`
                  : undefined
              }
              value={field.lookupConfig?.displayField ?? ""}
              onChange={(event) =>
                onChange({
                  lookupConfig: {
                    ...(field.lookupConfig ?? {
                      targetEntity: "local_options",
                      valueField: "value",
                    }),
                    displayField: event.target.value,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          <label>
            Value field
            <input
              aria-label="Lookup value field"
              list={
                selectedDataSource?.fields?.length
                  ? `fb-ds-fields-${field.id}`
                  : undefined
              }
              value={field.lookupConfig?.valueField ?? ""}
              onChange={(event) =>
                onChange({
                  lookupConfig: {
                    ...(field.lookupConfig ?? {
                      targetEntity: "local_options",
                      displayField: "label",
                    }),
                    valueField: event.target.value,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          {selectedDataSource?.fields?.length ? (
            <datalist id={`fb-ds-fields-${field.id}`}>
              {selectedDataSource.fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </datalist>
          ) : null}
          <p className="fb-help">
            Bind to an active tenant data source and configure its display and
            value fields.
          </p>
        </>
      )}
      {!details && (field.type === "text" || field.type === "textarea") && (
        <>
          <label>
            Minimum length
            <input
              aria-label="Minimum length"
              type="number"
              min={0}
              value={
                "minLength" in (validation ?? {})
                  ? ((validation as { minLength?: number }).minLength ?? "")
                  : ""
              }
              onChange={(event) =>
                onChange({
                  validation: {
                    ...validation,
                    minLength: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          <label>
            Maximum length
            <input
              aria-label="Maximum length"
              type="number"
              min={1}
              value={
                "maxLength" in (validation ?? {})
                  ? ((validation as { maxLength?: number }).maxLength ?? "")
                  : ""
              }
              onChange={(event) =>
                onChange({
                  validation: {
                    ...validation,
                    maxLength: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
        </>
      )}
      {!details && (field.type === "number" || field.type === "currency") && (
        <>
          <label>
            Minimum value
            <input
              aria-label="Minimum value"
              type="number"
              value={
                "min" in (validation ?? {})
                  ? ((validation as { min?: number }).min ?? "")
                  : ""
              }
              onChange={(event) =>
                onChange({
                  validation: {
                    ...validation,
                    min: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          <label>
            Maximum value
            <input
              aria-label="Maximum value"
              type="number"
              value={
                "max" in (validation ?? {})
                  ? ((validation as { max?: number }).max ?? "")
                  : ""
              }
              onChange={(event) =>
                onChange({
                  validation: {
                    ...validation,
                    max: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
        </>
      )}
      {!details && field.type === "file" && (
        <>
          <label>
            Allowed file extensions
            <input
              aria-label="Field allowed extensions"
              value={fileValidation?.allowedFileExtensions?.join(", ") ?? ""}
              onChange={(event) =>
                onChange({
                  validation: {
                    ...validation,
                    allowedFileExtensions: event.target.value
                      .split(",")
                      .map((value) => value.trim().replace(/^\./, ""))
                      .filter(Boolean),
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          <label>
            Maximum file size (MB)
            <input
              aria-label="Field maximum file size"
              type="number"
              min={1}
              value={fileValidation?.maxFileSizeMb ?? ""}
              onChange={(event) =>
                onChange({
                  validation: {
                    ...validation,
                    maxFileSizeMb: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
        </>
      )}
      {field.type === "calculated" && (
        <>
          <label>
            Operation
            <select
              aria-label="Calculation operation"
              value={field.calculationConfig?.operation ?? "sum"}
              onChange={(event) =>
                onChange({
                  calculationConfig: {
                    ...(field.calculationConfig ?? {}),
                    operation: event.target.value as NonNullable<
                      typeof field.calculationConfig
                    >["operation"],
                  },
                } as Partial<FieldDefinition>)
              }
            >
              {[
                "add",
                "subtract",
                "multiply",
                "divide",
                "sum",
                "min",
                "max",
                "count",
              ].map((operation) => (
                <option key={operation}>{operation}</option>
              ))}
            </select>
          </label>
          <label>
            Operand field keys
            <input
              aria-label="Calculation operands"
              value={field.calculationConfig?.operands?.join(", ") ?? ""}
              onChange={(event) =>
                onChange({
                  calculationConfig: {
                    ...(field.calculationConfig ?? { operation: "sum" }),
                    operands: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                } as Partial<FieldDefinition>)
              }
            />
          </label>
          <p className="fb-help">
            This stores declarative schema only. Phase 3 does not execute
            calculations.
          </p>
        </>
      )}
      <div className="fb-inline-actions">
        <button type="button" onClick={() => onMove(-1)}>
          Move up
        </button>
        <button type="button" onClick={() => onMove(1)}>
          Move down
        </button>
      </div>
      <button type="button" className="fb-danger" onClick={onRemove}>
        Remove {details ? "column" : "field"}
      </button>
    </div>
  );
}

function TabProperties({
  tab,
  onChange,
  onMove,
  onRemove,
}: {
  tab: FormTabUnion;
  onChange: (changes: Partial<FormTabUnion>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fb-property-form">
      <h3>Tab properties</h3>
      <label>
        Tab name
        <input
          aria-label="Tab name"
          value={tab.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>
      <label>
        Tab type
        <input aria-label="Tab type" value={TAB_LABELS[tab.type]} readOnly />
      </label>
      {tab.type === "form" && (
        <label>
          Columns
          <select
            aria-label="Tab columns"
            value={tab.columns ?? 1}
            onChange={(event) =>
              onChange({
                columns: Number(event.target.value),
              } as Partial<FormTabUnion>)
            }
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      {tab.type === "details" && (
        <>
          <Toggle
            label="Allow adding rows"
            checked={tab.configuration.allowAdd ?? false}
            onChange={(allowAdd) =>
              onChange({
                configuration: { ...tab.configuration, allowAdd },
              } as Partial<FormTabUnion>)
            }
          />
          <Toggle
            label="Allow editing rows"
            checked={tab.configuration.allowEdit ?? false}
            onChange={(allowEdit) =>
              onChange({
                configuration: { ...tab.configuration, allowEdit },
              } as Partial<FormTabUnion>)
            }
          />
          <Toggle
            label="Allow deleting rows"
            checked={tab.configuration.allowDelete ?? false}
            onChange={(allowDelete) =>
              onChange({
                configuration: { ...tab.configuration, allowDelete },
              } as Partial<FormTabUnion>)
            }
          />
          <label>
            Maximum rows
            <input
              aria-label="Maximum rows"
              type="number"
              min={1}
              value={tab.configuration.maxRows ?? ""}
              onChange={(event) =>
                onChange({
                  configuration: {
                    ...tab.configuration,
                    maxRows: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  },
                } as Partial<FormTabUnion>)
              }
            />
          </label>
        </>
      )}
      {tab.type === "notes" && (
        <>
          <Toggle
            label="Append-only notes"
            checked={tab.appendOnly}
            onChange={(appendOnly) => onChange({ appendOnly })}
          />
          <Toggle
            label="Show author"
            checked={tab.showAuthor}
            onChange={(showAuthor) => onChange({ showAuthor })}
          />
          <Toggle
            label="Show timestamp"
            checked={tab.showTimestamp}
            onChange={(showTimestamp) => onChange({ showTimestamp })}
          />
          <Toggle
            label="Allow attachments"
            checked={tab.allowAttachments}
            onChange={(allowAttachments) => onChange({ allowAttachments })}
          />
          <label>
            Default visibility
            <select
              aria-label="Default visibility"
              value={tab.defaultVisibility}
              onChange={(event) =>
                onChange({
                  defaultVisibility: event.target
                    .value as typeof tab.defaultVisibility,
                })
              }
            >
              <option value="internal">Internal</option>
              <option value="requester_and_approvers">
                Requester and approvers
              </option>
              <option value="all_authorized_users">All authorized users</option>
            </select>
          </label>
        </>
      )}
      {tab.type === "documents" && (
        <>
          <Toggle
            label="Allow multiple files"
            checked={tab.allowMultiple}
            onChange={(allowMultiple) => onChange({ allowMultiple })}
          />
          <Toggle
            label="Require a document"
            checked={tab.required}
            onChange={(required) => onChange({ required })}
          />
          <Toggle
            label="Allow delete before submit"
            checked={tab.allowDeleteBeforeSubmit ?? false}
            onChange={(allowDeleteBeforeSubmit) =>
              onChange({ allowDeleteBeforeSubmit })
            }
          />
          <label>
            Maximum files
            <input
              aria-label="Maximum files"
              type="number"
              min={1}
              value={tab.maxFiles ?? ""}
              onChange={(event) =>
                onChange({
                  maxFiles: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Maximum file size (MB)
            <input
              aria-label="Maximum file size"
              type="number"
              min={1}
              value={tab.maxFileSizeMb ?? ""}
              onChange={(event) =>
                onChange({
                  maxFileSizeMb: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Allowed extensions
            <input
              aria-label="Allowed extensions"
              value={tab.allowedExtensions?.join(", ") ?? ""}
              onChange={(event) =>
                onChange({
                  allowedExtensions: event.target.value
                    .split(",")
                    .map((value) => value.trim().replace(/^\./, ""))
                    .filter(Boolean),
                })
              }
            />
          </label>
        </>
      )}
      <div className="fb-inline-actions">
        <button type="button" onClick={() => onMove(-1)}>
          Move tab left
        </button>
        <button type="button" onClick={() => onMove(1)}>
          Move tab right
        </button>
      </div>
      <button type="button" className="fb-danger" onClick={onRemove}>
        Remove tab
      </button>
    </div>
  );
}
