import React, { useMemo, useState } from "react";
import type {
  FieldDefinition,
  FormSchemaV1,
  RuleAction,
  RuleActionType,
  RuleCondition,
  RuleDefinition,
  RuleOperator,
} from "@field/form-engine";
import { defaultId, slugify } from "./state";

export interface RulesEditorProps {
  schema: FormSchemaV1;
  onChange: (nextSchema: FormSchemaV1) => void;
  disabled?: boolean;
}

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  equals: "Equals",
  notEquals: "Does not equal",
  greaterThan: "Is greater than",
  lessThan: "Is less than",
  contains: "Contains",
  isEmpty: "Is empty",
  isNotEmpty: "Is not empty",
};

const ACTION_LABELS: Record<RuleActionType, string> = {
  show: "Show field",
  hide: "Hide field",
  require: "Make required",
  enable: "Enable field",
  disable: "Disable field",
  setValue: "Set value to",
};

export function RulesEditor({ schema, onChange, disabled }: RulesEditorProps) {
  const rules = useMemo(() => schema.rules || [], [schema.rules]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    () => rules[0]?.id ?? null,
  );

  // Discover all available fields from header and tabs
  const availableFields: FieldDefinition[] = useMemo(() => {
    const list: FieldDefinition[] = [];
    if (schema.header?.sections) {
      for (const s of schema.header.sections) {
        if (s.fields) list.push(...s.fields);
      }
    }
    if (schema.tabs) {
      for (const t of schema.tabs) {
        if (t.type === "form" && t.sections) {
          for (const s of t.sections) {
            if (s.fields) list.push(...s.fields);
          }
        }
      }
    }
    return list;
  }, [schema]);

  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    for (const f of availableFields) {
      map.set(f.id, f);
      map.set(f.key, f);
    }
    return map;
  }, [availableFields]);

  // Current selected rule
  const currentRule = useMemo(() => {
    return rules.find((r) => r.id === selectedRuleId) || rules[0] || null;
  }, [rules, selectedRuleId]);

  function updateRules(nextRules: RuleDefinition[]) {
    onChange({
      ...schema,
      rules: nextRules,
    });
  }

  function handleAddRule() {
    const id = defaultId("rule");
    const newRule: RuleDefinition = {
      id,
      key: `rule_${Date.now().toString(36)}`,
      name: `New Rule ${rules.length + 1}`,
      enabled: true,
      conditionLogic: "AND",
      conditions: [
        {
          id: defaultId("cond"),
          fieldId: availableFields[0]?.id || "",
          operator: "equals",
          value: "",
        },
      ],
      actions: [
        {
          id: defaultId("act"),
          targetFieldId: availableFields[1]?.id || availableFields[0]?.id || "",
          action: "show",
        },
      ],
    };
    const next = [...rules, newRule];
    updateRules(next);
    setSelectedRuleId(id);
  }

  function handleDeleteRule(ruleId: string) {
    const next = rules.filter((r) => r.id !== ruleId);
    updateRules(next);
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(next[0]?.id ?? null);
    }
  }

  function handleMoveRule(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rules.length) return;
    const next = [...rules];
    const item = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = item;
    updateRules(next);
  }

  function handleMutateCurrentRule(patch: Partial<RuleDefinition>) {
    if (!currentRule) return;
    const next = rules.map((r) => {
      if (r.id === currentRule.id) {
        return { ...r, ...patch };
      }
      return r;
    });
    updateRules(next);
  }

  // Condition mutations
  function handleAddCondition() {
    if (!currentRule) return;
    const newCond: RuleCondition = {
      id: defaultId("cond"),
      fieldId: availableFields[0]?.id || "",
      operator: "equals",
      value: "",
    };
    handleMutateCurrentRule({
      conditions: [...(currentRule.conditions || []), newCond],
    });
  }

  function handleUpdateCondition(index: number, patch: Partial<RuleCondition>) {
    if (!currentRule) return;
    const nextConds = [...(currentRule.conditions || [])];
    nextConds[index] = { ...nextConds[index], ...patch };
    handleMutateCurrentRule({ conditions: nextConds });
  }

  function handleDeleteCondition(index: number) {
    if (!currentRule) return;
    const nextConds = (currentRule.conditions || []).filter((_, i) => i !== index);
    handleMutateCurrentRule({ conditions: nextConds });
  }

  // Action mutations
  function handleAddAction() {
    if (!currentRule) return;
    const newAct: RuleAction = {
      id: defaultId("act"),
      targetFieldId: availableFields[0]?.id || "",
      action: "show",
    };
    handleMutateCurrentRule({
      actions: [...(currentRule.actions || []), newAct],
    });
  }

  function handleUpdateAction(index: number, patch: Partial<RuleAction>) {
    if (!currentRule) return;
    const nextActions = [...(currentRule.actions || [])];
    nextActions[index] = { ...nextActions[index], ...patch };
    handleMutateCurrentRule({ actions: nextActions });
  }

  function handleDeleteAction(index: number) {
    if (!currentRule) return;
    const nextActions = (currentRule.actions || []).filter((_, i) => i !== index);
    handleMutateCurrentRule({ actions: nextActions });
  }

  return (
    <div className="fb-rules-view" data-testid="rules-designer">
      {/* Top Header & Actions */}
      <div className="fb-rules-topbar">
        <div>
          <h2>Business Rules & Dynamic Behavior</h2>
          <p>
            Dynamically show, hide, require, enable, or disable fields based on
            user selections and entered data.
          </p>
        </div>
        <button
          type="button"
          className="fb-primary"
          onClick={handleAddRule}
          disabled={disabled || availableFields.length === 0}
          data-testid="add-rule-btn"
        >
          + New Rule
        </button>
      </div>

      {availableFields.length === 0 ? (
        <div className="fb-rules-empty">
          <p>No fields are configured in this form yet.</p>
          <p className="fb-text-muted">
            Add sections and fields in the Design tab before creating rules.
          </p>
        </div>
      ) : rules.length === 0 ? (
        <div className="fb-rules-empty" data-testid="rules-empty-state">
          <h3>No rules defined</h3>
          <p>
            Add business rules to create interactive, dynamic form experiences.
            Rules are evaluated in real time in both Preview and Runtime.
          </p>
          <button
            type="button"
            className="fb-primary"
            onClick={handleAddRule}
            disabled={disabled}
            data-testid="create-first-rule-btn"
          >
            Create Your First Rule
          </button>
        </div>
      ) : (
        <div className="fb-rules-layout">
          {/* Rules Master List Sidebar */}
          <aside className="fb-rules-sidebar" aria-label="Rule list">
            <div className="fb-rules-sidebar-header">
              <span>Rules ({rules.length})</span>
            </div>
            <ul className="fb-rules-list">
              {rules.map((rule, idx) => {
                const isSelected = rule.id === currentRule?.id;
                const isEnabled = rule.enabled !== false;
                return (
                  <li
                    key={rule.id}
                    className={`fb-rule-item ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedRuleId(rule.id)}
                    data-testid={`rule-list-item-${rule.id}`}
                  >
                    <div className="fb-rule-item-main">
                      <span className="fb-rule-item-name">
                        {rule.name || "Untitled Rule"}
                      </span>
                      <span className="fb-rule-item-meta">
                        {(rule.conditions || []).length} condition
                        {(rule.conditions || []).length === 1 ? "" : "s"} ·{" "}
                        {(rule.actions || []).length} action
                        {(rule.actions || []).length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="fb-rule-item-actions">
                      <button
                        type="button"
                        className={`fb-badge-toggle ${isEnabled ? "active" : "inactive"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = rules.map((r) =>
                            r.id === rule.id ? { ...r, enabled: !isEnabled } : r,
                          );
                          updateRules(next);
                        }}
                        title={isEnabled ? "Disable rule" : "Enable rule"}
                        data-testid={`rule-toggle-${rule.id}`}
                      >
                        {isEnabled ? "Active" : "Disabled"}
                      </button>

                      <div className="fb-rule-reorder">
                        <button
                          type="button"
                          disabled={idx === 0 || disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveRule(idx, -1);
                          }}
                          aria-label={`Move ${rule.name} up`}
                          data-testid={`rule-up-${rule.id}`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === rules.length - 1 || disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveRule(idx, 1);
                          }}
                          aria-label={`Move ${rule.name} down`}
                          data-testid={`rule-down-${rule.id}`}
                        >
                          ↓
                        </button>
                      </div>

                      <button
                        type="button"
                        className="fb-rule-delete"
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRule(rule.id);
                        }}
                        aria-label={`Delete ${rule.name}`}
                        data-testid={`rule-delete-${rule.id}`}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Rule Detail & Expression Editor */}
          {currentRule && (
            <main
              className="fb-rules-detail"
              aria-label={`Rule editor: ${currentRule.name}`}
              data-testid="rule-detail-panel"
            >
              {/* Rule Basics */}
              <div className="fb-rule-panel-section">
                <div className="fb-field-row">
                  <div className="fb-input-group">
                    <label htmlFor="rule-name-input">Rule Name</label>
                    <input
                      id="rule-name-input"
                      type="text"
                      value={currentRule.name || ""}
                      disabled={disabled}
                      onChange={(e) => {
                        const name = e.target.value;
                        const key = slugify(name) || currentRule.key;
                        handleMutateCurrentRule({ name, key });
                      }}
                      placeholder="e.g. Require safety briefing for contractors"
                      data-testid="rule-name-input"
                    />
                  </div>

                  <div className="fb-rule-toggle-wrapper">
                    <label
                      htmlFor="rule-active-toggle"
                      className="fb-toggle-label"
                    >
                      Rule Status
                    </label>
                    <label className="fb-switch">
                      <input
                        id="rule-active-toggle"
                        type="checkbox"
                        checked={currentRule.enabled !== false}
                        disabled={disabled}
                        onChange={(e) =>
                          handleMutateCurrentRule({ enabled: e.target.checked })
                        }
                        data-testid="rule-status-toggle"
                      />
                      <span className="fb-slider" />
                    </label>
                    <span className="fb-switch-text">
                      {currentRule.enabled !== false ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Conditions Section (IF) */}
              <div
                className="fb-rule-panel-section"
                data-testid="rule-conditions-section"
              >
                <div className="fb-section-subhead">
                  <div className="fb-subhead-left">
                    <span className="fb-logic-tag">IF</span>
                    <h3>Conditions</h3>
                  </div>
                  <div className="fb-logic-selector">
                    <label htmlFor="rule-logic-select">Evaluate:</label>
                    <select
                      id="rule-logic-select"
                      value={currentRule.conditionLogic || "AND"}
                      disabled={disabled}
                      onChange={(e) =>
                        handleMutateCurrentRule({
                          conditionLogic: e.target.value as "AND" | "OR",
                        })
                      }
                      data-testid="rule-logic-select"
                    >
                      <option value="AND">Match ALL conditions (AND)</option>
                      <option value="OR">Match ANY condition (OR)</option>
                    </select>
                  </div>
                </div>

                {(!currentRule.conditions ||
                  currentRule.conditions.length === 0) && (
                  <p className="fb-rule-warning">
                    This rule has no conditions and will not execute. Add at least
                    one condition below.
                  </p>
                )}

                <div className="fb-clause-list">
                  {(currentRule.conditions || []).map((cond, cIdx) => {
                    const srcField = fieldMap.get(cond.fieldId);
                    const isUnary =
                      cond.operator === "isEmpty" ||
                      cond.operator === "isNotEmpty";

                    return (
                      <div
                        key={cond.id || `c-${cIdx}`}
                        className="fb-clause-row"
                        data-testid={`condition-row-${cIdx}`}
                      >
                        {/* Source Field Selector */}
                        <div className="fb-clause-cell fb-cell-field">
                          <label
                            htmlFor={`cond-field-${cIdx}`}
                            className="sr-only"
                          >
                            Source Field
                          </label>
                          <select
                            id={`cond-field-${cIdx}`}
                            value={cond.fieldId}
                            disabled={disabled}
                            onChange={(e) =>
                              handleUpdateCondition(cIdx, {
                                fieldId: e.target.value,
                              })
                            }
                            data-testid={`condition-field-${cIdx}`}
                          >
                            {availableFields.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label} ({f.key})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Operator Selector */}
                        <div className="fb-clause-cell fb-cell-op">
                          <label
                            htmlFor={`cond-op-${cIdx}`}
                            className="sr-only"
                          >
                            Operator
                          </label>
                          <select
                            id={`cond-op-${cIdx}`}
                            value={cond.operator}
                            disabled={disabled}
                            onChange={(e) =>
                              handleUpdateCondition(cIdx, {
                                operator: e.target.value as RuleOperator,
                              })
                            }
                            data-testid={`condition-operator-${cIdx}`}
                          >
                            {Object.entries(OPERATOR_LABELS).map(
                              ([op, label]) => (
                                <option key={op} value={op}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </div>

                        {/* Value Input (Type-Aware) */}
                        <div className="fb-clause-cell fb-cell-val">
                          {isUnary ? (
                            <span className="fb-clause-na">—</span>
                          ) : srcField?.type === "checkbox" ? (
                            <select
                              id={`cond-val-${cIdx}`}
                              value={String(cond.value ?? true)}
                              disabled={disabled}
                              onChange={(e) =>
                                handleUpdateCondition(cIdx, {
                                  value: e.target.value === "true",
                                })
                              }
                              data-testid={`condition-val-${cIdx}`}
                            >
                              <option value="true">Checked (True)</option>
                              <option value="false">Unchecked (False)</option>
                            </select>
                          ) : srcField?.type === "dropdown" &&
                            srcField.options?.length ? (
                            <select
                              id={`cond-val-${cIdx}`}
                              value={String(cond.value ?? "")}
                              disabled={disabled}
                              onChange={(e) =>
                                handleUpdateCondition(cIdx, {
                                  value: e.target.value,
                                })
                              }
                              data-testid={`condition-val-${cIdx}`}
                            >
                              <option value="">Select option</option>
                              {srcField.options.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : srcField?.type === "number" ||
                            srcField?.type === "currency" ? (
                            <input
                              id={`cond-val-${cIdx}`}
                              type="number"
                              value={
                                cond.value === undefined || cond.value === null
                                  ? ""
                                  : String(cond.value)
                              }
                              disabled={disabled}
                              placeholder="Value"
                              onChange={(e) =>
                                handleUpdateCondition(cIdx, {
                                  value:
                                    e.target.value === ""
                                      ? ""
                                      : Number(e.target.value),
                                })
                              }
                              data-testid={`condition-val-${cIdx}`}
                            />
                          ) : (
                            <input
                              id={`cond-val-${cIdx}`}
                              type="text"
                              value={String(cond.value ?? "")}
                              disabled={disabled}
                              placeholder="Comparison value"
                              onChange={(e) =>
                                handleUpdateCondition(cIdx, {
                                  value: e.target.value,
                                })
                              }
                              data-testid={`condition-val-${cIdx}`}
                            />
                          )}
                        </div>

                        {/* Remove Condition */}
                        <button
                          type="button"
                          className="fb-clause-remove"
                          disabled={disabled}
                          onClick={() => handleDeleteCondition(cIdx)}
                          title="Remove condition"
                          data-testid={`remove-condition-${cIdx}`}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="fb-btn-add-clause"
                  onClick={handleAddCondition}
                  disabled={disabled}
                  data-testid="add-condition-btn"
                >
                  + Add Condition
                </button>
              </div>

              {/* Actions Section (THEN) */}
              <div
                className="fb-rule-panel-section"
                data-testid="rule-actions-section"
              >
                <div className="fb-section-subhead">
                  <div className="fb-subhead-left">
                    <span className="fb-logic-tag fb-then">THEN</span>
                    <h3>Actions</h3>
                  </div>
                </div>

                {(!currentRule.actions ||
                  currentRule.actions.length === 0) && (
                  <p className="fb-rule-warning">
                    This rule has no actions. Add at least one action below.
                  </p>
                )}

                <div className="fb-clause-list">
                  {(currentRule.actions || []).map((act, aIdx) => {
                    const isSetValue = act.action === "setValue";
                    return (
                      <div
                        key={act.id || `a-${aIdx}`}
                        className="fb-clause-row"
                        data-testid={`action-row-${aIdx}`}
                      >
                        {/* Action Type */}
                        <div className="fb-clause-cell fb-cell-op">
                          <label
                            htmlFor={`act-type-${aIdx}`}
                            className="sr-only"
                          >
                            Action
                          </label>
                          <select
                            id={`act-type-${aIdx}`}
                            value={act.action}
                            disabled={disabled}
                            onChange={(e) =>
                              handleUpdateAction(aIdx, {
                                action: e.target.value as RuleActionType,
                              })
                            }
                            data-testid={`action-type-${aIdx}`}
                          >
                            {Object.entries(ACTION_LABELS).map(
                              ([actionType, label]) => (
                                <option key={actionType} value={actionType}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </div>

                        {/* Target Field */}
                        <div className="fb-clause-cell fb-cell-field">
                          <label
                            htmlFor={`act-target-${aIdx}`}
                            className="sr-only"
                          >
                            Target Field
                          </label>
                          <select
                            id={`act-target-${aIdx}`}
                            value={act.targetFieldId}
                            disabled={disabled}
                            onChange={(e) =>
                              handleUpdateAction(aIdx, {
                                targetFieldId: e.target.value,
                              })
                            }
                            data-testid={`action-target-${aIdx}`}
                          >
                            {availableFields.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label} ({f.key})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Set Value Input */}
                        <div className="fb-clause-cell fb-cell-val">
                          {isSetValue ? (
                            <input
                              id={`act-val-${aIdx}`}
                              type="text"
                              value={String(act.value ?? "")}
                              disabled={disabled}
                              placeholder="Value to set"
                              onChange={(e) =>
                                handleUpdateAction(aIdx, {
                                  value: e.target.value,
                                })
                              }
                              data-testid={`action-value-${aIdx}`}
                            />
                          ) : (
                            <span className="fb-clause-na">—</span>
                          )}
                        </div>

                        {/* Remove Action */}
                        <button
                          type="button"
                          className="fb-clause-remove"
                          disabled={disabled}
                          onClick={() => handleDeleteAction(aIdx)}
                          title="Remove action"
                          data-testid={`remove-action-${aIdx}`}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="fb-btn-add-clause"
                  onClick={handleAddAction}
                  disabled={disabled}
                  data-testid="add-action-btn"
                >
                  + Add Action
                </button>
              </div>
            </main>
          )}
        </div>
      )}
    </div>
  );
}
