/**
 * Hungarian (Kuhn-Munkres) Algorithm
 *
 * Solves the maximum weight bipartite matching problem.
 * Given an n×m similarity matrix, finds the optimal one-to-one pairing
 * that maximizes total similarity.
 *
 * Time Complexity: O(n³) where n = max(rows, cols)
 *
 * @see https://en.wikipedia.org/wiki/Hungarian_algorithm
 */

/**
 * A matched pair of source and target indices with similarity score
 * 源句子和目标句子的配对结果
 */
export interface MatchPair {
  /** Source sentence index in the source array (源句子索引) */
  sourceIndex: number;
  /** Target sentence index in the target array (目标句子索引) */
  targetIndex: number;
  /** Similarity score between the pair (配对相似度分数) */
  similarity: number;
}

/**
 * Hungarian Algorithm for maximum weight bipartite matching
 *
 * 匈牙利算法 - 寻找全局最优的二分图最大权匹配
 *
 * @param matrix - n×m similarity matrix where matrix[i][j] is similarity
 *                 between source[i] and target[j]. Higher = more similar.
 *                 相似度矩阵，matrix[i][j] 表示 source[i] 与 target[j] 的相似度
 * @returns Array of optimal match pairs (最优配对数组)
 *
 * @example
 * const matrix = [
 *   [0.9, 0.4, 0.2],  // source[0] similarities
 *   [0.3, 0.8, 0.5],  // source[1] similarities
 *   [0.2, 0.3, 0.7]   // source[2] similarities
 * ];
 * hungarian(matrix)
 * // → [
 * //   { sourceIndex: 0, targetIndex: 0, similarity: 0.9 },
 * //   { sourceIndex: 1, targetIndex: 1, similarity: 0.8 },
 * //   { sourceIndex: 2, targetIndex: 2, similarity: 0.7 }
 * // ]
 * // Total: 2.4 (optimal)
 */
export function hungarian(matrix: number[][]): MatchPair[] {
  const n = matrix.length;
  if (n === 0) return [];

  const m = matrix[0]?.length ?? 0;
  if (m === 0) return [];

  // Handle non-square matrices by padding to square
  // 处理非方阵：填充为方阵
  const size = Math.max(n, m);
  const cost: number[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(0));

  // Convert to minimization problem: cost = maxValue - similarity
  // 转换为最小化问题：代价 = 最大值 - 相似度
  let maxVal = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      maxVal = Math.max(maxVal, matrix[i][j]);
    }
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i < n && j < m) {
        cost[i][j] = maxVal - matrix[i][j];
      } else {
        cost[i][j] = maxVal; // Padding with max cost (dummy assignments)
      }
    }
  }

  // Kuhn-Munkres algorithm implementation
  // 匈牙利算法核心实现
  const u: number[] = Array(size + 1).fill(0); // Potential for rows (行势能)
  const v: number[] = Array(size + 1).fill(0); // Potential for cols (列势能)
  const p: number[] = Array(size + 1).fill(0); // Assignment: p[j] = row assigned to col j
  const way: number[] = Array(size + 1).fill(0); // Path tracking

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minv: number[] = Array(size + 1).fill(Infinity);
    const used: boolean[] = Array(size + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    // Reconstruct path
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Extract results (only for original matrix indices)
  // 提取结果（仅返回原始矩阵范围内的配对）
  const result: MatchPair[] = [];
  for (let j = 1; j <= size; j++) {
    const sourceIndex = p[j] - 1;
    const targetIndex = j - 1;

    // Only include pairs within original matrix bounds
    if (sourceIndex >= 0 && sourceIndex < n && targetIndex >= 0 && targetIndex < m) {
      result.push({
        sourceIndex,
        targetIndex,
        similarity: matrix[sourceIndex][targetIndex],
      });
    }
  }

  // Sort by source index for consistent output
  // 按源索引排序以保持输出一致性
  result.sort((a, b) => a.sourceIndex - b.sourceIndex);

  return result;
}

/**
 * Build a similarity matrix from source and target arrays using a similarity function
 *
 * 构建相似度矩阵
 *
 * @param sources - Source items (源数组)
 * @param targets - Target items (目标数组)
 * @param similarityFn - Function to compute similarity between two items (相似度计算函数)
 * @returns n×m similarity matrix (相似度矩阵)
 *
 * @example
 * const sources = ['hello world', 'foo bar'];
 * const targets = ['hello there', 'baz qux'];
 * const matrix = buildSimilarityMatrix(sources, targets, (a, b) => jaccardSimilarity(a, b));
 */
export function buildSimilarityMatrix<T>(
  sources: T[],
  targets: T[],
  similarityFn: (source: T, target: T) => number
): number[][] {
  const matrix: number[][] = [];

  for (const source of sources) {
    const row: number[] = [];
    for (const target of targets) {
      row.push(similarityFn(source, target));
    }
    matrix.push(row);
  }

  return matrix;
}
