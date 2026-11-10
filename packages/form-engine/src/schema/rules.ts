export type RuleOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'contains'
  | 'isEmpty'
  | 'isNotEmpty';

export type RuleActionType =
  | 'show'
  | 'hide'
  | 'require'
  | 'enable'
  | 'disable'
  | 'setValue';

export interface RuleCondition {
  fieldId: string;
  operator: RuleOperator;
  value?: unknown;
}

export interface RuleAction {
  targetFieldId: string;
  action: RuleActionType;
  value?: unknown;
}

export interface RuleDefinition {
  id: string;
  key: string;
  name: string;
  conditions: RuleCondition[];
  conditionLogic?: 'AND' | 'OR';
  actions: RuleAction[];
}
