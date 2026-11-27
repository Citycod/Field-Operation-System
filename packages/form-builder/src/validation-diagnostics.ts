import {
  extractFormulaFieldReferences,
  isFlowWorkflow,
  parseFormula,
  validatePublishableSchema,
  type DetailsColumnDefinition,
  type FieldDefinition,
  type FormSchemaV1,
  type ValidationError,
  type ValidationWarning,
} from "@field/form-engine";
import type {
  BuilderDataSourceOption,
  BuilderMemberOption,
  BuilderModuleTab,
  BuilderSelection,
} from "./types";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCategory =
  | "fields"
  | "calculations"
  | "lookup"
  | "workflow"
  | "rules"
  | "listview"
  | "settings";

export interface DiagnosticFixTarget {
  module: BuilderModuleTab;
  tabId?: string;
  selection?: BuilderSelection;
  workflowStepId?: string;
}

export interface ActionableDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  code: string;
  path: string;
  title: string;
  friendlyMessage: string;
  rawMessage: string;
  fixLabel: string;
  fixTarget: DiagnosticFixTarget;
}

export interface FormReadinessReport {
  validForPublish: boolean;
  errors: ActionableDiagnostic[];
  warnings: ActionableDiagnostic[];
  all: ActionableDiagnostic[];
  summaryByCategory: Record<DiagnosticCategory, { errors: number; warnings: number }>;
  sectionChecks: {
    id: string;
    label: string;
    module: BuilderModuleTab;
    passed: boolean;
    issueCount: number;
    description: string;
  }[];
}

interface FieldLocation {
  field: FieldDefinition | DetailsColumnDefinition;
  label: string;
  key: string;
  id: string;
  tabId?: string;
  selection: BuilderSelection;
}

function indexSchemaFields(schema: FormSchemaV1): {
  byId: Map<string, FieldLocation>;
  byKey: Map<string, FieldLocation>;
  all: FieldLocation[];
} {
  const byId = new Map<string, FieldLocation>();
  const byKey = new Map<string, FieldLocation>();
  const all: FieldLocation[] = [];

  for (const section of schema.header.sections) {
    for (const field of section.fields) {
      const loc: FieldLocation = {
        field,
        label: field.label || field.key,
        key: field.key,
        id: field.id,
        selection: { kind: "field", area: "header", sectionId: section.id, fieldId: field.id },
      };
      byId.set(field.id, loc);
      byKey.set(field.key, loc);
      all.push(loc);
    }
  }

  for (const tab of schema.tabs) {
    if (tab.type === "form") {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          const loc: FieldLocation = {
            field,
            label: field.label || field.key,
            key: field.key,
            id: field.id,
            tabId: tab.id,
            selection: { kind: "field", area: "tab", tabId: tab.id, sectionId: section.id, fieldId: field.id },
          };
          byId.set(field.id, loc);
          byKey.set(field.key, loc);
          all.push(loc);
        }
      }
    } else if (tab.type === "details") {
      for (const col of tab.configuration.columns) {
        const loc: FieldLocation = {
          field: col,
          label: col.label || col.key,
          key: col.key,
          id: col.id,
          tabId: tab.id,
          selection: { kind: "field", area: "details", tabId: tab.id, fieldId: col.id },
        };
        byId.set(col.id, loc);
        byKey.set(col.key, loc);
        all.push(loc);
      }
    }
  }

  return { byId, byKey, all };
}

function resolveFieldLocationFromPath(
  schema: FormSchemaV1,
  path: string,
  index: ReturnType<typeof indexSchemaFields>,
): FieldLocation | undefined {
  const fieldBracketMatch = path.match(/field\[([^\]]+)\]/);
  if (fieldBracketMatch) {
    return index.byId.get(fieldBracketMatch[1]);
  }

  const headerFieldMatch = path.match(/^header\.sections\[(\d+)\]\.fields\[(\d+)\]/);
  if (headerFieldMatch) {
    const section = schema.header.sections[Number(headerFieldMatch[1])];
    const field = section?.fields[Number(headerFieldMatch[2])];
    if (field) return index.byId.get(field.id);
  }

  const tabFieldMatch = path.match(/^tabs\[(\d+)\]\.sections\[(\d+)\]\.fields\[(\d+)\]/);
  if (tabFieldMatch) {
    const tab = schema.tabs[Number(tabFieldMatch[1])];
    if (tab?.type === "form") {
      const section = tab.sections[Number(tabFieldMatch[2])];
      const field = section?.fields[Number(tabFieldMatch[3])];
      if (field) return index.byId.get(field.id);
    }
  }

  const colMatch = path.match(/^tabs\[(\d+)\]\.configuration\.columns\[(\d+)\]/);
  if (colMatch) {
    const tab = schema.tabs[Number(colMatch[1])];
    if (tab?.type === "details") {
      const col = tab.configuration.columns[Number(colMatch[2])];
      if (col) return index.byId.get(col.id);
    }
  }

  return undefined;
}

function resolveSectionSelectionFromPath(
  schema: FormSchemaV1,
  path: string,
): { tabId?: string; selection?: BuilderSelection } {
  const headerSecMatch = path.match(/^header\.sections\[(\d+)\]/);
  if (headerSecMatch) {
    const section = schema.header.sections[Number(headerSecMatch[1])];
    if (section) {
      return { selection: { kind: "section", area: "header", sectionId: section.id } };
    }
  }

  const tabSecMatch = path.match(/^tabs\[(\d+)\]\.sections\[(\d+)\]/);
  if (tabSecMatch) {
    const tab = schema.tabs[Number(tabSecMatch[1])];
    if (tab?.type === "form") {
      const section = tab.sections[Number(tabSecMatch[2])];
      if (section) {
        return {
          tabId: tab.id,
          selection: { kind: "section", area: "tab", tabId: tab.id, sectionId: section.id },
        };
      }
    }
  }

  const tabMatch = path.match(/^tabs\[(\d+)\]/);
  if (tabMatch) {
    const tab = schema.tabs[Number(tabMatch[1])];
    if (tab) {
      return { tabId: tab.id, selection: { kind: "tab", tabId: tab.id } };
    }
  }

  return {};
}

function humanizeIdentifier(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function buildFriendlyDiagnostic(
  issue: ValidationError | ValidationWarning,
  severity: DiagnosticSeverity,
  schema: FormSchemaV1,
  fieldIndex: ReturnType<typeof indexSchemaFields>,
  idx: number,
): ActionableDiagnostic {
  const { path, code, message } = issue;
  const fieldLoc = resolveFieldLocationFromPath(schema, path, fieldIndex);
  const sectionTarget = resolveSectionSelectionFromPath(schema, path);

  let category: DiagnosticCategory = "fields";
  let title = "Field configuration issue";
  let friendlyMessage = message;
  let fixLabel = "Fix This";
  let fixTarget: DiagnosticFixTarget = {
    module: "Design",
    tabId: fieldLoc?.tabId ?? sectionTarget.tabId,
    selection: fieldLoc?.selection ?? sectionTarget.selection,
  };

  if (path.includes("calculationConfig") || code.includes("CALCULATION")) {
    category = "calculations";
    const fieldName = fieldLoc ? `"${fieldLoc.label}"` : "calculated field";
    const missingRefMatch = message.match(/non-existent field "([^"]+)"/i);
    if (missingRefMatch) {
      const missingKey = missingRefMatch[1];
      const suggestedLabel = humanizeIdentifier(missingKey);
      title = `Broken calculation in ${fieldName}`;
      friendlyMessage = `Your ${fieldName} calculation needs a ${suggestedLabel} field ("${missingKey}"). Add the missing field or update the calculation to use an existing numeric field.`;
      fixLabel = "Fix Calculation";
    } else if (code === "INVALID_CALCULATION_CONFIG" || message.toLowerCase().includes("operands")) {
      title = `Incomplete calculation for ${fieldName}`;
      friendlyMessage = `Your ${fieldName} calculation does not have any calculation inputs or formula yet. Pick the numeric fields to calculate or choose a table column to total.`;
      fixLabel = "Configure Calculation";
    } else if (message.toLowerCase().includes("source") || message.toLowerCase().includes("column")) {
      title = `Missing table column in ${fieldName}`;
      friendlyMessage = `Your ${fieldName} table summary points to a table column that no longer exists. Select a valid table column in the calculation settings.`;
      fixLabel = "Select Table Column";
    } else {
      title = `Calculation issue in ${fieldName}`;
      friendlyMessage = `Check the calculation formula in ${fieldName}: ${message}`;
      fixLabel = "Fix Calculation";
    }
  } else if (path.includes("lookupConfig") || code.includes("LOOKUP")) {
    category = "lookup";
    const fieldName = fieldLoc ? `"${fieldLoc.label}"` : "lookup field";
    title = `Lookup source issue in ${fieldName}`;
    if (code === "BROKEN_LOOKUP_SOURCE" || code === "INACTIVE_LOOKUP_SOURCE") {
      friendlyMessage = `The ${fieldName} lookup field is connected to a data source that is missing or inactive. Select an active data source so users can pick values.`;
    } else {
      friendlyMessage = `The ${fieldName} lookup field needs valid display and value columns from its data source. Open the field settings and select matching columns.`;
    }
    fixLabel = "Fix Lookup";
  } else if (path.startsWith("workflow") || code.includes("WORKFLOW") || code.includes("APPROVER") || code.includes("TRANSITION")) {
    category = "workflow";
    fixTarget = { module: "Workflow" };
    fixLabel = "Fix Workflow";

    if (isFlowWorkflow(schema.workflow)) {
      const stepIdxMatch = path.match(/^workflow\.steps\[(\d+)\]/);
      if (stepIdxMatch) {
        const step = schema.workflow.steps[Number(stepIdxMatch[1])];
        if (step) {
          fixTarget.workflowStepId = step.id;
        }
      }
    }

    if (message.toLowerCase().includes("assignee") || code.includes("APPROVER")) {
      title = "Approval stage needs an approver";
      friendlyMessage = "An approval stage in your workflow has no assigned approver. Choose a user, role, or submitter manager so submissions know where to go.";
      fixLabel = "Assign Approver";
    } else if (code.includes("TRANSITION") || message.toLowerCase().includes("transition") || message.toLowerCase().includes("unreachable") || message.toLowerCase().includes("entry")) {
      title = "Disconnected workflow step";
      friendlyMessage = `Your workflow has a disconnected path (${message}). Connect the start trigger and every stage outcome so requests never get stuck.`;
      fixLabel = "Connect Steps";
    } else {
      title = "Workflow needs attention";
      friendlyMessage = `Review your approval workflow: ${message}`;
    }
  } else if (path.startsWith("rules") || code.includes("RULE")) {
    category = "rules";
    title = "Business rule needs attention";
    friendlyMessage = message.toLowerCase().includes("does not exist")
      ? "A business rule references a field that was deleted or renamed. Update the rule to point to an existing field."
      : `Check your business rules configuration: ${message}`;
    fixLabel = "Fix Rule";
    fixTarget = { module: "Rules" };
  } else if (path.startsWith("listView") || code.includes("LIST_VIEW")) {
    category = "listview";
    title = "List view configuration issue";
    friendlyMessage = "Your submission table layout references a column or sort field that no longer exists. Update the List View columns.";
    fixLabel = "Fix List View";
    fixTarget = { module: "List View" };
  } else if (path.startsWith("settings") || code.includes("SETTINGS") || code.includes("PERMISSION")) {
    category = "settings";
    title = "Form settings issue";
    friendlyMessage = `Check Form Settings: ${message}`;
    fixLabel = "Open Settings";
    fixTarget = { module: "Form Settings" };
  } else if (code.includes("DUPLICATE") && code.toLowerCase().includes("key")) {
    category = "fields";
    const fieldName = fieldLoc ? `"${fieldLoc.label}"` : "Two fields";
    title = "Duplicate internal field name";
    friendlyMessage = `${fieldName} shares the same internal field name with another field. Rename one of them under Advanced Settings so saved data stays separate.`;
    fixLabel = "Rename Field";
  } else if (fieldLoc) {
    title = `Check "${fieldLoc.label}"`;
    friendlyMessage = `Please review "${fieldLoc.label}": ${message}`;
    fixLabel = "Go to Field";
  } else {
    title = "Form structure issue";
    friendlyMessage = message;
  }

  return {
    id: `${severity}:${code}:${path}:${idx}`,
    severity,
    category,
    code,
    path,
    title,
    friendlyMessage,
    rawMessage: message,
    fixLabel,
    fixTarget,
  };
}

export function analyzeFormReadiness(
  schema: FormSchemaV1,
  options?: {
    dataSources?: BuilderDataSourceOption[];
    members?: BuilderMemberOption[];
  },
): FormReadinessReport {
  const activeMemberUserIds = options?.members?.length
    ? new Set(options.members.map((m) => m.userId))
    : undefined;

  const dataSourcesSnapshot = options?.dataSources?.map((ds) => ({
    id: ds.id,
    key: ds.key,
    status: ds.status,
    fields: ds.fields,
  }));

  const rawResult = validatePublishableSchema(schema, {
    dataSources: dataSourcesSnapshot,
    activeMemberUserIds,
  });

  const fieldIndex = indexSchemaFields(schema);
  const errorsRaw = rawResult.errors.map((err, idx) =>
    buildFriendlyDiagnostic(err, "error", schema, fieldIndex, idx),
  );
  // Deduplicate redundant calculation errors on the same calculated field when a specific missing-ref message already exists
  const specificCalcFieldIds = new Set(
    errorsRaw
      .filter((e) => e.category === "calculations" && e.path.endsWith(".formula"))
      .map((e) => e.path.match(/field\[([^\]]+)\]/)?.[1])
      .filter(Boolean) as string[],
  );
  const errors: ActionableDiagnostic[] = errorsRaw.filter((err) => {
    if (err.category === "calculations" && err.path.includes(".operands")) {
      const fId = err.path.match(/field\[([^\]]+)\]/)?.[1];
      if (fId && specificCalcFieldIds.has(fId)) return false;
    }
    return true;
  });
  const warnings: ActionableDiagnostic[] = rawResult.warnings.map((warn, idx) =>
    buildFriendlyDiagnostic(warn, "warning", schema, fieldIndex, idx),
  );

  // Add client-side formula syntax/reference guards for fields that might be in partial draft state
  const seenKeys = new Set(errors.map((e) => `${e.category}:${e.path}:${e.code}`));
  for (const loc of fieldIndex.all) {
    if (loc.field.type !== "calculated" || !loc.field.calculationConfig) continue;
    const cfg = loc.field.calculationConfig;
    if (cfg.operation === "custom" && cfg.formula) {
      const parsed = parseFormula(cfg.formula);
      if (parsed.errors.length > 0 && !seenKeys.has(`calculations:field[${loc.id}].calculationConfig.formula:INVALID_FORMULA_SYNTAX`)) {
        errors.push({
          id: `error:FORMULA_SYNTAX:${loc.id}`,
          severity: "error",
          category: "calculations",
          code: "INVALID_FORMULA_SYNTAX",
          path: `field[${loc.id}].calculationConfig.formula`,
          title: `Formula syntax error in "${loc.label}"`,
          friendlyMessage: `Your "${loc.label}" calculation formula could not be understood (${parsed.errors[0]}). Check parentheses, operators, and field names.`,
          rawMessage: parsed.errors[0],
          fixLabel: "Fix Formula",
          fixTarget: {
            module: "Design",
            tabId: loc.tabId,
            selection: loc.selection,
          },
        });
      }
      const refs = extractFormulaFieldReferences(cfg.formula);
      for (const ref of refs) {
        if (!fieldIndex.byKey.has(ref) && !fieldIndex.byId.has(ref)) {
          const dedupKey = `calculations:field[${loc.id}].calculationConfig.formula:BROKEN_CALCULATION_REF`;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            const suggested = humanizeIdentifier(ref);
            errors.push({
              id: `error:MISSING_CALC_REF:${loc.id}:${ref}`,
              severity: "error",
              category: "calculations",
              code: "BROKEN_CALCULATION_REF",
              path: `field[${loc.id}].calculationConfig.formula`,
              title: `Missing calculation input in "${loc.label}"`,
              friendlyMessage: `Your "${loc.label}" calculation needs a ${suggested} field ("${ref}"). Add the missing field or select an existing numeric field.`,
              rawMessage: `Formula references non-existent field "${ref}".`,
              fixLabel: "Fix Calculation",
              fixTarget: {
                module: "Design",
                tabId: loc.tabId,
                selection: loc.selection,
              },
            });
          }
        }
      }
    }
  }

  // Duplicate field key friendly check (header + tabs)
  const keyOccurrences = new Map<string, FieldLocation[]>();
  for (const loc of fieldIndex.all) {
    const list = keyOccurrences.get(loc.key) ?? [];
    list.push(loc);
    keyOccurrences.set(loc.key, list);
  }
  for (const [dupKey, locs] of keyOccurrences.entries()) {
    if (locs.length > 1) {
      const target = locs[1];
      const alreadyReported = errors.some(
        (e) => e.code.includes("DUPLICATE") && e.rawMessage.includes(dupKey),
      );
      if (!alreadyReported) {
        errors.push({
          id: `error:DUP_KEY:${dupKey}:${target.id}`,
          severity: "error",
          category: "fields",
          code: "DUPLICATE_FIELD_KEY",
          path: `field[${target.id}].key`,
          title: `Duplicate internal name "${dupKey}"`,
          friendlyMessage: `"${target.label}" and "${locs[0].label}" both use the internal field name "${dupKey}". Open Advanced Settings on "${target.label}" to give it a unique name.`,
          rawMessage: `Duplicate field key: ${dupKey}`,
          fixLabel: "Rename Field",
          fixTarget: {
            module: "Design",
            tabId: target.tabId,
            selection: target.selection,
          },
        });
      }
    }
  }

  // Helpful non-blocking UX recommendations (warnings)
  const userFieldCount = fieldIndex.all.filter((loc) => loc.field.type !== "calculated").length;
  if (userFieldCount === 0) {
    warnings.push({
      id: "warning:NO_INPUT_FIELDS",
      severity: "warning",
      category: "fields",
      code: "EMPTY_FORM_FIELDS",
      path: "header.sections",
      title: "No input fields added yet",
      friendlyMessage: "Your form currently has no fields for people to fill out. Add at least one field in Stage 1: Build Form.",
      rawMessage: "No input fields configured.",
      fixLabel: "Add Fields",
      fixTarget: { module: "Design" },
    });
  }

  const all = [...errors, ...warnings];
  const summaryByCategory: Record<DiagnosticCategory, { errors: number; warnings: number }> = {
    fields: { errors: 0, warnings: 0 },
    calculations: { errors: 0, warnings: 0 },
    lookup: { errors: 0, warnings: 0 },
    workflow: { errors: 0, warnings: 0 },
    rules: { errors: 0, warnings: 0 },
    listview: { errors: 0, warnings: 0 },
    settings: { errors: 0, warnings: 0 },
  };

  for (const diag of errors) {
    summaryByCategory[diag.category].errors += 1;
  }
  for (const diag of warnings) {
    summaryByCategory[diag.category].warnings += 1;
  }

  const fieldErrors =
    summaryByCategory.fields.errors + summaryByCategory.lookup.errors;
  const calcErrors = summaryByCategory.calculations.errors;
  const workflowErrors = summaryByCategory.workflow.errors;
  const otherErrors =
    summaryByCategory.rules.errors +
    summaryByCategory.listview.errors +
    summaryByCategory.settings.errors;

  const sectionChecks = [
    {
      id: "fields",
      label: "Form Sections & Fields",
      module: "Design" as BuilderModuleTab,
      passed: fieldErrors === 0 && userFieldCount > 0,
      issueCount: fieldErrors + (userFieldCount === 0 ? 1 : 0),
      description: `${fieldIndex.all.length} field${fieldIndex.all.length === 1 ? "" : "s"} across header and ${schema.tabs.length} tab${schema.tabs.length === 1 ? "" : "s"}`,
    },
    {
      id: "calculations",
      label: "Calculated Fields",
      module: "Design" as BuilderModuleTab,
      passed: calcErrors === 0,
      issueCount: calcErrors,
      description:
        calcErrors === 0
          ? "All calculation formulas and field references are valid"
          : `${calcErrors} calculation issue${calcErrors === 1 ? "" : "s"} need attention`,
    },
    {
      id: "workflow",
      label: "Approval Workflow",
      module: "Workflow" as BuilderModuleTab,
      passed: workflowErrors === 0,
      issueCount: workflowErrors,
      description: schema.workflow
        ? workflowErrors === 0
          ? "Workflow stages and approvers are properly connected"
          : `${workflowErrors} workflow issue${workflowErrors === 1 ? "" : "s"} found`
        : "Optional — submissions go straight to submitted status",
    },
    {
      id: "rules_listview",
      label: "Rules, List View & Settings",
      module: otherErrors > 0 && summaryByCategory.rules.errors > 0
        ? ("Rules" as BuilderModuleTab)
        : otherErrors > 0 && summaryByCategory.listview.errors > 0
          ? ("List View" as BuilderModuleTab)
          : ("Form Settings" as BuilderModuleTab),
      passed: otherErrors === 0,
      issueCount: otherErrors,
      description:
        otherErrors === 0
          ? `${schema.rules.length} rule${schema.rules.length === 1 ? "" : "s"} and table columns verified`
          : `${otherErrors} configuration issue${otherErrors === 1 ? "" : "s"} found`,
    },
  ];

  return {
    validForPublish: errors.length === 0,
    errors,
    warnings,
    all,
    summaryByCategory,
    sectionChecks,
  };
}
