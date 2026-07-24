import type { GuardMap, VariableStore } from "./types";

const decodeXMLEntities = (expr: string): string =>
  expr
    .replace(/&gt;=/g, ">=")
    .replace(/&lt;=/g, "<=")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

type FEELToken =
  | { type: 'IDENT'; value: string }
  | { type: 'NUMBER'; value: number }
  | { type: 'STRING'; value: string }
  | { type: 'OP'; value: string }
  | { type: 'ARITH'; value: string }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'AND' }
  | { type: 'OR' }
  | { type: 'NOT' }
  | { type: 'TRUE' }
  | { type: 'FALSE' }
  | { type: 'EOF' };

const UNDEF = Symbol('UNDEF');
type FEELValue = string | number | boolean | typeof UNDEF;

function tokenizeFEEL(input: string): FEELToken[] {
  const tokens: FEELToken[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue; }
    if (input[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (input[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (i + 1 < input.length && (input.slice(i, i + 2) === '>=' || input.slice(i, i + 2) === '<=' || input.slice(i, i + 2) === '!=')) {
      tokens.push({ type: 'OP', value: input.slice(i, i + 2) }); i += 2; continue;
    }
    if (input[i] === '>' || input[i] === '<' || input[i] === '=') {
      tokens.push({ type: 'OP', value: input[i] }); i++; continue;
    }
    if (input[i] === '+' || input[i] === '-' || input[i] === '*') {
      tokens.push({ type: 'ARITH', value: input[i] }); i++; continue;
    }
    if (/[0-9]/.test(input[i])) {
      const start = i;
      while (i < input.length && /[0-9.]/.test(input[i])) i++;
      tokens.push({ type: 'NUMBER', value: parseFloat(input.slice(start, i)) }); continue;
    }
    if (input[i] === '"' || input[i] === "'") {
      const q = input[i++]; const start = i;
      while (i < input.length && input[i] !== q) i++;
      tokens.push({ type: 'STRING', value: input.slice(start, i++) }); continue;
    }
    if (/[A-Za-z_]/.test(input[i])) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) i++;
      const word = input.slice(start, i);
      if (word === 'and') tokens.push({ type: 'AND' });
      else if (word === 'or') tokens.push({ type: 'OR' });
      else if (word === 'not') tokens.push({ type: 'NOT' });
      else if (word === 'true') tokens.push({ type: 'TRUE' });
      else if (word === 'false') tokens.push({ type: 'FALSE' });
      else tokens.push({ type: 'IDENT', value: word });
      continue;
    }
    i++;
  }
  tokens.push({ type: 'EOF' });
  return tokens;
}

function feelEval(tokens: FEELToken[], store: VariableStore): boolean {
  let pos = 0;
  const peek = (): FEELToken => tokens[pos];
  const consume = (): FEELToken => tokens[pos++];
  const toBool = (v: FEELValue): boolean => v !== UNDEF && Boolean(v);

  // All functions return FEELValue so arithmetic values survive parentheses.
  // toBool is called at logical operator sites and at the top level.

  function parseExpr(): FEELValue { return parseOr(); }

  function parseOr(): FEELValue {
    let left = parseAnd();
    while (peek().type === 'OR') { consume(); const r = parseAnd(); left = toBool(left) || toBool(r); }
    return left;
  }

  function parseAnd(): FEELValue {
    let left = parseNot();
    while (peek().type === 'AND') { consume(); const r = parseNot(); left = toBool(left) && toBool(r); }
    return left;
  }

  function parseNot(): FEELValue {
    if (peek().type === 'NOT') { consume(); return !toBool(parseNot()); }
    return parseComparison();
  }

  function parseComparison(): FEELValue {
    const left = parseAddSub();
    const opTok = peek();
    if (opTok.type !== 'OP') return left;
    consume();
    const right = parseAddSub();
    if (left === UNDEF || right === UNDEF) return false;
    const op = (opTok as { type: 'OP'; value: string }).value;
    switch (op) {
      case '>':  return (left as any) >  (right as any);
      case '<':  return (left as any) <  (right as any);
      case '>=': return (left as any) >= (right as any);
      case '<=': return (left as any) <= (right as any);
      case '=':  return left == right;
      case '!=': return left != right;
      default:   return false;
    }
  }

  function parseAddSub(): FEELValue {
    let left = parseMul();
    while (peek().type === 'ARITH' && (peek() as { type: 'ARITH'; value: string }).value !== '*') {
      const op = (consume() as { type: 'ARITH'; value: string }).value;
      const right = parseMul();
      if (left === UNDEF || right === UNDEF) { left = UNDEF; continue; }
      left = op === '+' ? (left as number) + (right as number) : (left as number) - (right as number);
    }
    return left;
  }

  function parseMul(): FEELValue {
    let left = parseAtom();
    while (peek().type === 'ARITH' && (peek() as { type: 'ARITH'; value: string }).value === '*') {
      consume();
      const right = parseAtom();
      if (left === UNDEF || right === UNDEF) { left = UNDEF; continue; }
      left = (left as number) * (right as number);
    }
    return left;
  }

  function parseAtom(): FEELValue {
    const tok = peek();
    if (tok.type === 'NUMBER') { consume(); return tok.value; }
    if (tok.type === 'STRING') { consume(); return tok.value; }
    if (tok.type === 'TRUE')   { consume(); return true; }
    if (tok.type === 'FALSE')  { consume(); return false; }
    if (tok.type === 'IDENT')  { consume(); return tok.value in store ? store[tok.value] as FEELValue : UNDEF; }
    if (tok.type === 'ARITH' && (tok as { type: 'ARITH'; value: string }).value === '-') {
      consume();
      const v = parseAtom();
      return v === UNDEF ? UNDEF : -(v as number);
    }
    if (tok.type === 'LPAREN') {
      consume();
      const val = parseExpr();
      if (peek().type === 'RPAREN') consume();
      return val;
    }
    return UNDEF;
  }

  return toBool(parseExpr());
}

export const evaluateGuard = (
  expression: string | undefined,
  variableStore: VariableStore
): boolean => {
  if (!expression || expression.trim() === "") return true;
  try {
    return feelEval(tokenizeFEEL(decodeXMLEntities(expression).trim()), variableStore);
  } catch {
    return true;
  }
};

// Returns null if the expression is syntactically valid, or an error message if not.
export const validateGuardSyntax = (expression: string): string | null => {
  if (!expression || expression.trim() === '') return null;
  const expr = decodeXMLEntities(expression).trim();

  let depth = 0;
  for (const ch of expr) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) return 'Unexpected closing parenthesis'; }
  }
  if (depth > 0) return 'Missing closing parenthesis';

  try {
    const tokens = tokenizeFEEL(expr);
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function parseE(): void { parseOr(); }
    function parseOr(): void { parseAnd(); while (peek().type === 'OR') { consume(); parseAnd(); } }
    function parseAnd(): void { parseNot(); while (peek().type === 'AND') { consume(); parseNot(); } }
    function parseNot(): void {
      if (peek().type === 'NOT') { consume(); parseNot(); return; }
      parseComparison();
    }
    function parseComparison(): void {
      parseAddSub();
      if (peek().type === 'OP') { consume(); parseAddSub(); }
    }
    function parseAddSub(): void {
      parseMul();
      while (peek().type === 'ARITH' && (peek() as any).value !== '*') { consume(); parseMul(); }
    }
    function parseMul(): void {
      parseAtom();
      while (peek().type === 'ARITH' && (peek() as any).value === '*') { consume(); parseAtom(); }
    }
    function parseAtom(): void {
      const tok = peek();
      if (tok.type === 'NUMBER' || tok.type === 'STRING' || tok.type === 'TRUE' || tok.type === 'FALSE' || tok.type === 'IDENT') {
        consume(); return;
      }
      if (tok.type === 'ARITH' && (tok as any).value === '-') { consume(); parseAtom(); return; }
      if (tok.type === 'LPAREN') { consume(); parseE(); if (peek().type === 'RPAREN') consume(); return; }
      throw new Error('Expected a variable, value, or expression');
    }

    parseE();
    if (peek().type !== 'EOF') return `Unexpected token "${expr.slice(tokens[pos].type === 'EOF' ? expr.length : pos)}"`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid guard expression';
  }
};

export const getGuard = (
  guardMap: GuardMap | undefined,
  source: string,
  target: string,
  relationType: string
): string | undefined => {
  return guardMap?.[source]?.[target]?.[relationType];
};
