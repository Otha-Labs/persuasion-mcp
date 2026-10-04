import { readFileSync } from 'node:fs'
const D = process.argv[2]
const OLD = process.env.OLD_SCORER // a build of the scorer before the splitter fix
const NEW = new URL('../../dist/scorers/flow-framework.js', import.meta.url).href
const mods = { old: await import(OLD), new: await import(NEW) }
const splitRe = (p) => eval(readFileSync(p, 'utf8').match(/const SENTENCE_SPLIT =\s*(\/.*\/g)/)[1])
const RE = { old: splitRe(OLD), new: splitRe(NEW) }
const split = (t, k) => t.split(RE[k]).map((s) => s.trim()).filter(Boolean)
const words = (s) => s.split(/\s+/).filter(Boolean).length

// AI drafts -> prose chunks the size of the human samples
function prose(t) {
  return t.split('\n').map((l) => l.trim()).filter((l) => {
    if (!l) return true
    if (/^(#|---|\||>|\[|\*\*\[|```)/.test(l)) return false
    const w = l.replace(/[*_#>\-\[\]()]/g, ' ').trim().split(/\s+/).filter(Boolean).length
    return !(w <= 6 && !/[.!?]["')]?$/.test(l.replace(/\*+$/, '')))
  }).map((l) => l.replace(/^\s*([-*•]|\d+\.)\s+/, '').replace(/\*\*/g, '')).join('\n')
}
function chunks(t) {
  const paras = prose(t).split(/\n{2,}/).map((p) => p.trim()).filter((p) => words(p) >= 4)
  const out = []; let cur = []
  for (const p of paras) { cur.push(p); if (cur.join('\n\n').length >= 450) { out.push(cur.join('\n\n')); cur = [] } }
  if (cur.join('\n\n').length >= 350) out.push(cur.join('\n\n'))
  return out.filter((c) => c.length <= 2000)
}
const human = JSON.parse(readFileSync(`${D}/human.json`, 'utf8')).map((r) => r.example_text)
const ai = JSON.parse(readFileSync(`${D}/ai.json`, 'utf8')).flatMap((r) => chunks(r.draft_text))
const GATES = ['burstiness', 'band_distribution', 'consecutive_band', 'rhythmic_contrast', 'threading_ratio', 'paragraph_variance', 'opening_uniformity']
const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`.padStart(4)
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))] }
console.log(`samples: human ${human.length}, ai chunks ${ai.length}\n`)
const stats = {}
for (const [name, texts] of [['human', human], ['ai', ai]]) {
  for (const k of ['old', 'new']) {
    const fires = Object.fromEntries(GATES.map((g) => [g, { fail: 0, warn: 0, n: 0 }]))
    const sds = [], cvs = [], ns = [], scores = []
    for (const t of texts) {
      const r = mods[k].scoreFlow(t, { context: 'body' })
      scores.push(r.score)
      for (const g of r.gates) if (fires[g.name]) { fires[g.name].n++; if (g.status === 'fail') fires[g.name].fail++; if (g.status === 'warn') fires[g.name].warn++ }
      const L = split(t, k).map(words)
      if (L.length >= 4) { const m = L.reduce((a, b) => a + b, 0) / L.length; const sd = Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length); sds.push(sd); cvs.push(sd / m); ns.push(L.length) }
    }
    stats[`${name}/${k}`] = { sds, cvs }
    console.log(`${name.padEnd(5)} ${k}: mean score ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)}, sentences p50 ${q(ns, 0.5)}, sd p10/p50/p90 ${q(sds, 0.1).toFixed(1)}/${q(sds, 0.5).toFixed(1)}/${q(sds, 0.9).toFixed(1)}, cv p10/p50/p90 ${q(cvs, 0.1).toFixed(2)}/${q(cvs, 0.5).toFixed(2)}/${q(cvs, 0.9).toFixed(2)}`)
    console.log('   ' + GATES.map((g) => `${g}: fail${pct(fires[g].fail, fires[g].n)} warn${pct(fires[g].warn, fires[g].n)} (n=${fires[g].n})`).join('\n   '))
  }
}
