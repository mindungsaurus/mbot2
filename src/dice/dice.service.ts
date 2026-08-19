import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export interface DiceRollResult {
  input: string;
  expanded: string;
  dice: number[];
  total: number;
}

export type Comparator = '>=' | '>' | '<=' | '<' | '==' | '!=';

export interface DiceTargetAnalysis {
  input: string;
  target: number;
  comparator: Comparator;

  method: 'exact' | 'montecarlo';
  probabilityPercent: string; // 예: "27.34%"
  probability: number; // 0..1 (몬테카를로에서만 신뢰 가능, exact는 너무 큰 BigInt 대비로 참고용)

  // montecarlo일 때만 채움
  samples?: number;
  ci95Percent?: { low: string; high: string };

  // “몇 이상 떠야…”용: 각 dice term(각 NdM 토큰)의 합 기준
  // 여러 주사위가 있으면 단일 임계값이 아니라 “다른 주사위 가정”이 필요해서
  // (다른 주사위가 최소/최대일 때) 필요한 최소 합을 같이 제공
  diceTerms: Array<{
    index: number; // dice 토큰 순서(0-based)
    raw: string; // "2d12" 등
    minSum: number; // count * 1
    maxSum: number; // count * sides
    needAtLeastWhenOthersMin?: number; // 다른 dice들을 모두 최소로 둔다면, 이 term 합이 최소 얼마면 target 달성 가능한지
    needAtLeastWhenOthersMax?: number; // 다른 dice들을 모두 최대로 둔다면, 이 term 합이 최소 얼마면 target 달성 가능한지
  }>;
}

export class DiceExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceExpressionError';
  }
}

// -----------------------------
// 내부 토큰
// -----------------------------
type BinaryOp = '+' | '-' | '*' | '/';
type UnaryOp = 'u+' | 'u-';
type Op = BinaryOp | UnaryOp;
type FuncName = 'min' | 'max';

type DiceToken =
  | { kind: 'num'; raw: string; value: number }
  | { kind: 'dice'; raw: string; count: number; sides: number }
  | { kind: 'op'; op: Op }
  | { kind: 'func'; name: FuncName; argc?: number }
  | { kind: 'comma' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

type EvalRolled = {
  value: number;
  allRolls: number[];
  diceFacesByAppearance: number[][];
};

@Injectable()
export class DiceService {
  // 안전장치(디스코드 봇에서는 필수)
  private readonly MAX_EXPR_LEN = 800;

  // 실제 굴림 제한
  private readonly MAX_TOTAL_DICE = 2000;
  private readonly MAX_DICE_PER_TERM = 300;
  private readonly MAX_SIDES = 1_000_000;

  // 확률 계산(Exact) 제한: “주사위 합 조합 수”가 이거보다 크면 몬테카를로로 전환
  private readonly MAX_EXACT_COMBINATIONS = 2_000_000;

  // 분포 계산 제한(너무 큰 면/개수면 DP 자체가 비현실적)
  private readonly MAX_DIST_SIZE = 200_000; // NdM의 "합" 가능한 값 개수(count*(sides-1)+1)

  // -------------------------
  // 1) 기존: 실제 굴림 + 펼친 식 반환
  // -------------------------
  rollExpression(input: string, options?: { sort?: boolean }): DiceRollResult {
    try {
      const expr = (input ?? '').trim();
      if (!expr) throw new Error('Expression is empty.');
      if (expr.length > this.MAX_EXPR_LEN)
        throw new Error('Expression too long.');

      const tokens = this.tokenize(expr);
      const rpn = this.toRpn(tokens);
      const rolled = this.evalRpnRoll(rpn);
      const expanded = this.buildExpandedExpression(
        tokens,
        rolled.diceFacesByAppearance,
      );

      const dice = options?.sort
        ? [...rolled.allRolls].sort((a, b) => b - a) // 내림차순
        : rolled.allRolls;

      return {
        input: expr,
        expanded,
        dice,
        total: rolled.value,
      };
    } catch (e) {
      throw this.wrapToUserError(e);
    }
  }

  formatResult(r: DiceRollResult): string {
    return `-# Input expr: \`${r.input}\`\n🎲**\`Dice: [${r.dice.join(', ')}]\`** => \n\`${r.expanded}\` = **${this.formatNumber(r.total)}**`;
  }

  // -------------------------
  // 2) 추가: target 확률 분석
  // -------------------------
  analyzeTarget(
    input: string,
    target: number,
    options?: { comparator?: Comparator; samples?: number },
  ): DiceTargetAnalysis {
    try {
      const expr = (input ?? '').trim();
      if (!expr) throw new Error('Expression is empty.');
      if (expr.length > this.MAX_EXPR_LEN)
        throw new Error('Expression too long.');
      if (!Number.isFinite(target))
        throw new Error('Target must be a finite number.');

      const comparator: Comparator = options?.comparator ?? '>=';
      const tokens = this.tokenize(expr);
      const rpn = this.toRpn(tokens);

      const diceTerms = tokens.filter(
        (t): t is Extract<DiceToken, { kind: 'dice' }> => t.kind === 'dice',
      );

      // dice 없으면 0%/100%
      if (diceTerms.length === 0) {
        const v = this.evalRpnWithDiceSums(rpn, []);
        const ok = this.compare(v, target, comparator);
        return {
          input: expr,
          target,
          comparator,
          method: 'exact',
          probabilityPercent: ok ? '100.00%' : '0.00%',
          probability: ok ? 1 : 0,
          diceTerms: [],
        };
      }

      const dists = diceTerms.map((d) =>
        this.buildSumDistributionOrNull(d.count, d.sides),
      );
      const canExact =
        dists.every((x) => x !== null) &&
        this.estimateCombinationCount(dists) <= this.MAX_EXACT_COMBINATIONS;

      if (canExact) {
        return this.analyzeExact(
          expr,
          rpn,
          diceTerms,
          dists,
          target,
          comparator,
        );
      }

      const samples = Math.max(
        1000,
        Math.min(options?.samples ?? 50_000, 1_000_000),
      );
      return this.analyzeMonteCarlo(
        expr,
        rpn,
        diceTerms,
        target,
        comparator,
        samples,
      );
    } catch (e) {
      throw this.wrapToUserError(e);
    }
  }

  // -------------------------
  // Exact 분석: 각 dice term의 “합 분포”를 만들고,
  // 분포 조합(합 값들) 전체에 대해 수식을 평가해서 성공 케이스를 카운트
  // -------------------------
  private analyzeExact(
    expr: string,
    rpn: DiceToken[],
    diceTerms: Array<Extract<DiceToken, { kind: 'dice' }>>,
    dists: Array<Map<number, bigint>>,
    target: number,
    comparator: Comparator,
  ): DiceTargetAnalysis {
    const totals: bigint[] = diceTerms.map((d) =>
      this.bigIntPow(BigInt(d.sides), BigInt(d.count)),
    );
    const totalOutcomes = totals.reduce((a, b) => a * b, 1n);

    let success = 0n;

    const diceSums: number[] = new Array(diceTerms.length).fill(0);

    const recur = (idx: number, weight: bigint) => {
      if (idx === dists.length) {
        const v = this.evalRpnWithDiceSums(rpn, diceSums);
        if (this.compare(v, target, comparator)) success += weight;
        return;
      }
      const dist = dists[idx];
      for (const [sum, cnt] of dist.entries()) {
        diceSums[idx] = sum;
        recur(idx + 1, weight * cnt);
      }
    };

    recur(0, 1n);

    const pct = this.formatPercentBigInt(success, totalOutcomes, 2); // 2 decimals
    // probability(number)는 너무 큰 BigInt면 정밀도 잃을 수 있음 → 참고용
    const prob = this.safeBigIntRatioToNumber(success, totalOutcomes);

    return {
      input: expr,
      target,
      comparator,
      method: 'exact',
      probabilityPercent: pct,
      probability: prob,
      diceTerms: [], // caller에서 채움
    };
  }

  // -------------------------
  // Monte Carlo 분석: 표본 추정 + 95% CI
  // -------------------------
  private analyzeMonteCarlo(
    expr: string,
    rpn: DiceToken[],
    diceTerms: Array<Extract<DiceToken, { kind: 'dice' }>>,
    target: number,
    comparator: Comparator,
    samples: number,
  ): DiceTargetAnalysis {
    let success = 0;

    for (let i = 0; i < samples; i++) {
      const diceSums: number[] = [];
      for (const d of diceTerms) {
        let sum = 0;
        for (let k = 0; k < d.count; k++) sum += randomInt(1, d.sides + 1);
        diceSums.push(sum);
      }
      const v = this.evalRpnWithDiceSums(rpn, diceSums);
      if (this.compare(v, target, comparator)) success++;
    }

    const p = success / samples;
    // 95% CI (정규근사)
    const se = Math.sqrt(Math.max(0, p * (1 - p)) / samples);
    const low = Math.max(0, p - 1.96 * se);
    const high = Math.min(1, p + 1.96 * se);

    return {
      input: expr,
      target,
      comparator,
      method: 'montecarlo',
      probabilityPercent: this.formatPercentNumber(p, 2),
      probability: p,
      samples,
      ci95Percent: {
        low: this.formatPercentNumber(low, 2),
        high: this.formatPercentNumber(high, 2),
      },
      diceTerms: [], // caller에서 채움
    };
  }

  // 특정 term의 “합”을 얼마나 띄워야 target 달성이 가능한지(다른 term은 fixedSums로 고정)
  private findNeedAtLeastForTerm(
    rpn: DiceToken[],
    termInfos: Array<{ minSum: number; maxSum: number }>,
    termIndex: number,
    target: number,
    comparator: Comparator,
    fixedSums: number[],
  ): number | undefined {
    const min = termInfos[termIndex].minSum;
    const max = termInfos[termIndex].maxSum;

    const diceSums = fixedSums.slice(); // 고정값 복사
    for (let s = min; s <= max; s++) {
      diceSums[termIndex] = s;
      const v = this.evalRpnWithDiceSums(rpn, diceSums);
      if (this.compare(v, target, comparator)) return s;
    }
    return undefined;
  }

  // -------------------------
  // 3) 수식 파서/평가 (tokenize / rpn / eval)
  // -------------------------
  private tokenize(expr: string): DiceToken[] {
    const s = expr.replace(/\s+/g, '');
    const re = /(\d+[dD]\d+|[dD]\d+|\d+(?:\.\d+)?|[a-zA-Z]+|[(),+\-*/])/g;

    const parts = s.match(re);
    if (!parts || parts.join('') !== s) {
      throw new Error('Invalid characters or unsupported syntax.');
    }

    const tokens: DiceToken[] = [];
    let totalDice = 0;

    for (const p of parts) {
      if (p === '(') tokens.push({ kind: 'lparen' });
      else if (p === ')') tokens.push({ kind: 'rparen' });
      else if (p === ',') tokens.push({ kind: 'comma' });
      else if (p === '+' || p === '-' || p === '*' || p === '/')
        tokens.push({ kind: 'op', op: p });
      else if (/^[a-zA-Z]+$/.test(p)) {
        const name = p.toLowerCase();
        if (name === 'min' || name === 'max')
          tokens.push({ kind: 'func', name });
        else throw new Error(`Unsupported identifier: ${p}`);
      } else if (/[dD]/.test(p)) {
        const [cRaw, sRaw] = p.toLowerCase().split('d');
        const count = cRaw === '' ? 1 : parseInt(cRaw, 10);
        const sides = parseInt(sRaw, 10);

        if (!Number.isInteger(count) || count <= 0)
          throw new Error(`Invalid dice count: ${p}`);
        if (!Number.isInteger(sides) || sides <= 0)
          throw new Error(`Invalid dice sides: ${p}`);
        if (count > this.MAX_DICE_PER_TERM)
          throw new Error(`Too many dice in one term: ${p}`);
        if (sides > this.MAX_SIDES)
          throw new Error(`Dice has too many sides: ${p}`);

        totalDice += count;
        if (totalDice > this.MAX_TOTAL_DICE)
          throw new Error('Too many total dice rolls in one expression.');

        tokens.push({ kind: 'dice', raw: p, count, sides });
      } else {
        const v = Number(p);
        if (!Number.isFinite(v)) throw new Error(`Invalid number: ${p}`);
        tokens.push({ kind: 'num', raw: p, value: v });
      }
    }

    // 함수 다음은 반드시 '('
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      const next = tokens[i + 1];
      if (t.kind === 'func' && next.kind !== 'lparen') {
        throw new Error(
          `Function ${t.name} must be followed by '(' e.g. ${t.name}(1,2)`,
        );
      }
    }

    return tokens;
  }

  private toRpn(tokens: DiceToken[]): DiceToken[] {
    const output: DiceToken[] = [];
    const stack: DiceToken[] = [];
    const funcCommaCounts: number[] = [];
    let prev: DiceToken | null = null;

    for (const t of tokens) {
      switch (t.kind) {
        case 'num':
        case 'dice':
          output.push(t);
          break;

        case 'func':
          stack.push(t);
          break;

        case 'comma': {
          while (stack.length && stack[stack.length - 1].kind !== 'lparen') {
            output.push(stack.pop()!);
          }
          if (!stack.length)
            throw new Error("Comma ',' is outside parentheses.");
          if (!funcCommaCounts.length)
            throw new Error("Comma ',' can only be used inside min()/max().");
          funcCommaCounts[funcCommaCounts.length - 1] += 1;
          break;
        }

        case 'op': {
          const opTok = this.normalizeUnary(t, prev);

          while (stack.length) {
            const top = stack[stack.length - 1];
            if (top.kind !== 'op') break;

            const p1 = this.precedence(opTok.op);
            const p2 = this.precedence(top.op);

            const rightAssoc = this.isRightAssociative(opTok.op);
            const shouldPop = rightAssoc ? p1 < p2 : p1 <= p2;

            if (!shouldPop) break;
            output.push(stack.pop()!);
          }
          stack.push(opTok);
          break;
        }

        case 'lparen': {
          if (prev?.kind === 'func') funcCommaCounts.push(0);
          stack.push(t);
          break;
        }

        case 'rparen': {
          if (prev?.kind === 'lparen')
            throw new Error('Empty parentheses are not allowed.');

          while (stack.length && stack[stack.length - 1].kind !== 'lparen') {
            output.push(stack.pop()!);
          }
          if (!stack.length) throw new Error('Mismatched parentheses.');
          stack.pop(); // '('

          const top = stack[stack.length - 1];
          if (top?.kind === 'func') {
            const fn = stack.pop() as Extract<DiceToken, { kind: 'func' }>;
            const commas = funcCommaCounts.pop();
            if (commas === undefined)
              throw new Error('Function argument parsing failed.');

            const argc = commas + 1;
            if (argc < 2)
              throw new Error(`${fn.name}() requires at least 2 arguments.`);
            output.push({ ...fn, argc });
          }
          break;
        }
      }
      prev = t;
    }

    while (stack.length) {
      const t = stack.pop()!;
      if (t.kind === 'lparen' || t.kind === 'rparen')
        throw new Error('Mismatched parentheses.');
      output.push(t);
    }

    return output;
  }

  private normalizeUnary(
    t: Extract<DiceToken, { kind: 'op' }>,
    prev: DiceToken | null,
  ): Extract<DiceToken, { kind: 'op' }> {
    const unaryContext =
      prev === null ||
      prev.kind === 'op' ||
      prev.kind === 'lparen' ||
      prev.kind === 'comma' ||
      prev.kind === 'func';

    if (unaryContext && (t.op === '+' || t.op === '-')) {
      return { kind: 'op', op: t.op === '+' ? 'u+' : 'u-' };
    }
    return t;
  }

  private precedence(op: Op): number {
    if (op === 'u+' || op === 'u-') return 3;
    if (op === '*' || op === '/') return 2;
    return 1;
  }

  private isRightAssociative(op: Op): boolean {
    return op === 'u+' || op === 'u-';
  }

  private evalRpnRoll(rpn: DiceToken[]): EvalRolled {
    const st: number[] = [];
    const allRolls: number[] = [];
    const diceFacesByAppearance: number[][] = [];

    for (const t of rpn) {
      if (t.kind === 'num') {
        st.push(t.value);
        continue;
      }

      if (t.kind === 'dice') {
        const faces: number[] = [];
        for (let i = 0; i < t.count; i++) faces.push(randomInt(1, t.sides + 1));
        diceFacesByAppearance.push(faces);
        allRolls.push(...faces);
        st.push(faces.reduce((a, b) => a + b, 0));
        continue;
      }

      if (t.kind === 'op') {
        if (t.op === 'u+' || t.op === 'u-') {
          if (st.length < 1) throw new Error('Unary operator has no operand.');
          const a = st.pop()!;
          st.push(t.op === 'u-' ? -a : +a);
        } else {
          if (st.length < 2)
            throw new Error('Binary operator has insufficient operands.');
          const b = st.pop()!;
          const a = st.pop()!;
          switch (t.op) {
            case '+':
              st.push(a + b);
              break;
            case '-':
              st.push(a - b);
              break;
            case '*':
              st.push(a * b);
              break;
            case '/':
              if (b === 0) throw new Error('Division by zero.');
              st.push(a / b);
              break;
          }
        }
        continue;
      }

      if (t.kind === 'func') {
        const argc = t.argc ?? 0;
        if (argc < 2)
          throw new Error(`${t.name}() requires at least 2 arguments.`);
        if (st.length < argc)
          throw new Error(`${t.name}() has insufficient operands.`);

        const args = st.slice(st.length - argc);
        st.length -= argc;
        st.push(t.name === 'max' ? Math.max(...args) : Math.min(...args));
        continue;
      }

      if (t.kind === 'lparen' || t.kind === 'rparen' || t.kind === 'comma') {
        throw new Error(`Invalid token in RPN: ${t.kind}`);
      }
    }

    if (st.length !== 1) throw new Error('Invalid expression.');
    const value = st[0];
    if (!Number.isFinite(value))
      throw new Error('Result is not a finite number.');

    return { value, allRolls, diceFacesByAppearance };
  }

  // 확률 계산용: dice를 “굴리지 않고” 외부에서 주어진 dice 합(diceSums)으로 평가
  private evalRpnWithDiceSums(rpn: DiceToken[], diceSums: number[]): number {
    const st: number[] = [];
    let di = 0;

    for (const t of rpn) {
      if (t.kind === 'num') {
        st.push(t.value);
        continue;
      }

      if (t.kind === 'dice') {
        const v = diceSums[di++];
        if (v === undefined)
          throw new Error('Dice sums are missing for evaluation.');
        st.push(v);
        continue;
      }

      if (t.kind === 'op') {
        if (t.op === 'u+' || t.op === 'u-') {
          if (st.length < 1) throw new Error('Unary operator has no operand.');
          const a = st.pop()!;
          st.push(t.op === 'u-' ? -a : +a);
        } else {
          if (st.length < 2)
            throw new Error('Binary operator has insufficient operands.');
          const b = st.pop()!;
          const a = st.pop()!;
          switch (t.op) {
            case '+':
              st.push(a + b);
              break;
            case '-':
              st.push(a - b);
              break;
            case '*':
              st.push(a * b);
              break;
            case '/':
              if (b === 0) throw new Error('Division by zero.');
              st.push(a / b);
              break;
          }
        }
        continue;
      }

      if (t.kind === 'func') {
        const argc = t.argc ?? 0;
        if (argc < 2)
          throw new Error(`${t.name}() requires at least 2 arguments.`);
        if (st.length < argc)
          throw new Error(`${t.name}() has insufficient operands.`);

        const args = st.slice(st.length - argc);
        st.length -= argc;
        st.push(t.name === 'max' ? Math.max(...args) : Math.min(...args));
        continue;
      }

      if (t.kind === 'lparen' || t.kind === 'rparen' || t.kind === 'comma') {
        throw new Error(`Invalid token in RPN: ${t.kind}`);
      }
    }

    if (st.length !== 1) throw new Error('Invalid expression.');
    return st[0];
  }

  private buildExpandedExpression(
    tokens: DiceToken[],
    diceFacesByAppearance: number[][],
  ): string {
    let di = 0;
    const out: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const prev = tokens[i - 1];
      const next = tokens[i + 1];

      switch (t.kind) {
        case 'num':
          out.push(this.formatNumber(t.value));
          break;

        case 'dice': {
          const faces = diceFacesByAppearance[di++];
          if (!faces) throw new Error('Dice face mapping failed.');

          if (faces.length === 1) {
            out.push(String(faces[0]));
            break;
          }

          const inner = faces.join(' + ');
          const surroundedByParens =
            prev?.kind === 'lparen' && next?.kind === 'rparen';
          out.push(surroundedByParens ? inner : `(${inner})`);
          break;
        }

        case 'func':
          out.push(t.name);
          break;

        case 'comma':
          out.push(', ');
          break;

        case 'lparen':
          out.push('(');
          break;

        case 'rparen':
          out.push(')');
          break;

        case 'op':
          if (t.op === 'u+') out.push('+');
          else if (t.op === 'u-') out.push('-');
          else out.push(` ${t.op} `);
          break;
      }
    }

    return out
      .join('')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // -------------------------
  // 분포/확률용 유틸
  // -------------------------
  // NdM "합" 분포를 BigInt 카운트로 생성 (가능하면)
  // 실패(null)하면 몬테카를로로 가게 만듦
  private buildSumDistributionOrNull(
    count: number,
    sides: number,
  ): Map<number, bigint> | null {
    // 합 가능한 값 개수 = count*(sides-1)+1
    const size = count * (sides - 1) + 1;
    if (size > this.MAX_DIST_SIZE) return null;

    // 0..(sides-1)로 변환(각 눈-1)해서 DP (슬라이딩 윈도우로 O(count*size))
    let dist: bigint[] = [1n]; // 0 dice, sum'=0
    for (let i = 0; i < count; i++) {
      const newLen = dist.length + (sides - 1);
      const next: bigint[] = new Array(newLen).fill(0n);

      let window = 0n;
      for (let idx = 0; idx < newLen; idx++) {
        // add dist[idx]
        if (idx < dist.length) window += dist[idx];
        // remove dist[idx - sides]
        const removeIdx = idx - sides;
        if (removeIdx >= 0 && removeIdx < dist.length)
          window -= dist[removeIdx];

        next[idx] = window;
      }
      dist = next;
    }

    // 실제 합 = sum' + count
    const map = new Map<number, bigint>();
    for (let sumPrime = 0; sumPrime < dist.length; sumPrime++) {
      const actual = sumPrime + count;
      map.set(actual, dist[sumPrime]);
    }
    return map;
  }

  private estimateCombinationCount(dists: Array<Map<number, bigint>>): number {
    let prod = 1;
    for (const dist of dists) {
      prod *= dist.size;
      if (prod > this.MAX_EXACT_COMBINATIONS) return prod;
    }
    return prod;
  }

  private compare(v: number, target: number, cmp: Comparator): boolean {
    switch (cmp) {
      case '>=':
        return v >= target;
      case '>':
        return v > target;
      case '<=':
        return v <= target;
      case '<':
        return v < target;
      case '==':
        return Math.abs(v - target) <= 1e-12;
      case '!=':
        return Math.abs(v - target) > 1e-12;
    }
  }

  private formatNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(6).replace(/0+$/g, '').replace(/\.$/g, '');
  }

  private formatPercentNumber(p: number, decimals: number): string {
    const pct = p * 100;
    return `${pct.toFixed(decimals)}%`;
  }

  // BigInt 기반 exact 확률을 퍼센트 문자열로 (정확)
  private formatPercentBigInt(
    success: bigint,
    total: bigint,
    decimals: number,
  ): string {
    if (total === 0n) return '0.00%';
    const scale = 10n ** BigInt(decimals);
    // percent = success/total*100
    // percentScaled = success*100*scale / total
    const percentScaled = (success * 100n * scale) / total;
    const intPart = percentScaled / scale;
    const fracPart = percentScaled % scale;
    const frac = fracPart.toString().padStart(decimals, '0');
    return `${intPart.toString()}.${frac}%`;
  }

  private safeBigIntRatioToNumber(a: bigint, b: bigint): number {
    // 큰 수는 정밀도 떨어질 수 있으니 “참고용”
    // (정확한 출력은 probabilityPercent로 제공)
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    if (a <= maxSafe && b <= maxSafe) return Number(a) / Number(b);

    // 스케일링해서 대략치
    const scale = 1_000_000n;
    const scaled = (a * scale) / b; // 0..1e6
    return Number(scaled) / Number(scale);
  }

  private bigIntPow(base: bigint, exp: bigint): bigint {
    let result = 1n;
    let b = base;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) result *= b;
      b *= b;
      e >>= 1n;
    }
    return result;
  }

  private wrapToUserError(e: unknown): DiceExpressionError {
    // 이미 사용자용이면 그대로
    if (e instanceof DiceExpressionError) return e;

    const raw = e instanceof Error ? e.message : String(e);

    // 메시지 매핑(사용자에게 보여줄 문장으로)
    const msg = this.toFriendlyMessage(raw);

    return new DiceExpressionError(msg);
  }

  private toFriendlyMessage(raw: string): string {
    // 너무 내부적인 메시지는 일반화해서 노출
    if (raw.includes('Invalid characters or unsupported syntax')) {
      return '수식에 지원하지 않는 문자가 있어요. (허용: 숫자, d, + - * /, 괄호(), 쉼표(함수 인자), min/max)';
    }
    if (raw.startsWith('Unsupported identifier:')) {
      return '지원하지 않는 함수/식별자예요. (지원: min, max)';
    }
    if (raw.includes('must be followed by')) {
      return '함수 뒤에는 괄호가 필요해요. 예: max(1,2)';
    }
    if (raw.includes('requires at least 2 arguments')) {
      return 'min/max는 인자가 최소 2개 필요해요. 예: min(1,2)';
    }
    if (raw.includes('Comma') && raw.includes('min()/max()')) {
      return '쉼표(,)는 min()/max() 함수 인자 구분에만 사용할 수 있어요.';
    }
    if (raw.includes('Mismatched parentheses')) {
      return '괄호가 맞지 않아요. "("와 ")" 개수를 확인해 주세요.';
    }
    if (raw.includes('Empty parentheses')) {
      return '빈 괄호 "()"는 허용되지 않아요.';
    }
    if (raw.includes('Division by zero')) {
      return '0으로 나눌 수 없어요.';
    }
    if (
      raw.includes('Unary operator has no operand') ||
      raw.includes('Binary operator has insufficient operands')
    ) {
      return '연산자 위치가 올바르지 않아요. (예: 연산자만 끝에 오거나, 연산자 연속 등)';
    }
    if (raw.includes('Invalid expression')) {
      return '수식이 올바르지 않아요. 연산자/괄호 위치를 확인해 주세요.';
    }
    if (raw.includes('Expression is empty')) return '수식이 비어 있어요.';
    if (raw.includes('Expression too long')) return '수식이 너무 길어요.';

    // 기본 fallback
    return '수식이 올바르지 않아요.';
  }
}
