#!/usr/bin/env node
'use strict';

// Cyclomatic-complexity analysis over the repository's TypeScript sources
// (issue #1320 — "complexity analysis").
//
// Uses the repo's own `typescript` compiler to walk each source file's AST and
// counts decision points (if/else, while, for, do, case, catch, ternary,
// && / || / ??, optional chaining, parameter defaults, spread) per enclosing
// function. Measures maintainability inputs: cyclomatic complexity G and a
// lightweight Halstead volume V (token based) for the Maintenance Index.
//
// Usage:
//   node scripts/quality/analyze-complexity.js
//
// Writes scripts/quality/reports/complexity.json.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORTS = path.join(__dirname, 'reports');
const SOURCES = ['apps/api/src', 'apps/web/src', 'apps/stellar-service/src'];

function collectFiles() {
  const files = [];
  for (const dir of SOURCES) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.test\.|\.spec\.|__tests__|\.d\.ts$/.test(full)) continue;
        if (/node_modules|dist|\.next|migrations/.test(full)) continue;
        files.push(full);
      }
    };
    walk(abs);
  }
  return files;
}

function halsteadCounts(text) {
  let operators = 0;
  let operands = 0;
  const tokenRe =
    /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<=|>=|===|!==|&&|\|\||\?\?|->|=>|[-+*/%=<>!&|^~?:.]/g;
  for (const m of text.matchAll(tokenRe)) {
    const t = m[0];
    if (
      /^(true|false|null|undefined|this|function|return|export|import|const|let|var|if|else|for|while|switch|break|continue|new|typeof|async|await|class|constructor|extends|static|default|from|as|of|in|do|try|catch|throw|case)$/.test(
        t
      )
    )
      continue;
    if (/^[A-Za-z_$][\w$]*$/.test(t)) operands += 1;
    else operators += 1;
  }
  return { operators, operands };
}

function analyzeFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const commentCount = (text.match(/\/\/|\/\*|^\s*\*/gm) || []).length;
  const lines = text.split('\n').length;

  const functions = [];

  // Track per-function complexity using a stack of contexts.
  let current = null;
  const countNode = (node) => {
    if (current) {
      if (
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isCatchClause(node) ||
        ts.isConditionalExpression(node)
      ) {
        current.complexity += 1;
        return;
      }
      if (ts.isSwitchStatement(node)) {
        const clauses = node.caseBlock.clauses.filter((c) => ts.isCaseClause(c)).length;
        current.complexity += clauses || 1;
        return;
      }
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      ) {
        current.complexity += 1;
      }
    }
  };

  const walk = (node) => {
    if (ts.isFunctionLike(node) && !node.name) {
      // arrow/function expression — treat as nested function boundary
    }
    countNode(node);
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      const prev = current;
      current = {
        name: node.name ? node.name.getText(sourceFile) : '(anonymous)',
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        complexity: 1,
      };
      node.forEachChild(walk);
      const fn = {
        name: current.name,
        line: current.line,
        complexity: Math.max(current.complexity, 1),
      };
      if (current.complexity > 0) functions.push(fn);
      current = prev;
      return;
    }
    node.forEachChild(walk);
  };
  walk(sourceFile);

  const { operators, operands } = halsteadCounts(text);
  const vocab = operators + operands;
  const volume = vocab > 0 ? (operators + operands) * Math.log2(Math.max(vocab, 2)) : 0;
  const avgFunctionComplexity = functions.length
    ? functions.reduce((s, f) => s + f.complexity, 0) / functions.length
    : 1;
  const commentPercent = lines > 0 ? (Math.min(commentCount, lines) / lines) * 100 : 0;

  // Classic Maintenance Index (MS-Excel formula), clamped to [0,100].
  const miParts = [
    171,
    -5.2 * Math.log(Math.max(volume, 1)),
    -0.23 * avgFunctionComplexity,
    -16.2 * Math.log(Math.max(commentPercent, 1)),
  ];
  const maintainabilityIndex = Math.max(
    0,
    Math.min(
      100,
      miParts.reduce((a, b) => a + b, 0)
    )
  );

  return {
    file: path.relative(ROOT, file),
    lines,
    functions,
    functionCount: functions.length,
    avgFunctionComplexity: Number(avgFunctionComplexity.toFixed(2)),
    maxFunctionComplexity: functions.length ? Math.max(...functions.map((f) => f.complexity)) : 0,
    highRiskFunctions: functions.filter((f) => f.complexity >= 15),
    volume: Math.round(volume),
    maintainabilityIndex: Number(maintainabilityIndex.toFixed(1)),
    commentPercent: Number(commentPercent.toFixed(1)),
  };
}

function main() {
  const files = collectFiles();
  const analyzed = files.map(analyzeFile);

  const totals = {
    files: analyzed.length,
    totalLines: analyzed.reduce((s, f) => s + f.lines, 0),
    totalFunctions: analyzed.reduce((s, f) => s + f.functionCount, 0),
    avgMaintainabilityIndex: Number(
      (
        analyzed.reduce((s, f) => s + f.maintainabilityIndex, 0) / Math.max(analyzed.length, 1)
      ).toFixed(1)
    ),
    avgFileComplexity: files.length
      ? Number(
          (
            analyzed.reduce((s, f) => s + f.avgFunctionComplexity * f.functionCount, 0) /
            analyzed.reduce((s, f) => s + Math.max(f.functionCount, 1), 0)
          ).toFixed(2)
        )
      : 0,
    maxFileComplexity: analyzed.length
      ? Math.max(...analyzed.map((f) => f.maxFunctionComplexity))
      : 0,
    highRiskFiles: analyzed.filter((f) => f.maxFunctionComplexity >= 15).length,
    highRiskFunctionsTotal: analyzed.reduce((s, f) => s + f.highRiskFunctions.length, 0),
    avgVolume: Number(
      (analyzed.reduce((s, f) => s + f.volume, 0) / Math.max(analyzed.length, 1)).toFixed(0)
    ),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    tools: ['typescript-ast'],
    dirs: SOURCES,
    totals,
    files: analyzed,
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'complexity.json'), JSON.stringify(report, null, 2));
  console.log(
    `complexity: ${totals.files} files, ${totals.totalFunctions} functions, MI ${totals.avgMaintainabilityIndex}, ${totals.highRiskFunctionsTotal} high-risk functions`
  );
}

main();
