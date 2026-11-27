"use client";

import React, { useMemo, useState } from "react";
import {
  extractFormulaFieldReferences,
  evaluateFormula,
  parseFormula,
  refactorFormulaIdentifier,
  type CalculationConfig,
  type DetailsColumnDefinition,
  type FieldDefinition,
} from "@field/form-engine";

export interface CalculationFieldOption {
  key: string;
  label: string;
  type: string;
  source?: string; // e.g. 'tabKey.colKey' for grid columns
}

export interface VisualCalculationBuilderProps {
  field: FieldDefinition | DetailsColumnDefinition;
  availableFields?: CalculationFieldOption[];
  gridColumns?: Array<{ tabKey: string; tabLabel: string; colKey: string; colLabel: string; type: string }>;
  onChange: (changes: Partial<FieldDefinition & DetailsColumnDefinition>) => void;
  onCreateMissingField?: (suggestedKey: string, suggestedLabel: string) => void;
}

const OPERATION_LABELS: Record<string, { label: string; hint: string }> = {
  add: { label: "Add (+)", hint: "Adds two or more numbers together" },
  subtract: { label: "Subtract (−)", hint: "Subtracts subsequent fields from the first field" },
  multiply: { label: "Multiply (×)", hint: "Multiplies inputs together (e.g. Quantity × Unit Cost)" },
  divide: { label: "Divide (÷)", hint: "Divides the first input by the next input" },
  sum: { label: "Sum (Total)", hint: "Totals multiple fields or a repeating table column" },
  min: { label: "Minimum", hint: "Picks the smallest value among the inputs" },
  max: { label: "Maximum", hint: "Picks the largest value among the inputs" },
  count: { label: "Count", hint: "Counts how many inputs or table rows are filled" },
};

function humanizeKey(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function VisualCalculationBuilder({
  field,
  availableFields = [],
  gridColumns = [],
  onChange,
  onCreateMissingField,
}: VisualCalculationBuilderProps) {
  const config: CalculationConfig =
    (field as { calculationConfig?: CalculationConfig }).calculationConfig ??
    ({ operation: "multiply", operands: [] } as CalculationConfig);

  const isCustomFormula = config.operation === "custom" || Boolean(config.formula);
  const [mode, setMode] = useState<"predefined" | "custom">(
    isCustomFormula ? "custom" : "predefined",
  );
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});
  const [replaceTarget, setReplaceTarget] = useState<Record<string, string>>({});

  const formula = config.formula ?? "";
  const parseResult = useMemo(() => {
    if (!formula.trim()) return null;
    return parseFormula(formula);
  }, [formula]);

  const referencedFields = useMemo(() => {
    if (!formula.trim()) return [];
    return extractFormulaFieldReferences(formula);
  }, [formula]);

  const numericCandidates = useMemo(
    () =>
      availableFields.filter(
        (f) =>
          f.key !== field.key &&
          (f.type === "number" || f.type === "currency" || f.type === "calculated"),
      ),
    [availableFields, field.key],
  );

  const numericGridColumns = useMemo(
    () =>
      gridColumns.filter(
        (col) =>
          col.type === "number" || col.type === "currency" || col.type === "calculated",
      ),
    [gridColumns],
  );

  const fieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of availableFields) {
      map.set(f.key, f.label || f.key);
    }
    return map;
  }, [availableFields]);

  const knownKeys = useMemo(() => new Set(availableFields.map((f) => f.key)), [availableFields]);

  // Detect missing references in active mode
  const missingRefs = useMemo(() => {
    const refs = mode === "custom" ? referencedFields : (config.operands ?? []);
    return refs.filter((ref) => !knownKeys.has(ref));
  }, [mode, referencedFields, config.operands, knownKeys]);

  const missingGridSource = useMemo(() => {
    if (!config.source) return false;
    return !gridColumns.some((c) => `${c.tabKey}.${c.colKey}` === config.source);
  }, [config.source, gridColumns]);

  const humanReadableFormula = useMemo(() => {
    if (!formula.trim()) return "";
    let readable = formula;
    for (const ref of referencedFields) {
      const label = fieldLabelMap.get(ref);
      if (label) {
        const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        readable = readable.replace(new RegExp(`\\b${escaped}\\b`, "g"), `[${label}]`);
      }
    }
    return readable.replace(/\*/g, "×").replace(/\//g, "÷");
  }, [formula, referencedFields, fieldLabelMap]);

  const liveEvaluation = useMemo(() => {
    if (mode === "custom") {
      if (!formula.trim() || !parseResult?.ast) return null;
      const numericInputs: Record<string, unknown> = {};
      for (const ref of referencedFields) {
        numericInputs[ref] = sampleValues[ref] ?? "10";
      }
      return evaluateFormula(parseResult.ast, numericInputs, {
        precision: config.precision,
      });
    }

    const operands = config.operands ?? [];
    if (operands.length === 0) return null;
    const nums = operands.map((op) => {
      const parsed = Number(sampleValues[op] ?? "10");
      return Number.isFinite(parsed) ? parsed : 0;
    });
    let value: number | null = null;
    const op = config.operation || "sum";
    if (op === "add" || op === "sum") value = nums.reduce((a, b) => a + b, 0);
    else if (op === "subtract") value = nums.slice(1).reduce((a, b) => a - b, nums[0] ?? 0);
    else if (op === "multiply") value = nums.reduce((a, b) => a * b, 1);
    else if (op === "divide") {
      value = nums.slice(1).reduce((acc, n) => (n === 0 ? NaN : acc / n), nums[0] ?? 0);
      if (Number.isNaN(value)) return { value: null, error: "Cannot divide by 0" };
    } else if (op === "min") value = Math.min(...nums);
    else if (op === "max") value = Math.max(...nums);
    else if (op === "count") value = operands.length;

    if (value !== null && config.precision !== undefined) {
      value = Number(value.toFixed(config.precision));
    }
    return { value };
  }, [mode, formula, parseResult, referencedFields, sampleValues, config.precision, config.operands, config.operation]);

  const handleModeChange = (newMode: "predefined" | "custom") => {
    setMode(newMode);
    if (newMode === "custom") {
      const seedFormula =
        config.formula ||
        ((config.operands?.length ?? 0) >= 2
          ? config.operands!.join(
              config.operation === "multiply"
                ? " * "
                : config.operation === "subtract"
                  ? " - "
                  : config.operation === "divide"
                    ? " / "
                    : " + ",
            )
          : "");
      onChange({
        calculationConfig: {
          ...config,
          operation: "custom",
          formula: seedFormula,
          operands: extractFormulaFieldReferences(seedFormula),
        },
      } as Partial<FieldDefinition & DetailsColumnDefinition>);
    } else {
      onChange({
        calculationConfig: {
          ...config,
          operation:
            config.operation === "custom" ? "sum" : config.operation || "sum",
          formula: undefined,
        },
      } as Partial<FieldDefinition & DetailsColumnDefinition>);
    }
  };

  const handleFormulaChange = (newFormula: string) => {
    const refs = extractFormulaFieldReferences(newFormula);
    onChange({
      calculationConfig: {
        ...config,
        operation: "custom",
        formula: newFormula,
        operands: refs,
      },
    } as Partial<FieldDefinition & DetailsColumnDefinition>);
  };

  const insertToken = (str: string) => {
    const trimmed = formula.trimEnd();
    const next = trimmed ? `${trimmed} ${str}` : str;
    handleFormulaChange(next);
  };

  const toggleOperand = (key: string) => {
    const current = config.operands ?? [];
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    onChange({
      calculationConfig: {
        ...config,
        operation: config.operation === "custom" ? "sum" : config.operation || "sum",
        operands: next,
      },
    } as Partial<FieldDefinition & DetailsColumnDefinition>);
  };

  const handleReplaceMissingRef = (oldKey: string, newKey: string) => {
    if (!newKey) return;
    if (mode === "custom") {
      const updated = refactorFormulaIdentifier(formula, oldKey, newKey);
      handleFormulaChange(updated);
    } else {
      const nextOperands = (config.operands ?? []).map((item) =>
        item === oldKey ? newKey : item,
      );
      onChange({
        calculationConfig: {
          ...config,
          operands: nextOperands,
        },
      } as Partial<FieldDefinition & DetailsColumnDefinition>);
    }
  };

  const testerKeys = mode === "custom" ? referencedFields : (config.operands ?? []);

  return (
    <div className="fb-formula-builder">
      <div className="fb-calc-header">
        <strong>Visual Calculation Builder</strong>
        <span className="fb-help-inline">
          Combine number or currency fields automatically
        </span>
      </div>

      <div className="fb-formula-mode-toggle">
        <button
          type="button"
          className={`fb-formula-mode-btn ${mode === "predefined" ? "active" : ""}`}
          onClick={() => handleModeChange("predefined")}
        >
          Predefined Operation
        </button>
        <button
          type="button"
          className={`fb-formula-mode-btn ${mode === "custom" ? "active" : ""}`}
          onClick={() => handleModeChange("custom")}
        >
          Custom Formula
        </button>
      </div>

      {mode === "predefined" ? (
        <>
          <label>
            Calculation Type
            <select
              aria-label="Calculation operation"
              value={config.operation ?? "sum"}
              onChange={(event) =>
                onChange({
                  calculationConfig: {
                    ...config,
                    operation: event.target.value as NonNullable<
                      CalculationConfig["operation"]
                    >,
                  },
                } as Partial<FieldDefinition & DetailsColumnDefinition>)
              }
            >
              {Object.entries(OPERATION_LABELS).map(([operation, meta]) => (
                <option key={operation} value={operation}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
          <p className="fb-help">
            {OPERATION_LABELS[config.operation ?? "sum"]?.hint ??
              "Evaluates aggregate or math operations across selected inputs."}
          </p>

          {numericCandidates.length > 0 && (
            <div className="fb-calc-picker-box">
              <span className="fb-calc-sublabel">
                Pick Fields to Include (click to add/remove):
              </span>
              <div className="fb-formula-chips">
                {numericCandidates.map((cand) => {
                  const selected = (config.operands ?? []).includes(cand.key);
                  return (
                    <button
                      key={cand.key}
                      type="button"
                      className={`fb-formula-chip-btn ${selected ? "is-picked" : ""}`}
                      onClick={() => toggleOperand(cand.key)}
                    >
                      <span>{selected ? "✓" : "+"}</span> {cand.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(config.operation === "sum" ||
            config.operation === "min" ||
            config.operation === "max" ||
            config.operation === "count") &&
            numericGridColumns.length > 0 && (
              <label>
                Or Total a Repeating Table Column
                <select
                  aria-label="Calculation table source"
                  value={config.source ?? ""}
                  onChange={(event) =>
                    onChange({
                      calculationConfig: {
                        ...config,
                        source: event.target.value || undefined,
                      },
                    } as Partial<FieldDefinition & DetailsColumnDefinition>)
                  }
                >
                  <option value="">None (use fields above)</option>
                  {numericGridColumns.map((col) => {
                    const sourceKey = `${col.tabKey}.${col.colKey}`;
                    return (
                      <option key={sourceKey} value={sourceKey}>
                        {col.tabLabel} → {col.colLabel}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

          <label>
            Calculation Inputs
            <input
              aria-label="Calculation operands"
              placeholder="Select fields above or type names (e.g. quantity, unit_cost)"
              value={config.operands?.join(", ") ?? ""}
              onChange={(event) =>
                onChange({
                  calculationConfig: {
                    ...config,
                    operation: config.operation || "sum",
                    operands: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                } as Partial<FieldDefinition & DetailsColumnDefinition>)
              }
            />
          </label>
        </>
      ) : (
        <>
          <label>
            Calculation Formula
            <input
              aria-label="Calculation formula"
              placeholder="Example: quantity * unit_cost"
              value={formula}
              onChange={(e) => handleFormulaChange(e.target.value)}
            />
          </label>

          {humanReadableFormula && (
            <div className="fb-calc-readable-preview">
              <span>Reads as:</span>{" "}
              <strong>{humanReadableFormula}</strong>
            </div>
          )}

          {numericCandidates.length > 0 && (
            <div className="fb-calc-picker-box">
              <span className="fb-calc-sublabel">1. Click fields to insert:</span>
              <div className="fb-formula-chips">
                {numericCandidates.map((cand) => (
                  <button
                    key={cand.key}
                    type="button"
                    className="fb-formula-chip-btn"
                    title={`Insert ${cand.label} (${cand.key})`}
                    onClick={() => insertToken(cand.key)}
                  >
                    <span>+</span> {cand.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="fb-calc-sublabel">2. Click operators:</span>
            <div className="fb-formula-operators">
              {[
                { token: "+", label: "+" },
                { token: "-", label: "−" },
                { token: "*", label: "×" },
                { token: "/", label: "÷" },
                { token: "(", label: "(" },
                { token: ")", label: ")" },
              ].map((op) => (
                <button
                  key={op.token}
                  type="button"
                  aria-label={`Insert operator ${op.token}`}
                  className="fb-operator-btn"
                  onClick={() => insertToken(op.token)}
                >
                  {op.label}
                </button>
              ))}
              <button
                type="button"
                className="fb-operator-btn fb-operator-clear"
                onClick={() => handleFormulaChange("")}
              >
                Clear
              </button>
            </div>
          </div>

          {parseResult && (
            <div
              className={`fb-formula-status ${
                parseResult.ast && parseResult.errors.length === 0 && missingRefs.length === 0
                  ? "valid"
                  : "invalid"
              }`}
            >
              {parseResult.errors.length > 0 ? (
                <div>
                  <strong>Formula needs a fix:</strong> {parseResult.errors.join("; ")}
                </div>
              ) : missingRefs.length === 0 ? (
                <div>
                  <strong>✓ Valid syntax.</strong>
                  {referencedFields.length > 0 && (
                    <span className="fb-calc-refs-note" style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>
                      Inputs: {referencedFields.join(", ")} (
                      {referencedFields
                        .map((ref) => fieldLabelMap.get(ref) ?? ref)
                        .join(", ")}
                      )
                    </span>
                  )}
                </div>
              ) : (
                <div>
                  <strong>Missing field in formula.</strong> See details below to fix.
                </div>
              )}
            </div>
          )}

          <input
            aria-label="Calculation operands"
            style={{ display: "none" }}
            readOnly
            value={referencedFields.join(", ")}
          />
        </>
      )}

      {/* Actionable missing-reference warnings */}
      {missingRefs.length > 0 && (
        <div className="fb-calc-missing-alert" role="alert">
          {missingRefs.map((missingKey) => {
            const suggestedLabel = humanizeKey(missingKey);
            return (
              <div key={missingKey} className="fb-calc-missing-item">
                <p>
                  Your <strong>{field.label || "Calculated"}</strong> calculation needs a{" "}
                  <strong>{suggestedLabel}</strong> field (<code>{missingKey}</code>). Add the
                  missing field or select an existing numeric field.
                </p>
                <div className="fb-calc-missing-actions">
                  {onCreateMissingField && (
                    <button
                      type="button"
                      className="fb-btn-inline-fix"
                      onClick={() => onCreateMissingField(missingKey, suggestedLabel)}
                    >
                      + Create &quot;{suggestedLabel}&quot;
                    </button>
                  )}
                  {numericCandidates.length > 0 && (
                    <div className="fb-calc-replace-row">
                      <select
                        aria-label={`Replace missing field ${missingKey}`}
                        value={replaceTarget[missingKey] ?? ""}
                        onChange={(e) => {
                          const targetKey = e.target.value;
                          setReplaceTarget((prev) => ({ ...prev, [missingKey]: targetKey }));
                          if (targetKey) {
                            handleReplaceMissingRef(missingKey, targetKey);
                          }
                        }}
                      >
                        <option value="">Replace with existing field…</option>
                        {numericCandidates.map((cand) => (
                          <option key={cand.key} value={cand.key}>
                            {cand.label} ({cand.key})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {missingGridSource && (
        <div className="fb-calc-missing-alert" role="alert">
          <p>
            The selected repeating table column (<code>{config.source}</code>) no longer exists.
            Choose an active Details / Grid column.
          </p>
        </div>
      )}

      {testerKeys.length > 0 && missingRefs.length === 0 && (
        <div className="fb-formula-tester">
          <span className="fb-calc-tester-title">Test With Sample Values</span>
          <div className="fb-tester-grid">
            {testerKeys.map((ref) => (
              <div key={ref} className="fb-tester-item">
                <label htmlFor={`calc-test-${field.id}-${ref}`}>
                  {fieldLabelMap.get(ref) ?? ref}
                </label>
                <input
                  id={`calc-test-${field.id}-${ref}`}
                  type="number"
                  placeholder="10"
                  value={sampleValues[ref] ?? ""}
                  onChange={(e) =>
                    setSampleValues({
                      ...sampleValues,
                      [ref]: e.target.value,
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="fb-tester-result">
            <span>Calculated Preview:</span>
            <strong className="fb-tester-value">
              {liveEvaluation?.error
                ? liveEvaluation.error
                : liveEvaluation?.value !== null && liveEvaluation?.value !== undefined
                  ? field.type === "currency"
                    ? Number(liveEvaluation.value).toLocaleString(undefined, {
                        minimumFractionDigits: config.precision ?? 2,
                        maximumFractionDigits: config.precision ?? 4,
                      })
                    : liveEvaluation.value
                  : "—"}
            </strong>
          </div>
        </div>
      )}

      <label style={{ marginTop: "8px" }}>
        Decimal Precision
        <select
          aria-label="Decimal Precision"
          value={config.precision !== undefined ? String(config.precision) : "default"}
          onChange={(event) => {
            const val =
              event.target.value === "default"
                ? undefined
                : parseInt(event.target.value, 10);
            onChange({
              calculationConfig: {
                ...config,
                precision: val,
              },
            } as Partial<FieldDefinition & DetailsColumnDefinition>);
          }}
        >
          <option value="default">Default (4 decimals)</option>
          <option value="0">0 (Whole numbers)</option>
          <option value="2">2 (Currency standard)</option>
          <option value="4">4 (High precision)</option>
          <option value="6">6 (Micro precision)</option>
        </select>
      </label>
    </div>
  );
}
