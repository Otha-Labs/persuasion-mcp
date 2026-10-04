/** Plain A/B test statistics. No dependencies, no network. */

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf, |error| < 1.5e-7). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

/** Inverse standard normal CDF (Acklam's rational approximation). */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new Error('normInv: p must be in (0,1)')
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Visitors needed per version to detect a relative lift (two-sided, two-proportion z-test). */
export function sampleSizePerArm(baseline: number, relativeLift: number, alpha: number, power: number): number {
  const p1 = baseline
  const p2 = baseline * (1 + relativeLift)
  const za = normInv(1 - alpha / 2)
  const zb = normInv(power)
  const pbar = (p1 + p2) / 2
  const n = (za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2
  return Math.ceil(n)
}

export interface Comparison {
  rateA: number
  rateB: number
  diff: number
  relLift: number
  z: number
  p: number
  ciLow: number
  ciHigh: number
  probBBetter: number
}

/** Two-proportion z-test (pooled SE for the test, unpooled SE for the interval). */
export function compare(cA: number, nA: number, cB: number, nB: number, alpha: number): Comparison {
  const rateA = cA / nA
  const rateB = cB / nB
  const diff = rateB - rateA
  const pooled = (cA + cB) / (nA + nB)
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB))
  const z = sePooled > 0 ? diff / sePooled : 0
  const p = 2 * (1 - normCdf(Math.abs(z)))
  const se = Math.sqrt((rateA * (1 - rateA)) / nA + (rateB * (1 - rateB)) / nB)
  const zc = normInv(1 - alpha / 2)
  return {
    rateA, rateB, diff,
    relLift: rateA > 0 ? diff / rateA : NaN,
    z, p,
    ciLow: diff - zc * se,
    ciHigh: diff + zc * se,
    probBBetter: se > 0 ? normCdf(diff / se) : 0.5,
  }
}

/** Regularized upper incomplete gamma Q(a, x) (Numerical Recipes gammq). */
function gammq(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN
  if (x === 0) return 1
  const gln = lnGamma(a)
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a
    for (let n = 0; n < 200; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln)
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a); b += 2
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d; const del = d * c; h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h
}
function lnGamma(x: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (const c of cof) ser += c / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/** Sample ratio mismatch: chi-square goodness of fit of observed visitors against the intended split. */
export function srmPValue(observed: number[], intendedShares: number[]): number {
  const total = observed.reduce((a, b) => a + b, 0)
  const shareSum = intendedShares.reduce((a, b) => a + b, 0)
  let chi = 0
  observed.forEach((o, i) => { const e = (total * intendedShares[i]) / shareSum; chi += (o - e) ** 2 / e })
  return gammq((observed.length - 1) / 2, chi / 2)
}
