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
  type OptionItem,
  type CalculationConfig,
  normalizeOptionItem,
  generateUniqueOptionKey,
  slugifyOptionKey,
  resolveOptionLabel,
  refactorFormulaIdentifier,
  slugifyFieldKey,
  generateUniqueFieldKey,
  validateFieldKey,
  isDefaultPlaceholderKey,
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
  FIELD_DESCRIPTIONS,
  FIELD_EXAMPLES,
  FIELD_LABELS,
  FIELD_TYPES,
  moveFieldBetweenSections,
  moveItem,
  normalizeOrder,
  slugify,
  TAB_DESCRIPTIONS,
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
import { VisualCalculationBuilder } from "./calculation-builder";
import { PublishReadinessPanel } from "./publish-readiness-panel";
import { analyzeFormReadiness, type ActionableDiagnostic } from "./validation-diagnostics";

type BuilderGuidedStage = "build" | "workflow" | "publish";

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
  ariaLabel,
  hint,
  checked,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="fb-toggle-row">
      <input
        type="checkbox"
        aria-label={ariaLabel ?? label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="fb-toggle" aria-hidden="true" />
      <span>
        {label}
        {hint && <small className="fb-toggle-hint">{hint}</small>}
      </span>
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
  onExportVersion,
  createId = defaultId,
  dataSources,
  organizationMembers,
  lookupProvider,
  isPublic,
  publicSlug,
  onTogglePublicAccess,
  isLocked: propIsLocked,
  hasSubmissions: propHasSubmissions,
}: FormBuilderProps) {
  const isFormLocked = Boolean(
    propIsLocked ||
    propHasSubmissions ||
    versions?.some((v) => v.status === "published")
  );
  const [schema, setSchema] = useState(() => cloneSchema(initialSchema));
  const [activeModule, setActiveModule] = useState<BuilderModuleTab>("Design");
  const [activeStage, setActiveStage] = useState<BuilderGuidedStage>("build");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [livePreviewSplit, setLivePreviewSplit] = useState(false);
  const [workflowFocusStepId, setWorkflowFocusStepId] = useState<string | null>(null);
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
  const allSectionKeys = useMemo(() => {
    const keys: string[] = [];
    schema.header.sections.forEach((s) => {
      if (s.key) keys.push(s.key);
    });
    schema.tabs.forEach((t) => {
      if (t.type === "form") {
        t.sections.forEach((s) => {
          if (s.key) keys.push(s.key);
        });
      }
    });
    return keys;
  }, [schema]);

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
      const key = generateUniqueFieldKey("section", allSectionKeys);
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
    const key = generateUniqueFieldKey("section", allSectionKeys);
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

  const addField = (
    type: FieldType,
    explicitTarget?: {
      area: "header" | "tab" | "details";
      sectionId?: string;
      tabId?: string;
      beforeFieldId?: string;
    },
  ) => {
    const isHeaderTarget =
      explicitTarget
        ? explicitTarget.area === "header"
        : (selection.kind === "section" || selection.kind === "field") &&
          selection.area === "header";

    if (
      explicitTarget?.area === "details" ||
      (!explicitTarget && !isHeaderTarget && activeTab?.type === "details")
    ) {
      const targetDetailsTab = explicitTarget?.tabId
        ? schema.tabs.find((t) => t.id === explicitTarget.tabId && t.type === "details")
        : activeTab;
      if (!targetDetailsTab || targetDetailsTab.type !== "details") return;
      const id = idFactory.current("column");
      const key = generateUniqueFieldKey(FIELD_LABELS[type], allFieldKeys);
      update({
        ...schema,
        tabs: schema.tabs.map((tab) =>
          tab.id === targetDetailsTab.id && tab.type === "details"
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
        tabId: targetDetailsTab.id,
      });
      return;
    }

    let targetArea: "header" | "tab" | undefined;
    let targetSectionId: string | undefined;
    let targetTabId: string | undefined;

    if (explicitTarget && (explicitTarget.area === "header" || explicitTarget.area === "tab")) {
      targetArea = explicitTarget.area;
      targetSectionId = explicitTarget.sectionId;
      targetTabId = explicitTarget.tabId;
    } else if (selection.kind === "section") {
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
    const key = generateUniqueFieldKey(FIELD_LABELS[type], allFieldKeys);
    const next = updateSection(
      schema,
      targetArea,
      targetSectionId,
      (section) => {
        const nextFields = [...section.fields];
        const newField = createField(type, id, key, section.fields.length);
        if (explicitTarget?.beforeFieldId) {
          const insertIdx = nextFields.findIndex((f) => f.id === explicitTarget.beforeFieldId);
          if (insertIdx >= 0) {
            nextFields.splice(insertIdx, 0, newField);
            return {
              ...section,
              fields: nextFields.map((f, i) => ({ ...f, order: i + 1 })),
            };
          }
        }
        return {
          ...section,
          fields: [...nextFields, newField],
        };
      },
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

  const cascadeFormulaKeyRename = (
    schemaToUpdate: FormSchemaV1,
    fromKey: string,
    toKey: string,
  ): FormSchemaV1 => {
    if (fromKey === toKey) return schemaToUpdate;
    const updateCalc = (f: FieldDefinition | DetailsColumnDefinition) => {
      if (f.type !== "calculated" || !("calculationConfig" in f) || !f.calculationConfig) {
        return f;
      }
      const cfg = f.calculationConfig;
      const newFormula = cfg.formula
        ? refactorFormulaIdentifier(cfg.formula, fromKey, toKey)
        : cfg.formula;
      const newOperands = cfg.operands
        ? cfg.operands.map((op) => (op === fromKey ? toKey : op))
        : cfg.operands;
      return {
        ...f,
        calculationConfig: {
          ...cfg,
          formula: newFormula,
          operands: newOperands,
        },
      };
    };

    return {
      ...schemaToUpdate,
      header: {
        ...schemaToUpdate.header,
        sections: schemaToUpdate.header.sections.map((sec) => ({
          ...sec,
          fields: sec.fields.map(updateCalc) as FieldDefinition[],
        })),
      },
      tabs: schemaToUpdate.tabs.map((tab) => {
        if (tab.type === "form") {
          return {
            ...tab,
            sections: tab.sections.map((sec) => ({
              ...sec,
              fields: sec.fields.map(updateCalc) as FieldDefinition[],
            })),
          };
        }
        if (tab.type === "details") {
          return {
            ...tab,
            configuration: {
              ...tab.configuration,
              columns: tab.configuration.columns.map(updateCalc) as DetailsColumnDefinition[],
            },
          };
        }
        return tab;
      }),
    };
  };

  const mutateField = (
    changes: Partial<FieldDefinition & DetailsColumnDefinition>,
  ) => {
    if (selection.kind !== "field") return;
    let oldKey: string | null = null;
    let newKey: string | null = null;

    const applyFieldChanges = <
      T extends FieldDefinition | DetailsColumnDefinition,
    >(
      field: T,
    ): T => {
      const resolvedChanges = { ...changes };
      if (resolvedChanges.key && resolvedChanges.key !== field.key) {
        oldKey = field.key;
        newKey = resolvedChanges.key;
      }
      return { ...field, ...resolvedChanges } as T;
    };

    let nextSchema: FormSchemaV1;
    if (selection.area === "details") {
      nextSchema = {
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
      };
    } else {
      nextSchema = updateSection(
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
      );
    }

    if (oldKey && newKey && oldKey !== newKey) {
      nextSchema = cascadeFormulaKeyRename(nextSchema, oldKey, newKey);
    }
    update(nextSchema);
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

  const normalizeDraftKeysBeforeSave = (currentSchema: FormSchemaV1): FormSchemaV1 => {
    let next = cloneSchema(currentSchema);
    let mutated = false;

    // 1. Header sections
    const usedSectionKeys = new Set(allSectionKeys);
    next.header.sections = next.header.sections.map((sec) => {
      if (
        isDefaultPlaceholderKey(sec.key) &&
        sec.title &&
        sec.title.trim() &&
        sec.title.trim().toLowerCase() !== "new section"
      ) {
        usedSectionKeys.delete(sec.key);
        const derived = generateUniqueFieldKey(sec.title.trim(), usedSectionKeys);
        usedSectionKeys.add(derived);
        mutated = true;
        return { ...sec, key: derived };
      }
      return sec;
    });

    // 2. Form tab sections
    next.tabs = next.tabs.map((tab) => {
      if (tab.type === "form") {
        return {
          ...tab,
          sections: tab.sections.map((sec) => {
            if (
              isDefaultPlaceholderKey(sec.key) &&
              sec.title &&
              sec.title.trim() &&
              sec.title.trim().toLowerCase() !== "new section"
            ) {
              usedSectionKeys.delete(sec.key);
              const derived = generateUniqueFieldKey(sec.title.trim(), usedSectionKeys);
              usedSectionKeys.add(derived);
              mutated = true;
              return { ...sec, key: derived };
            }
            return sec;
          }),
        };
      }
      return tab;
    });

    // 3. Fields & Columns
    const usedFieldKeys = new Set(allFieldKeys);
    const keyReplacements: Array<{ oldKey: string; newKey: string }> = [];

    const normalizeField = <T extends FieldDefinition | DetailsColumnDefinition>(
      f: T,
    ): T => {
      if (
        isDefaultPlaceholderKey(f.key) &&
        f.label &&
        f.label.trim() &&
        f.label.trim().toLowerCase() !== FIELD_LABELS[f.type].toLowerCase()
      ) {
        usedFieldKeys.delete(f.key);
        const derived = generateUniqueFieldKey(f.label.trim(), usedFieldKeys);
        usedFieldKeys.add(derived);
        keyReplacements.push({ oldKey: f.key, newKey: derived });
        mutated = true;
        return { ...f, key: derived };
      }
      return f;
    };

    next.header.sections = next.header.sections.map((sec) => ({
      ...sec,
      fields: sec.fields.map(normalizeField),
    }));

    next.tabs = next.tabs.map((tab) => {
      if (tab.type === "form") {
        return {
          ...tab,
          sections: tab.sections.map((sec) => ({
            ...sec,
            fields: sec.fields.map(normalizeField),
          })),
        };
      } else if (tab.type === "details") {
        return {
          ...tab,
          configuration: {
            ...tab.configuration,
            columns: tab.configuration.columns.map(normalizeField),
          },
        };
      }
      return tab;
    });

    for (const { oldKey, newKey } of keyReplacements) {
      next = cascadeFormulaKeyRename(next, oldKey, newKey);
    }

    if (mutated) {
      update(next);
    }
    return next;
  };

  const validateFor = (action: "preview" | "save", targetSchema = schema) => {
    const result = validateDraftSchema(targetSchema);
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
    const targetSchema = normalizeDraftKeysBeforeSave(schema);
    if (validateFor("preview", targetSchema)) {
      rememberOverlayTrigger();
      setPreviewOpen(true);
      setNotice("Preview is using the current local draft schema.");
    }
  };

  const save = async () => {
    const targetSchema = normalizeDraftKeysBeforeSave(schema);
    if (!validateFor("save", targetSchema)) return;
    setSaving(true);
    try {
      await onSave?.(targetSchema);
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
    const targetSchema = normalizeDraftKeysBeforeSave(schema);
    rememberOverlayTrigger();
    const result = validatePublishableSchema(targetSchema, {
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
    setActiveStage(item === "Workflow" ? "workflow" : "build");
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

  const handleSelectStage = (stage: BuilderGuidedStage) => {
    setActiveStage(stage);
    if (stage === "build") {
      if (activeModule === "Workflow") {
        setActiveModule("Design");
      }
    } else if (stage === "workflow") {
      setActiveModule("Workflow");
    }
  };

  const readinessReport = useMemo(
    () =>
      analyzeFormReadiness(schema, {
        dataSources: dataSources ? [...dataSources] : undefined,
        members: organizationMembers ? [...organizationMembers] : undefined,
      }),
    [schema, dataSources, organizationMembers],
  );

  const gridColumns = useMemo(() => {
    const cols: Array<{
      tabKey: string;
      tabLabel: string;
      colKey: string;
      colLabel: string;
      type: string;
    }> = [];
    for (const tab of schema.tabs) {
      if (tab.type === "details") {
        for (const col of tab.configuration.columns) {
          cols.push({
            tabKey: tab.key,
            tabLabel: tab.title,
            colKey: col.key,
            colLabel: col.label,
            type: col.type,
          });
        }
      }
    }
    return cols;
  }, [schema]);

  const navigateToFix = (diag: ActionableDiagnostic) => {
    setDiagnosticsOpen(false);
    if (diag.fixTarget.tabId) {
      setActiveTabId(diag.fixTarget.tabId);
    }
    if (diag.fixTarget.selection) {
      setSelection(diag.fixTarget.selection);
    }
    if (diag.fixTarget.workflowStepId) {
      setWorkflowFocusStepId(diag.fixTarget.workflowStepId);
    }
    setActiveModule(diag.fixTarget.module);
    setActiveStage(diag.fixTarget.module === "Workflow" ? "workflow" : "build");
    setNotice(`Jumped to: ${diag.title}`);
  };

  const handleCreateMissingField = (suggestedKey: string, suggestedLabel: string) => {
    const targetArea: "header" | "tab" | undefined =
      selection.kind === "field" && selection.area === "tab"
        ? "tab"
        : selection.kind === "section"
          ? selection.area
          : schema.header.sections.length > 0
            ? "header"
            : undefined;
    const targetSectionId =
      selection.kind === "field" || selection.kind === "section"
        ? selection.sectionId
        : schema.header.sections[schema.header.sections.length - 1]?.id;
    const targetTabId =
      selection.kind === "field" || selection.kind === "section"
        ? selection.tabId
        : undefined;

    if (!targetArea || !targetSectionId) return;
    const id = idFactory.current("field");
    const uniqueNewKey = allFieldKeys.includes(suggestedKey)
      ? generateUniqueFieldKey(suggestedLabel, allFieldKeys)
      : suggestedKey;
    const created = {
      ...createField("number", id, uniqueNewKey, 999),
      label: suggestedLabel,
    };
    const next = updateSection(
      schema,
      targetArea,
      targetSectionId,
      (sec) => ({
        ...sec,
        fields: [...sec.fields, created].map((f, i) => ({ ...f, order: i + 1 })),
      }),
      targetTabId,
    );
    update(next);
    setNotice(`Added "${suggestedLabel}" (${uniqueNewKey}) so your calculation is valid.`);
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

  const allAvailableFields = useMemo(() => {
    const list: Array<{ key: string; label: string; type: string }> = [];
    for (const section of schema.header.sections) {
      for (const field of section.fields) {
        list.push({ key: field.key, label: field.label, type: field.type });
      }
    }
    for (const tab of schema.tabs) {
      if (tab.type === "form") {
        for (const section of tab.sections) {
          for (const field of section.fields) {
            list.push({ key: field.key, label: field.label, type: field.type });
          }
        }
      } else if (tab.type === "details") {
        for (const col of tab.configuration.columns) {
          list.push({ key: col.key, label: col.label, type: col.type });
        }
      }
    }
    return list;
  }, [schema]);

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

      <nav className="fb-stage-stepper" aria-label="Guided form creation stages">
        <div className="fb-stage-steps">
          <button
            type="button"
            className={`fb-stage-btn ${activeStage === "build" ? "is-active" : ""}`}
            aria-current={activeStage === "build" ? "step" : undefined}
            onClick={() => handleSelectStage("build")}
          >
            <span className="fb-stage-num">1</span>
            <span className="fb-stage-copy">
              <strong>Build Form</strong>
              <small>Sections, fields &amp; calculations</small>
            </span>
          </button>
          <button
            type="button"
            className={`fb-stage-btn ${activeStage === "workflow" ? "is-active" : ""}`}
            aria-current={activeStage === "workflow" ? "step" : undefined}
            onClick={() => handleSelectStage("workflow")}
          >
            <span className="fb-stage-num">2</span>
            <span className="fb-stage-copy">
              <strong>Configure Workflow</strong>
              <small>Approvers &amp; routing</small>
            </span>
          </button>
          <button
            type="button"
            className={`fb-stage-btn ${activeStage === "publish" ? "is-active" : ""}`}
            aria-current={activeStage === "publish" ? "step" : undefined}
            onClick={() => handleSelectStage("publish")}
          >
            <span className="fb-stage-num">3</span>
            <span className="fb-stage-copy">
              <strong>Publish &amp; Share</strong>
              <small>Check readiness &amp; share link</small>
            </span>
          </button>
        </div>

        <div className="fb-stage-status-wrap">
          <button
            type="button"
            className={`fb-validation-pill ${
              readinessReport.errors.length > 0 ? "is-error" : "is-valid"
            }`}
            aria-expanded={diagnosticsOpen}
            onClick={() => setDiagnosticsOpen((prev) => !prev)}
          >
            {readinessReport.errors.length > 0
              ? `! ${readinessReport.errors.length} issue${readinessReport.errors.length === 1 ? "" : "s"} to fix`
              : readinessReport.warnings.length > 0
                ? `✓ Ready · ${readinessReport.warnings.length} tip${readinessReport.warnings.length === 1 ? "" : "s"}`
                : "✓ Form ready to publish"}
          </button>
        </div>
      </nav>

      <nav className="fb-topnav" aria-label="Builder modules">
        {MODULE_TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={activeStage !== "publish" && item === activeModule ? "page" : undefined}
            onClick={() => void handleSelectModule(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {diagnosticsOpen && readinessReport.all.length > 0 && (
        <section
          className={`fb-diagnostics-tray ${readinessReport.errors.length > 0 ? "has-errors" : ""}`}
          aria-label="Live validation checks"
        >
          <div className="fb-diagnostics-head">
            <strong>
              {readinessReport.errors.length > 0
                ? `${readinessReport.errors.length} item${readinessReport.errors.length === 1 ? "" : "s"} need attention before publishing`
                : "Suggestions to improve your form"}
            </strong>
            <button
              type="button"
              className="fb-btn-subtle"
              onClick={() => setDiagnosticsOpen(false)}
            >
              Hide
            </button>
          </div>
          <div className="fb-diagnostics-items">
            {readinessReport.all.map((diag) => (
              <div
                key={diag.id}
                className={`fb-diagnostic-card ${diag.severity === "error" ? "is-error" : "is-warning"}`}
              >
                <div className="fb-diagnostic-copy">
                  <strong>{diag.title}</strong>
                  <p>{diag.friendlyMessage}</p>
                </div>
                <button
                  type="button"
                  className="fb-btn-fix"
                  onClick={() => navigateToFix(diag)}
                >
                  {diag.fixLabel}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {activeStage === "publish" ? (
        <PublishReadinessPanel
          schema={schema}
          report={readinessReport}
          formId={schema.form.id}
          publishedVersionNumber={latestPublishedVersion?.version_number}
          isPublicAccessEnabled={
            typeof isPublic === "boolean"
              ? isPublic
              : Boolean(schema.settings?.publicAccess?.enabled)
          }
          saving={saving}
          publishing={publishing}
          canPublish={Boolean(onPublish)}
          onSave={save}
          onOpenPreview={openPreview}
          onOpenPublishDialog={openPublishDialog}
          onOpenShareDialog={() => setShareDialogOpen(true)}
          onFixIssue={navigateToFix}
          onNavigateModule={(mod) => void handleSelectModule(mod)}
        />
      ) : (
        <>
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

      <div className={`fb-workspace ${livePreviewSplit ? "with-live-preview" : ""}`}>
        <aside className="fb-palette" aria-label="Component palette">
          <div className="fb-panel-heading">
            <h2>Add Fields</h2>
            <p>Click or drag onto a section.</p>
          </div>
          <div className="fb-field-grid">
            {FIELD_TYPES.map((type) => (
              <button
                type="button"
                key={type}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer?.setData("application/x-fb-new-field", type);
                  event.dataTransfer?.setData("text/plain", type);
                }}
                onClick={() => addField(type)}
                aria-label={`Add ${FIELD_LABELS[type]} field`}
                title={`${FIELD_DESCRIPTIONS[type]} (${FIELD_EXAMPLES[type]})`}
              >
                <FieldGlyph type={type} />
                <div className="fb-palette-card-text">
                  <span>{FIELD_LABELS[type]}</span>
                  <small>{FIELD_DESCRIPTIONS[type]}</small>
                </div>
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
            Click a section (or drag a field directly into one) to add questions, totals, or line-item grids.
          </div>
        </aside>

        <main className="fb-canvas">
          <div className="fb-canvas-title">
            <div>
              <h2>Form layout</h2>
              <p>Organize header sections, tabs, and fields.</p>
            </div>
            <div className="fb-canvas-toolbar-actions">
              <button
                type="button"
                aria-pressed={livePreviewSplit}
                onClick={() => setLivePreviewSplit((prev) => !prev)}
              >
                {livePreviewSplit ? "Hide Live Preview" : "Live Preview"}
              </button>
              <button type="button" onClick={openAddTab}>
                ＋ Add Tab
              </button>
            </div>
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
                    area="header"
                    onDropNewField={(type, beforeFieldId) =>
                      addField(type, {
                        area: "header",
                        sectionId: section.id,
                        beforeFieldId,
                      })
                    }
                    onDropMoveField={(source, beforeFieldId) =>
                      update(
                        moveFieldBetweenSections(schema, source, {
                          area: "header",
                          sectionId: section.id,
                          beforeFieldId,
                        }),
                      )
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
                onDropNewField={(type, sectionId, beforeFieldId) =>
                  addField(type, {
                    area: activeTab.type === "details" ? "details" : "tab",
                    tabId: activeTab.id,
                    sectionId,
                    beforeFieldId,
                  })
                }
                onDropMoveField={(source, targetSectionId, beforeFieldId) =>
                  update(
                    moveFieldBetweenSections(schema, source, {
                      area: "tab",
                      tabId: activeTab.id,
                      sectionId: targetSectionId,
                      beforeFieldId,
                    }),
                  )
                }
              />
            )}
          </section>
        </main>

        {livePreviewSplit && (
          <aside className="fb-live-preview-pane" aria-label="Live form preview">
            <div className="fb-live-preview-head">
              <strong>Live Preview</strong>
              <button
                type="button"
                className="fb-btn-subtle"
                onClick={() => setLivePreviewSplit(false)}
              >
                Close
              </button>
            </div>
            <FormRenderer
              schema={schema}
              mode="preview"
              lookupProvider={lookupProvider ?? (async () => [])}
            />
          </aside>
        )}

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
              allSectionKeys={allSectionKeys}
              isLocked={isFormLocked}
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
              availableFields={allAvailableFields}
              gridColumns={gridColumns}
              allFieldKeys={allFieldKeys}
              isLocked={isFormLocked}
              onChange={mutateField}
              onMove={reorderField}
              onRemove={removeField}
              onCreateMissingField={handleCreateMissingField}
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
      focusStepId={workflowFocusStepId}
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
                    {onExportVersion && (
                      <button
                        type="button"
                        className="fb-btn-schema"
                        onClick={() => void onExportVersion(v)}
                        title={`Export Version ${v.version_number} JSON`}
                      >
                        Export JSON
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )}
      </>
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
                    <span>{TAB_DESCRIPTIONS[type]}</span>
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
  area = "header",
  tabId,
  onSelect,
  onFieldSelect,
  onMove,
  onRemove,
  onDropNewField,
  onDropMoveField,
}: {
  section: HeaderSectionDefinition | FormSectionDefinition;
  selected: boolean;
  selectedFieldId?: string;
  area?: "header" | "tab";
  tabId?: string;
  onSelect: () => void;
  onFieldSelect: (id: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDropNewField?: (type: FieldType, beforeFieldId?: string) => void;
  onDropMoveField?: (
    source: { area: "header" | "tab"; tabId?: string; sectionId: string; fieldId: string },
    beforeFieldId?: string,
  ) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDropOnSection = (event: React.DragEvent, beforeFieldId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    const movePayload = event.dataTransfer?.getData("application/x-fb-move-field");
    if (movePayload && onDropMoveField) {
      try {
        const parsed = JSON.parse(movePayload) as {
          area: "header" | "tab";
          tabId?: string;
          sectionId: string;
          fieldId: string;
        };
        if (parsed.fieldId && parsed.sectionId) {
          onDropMoveField(parsed, beforeFieldId);
          return;
        }
      } catch {
        // ignore invalid drag payload
      }
    }

    const droppedType = (
      event.dataTransfer?.getData("application/x-fb-new-field") ||
      event.dataTransfer?.getData("text/plain")
    ) as FieldType | "";
    if (droppedType && FIELD_TYPES.includes(droppedType as FieldType) && onDropNewField) {
      onDropNewField(droppedType as FieldType, beforeFieldId);
    }
  };

  return (
    <article
      className={`fb-section-card ${selected ? "is-selected" : ""} ${dragOver ? "is-drag-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => handleDropOnSection(event)}
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
            Select this section, then add or drop fields here.
          </span>
        ) : (
          section.fields.map((field) => (
            <button
              type="button"
              key={field.id}
              draggable
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer?.setData(
                  "application/x-fb-move-field",
                  JSON.stringify({
                    area,
                    tabId,
                    sectionId: section.id,
                    fieldId: field.id,
                  }),
                );
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDropOnSection(event, field.id)}
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
                  {FIELD_LABELS[field.type]}
                  {!isDefaultPlaceholderKey(field.key) && ` · ${field.key}`}
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
  onDropNewField,
  onDropMoveField,
}: {
  tab: FormTabUnion;
  selection: BuilderSelection;
  onSelectTab: () => void;
  onSelectSection: (id: string) => void;
  onSelectField: (id: string, sectionId?: string) => void;
  onAddSection: () => void;
  onMoveSection: (id: string, direction: -1 | 1) => void;
  onRemoveSection: (id: string) => void;
  onDropNewField?: (type: FieldType, sectionId?: string, beforeFieldId?: string) => void;
  onDropMoveField?: (
    source: { area: "header" | "tab"; tabId?: string; sectionId: string; fieldId: string },
    targetSectionId: string,
    beforeFieldId?: string,
  ) => void;
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
                area="tab"
                tabId={tab.id}
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
                onDropNewField={(type, beforeFieldId) =>
                  onDropNewField?.(type, section.id, beforeFieldId)
                }
                onDropMoveField={(source, beforeFieldId) =>
                  onDropMoveField?.(source, section.id, beforeFieldId)
                }
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
  allSectionKeys = [],
  isLocked = false,
  onChange,
  onRemove,
}: {
  section: HeaderSectionDefinition | FormSectionDefinition;
  area: "header" | "tab";
  allSectionKeys?: string[];
  isLocked?: boolean;
  onChange: (
    changes: Partial<HeaderSectionDefinition & FormSectionDefinition>,
  ) => void;
  onRemove: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  const [keyDraft, setKeyDraft] = useState(section.key);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    setTitleDraft(section.title);
    setKeyDraft(section.key);
    setKeyError(null);
  }, [section.id, section.title, section.key]);

  const handleTitleBlur = () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) return;
    // Generate key from title once on first blur if key is a default placeholder
    if (isDefaultPlaceholderKey(section.key)) {
      const otherKeys = allSectionKeys.filter((k) => k !== section.key);
      const generated = generateUniqueFieldKey(trimmed, otherKeys);
      setKeyDraft(generated);
      onChange({ key: generated });
    }
  };

  const handleKeyChange = (val: string) => {
    setKeyDraft(val);
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const validation = validateFieldKey(sanitized, allSectionKeys, section.key);
    setKeyError(validation.error || null);
    if (validation.valid && sanitized !== section.key) {
      onChange({ key: sanitized });
    }
  };

  const handleKeyBlur = () => {
    const trimmed = keyDraft.trim();
    const sanitized = slugifyFieldKey(trimmed);
    const validation = validateFieldKey(sanitized, allSectionKeys, section.key);
    if (!validation.valid) {
      setKeyDraft(section.key);
      setKeyError(null);
    } else {
      setKeyDraft(sanitized);
      if (sanitized !== section.key) {
        onChange({ key: sanitized });
      }
    }
  };

  return (
    <div className="fb-property-form">
      <h3>Section properties</h3>
      <label>
        Title
        <input
          aria-label="Section title"
          value={titleDraft}
          onChange={(event) => {
            setTitleDraft(event.target.value);
            onChange({ title: event.target.value });
          }}
          onBlur={handleTitleBlur}
        />
      </label>
      <div className="fb-key-status" style={{ margin: "2px 0 10px", fontSize: "11px", color: "var(--fb-muted, #5f6f86)" }}>
        <span>Section Key: <code>{section.key}</code></span>
        {isDefaultPlaceholderKey(section.key) && (
          <span style={{ marginLeft: "6px", fontStyle: "italic", color: "var(--fb-green, #08783e)" }}>
            (auto-derives from title)
          </span>
        )}
      </div>

      <details className="fb-advanced-settings">
        <summary className="fb-advanced-summary">Advanced / Developer Settings</summary>
        <div className="fb-advanced-body">
          {isLocked ? (
            <div className="fb-key-locked-container">
              <span className="fb-option-key-badge" title="Immutable section key">
                🔒 Key: <code>{section.key}</code>
              </span>
              <p className="fb-help" style={{ margin: "4px 0 0" }}>
                Key is immutable because this form has been published or has recorded submissions.
              </p>
            </div>
          ) : (
            <>
              <label>
                Section Key (Developer Override)
                <input
                  aria-label="Section key"
                  value={keyDraft}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  onBlur={handleKeyBlur}
                />
              </label>
              {keyError && (
                <div
                  className="fb-field-key-error"
                  role="alert"
                  style={{
                    color: "var(--fb-danger, #d13438)",
                    fontSize: "11px",
                    marginTop: "2px",
                    fontWeight: 500,
                  }}
                >
                  {keyError}
                </div>
              )}
              <p className="fb-help" style={{ margin: "4px 0 0" }}>
                Auto-generated from title. You do not need to type or edit this unless you need a custom developer key.
              </p>
            </>
          )}
        </div>
      </details>
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

function DropdownOptionsEditor({
  options: rawOptions,
  onChange,
}: {
  options?: readonly OptionItem[];
  onChange: (options: OptionItem[]) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  const options = useMemo(
    () => (rawOptions ?? []).map((o) => normalizeOptionItem(o)),
    [rawOptions],
  );

  const handleUpdateLabel = (index: number, label: string) => {
    const next = [...options];
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, label };
    onChange(next);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    const item = next[index];
    next[index] = next[target];
    next[target] = item;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    const next = options.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleAddOption = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const key = generateUniqueOptionKey(label, options);
    const next = [...options, { key, value: key, label }];
    onChange(next);
    setNewLabel("");
  };

  const rawTextValue = (options ?? [])
    .map((option) => `${option.label} = ${option.key || option.value}`)
    .join("\n");

  const handleToggleRaw = () => {
    if (!showRaw) {
      setRawDraft(rawTextValue);
      setRawError(null);
    } else {
      setRawDraft(null);
      setRawError(null);
    }
    setShowRaw(!showRaw);
  };

  const handleRawTextChange = (text: string) => {
    setRawDraft(text);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: OptionItem[] = [];
    const seenKeys = new Set<string>();

    // Map existing options by label and by canonical key
    const existingByLabel = new Map<string, OptionItem>();
    const existingByKey = new Map<string, OptionItem>();
    for (const opt of options) {
      const k = opt.key || opt.value;
      if (opt.label) existingByLabel.set(opt.label, opt);
      if (k) existingByKey.set(k, opt);
    }

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let cleanLabel = "";
      let cleanKey = "";

      if (line.includes("=")) {
        const parts = line.split("=");
        cleanLabel = parts[0]?.trim() || "";
        cleanKey = parts.slice(1).join("=").trim();
      } else {
        cleanLabel = line.trim();
        cleanKey = "";
      }

      if (!cleanLabel) {
        setRawError(`Line ${lineIdx + 1}: Display label cannot be empty.`);
        return;
      }

      if (cleanKey) {
        // Enforce valid slug characters for keys
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(cleanKey)) {
          setRawError(
            `Line ${lineIdx + 1}: Invalid key "${cleanKey}". Keys must contain only lowercase letters, numbers, hyphens, and underscores.`,
          );
          return;
        }

        // Prevent changing the key of an existing option whose label matched
        const existingForLabel = existingByLabel.get(cleanLabel);
        if (existingForLabel) {
          const originalKey = existingForLabel.key || existingForLabel.value;
          if (originalKey && originalKey !== cleanKey) {
            setRawError(
              `Line ${lineIdx + 1}: Existing key "${originalKey}" cannot be changed to "${cleanKey}". Only display labels may be edited.`,
            );
            return;
          }
        }
      } else {
        // Auto-generate key if omitted on a new line
        cleanKey = generateUniqueOptionKey(cleanLabel, parsed);
      }

      // Enforce duplicate key prevention
      if (seenKeys.has(cleanKey)) {
        setRawError(`Duplicate option key "${cleanKey}" is not allowed.`);
        return;
      }
      seenKeys.add(cleanKey);

      parsed.push({
        key: cleanKey,
        value: cleanKey,
        label: cleanLabel,
      });
    }

    setRawError(null);
    onChange(parsed);
  };

  const prospectiveKey = newLabel.trim()
    ? generateUniqueOptionKey(newLabel.trim(), options)
    : "";

  return (
    <div className="fb-options-manager">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: "12px" }}>Dropdown Options</span>
        <button
          type="button"
          style={{
            fontSize: "11px",
            background: "none",
            border: "none",
            color: "var(--fb-green)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
          onClick={handleToggleRaw}
        >
          {showRaw ? "Structured View" : "Bulk / Raw View"}
        </button>
      </div>

      {showRaw ? (
        <label>
          <small>One `Label = key` per line</small>
          <textarea
            aria-label="Dropdown options"
            rows={5}
            value={rawDraft !== null ? rawDraft : rawTextValue}
            onChange={(event) => handleRawTextChange(event.target.value)}
          />
          {rawError && (
            <div
              className="fb-raw-error"
              role="alert"
              style={{
                color: "var(--fb-danger, #d13438)",
                fontSize: "11px",
                marginTop: "4px",
                fontWeight: 500,
              }}
            >
              {rawError}
            </div>
          )}
        </label>
      ) : (
        <>
          {options.length > 0 ? (
            <div className="fb-options-list" role="list" aria-label="Option rows">
              {options.map((opt, i) => (
                <div key={opt.key || `${i}`} className="fb-option-row">
                  <input
                    className="fb-option-input"
                    aria-label={`Option ${i + 1} display name`}
                    title="User-facing display name"
                    value={opt.label}
                    placeholder="Display Name"
                    onChange={(e) => handleUpdateLabel(i, e.target.value)}
                  />
                  <div className="fb-option-meta">
                    <span
                      className="fb-option-key-badge"
                      title={`Immutable system key: ${opt.key || opt.value}`}
                    >
                      🔒 {opt.key || opt.value}
                    </span>
                    <div className="fb-option-actions">
                      <button
                        type="button"
                        className="fb-option-btn-icon"
                        title="Move up"
                        disabled={i === 0}
                        onClick={() => handleMove(i, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="fb-option-btn-icon"
                        title="Move down"
                        disabled={i === options.length - 1}
                        onClick={() => handleMove(i, 1)}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="fb-option-btn-icon danger"
                        title="Delete option"
                        onClick={() => handleRemove(i)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="fb-help" style={{ margin: "4px 0" }}>
              No options configured yet.
            </p>
          )}

          <div className="fb-add-option-container">
            <div className="fb-add-option-row">
              <input
                className="fb-option-input"
                aria-label="New option display name"
                placeholder="Option name (e.g. Office Supplies)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddOption();
                  }
                }}
              />
              <button
                type="button"
                className="fb-button fb-button-sm"
                style={{ fontSize: "12px", padding: "4px 10px", flexShrink: 0 }}
                disabled={!newLabel.trim()}
                onClick={() => handleAddOption()}
              >
                Add
              </button>
            </div>
            {prospectiveKey && (
              <div style={{ marginTop: "4px" }}>
                <span className="fb-option-key-badge" title="Generated immutable key">
                  → {prospectiveKey}
                </span>
              </div>
            )}
          </div>

          <textarea
            aria-label="Dropdown options"
            style={{ display: "none" }}
            readOnly
            value={rawTextValue}
          />
        </>
      )}
    </div>
  );
}

function FieldProperties({
  field,
  details,
  dataSources,
  availableFields,
  gridColumns = [],
  allFieldKeys = [],
  isLocked = false,
  onChange,
  onMove,
  onRemove,
  onCreateMissingField,
}: {
  field: FieldDefinition | DetailsColumnDefinition;
  details: boolean;
  dataSources?: readonly BuilderDataSourceOption[];
  availableFields?: Array<{ key: string; label: string; type: string }>;
  gridColumns?: Array<{ tabKey: string; tabLabel: string; colKey: string; colLabel: string; type: string }>;
  allFieldKeys?: string[];
  isLocked?: boolean;
  onChange: (
    changes: Partial<FieldDefinition & DetailsColumnDefinition>,
  ) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onCreateMissingField?: (suggestedKey: string, suggestedLabel: string) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(field.label);
  const [keyDraft, setKeyDraft] = useState(field.key);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    setLabelDraft(field.label);
    setKeyDraft(field.key);
    setKeyError(null);
  }, [field.id, field.label, field.key]);

  const handleLabelBlur = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed) return;
    // Generate key from label once on first blur if key is a default placeholder
    if (isDefaultPlaceholderKey(field.key)) {
      const otherKeys = allFieldKeys.filter((k) => k !== field.key);
      const generated = generateUniqueFieldKey(trimmed, otherKeys);
      setKeyDraft(generated);
      onChange({ key: generated });
    }
  };

  const handleKeyChange = (val: string) => {
    setKeyDraft(val);
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const validation = validateFieldKey(sanitized, allFieldKeys, field.key);
    setKeyError(validation.error || null);
    if (validation.valid && sanitized !== field.key) {
      onChange({ key: sanitized });
    }
  };

  const handleKeyBlur = () => {
    const trimmed = keyDraft.trim();
    const sanitized = slugifyFieldKey(trimmed);
    const validation = validateFieldKey(sanitized, allFieldKeys, field.key);
    if (!validation.valid) {
      setKeyDraft(field.key);
      setKeyError(null);
    } else {
      setKeyDraft(sanitized);
      if (sanitized !== field.key) {
        onChange({ key: sanitized });
      }
    }
  };

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
      <h3>{details ? "Table column settings" : "Field settings"}</h3>
      <div className="fb-readonly-type">
        <FieldGlyph type={field.type} />
        <div>
          <span>{FIELD_LABELS[field.type]}</span>
          <small className="fb-help-inline" style={{ display: "block" }}>
            {FIELD_DESCRIPTIONS[field.type]}
          </small>
        </div>
      </div>
      <label>
        Field Label
        <input
          aria-label="Field label"
          value={labelDraft}
          onChange={(event) => {
            setLabelDraft(event.target.value);
            onChange({ label: event.target.value });
          }}
          onBlur={handleLabelBlur}
        />
      </label>
      {!details && "helpText" in field && (
        <label>
          Description / Help Text
          <input
            aria-label="Field description"
            placeholder="Optional instructions shown below this field"
            value={field.helpText ?? ""}
            onChange={(event) => onChange({ helpText: event.target.value })}
          />
        </label>
      )}
      {!details && "placeholder" in field && (
        <label>
          Placeholder Text
          <input
            aria-label="Field placeholder"
            placeholder={FIELD_EXAMPLES[field.type]}
            value={field.placeholder ?? ""}
            onChange={(event) => onChange({ placeholder: event.target.value })}
          />
        </label>
      )}
      {!details && "width" in field && (
        <label>
          Column Width
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
              <option key={width} value={width}>
                {width === "full"
                  ? "full (Whole row)"
                  : width === "half"
                    ? "half (2 per row)"
                    : width === "third"
                      ? "third (3 per row)"
                      : "quarter (4 per row)"}
              </option>
            ))}
          </select>
        </label>
      )}
      <Toggle
        label="Must Be Completed"
        ariaLabel="Required"
        hint="People must fill this in before submitting"
        checked={field.required ?? false}
        onChange={(required) => onChange({ required })}
      />
      <div className="fb-key-status" style={{ margin: "2px 0 10px", fontSize: "11px", color: "var(--fb-muted, #5f6f86)" }}>
        <span>Internal Field Name: <code>{field.key}</code></span>
        {isDefaultPlaceholderKey(field.key) && (
          <span style={{ marginLeft: "6px", fontStyle: "italic", color: "var(--fb-green, #08783e)" }}>
            (auto-created from label)
          </span>
        )}
      </div>

      <details className="fb-advanced-settings">
        <summary className="fb-advanced-summary">More Options (Display &amp; Limits)</summary>
        <div className="fb-advanced-body">
          <Toggle
            label="Cannot Be Edited"
            ariaLabel="Read only"
            hint="Displays the value as locked / read-only"
            checked={field.readOnly ?? false}
            onChange={(readOnly) => onChange({ readOnly })}
          />
          {!details && "hidden" in field && (
            <Toggle
              label="Hidden by Default"
              ariaLabel="Hidden"
              hint="Only shown when revealed by a rule"
              checked={field.hidden ?? false}
              onChange={(hidden) => onChange({ hidden })}
            />
          )}
          {field.type === "currency" && !details && (
            <label>
              Currency Code
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
          {!details && (field.type === "text" || field.type === "textarea") && (
            <>
              <label>
                Minimum Length
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
                Maximum Length
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
                Minimum Value
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
                Maximum Value
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
                Allowed File Types
                <input
                  aria-label="Field allowed extensions"
                  placeholder="pdf, png, jpg"
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
                Maximum File Size (MB)
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
        </div>
      </details>

      <details className="fb-advanced-settings">
        <summary className="fb-advanced-summary">Advanced / Developer Settings</summary>
        <div className="fb-advanced-body">
          {isLocked ? (
            <div className="fb-key-locked-container">
              <span className="fb-option-key-badge" title="Immutable system key">
                🔒 Key: <code>{field.key}</code>
              </span>
              <p className="fb-help" style={{ margin: "4px 0 0" }}>
                Key is immutable because this form has been published or has recorded submissions.
              </p>
            </div>
          ) : (
            <>
              <label>
                Internal Field Name (Advanced Override)
                <input
                  aria-label="Field key"
                  value={keyDraft}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  onBlur={handleKeyBlur}
                />
              </label>
              {keyError && (
                <div
                  className="fb-field-key-error"
                  role="alert"
                  style={{
                    color: "var(--fb-danger, #d13438)",
                    fontSize: "11px",
                    marginTop: "2px",
                    fontWeight: 500,
                  }}
                >
                  {keyError}
                </div>
              )}
              <p className="fb-help" style={{ margin: "4px 0 0" }}>
                Automatically generated from the label. Only change this if integrating with an external API or formula.
              </p>
            </>
          )}
        </div>
      </details>
      {field.type === "dropdown" && (
        <DropdownOptionsEditor
          options={options}
          onChange={(newOptions) =>
            onChange({ options: newOptions } as Partial<FieldDefinition & DetailsColumnDefinition>)
          }
        />
      )}
      {field.type === "lookup" && (
        <>
          <label>
            Source Type
            <select
              aria-label="Lookup source type"
              value={field.lookupConfig?.sourceType ?? "data_source"}
              onChange={(e) => {
                const newSourceType = e.target.value as NonNullable<
                  typeof field.lookupConfig
                >["sourceType"];
                if (newSourceType === "table") {
                  onChange({
                    lookupConfig: {
                      ...(field.lookupConfig ?? {}),
                      sourceType: "table",
                      targetEntity: "members",
                      displayField: "name",
                      valueField: "id",
                    },
                  } as Partial<FieldDefinition & DetailsColumnDefinition>);
                } else if (newSourceType === "api") {
                  onChange({
                    lookupConfig: {
                      ...(field.lookupConfig ?? {}),
                      sourceType: "api",
                      apiMethod: "GET",
                      displayField: "label",
                      valueField: "value",
                    },
                  } as Partial<FieldDefinition & DetailsColumnDefinition>);
                } else {
                  onChange({
                    lookupConfig: {
                      ...(field.lookupConfig ?? {}),
                      sourceType: "data_source",
                      targetEntity: selectedDataSource?.key ?? "",
                      displayField: selectedDataSource?.displayFieldKey ?? "label",
                      valueField: selectedDataSource?.valueFieldKey ?? "value",
                    },
                  } as Partial<FieldDefinition & DetailsColumnDefinition>);
                }
              }}
            >
              <option value="data_source">Tenant Data Source</option>
              <option value="table">Platform Member Roster</option>
              <option value="api">External REST API</option>
            </select>
          </label>

          {(!field.lookupConfig?.sourceType || field.lookupConfig.sourceType === "data_source") && (
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
                          ...(field.lookupConfig ?? {}),
                          sourceType: "data_source",
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
                Bind to an active tenant data source and configure its display and value fields.
              </p>
            </>
          )}

          {field.lookupConfig?.sourceType === "table" && (
            <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "4px", border: "1px solid var(--fb-line)", marginTop: "6px" }}>
              <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--fb-ink)" }}>
                <strong>Platform Member Roster:</strong> Dynamically resolves active members from the current organization.
              </p>
              <label>
                Display format
                <input
                  aria-label="Lookup display field"
                  value={field.lookupConfig?.displayField ?? "name"}
                  onChange={(e) =>
                    onChange({
                      lookupConfig: {
                        ...field.lookupConfig,
                        displayField: e.target.value,
                      },
                    } as Partial<FieldDefinition>)
                  }
                />
              </label>
            </div>
          )}

          {field.lookupConfig?.sourceType === "api" && (
            <>
              <label>
                API Endpoint URL
                <input
                  aria-label="Lookup API endpoint"
                  placeholder="https://api.example.com/v1/options"
                  value={field.lookupConfig?.apiEndpoint ?? ""}
                  onChange={(e) =>
                    onChange({
                      lookupConfig: {
                        ...(field.lookupConfig ?? {}),
                        apiEndpoint: e.target.value,
                      },
                    } as Partial<FieldDefinition>)
                  }
                />
              </label>
              <label>
                HTTP Method
                <select
                  aria-label="Lookup API method"
                  value={field.lookupConfig?.apiMethod ?? "GET"}
                  onChange={(e) =>
                    onChange({
                      lookupConfig: {
                        ...(field.lookupConfig ?? {}),
                        apiMethod: e.target.value as "GET" | "POST",
                      },
                    } as Partial<FieldDefinition>)
                  }
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </label>
              <label>
                Display Field Key
                <input
                  aria-label="Lookup display field"
                  placeholder="label (or name, title)"
                  value={field.lookupConfig?.displayField ?? ""}
                  onChange={(e) =>
                    onChange({
                      lookupConfig: {
                        ...(field.lookupConfig ?? {}),
                        displayField: e.target.value,
                      },
                    } as Partial<FieldDefinition>)
                  }
                />
              </label>
              <label>
                Value Field Key
                <input
                  aria-label="Lookup value field"
                  placeholder="value (or id, code)"
                  value={field.lookupConfig?.valueField ?? ""}
                  onChange={(e) =>
                    onChange({
                      lookupConfig: {
                        ...(field.lookupConfig ?? {}),
                        valueField: e.target.value,
                      },
                    } as Partial<FieldDefinition>)
                  }
                />
              </label>
              <p className="fb-help">
                External APIs are protected against SSRF. Private networks and internal hostnames are blocked.
              </p>
            </>
          )}
        </>
      )}
      {field.type === "calculated" && (
        <VisualCalculationBuilder
          field={field}
          availableFields={availableFields}
          gridColumns={gridColumns}
          onChange={onChange}
          onCreateMissingField={onCreateMissingField}
        />
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
