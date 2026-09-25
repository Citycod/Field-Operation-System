import { FormSchemaV1 } from '../schema/form-schema';
import { validateDraftSchema } from './draft-validator';
import { ValidationResult, ValidationError, ValidationWarning } from './types';

export function validatePublishableSchema(schema: unknown): ValidationResult {
  const draftResult = validateDraftSchema(schema);
  if (!draftResult.valid) {
    return draftResult;
  }

  const errors: ValidationError[] = [...draftResult.errors];
  const warnings: ValidationWarning[] = [...draftResult.warnings];
  const passedChecks: string[] = [...draftResult.passedChecks];

  const s = schema as FormSchemaV1;

  // --- Build field ID and key lookup sets ---
  const validFieldIds = new Set<string>();
  const validFieldKeys = new Set<string>();

  if (s.header && Array.isArray(s.header.sections)) {
    s.header.sections.forEach((sec) => {
      if (Array.isArray(sec.fields)) {
        sec.fields.forEach((f) => {
          validFieldIds.add(f.id);
          validFieldKeys.add(f.key);
        });
      }
    });
  }

  if (Array.isArray(s.tabs)) {
    s.tabs.forEach((tab) => {
      if (tab.type === 'form' && Array.isArray(tab.sections)) {
        tab.sections.forEach((sec) => {
          if (Array.isArray(sec.fields)) {
            sec.fields.forEach((f) => {
              validFieldIds.add(f.id);
              validFieldKeys.add(f.key);
            });
          }
        });
      }
    });
  }

  // --- Validate rules references ---
  if (Array.isArray(s.rules)) {
    s.rules.forEach((rule, rIdx) => {
      if (Array.isArray(rule.conditions)) {
        rule.conditions.forEach((cond, cIdx) => {
          if (!validFieldIds.has(cond.fieldId)) {
            errors.push({
              path: `rules[${rIdx}].conditions[${cIdx}].fieldId`,
              message: `Rule references non-existent condition field ID: ${cond.fieldId}`,
              code: 'BROKEN_RULE_REF',
            });
          }
        });
      }
      if (Array.isArray(rule.actions)) {
        rule.actions.forEach((act, aIdx) => {
          if (!validFieldIds.has(act.targetFieldId)) {
            errors.push({
              path: `rules[${rIdx}].actions[${aIdx}].targetFieldId`,
              message: `Rule references non-existent action target field ID: ${act.targetFieldId}`,
              code: 'BROKEN_RULE_REF',
            });
          }
        });
      }
    });
  }

  // --- Validate calculation references ---
  if (Array.isArray(s.tabs)) {
    s.tabs.forEach((tab) => {
      if (tab.type === 'form' && Array.isArray(tab.sections)) {
        tab.sections.forEach((sec) => {
          if (Array.isArray(sec.fields)) {
            sec.fields.forEach((f) => {
              if (f.type === 'calculated' && f.calculationConfig) {
                if (Array.isArray(f.calculationConfig.operands)) {
                  f.calculationConfig.operands.forEach((op, oIdx) => {
                    if (!validFieldIds.has(op) && !validFieldKeys.has(op)) {
                      errors.push({
                        path: `field[${f.id}].calculationConfig.operands[${oIdx}]`,
                        message: `Calculation references non-existent operand: ${op}`,
                        code: 'BROKEN_CALCULATION_REF',
                      });
                    }
                  });
                }
                if (f.calculationConfig.source) {
                  // source format: "tab_key.field_key" — validate the tab exists at minimum
                  const parts = f.calculationConfig.source.split('.');
                  if (parts.length >= 1) {
                    const tabKey = parts[0];
                    const tabExists = s.tabs.some((t) => t.key === tabKey);
                    if (!tabExists) {
                      errors.push({
                        path: `field[${f.id}].calculationConfig.source`,
                        message: `Calculation source references non-existent tab: ${tabKey}`,
                        code: 'BROKEN_CALCULATION_REF',
                      });
                    }
                  }
                }
              }
            });
          }
        });
      }
    });
  }

  // --- Validate header calculation refs too ---
  if (s.header && Array.isArray(s.header.sections)) {
    s.header.sections.forEach((sec) => {
      if (Array.isArray(sec.fields)) {
        sec.fields.forEach((f) => {
          if (f.type === 'calculated' && f.calculationConfig) {
            if (Array.isArray(f.calculationConfig.operands)) {
              f.calculationConfig.operands.forEach((op, oIdx) => {
                if (!validFieldIds.has(op) && !validFieldKeys.has(op)) {
                  errors.push({
                    path: `header.field[${f.id}].calculationConfig.operands[${oIdx}]`,
                    message: `Calculation references non-existent operand: ${op}`,
                    code: 'BROKEN_CALCULATION_REF',
                  });
                }
              });
            }
          }
        });
      }
    });
  }

  // --- Validate List View references ---
  if (s.listView && Array.isArray(s.listView.columns)) {
    s.listView.columns.forEach((col, cIdx) => {
      if (!validFieldKeys.has(col.sourceRef) && !col.sourceRef.startsWith('system.')) {
        errors.push({
          path: `listView.columns[${cIdx}].sourceRef`,
          message: `List view column references non-existent field key: ${col.sourceRef}`,
          code: 'BROKEN_LIST_VIEW_REF',
        });
      }
    });
  }

  // --- Validate Workflow configuration ---
  if (s.workflow) {
    if (s.workflow.type !== 'sequential') {
      errors.push({
        path: 'workflow.type',
        message: `Unsupported workflow type: ${s.workflow.type}`,
        code: 'INVALID_WORKFLOW_TYPE',
      });
    }
    if (Array.isArray(s.workflow.stages)) {
      const seenOrders = new Set<number>();
      s.workflow.stages.forEach((stg, sIdx) => {
        if (!stg.name) {
          errors.push({
            path: `workflow.stages[${sIdx}].name`,
            message: 'Workflow stage missing name',
            code: 'INVALID_WORKFLOW_STAGE',
          });
        }
        if (!stg.approverType) {
          errors.push({
            path: `workflow.stages[${sIdx}].approverType`,
            message: 'Workflow stage missing approverType',
            code: 'INVALID_WORKFLOW_APPROVER',
          });
        }
        const validApproverTypes = ['user', 'role', 'departmentRole', 'managerOfRequester'];
        if (stg.approverType && !validApproverTypes.includes(stg.approverType)) {
          errors.push({
            path: `workflow.stages[${sIdx}].approverType`,
            message: `Invalid workflow approver type: ${stg.approverType}`,
            code: 'INVALID_WORKFLOW_APPROVER',
          });
        }
        if (typeof stg.order === 'number') {
          if (seenOrders.has(stg.order)) {
            errors.push({
              path: `workflow.stages[${sIdx}].order`,
              message: `Duplicate workflow stage order: ${stg.order}`,
              code: 'INVALID_WORKFLOW_ORDER',
            });
          }
          seenOrders.add(stg.order);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    passedChecks,
  };
}
