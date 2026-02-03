/**
 * A/B Test Statistical Functions
 *
 * 用于比较两组配置（Control vs Treatment）的统计显著性
 *
 * - twoProportionZTest: 比较通过率 (Pass Rate)
 * - twoSampleTTest: 比较平均分数 (Avg Score)
 */

// ============================================================
// Types
// ============================================================

export interface ABTestResult {
  controlMean: number; // 控制组均值
  treatmentMean: number; // 实验组均值
  delta: number; // 差值 (B - A)
  deltaPercent: number; // 差值百分比
  pValue: number; // p 值
  confidenceInterval: [number, number]; // 95% 置信区间
  isSignificant: boolean; // p < 0.05
  sampleSizeAdequate: boolean; // 样本量是否足够 (>= 30)
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * 标准正态分布的累积分布函数 (CDF)
 * 使用 Abramowitz and Stegun 近似公式
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/**
 * t 分布的累积分布函数 (CDF)
 * 使用近似公式，对于 df > 30 接近标准正态分布
 */
function tCDF(t: number, df: number): number {
  // 对于大自由度，t 分布接近正态分布
  if (df > 100) {
    return normalCDF(t);
  }

  // 使用 Beta 函数的不完全积分近似
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  // 近似计算
  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(x, a, b);
  } else {
    return 0.5 * incompleteBeta(x, a, b);
  }
}

/**
 * 不完全 Beta 函数的近似计算
 */
function incompleteBeta(x: number, a: number, b: number): number {
  // 使用连分数展开的近似
  if (x === 0) return 0;
  if (x === 1) return 1;

  // 简化近似：对于 t 分布的常见情况
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaCF(x, a, b)) / a;
  } else {
    return 1 - (bt * betaCF(1 - x, b, a)) / b;
  }
}

/**
 * Beta 函数的连分数展开
 */
function betaCF(x: number, a: number, b: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let m = 1;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;

  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let h = d;

  for (let i = 1; i <= maxIterations; i++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < epsilon) break;
    m++;
  }

  return h;
}

/**
 * Log Gamma 函数（Lanczos 近似）
 */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * 计算数组的均值
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * 计算数组的方差
 */
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / (arr.length - 1);
}

// ============================================================
// Main Functions
// ============================================================

/**
 * 双比例 z 检验
 *
 * 用于比较两组的通过率是否有显著差异
 *
 * @param successA - 控制组成功数
 * @param totalA - 控制组总数
 * @param successB - 实验组成功数
 * @param totalB - 实验组总数
 * @returns A/B 测试结果
 */
export function twoProportionZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number
): ABTestResult {
  // 计算比例
  const pA = totalA > 0 ? successA / totalA : 0;
  const pB = totalB > 0 ? successB / totalB : 0;

  // 合并比例（用于计算标准误差）
  const pPooled = (successA + successB) / (totalA + totalB);

  // 计算标准误差
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / totalA + 1 / totalB));

  // 计算 z 统计量
  const z = se > 0 ? (pB - pA) / se : 0;

  // 计算 p 值（双尾检验）
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // 计算 95% 置信区间
  const seDiff = Math.sqrt((pA * (1 - pA)) / totalA + (pB * (1 - pB)) / totalB);
  const zCritical = 1.96; // 95% 置信度
  const ciLower = pB - pA - zCritical * seDiff;
  const ciUpper = pB - pA + zCritical * seDiff;

  // 差值
  const delta = pB - pA;
  const deltaPercent = pA > 0 ? ((pB - pA) / pA) * 100 : pB > 0 ? 100 : 0;

  return {
    controlMean: pA,
    treatmentMean: pB,
    delta,
    deltaPercent,
    pValue: Math.max(0, Math.min(1, pValue)), // 限制在 0-1 范围
    confidenceInterval: [ciLower, ciUpper],
    isSignificant: pValue < 0.05,
    sampleSizeAdequate: totalA >= 30 && totalB >= 30,
  };
}

/**
 * 双样本 t 检验 (Welch's t-test)
 *
 * 用于比较两组的平均值是否有显著差异
 * Welch's t-test 不假设两组方差相等
 *
 * @param samplesA - 控制组样本数组
 * @param samplesB - 实验组样本数组
 * @returns A/B 测试结果
 */
export function twoSampleTTest(samplesA: number[], samplesB: number[]): ABTestResult {
  const nA = samplesA.length;
  const nB = samplesB.length;

  // 处理空数组或单元素数组
  if (nA < 2 || nB < 2) {
    const meanA = mean(samplesA);
    const meanB = mean(samplesB);
    return {
      controlMean: meanA,
      treatmentMean: meanB,
      delta: meanB - meanA,
      deltaPercent: meanA > 0 ? ((meanB - meanA) / meanA) * 100 : 0,
      pValue: 1, // 无法计算，假设不显著
      confidenceInterval: [0, 0],
      isSignificant: false,
      sampleSizeAdequate: false,
    };
  }

  // 计算均值和方差
  const meanA = mean(samplesA);
  const meanB = mean(samplesB);
  const varA = variance(samplesA);
  const varB = variance(samplesB);

  // 计算 Welch's t 统计量
  const se = Math.sqrt(varA / nA + varB / nB);
  const t = se > 0 ? (meanB - meanA) / se : 0;

  // 计算 Welch-Satterthwaite 自由度
  const numerator = (varA / nA + varB / nB) ** 2;
  const denominator = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = denominator > 0 ? numerator / denominator : 1;

  // 计算 p 值（双尾检验）
  const pValue = 2 * (1 - tCDF(Math.abs(t), df));

  // 计算 95% 置信区间
  // 对于大自由度，使用 z = 1.96；否则需要查 t 表
  const tCritical = df > 30 ? 1.96 : 2.042; // 近似值
  const ciLower = meanB - meanA - tCritical * se;
  const ciUpper = meanB - meanA + tCritical * se;

  // 差值
  const delta = meanB - meanA;
  const deltaPercent = meanA > 0 ? ((meanB - meanA) / meanA) * 100 : 0;

  return {
    controlMean: meanA,
    treatmentMean: meanB,
    delta,
    deltaPercent,
    pValue: Math.max(0, Math.min(1, pValue)),
    confidenceInterval: [ciLower, ciUpper],
    isSignificant: pValue < 0.05,
    sampleSizeAdequate: nA >= 30 && nB >= 30,
  };
}
