/**
 * The bundled catalog snapshot (data/*.json, written by scripts/export-catalog.mjs)
 * plus in-memory search and move selection. No database, no network, no AI calls.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ROLE_NAMES, type Role, type Format, FORMAT_CHANNELS } from './roles.js'

export interface Example { brand: string; year: string | null; headline: string; excerpt: string; why: string }
export interface Technique {
  slug: string
  pt_id: string
  name: string
  role: Role
  family: string | null
  parent: string | null
  lede: string
  what_it_does: string
  why_it_works: string
  lands_when: string
  dilutes_when: string
  examples: Example[]
  sisters: { pt_id: string; name: string }[]
  counters: { pt_id: string; name: string }[]
  url: string
  brands: number
  channels: Record<string, number>
  /** distinct brands per persuasion mode, from the aggressive / balanced / equity opener tables */
  modes: Partial<Record<Mode, number>>
}
export type Mode = 'aggressive' | 'balanced' | 'equity'
export type Tier = 'table_stakes' | 'common' | 'occasional' | 'less_common'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const catalogFile = JSON.parse(readFileSync(join(DATA_DIR, 'catalog.json'), 'utf8')) as { meta: Record<string, unknown>; techniques: Technique[] }
const categoriesFile = JSON.parse(readFileSync(join(DATA_DIR, 'categories.json'), 'utf8')) as { categories: Record<string, { brands: number; tiers: Record<string, Tier> }> }

export const CATALOG_META = catalogFile.meta
export const TECHNIQUES = catalogFile.techniques
export const CATEGORIES = categoriesFile.categories
export const CATEGORY_NAMES = Object.keys(CATEGORIES).sort()

const byPtId = new Map(TECHNIQUES.map((t) => [t.pt_id.toUpperCase(), t]))
const bySlug = new Map(TECHNIQUES.map((t) => [t.slug.toLowerCase(), t]))
const byName = new Map(TECHNIQUES.map((t) => [norm(t.name), t]))
export const byRole = new Map<Role, Technique[]>(ROLE_NAMES.map((r) => [r, TECHNIQUES.filter((t) => t.role === r)]))

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function lookupTechnique(id: string): Technique | null {
  const raw = id.trim()
  return byPtId.get(raw.toUpperCase()) ?? bySlug.get(raw.toLowerCase().replace(/[\s-]+/g, '_')) ?? byName.get(norm(raw)) ?? null
}

/** Accept a category written loosely ("SaaS", "b2b saas", "skincare"). */
export function resolveCategory(input?: string | null): string | null {
  if (!input) return null
  const n = norm(input).replace(/ /g, '_')
  if (CATEGORIES[n]) return n
  const hit = CATEGORY_NAMES.find((c) => c.includes(n) || n.includes(c) || c.replace(/_/g, '').includes(n.replace(/_/g, '')))
  return hit ?? null
}

export function tierIn(category: string | null, slug: string): Tier | null {
  if (!category) return null
  return CATEGORIES[category]?.tiers[slug] ?? null
}

export function prevalenceLabel(t: Technique, category: string | null): string {
  if (category) {
    const tier = tierIn(category, t.slug)
    const cat = category.replace(/_/g, ' ')
    if (tier === 'table_stakes') return `table stakes in ${cat}`
    if (tier === 'common') return `common in ${cat}`
    if (tier === 'occasional') return `occasional in ${cat}`
    if (tier === 'less_common') return `less common in ${cat}`
    return `not seen in our ${cat} sample`
  }
  if (t.brands >= 150) return 'widely used'
  if (t.brands >= 40) return 'established'
  return 'less common'
}

export function channelFit(t: Technique, format: Format | null): number {
  if (!format) return 0
  return FORMAT_CHANNELS[format].reduce((s, g) => s + (t.channels[g] ?? 0), 0)
}

// ── search (BM25 over name / lede / definitions / family) ─────────────────
const STOP = new Set('a an the and or of to in on for with by is are be as at it its this that from your you their they them how what when why who make makes making use using get way ways do does into than more most less'.split(' '))
function tokens(s: string): string[] {
  return norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}
const FIELDS: [keyof Technique, number][] = [['name', 3], ['lede', 2], ['family', 1.5], ['what_it_does', 1], ['why_it_works', 0.5], ['lands_when', 0.5]]
const docs = TECHNIQUES.map((t) => {
  const tf = new Map<string, number>()
  let len = 0
  for (const [f, w] of FIELDS) {
    const v = t[f]
    if (typeof v !== 'string') continue
    for (const tok of tokens(f === 'family' ? v.replace(/_/g, ' ') : v)) { tf.set(tok, (tf.get(tok) ?? 0) + w); len += w }
  }
  for (const e of t.examples) {
    for (const tok of tokens(`${e.headline} ${e.why}`)) { tf.set(tok, (tf.get(tok) ?? 0) + 0.4); len += 0.4 }
  }
  return { t, tf, len }
})
const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length
const df = new Map<string, number>()
for (const d of docs) for (const tok of d.tf.keys()) df.set(tok, (df.get(tok) ?? 0) + 1)

function bm25(d: (typeof docs)[number], q: string[]): number {
  const N = docs.length
  let s = 0
  for (const tok of q) {
    const f = d.tf.get(tok)
    if (!f) continue
    const idf = Math.log(1 + (N - (df.get(tok) ?? 0) + 0.5) / ((df.get(tok) ?? 0) + 0.5))
    s += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.len / avgLen))))
  }
  return s
}
const docBySlug = new Map(docs.map((d) => [d.t.slug, d]))

/** Share of a technique's opener appearances that come from aggressive-mode copy (null = too little data). */
export function aggressiveShare(t: Technique): number | null {
  const a = t.modes.aggressive ?? 0, b = t.modes.balanced ?? 0, e = t.modes.equity ?? 0
  const n = a + b + e
  return n >= 5 ? a / n : null
}

/** Multiplier that keeps hard-sell moves out of balanced and equity copy (Coppica's persuasion modes). */
export function modeWeight(t: Technique, mode: Mode): number {
  if (mode === 'aggressive') return 1
  const share = aggressiveShare(t)
  if (share == null) return 1
  if (mode === 'equity') return share >= 0.5 ? 0 : 1 + Math.min(0.3, (t.modes.equity ?? 0) / 20)
  return share >= 0.6 ? 0.35 : 1
}

export function searchTechniques(query: string, opts: { role?: Role | null; format?: Format | null; limit?: number } = {}): Technique[] {
  const q = [...new Set(tokens(query))]
  const scored: { t: Technique; s: number }[] = []
  for (const d of docs) {
    if (opts.role && d.t.role !== opts.role) continue
    let s = bm25(d, q)
    if (s <= 0) continue
    if (opts.format) s *= 1 + Math.min(0.3, Math.log10(1 + channelFit(d.t, opts.format)) / 10)
    scored.push({ t: d.t, s })
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, opts.limit ?? 8).map((x) => x.t)
}

// ── deterministic, seeded move selection ─────────────────────────────────
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng(seed: number): () => number {
  let a = seed
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export interface PickedMove { t: Technique; kind: 'established' | 'less_expected' }

/**
 * Options for answering one reader question: one established move plus less-expected ones.
 * Ranked by relevance to the brief (BM25 over the brief or copy), fit to the format's
 * channels in the corpus, and the persuasion mode; then diversified by family and a seed,
 * so the same brief gets the same options and different briefs get different ones.
 * "Less expected" = not the category default: the long tail a model would not reach for
 * on its own (Theses IV, XIV). The calling model makes the final choice.
 */
export function pickMoves(role: Role, opts: { n: number; format: Format | null; category: string | null; seed: string; context: string; mode: Mode; exclude?: Set<string> }): PickedMove[] {
  const rand = rng(hash(`${opts.seed}|${role}`))
  const q = [...new Set(tokens(opts.context))]
  const all = (byRole.get(role) ?? []).filter((t) => !t.parent && t.brands >= 5 && !opts.exclude?.has(t.slug) && modeWeight(t, opts.mode) > 0)
  const rel = new Map(all.map((t) => [t.slug, bm25(docBySlug.get(t.slug)!, q)]))
  const maxRel = Math.max(1e-9, ...rel.values())
  const fit = (t: Technique) => channelFit(t, opts.format)
  const maxFit = Math.max(1, ...all.map(fit))
  const score = (t: Technique) =>
    (0.65 * (rel.get(t.slug)! / maxRel) + 0.35 * (Math.log1p(fit(t)) / Math.log1p(maxFit))) * modeWeight(t, opts.mode)
  const pool = [...all].sort((a, b) => score(b) - score(a)).slice(0, Math.max(12, opts.n * 3))
  const tierRank = (t: Technique) => ({ table_stakes: 3, common: 2, occasional: 1, less_common: 0 } as Record<string, number>)[tierIn(opts.category, t.slug) ?? ''] ?? -1

  const out: PickedMove[] = []
  const established = [...pool.slice(0, 5)].sort((a, b) => (opts.category ? tierRank(b) - tierRank(a) : 0) || b.brands - a.brands)[0]
  if (established) out.push({ t: established, kind: 'established' })

  const medianBrands = [...all].map((t) => t.brands).sort((a, b) => a - b)[Math.floor(all.length / 2)] ?? 0
  const isLessExpected = (t: Technique) => {
    if (opts.category) { const tr = tierIn(opts.category, t.slug); return tr === null || tr === 'occasional' || tr === 'less_common' }
    return t.brands <= medianBrands
  }
  // seen in the category but uncommon beats never seen there: evidence it can work for this kind of buyer
  const lessExpectedBonus = (t: Technique) => {
    if (!isLessExpected(t)) return 0
    if (opts.category && tierIn(opts.category, t.slug) === null) return 0.05
    return 0.25
  }
  const jittered = pool
    .filter((t) => !out.some((o) => o.t.slug === t.slug))
    .map((t) => ({ t, s: score(t) * (0.85 + 0.3 * rand()) + lessExpectedBonus(t) }))
    .sort((a, b) => b.s - a.s)
  for (const { t } of jittered) {
    if (out.length >= opts.n) break
    if (t.family && out.some((o) => o.t.family === t.family)) continue // distinct mechanisms, not near-synonyms
    out.push({ t, kind: isLessExpected(t) ? 'less_expected' : 'established' })
  }
  return out
}
