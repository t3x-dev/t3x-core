/**
 * A/B Test Statistical Functions
 *
 * Compare statistical significance between Control and Treatment configs.
 *
 * - twoProportionZTest: compare pass rates
 * - twoSampleTTest: compare average scores
 */

// ============================================================
// Types
// ============================================================

export interface ABTestResult {
  controlMean: number;
  treatmentMean: number;
  delta: number;
  deltaPercent: number;
  pValue: number;
  confidenceInterval: [number, number];
  isSignificant: boolean; // p < 0.05
  sampleSizeAdequate: boolean; // sample size >= 30
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Cumulative distribution function (CDF) for the standard normal distribution.
 * Uses the Abramowitz and Stegun approximation.
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
 * Cumulative distribution function (CDF) for the t distribution.
 * Uses an approximation that approaches the standard normal for df > 30.
 */
function tCDF(t: number, df: number): number {
  // For large degrees of freedom, the t distribution is close to normal.
  if (df > 100) {
    return normalCDF(t);
  }

  // Approximate via the incomplete beta integral.
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(x, a, b);
  } else {
    return 0.5 * incompleteBeta(x, a, b);
  }
}

/**
 * Incomplete beta function approximation.
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Continued-fraction approximation for common t-distribution cases.
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
 * Continued-fraction expansion of the beta function.
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
 * Log-gamma function (Lanczos approximation).
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
 * Mean of an array.
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Variance of an array.
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
 * Two-proportion z-test.
 *
 * Compares whether two pass rates differ significantly.
 *
 * @param successA - control successes
 * @param totalA - control total
 * @param successB - treatment successes
 * @param totalB - treatment total
 * @returns A/B test result
 */
export function twoProportionZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number
): ABTestResult {
  const pA = totalA > 0 ? successA / totalA : 0;
  const pB = totalB > 0 ? successB / totalB : 0;

  const pPooled = (successA + successB) / (totalA + totalB);

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / totalA + 1 / totalB));

  const z = se > 0 ? (pB - pA) / se : 0;

  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  const seDiff = Math.sqrt((pA * (1 - pA)) / totalA + (pB * (1 - pB)) / totalB);
  const zCritical = 1.96; // 95% confidence
  const ciLower = pB - pA - zCritical * seDiff;
  const ciUpper = pB - pA + zCritical * seDiff;

  const delta = pB - pA;
  const deltaPercent = pA > 0 ? ((pB - pA) / pA) * 100 : pB > 0 ? 100 : 0;

  return {
    controlMean: pA,
    treatmentMean: pB,
    delta,
    deltaPercent,
    pValue: Math.max(0, Math.min(1, pValue)),
    confidenceInterval: [ciLower, ciUpper],
    isSignificant: pValue < 0.05,
    sampleSizeAdequate: totalA >= 30 && totalB >= 30,
  };
}

/**
 * Two-sample t-test (Welch's t-test).
 *
 * Compares whether two means differ significantly.
 * Welch's t-test does not assume equal variances.
 *
 * @param samplesA - control samples
 * @param samplesB - treatment samples
 * @returns A/B test result
 */
export function twoSampleTTest(samplesA: number[], samplesB: number[]): ABTestResult {
  const nA = samplesA.length;
  const nB = samplesB.length;

  if (nA < 2 || nB < 2) {
    const meanA = mean(samplesA);
    const meanB = mean(samplesB);
    return {
      controlMean: meanA,
      treatmentMean: meanB,
      delta: meanB - meanA,
      deltaPercent: meanA > 0 ? ((meanB - meanA) / meanA) * 100 : 0,
      pValue: 1,
      confidenceInterval: [0, 0],
      isSignificant: false,
      sampleSizeAdequate: false,
    };
  }

  const meanA = mean(samplesA);
  const meanB = mean(samplesB);
  const varA = variance(samplesA);
  const varB = variance(samplesB);

  const se = Math.sqrt(varA / nA + varB / nB);
  const t = se > 0 ? (meanB - meanA) / se : 0;

  const numerator = (varA / nA + varB / nB) ** 2;
  const denominator = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = denominator > 0 ? numerator / denominator : 1;

  const pValue = 2 * (1 - tCDF(Math.abs(t), df));

  const tCritical = df > 30 ? 1.96 : 2.042;
  const ciLower = meanB - meanA - tCritical * se;
  const ciUpper = meanB - meanA + tCritical * se;

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
