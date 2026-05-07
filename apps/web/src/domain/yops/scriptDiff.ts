function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split('\n');
}

export function getChangedLineNumbers(baseText: string, currentText: string): number[] {
  if (baseText === currentText) return [];

  const base = splitLines(baseText);
  const current = splitLines(currentText);
  if (base.length === 0) {
    return current.map((_, index) => index + 1);
  }

  const rowLength = current.length + 1;
  const dp = new Array<number>((base.length + 1) * rowLength).fill(0);
  const at = (i: number, j: number) => i * rowLength + j;

  for (let i = base.length - 1; i >= 0; i--) {
    for (let j = current.length - 1; j >= 0; j--) {
      dp[at(i, j)] =
        base[i] === current[j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  const changed = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < base.length && j < current.length) {
    if (base[i] === current[j]) {
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      i++;
    } else {
      changed.add(j + 1);
      j++;
    }
  }
  while (j < current.length) {
    changed.add(j + 1);
    j++;
  }

  return [...changed].sort((a, b) => a - b);
}

function isContentLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('#')) return false;
  if (line === 'yops:') return false;
  if (line.startsWith('  - ')) return false;
  return true;
}

export function getChangedContentLineNumbers(baseText: string, currentText: string): number[] {
  const changed = new Set(getChangedLineNumbers(baseText, currentText));
  return currentText
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line, lineNumber }) => changed.has(lineNumber) && isContentLine(line))
    .map(({ lineNumber }) => lineNumber);
}

export function getHumanCommentContentLineNumbers(text: string): number[] {
  const lineNumbers: number[] = [];
  const lines = splitLines(text);
  let inHumanOp = false;
  let sawHumanOpStart = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('# Human edit via ')) {
      inHumanOp = true;
      sawHumanOpStart = false;
      return;
    }

    if (line.startsWith('  - ')) {
      if (inHumanOp && !sawHumanOpStart) {
        sawHumanOpStart = true;
      } else {
        inHumanOp = false;
        sawHumanOpStart = false;
      }
      return;
    }

    if (inHumanOp && isContentLine(line)) {
      lineNumbers.push(index + 1);
    }
  });

  return lineNumbers;
}
