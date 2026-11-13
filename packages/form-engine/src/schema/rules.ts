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
  id?: string;
  fieldId: string;
  operator: RuleOperator;
  value?: unknown;
}

export interface RuleAction {
  id?: string;
  targetFieldId: string;
  action: RuleActionType;
  value?: unknown;
}

export interface RuleDefinition {
  id: string;
  key: string;
  name: string;
  enabled?: boolean;
  conditions: RuleCondition[];
  conditionLogic?: 'AND' | 'OR';
  match?: 'all' | 'any';
  actions: RuleAction[];
}
