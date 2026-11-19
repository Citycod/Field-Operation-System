export type TokenType =
  | 'NUMBER'
  | 'IDENTIFIER'
  | 'PLUS'
  | 'MINUS'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}

export function safeRound(val: number, precision = 4): number {
  if (!Number.isFinite(val)) return 0;
  const clampedPrecision = Math.max(0, Math.min(12, precision));
  const factor = Math.pow(10, clampedPrecision);
  const sign = val < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(val) + Number.EPSILON) * factor) / factor);
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'field'; key: string }
  | { type: 'unary'; operator: '+' | '-'; operand: ASTNode }
  | { type: 'binary'; operator: '+' | '-' | '*' | '/'; left: ASTNode; right: ASTNode };

export interface FormulaParseResult {
  ast: ASTNode | null;
  errors: string[];
  fieldReferences: string[];
}

export interface FormulaEvaluationResult {
  value: number | null;
  error?: string;
}

/**
 * Tokenizes a mathematical formula expression into a stream of safe tokens.
 * Strictly prevents any arbitrary code execution or invalid characters.
 */
export function tokenizeFormula(expression: string): { tokens: Token[]; errors: string[] } {
  const tokens: Token[] = [];
  const errors: string[] = [];
  let i = 0;
  const len = expression.length;

  while (i < len) {
    const ch = expression[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Number (integer or decimal)
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(expression[i + 1]))) {
      const start = i;
      let hasDot = ch === '.';
      i++;
      while (i < len) {
        const nextCh = expression[i];
        if (/[0-9]/.test(nextCh)) {
          i++;
        } else if (nextCh === '.' && !hasDot) {
          hasDot = true;
          i++;
        } else {
          break;
        }
      }
      tokens.push({
        type: 'NUMBER',
        value: expression.slice(start, i),
        position: start,
      });
      continue;
    }

    // Field Identifier (e.g. principal_amount, field_1)
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      i++;
      while (i < len && /[a-zA-Z0-9_]/.test(expression[i])) {
        i++;
      }
      tokens.push({
        type: 'IDENTIFIER',
        value: expression.slice(start, i),
        position: start,
      });
      continue;
    }

    // Operators and Parentheses
    if (ch === '+') {
      tokens.push({ type: 'PLUS', value: '+', position: i++ });
    } else if (ch === '-') {
      tokens.push({ type: 'MINUS', value: '-', position: i++ });
    } else if (ch === '*') {
      tokens.push({ type: 'MULTIPLY', value: '*', position: i++ });
    } else if (ch === '/') {
      tokens.push({ type: 'DIVIDE', value: '/', position: i++ });
    } else if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: i++ });
    } else if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: i++ });
    } else {
      errors.push(`Invalid character '${ch}' at position ${i}`);
      i++;
    }
  }

  tokens.push({ type: 'EOF', value: '', position: i });
  return { tokens, errors };
}

/**
 * Parses a mathematical formula string into an Abstract Syntax Tree (AST)
 * with standard operator precedence and parentheses grouping.
 */
export function parseFormula(rawExpression: unknown): FormulaParseResult {
  if (!rawExpression || typeof rawExpression !== 'string') {
    return {
      ast: null,
      errors: ['Formula expression must be a non-empty string.'],
      fieldReferences: [],
    };
  }

  const trimmed = rawExpression.trim();
  if (!trimmed) {
    return {
      ast: null,
      errors: ['Formula expression cannot be empty.'],
      fieldReferences: [],
    };
  }

  const { tokens, errors: tokenErrors } = tokenizeFormula(trimmed);
  if (tokenErrors.length > 0) {
    return {
      ast: null,
      errors: tokenErrors,
      fieldReferences: [],
    };
  }

  let current = 0;
  const fieldRefs = new Set<string>();

  function peek(): Token {
    return tokens[current] || { type: 'EOF', value: '', position: trimmed.length };
  }

  function previous(): Token {
    return tokens[current - 1];
  }

  function match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (check(type)) {
        advance();
        return true;
      }
    }
    return false;
  }

  function check(type: TokenType): boolean {
    if (isAtEnd()) return false;
    return peek().type === type;
  }

  function advance(): Token {
    if (!isAtEnd()) current++;
    return previous();
  }

  function isAtEnd(): boolean {
    return peek().type === 'EOF';
  }

  const parseErrors: string[] = [];

  // Expression Grammar:
  // parseExpr      -> addition
  // addition       -> multiplication ( ("+" | "-") multiplication )*
  // multiplication -> unary ( ("*" | "/") unary )*
  // unary          -> ( "+" | "-" ) unary | primary
  // primary        -> NUMBER | IDENTIFIER | "(" parseExpr ")"

  function parseExpr(): ASTNode | null {
    return addition();
  }

  function addition(): ASTNode | null {
    let expr = multiplication();
    if (!expr) return null;

    while (match('PLUS', 'MINUS')) {
      const operator = previous().value as '+' | '-';
      const right = multiplication();
      if (!right) {
        parseErrors.push(`Expected operand after operator '${operator}'.`);
        return null;
      }
      expr = { type: 'binary', operator, left: expr, right };
    }

    return expr;
  }

  function multiplication(): ASTNode | null {
    let expr = unary();
    if (!expr) return null;

    while (match('MULTIPLY', 'DIVIDE')) {
      const operator = previous().value as '*' | '/';
      const right = unary();
      if (!right) {
        parseErrors.push(`Expected operand after operator '${operator}'.`);
        return null;
      }
      expr = { type: 'binary', operator, left: expr, right };
    }

    return expr;
  }

  function unary(): ASTNode | null {
    if (match('PLUS', 'MINUS')) {
      const operator = previous().value as '+' | '-';
      const operand = unary();
      if (!operand) {
        parseErrors.push(`Expected operand after unary '${operator}'.`);
        return null;
      }
      return { type: 'unary', operator, operand };
    }

    return primary();
  }

  function primary(): ASTNode | null {
    if (match('NUMBER')) {
      const val = parseFloat(previous().value);
      if (!Number.isFinite(val)) {
        parseErrors.push(`Invalid numeric constant '${previous().value}'.`);
        return null;
      }
      return { type: 'number', value: val };
    }

    if (match('IDENTIFIER')) {
      const key = previous().value;
      fieldRefs.add(key);
      return { type: 'field', key };
    }

    if (match('LPAREN')) {
      const expr = parseExpr();
      if (!expr) {
        parseErrors.push('Expected expression inside parentheses.');
        return null;
      }
      if (!match('RPAREN')) {
        parseErrors.push("Unmatched opening parenthesis '('. Missing closing ')'.");
        return null;
      }
      return expr;
    }

    const unexpected = peek();
    if (unexpected.type === 'EOF') {
      parseErrors.push('Unexpected end of formula.');
    } else {
      parseErrors.push(`Unexpected token '${unexpected.value}' at position ${unexpected.position}.`);
    }
    return null;
  }

  const ast = parseExpr();

  if (!isAtEnd() && parseErrors.length === 0) {
    parseErrors.push(`Unexpected extra tokens starting at position ${peek().position} ('${peek().value}').`);
  }

  return {
    ast: parseErrors.length === 0 ? ast : null,
    errors: parseErrors,
    fieldReferences: Array.from(fieldRefs),
  };
}

/**
 * Rapidly extracts field references from a formula string without full evaluation.
 */
export function extractFormulaFieldReferences(formula: string | unknown): string[] {
  if (!formula || typeof formula !== 'string') return [];
  const result = parseFormula(formula);
  return result.fieldReferences;
}

/**
 * Safely evaluates an AST or formula string against runtime field values.
 * Pure, deterministic, safe from division-by-zero, and never uses eval.
 */
export function evaluateFormula(
  input: string | ASTNode,
  values: Record<string, unknown> = {},
  options?: { precision?: number },
): FormulaEvaluationResult {
  let ast: ASTNode | null;

  if (typeof input === 'string') {
    const parseRes = parseFormula(input);
    if (!parseRes.ast || parseRes.errors.length > 0) {
      return { value: null, error: parseRes.errors.join('; ') };
    }
    ast = parseRes.ast;
  } else {
    ast = input;
  }

  if (!ast) {
    return { value: null, error: 'No AST available to evaluate' };
  }

  let evalError: string | null = null;

  function evaluateNode(node: ASTNode): number | null {
    switch (node.type) {
      case 'number':
        return node.value;

      case 'field': {
        const raw = values[node.key];
        const num = toNumber(raw);
        return num;
      }

      case 'unary': {
        const operand = evaluateNode(node.operand);
        if (operand === null) return null;
        return node.operator === '-' ? -operand : operand;
      }

      case 'binary': {
        const left = evaluateNode(node.left);
        const right = evaluateNode(node.right);

        if (left === null || right === null) {
          return null;
        }

        switch (node.operator) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            // Explicit error on division by zero
            if (right === 0) {
              evalError = 'Division by zero';
              return null;
            }
            if (!Number.isFinite(right)) {
              evalError = 'Invalid divisor';
              return null;
            }
            return left / right;
          default:
            return null;
        }
      }

      default:
        return null;
    }
  }

  try {
    const rawResult = evaluateNode(ast);
    if (evalError) {
      return { value: null, error: evalError };
    }
    if (rawResult === null || !Number.isFinite(rawResult)) {
      return { value: null };
    }
    const precision =
      typeof options?.precision === 'number' && options.precision >= 0
        ? options.precision
        : 4;
    return { value: safeRound(rawResult, precision) };
  } catch (err) {
    return {
      value: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Safely refactors a field identifier inside a mathematical formula string.
 * Uses strict word boundaries to avoid replacing substrings of other variable names.
 */
export function refactorFormulaIdentifier(
  formula: string,
  oldIdentifier: string,
  newIdentifier: string,
): string {
  if (!formula || typeof formula !== 'string' || !oldIdentifier || !newIdentifier) {
    return formula;
  }
  if (oldIdentifier === newIdentifier) {
    return formula;
  }
  const regex = new RegExp(`\\b${oldIdentifier}\\b`, 'g');
  return formula.replace(regex, newIdentifier);
}
