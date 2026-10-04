#!/usr/bin/env node
/**
 * Snapshot the PUBLISHED Persuasion Taxonomy into data/*.json so the MCP server
 * never touches the database at request time (zero runtime cost, zero AI calls).
 *
 * Read-only. Reads taxonomy_techniques + the four examples_* corpus tables, and the
 * analyzer baselines/clusters files from the sibling persuasion-taxonomy checkout.
 *
 *   npm run export-data
 *   (= node --env-file=../persuasion-taxonomy/.env.local scripts/export-catalog.mjs)
 *
 * Outputs:
 *   data/catalog.json   published techniques: identity, role, family, lede, definitions,
 *                       up to 3 short examples, sister/counter links, URL, global brand
 *                       support, per-channel-group brand support, and per-persuasion-mode
 *                       brand support (from the aggressive / balanced / equity opener tables)
 *   data/categories.json  per deep category (>= MIN_CATEGORY_BRANDS brands): prevalence TIER
 *                       per technique. Tiers only, never raw percentages (see the
 *                       2026-10-02 baseline review: thin per-brand sampling + tag noise).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DATA = join(here, '..', 'data')
const TAXONOMY_REPO = join(here, '..', '..', 'persuasion-taxonomy')
mkdirSync(DATA, { recursive: true })

const ORIGIN = 'https://taxonomy.coppica.com'
const MIN_CATEGORY_BRANDS = 100
// Source buckets, not industries: never offer these as a reader's category.
const NOT_CATEGORIES = new Set(['unknown', 'vintage_general', 'copywriting_reference'])
const CORPUS_TABLES = ['examples_openers_aggressive', 'examples_openers_balanced', 'examples_openers_equity', 'examples_structural']

const CHANNEL_GROUP = {
  meta_ad: 'ads', google_ad: 'ads', social: 'ads', outdoor: 'ads', print: 'ads',
  web: 'web',
  email: 'email',
  direct_mail: 'direct_mail', b2b_whitepaper: 'direct_mail',
  tv_commercial: 'video', video_online: 'video', vsl: 'video',
  radio: 'audio',
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run via npm run export-data)')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

/** Code-point-safe truncation (never splits a surrogate pair). */
function clip(s, max) {
  if (!s) return ''
  const t = (Array.isArray(s) ? s.filter(Boolean).join('; ') : String(s)).replace(/\s+/g, ' ').trim()
  const cps = Array.from(t)
  return cps.length <= max ? t : cps.slice(0, max - 1).join('').trimEnd() + '…'
}

async function pageAll(table, columns, orderCol) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).order(orderCol).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// ── 1. techniques ──────────────────────────────────────────────────────────
const COLS = [
  'slug', 'technique_name', 'functional_role', 'parent_slug', 'family',
  'catalog_pt_id', 'catalog_slug', 'catalog_published', 'catalog_lede', 'catalog_what_it_does',
  'catalog_why_it_works', 'catalog_lands_when', 'catalog_dilutes_when', 'catalog_examples',
  'catalog_sister_ids', 'catalog_counter_ids',
].join(',')
const rows = await pageAll('taxonomy_techniques', COLS, 'slug')
const bySlug = new Map(rows.map((r) => [r.slug, r]))
const byPtId = new Map(rows.filter((r) => r.catalog_pt_id).map((r) => [r.catalog_pt_id, r]))

// Same routing rule as persuasion-taxonomy lib/catalog-queries.ts routeOf().
function routeOf(row) {
  let top = null
  let cur = row.parent_slug
  const seen = new Set()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const p = bySlug.get(cur)
    if (!p) break
    if (p.catalog_published) top = p
    cur = p.parent_slug
  }
  if (top && top.catalog_slug) return { path: `/${top.functional_role.toLowerCase()}/${top.catalog_slug}/${row.catalog_slug}`, parent: top.slug }
  return { path: `/${row.functional_role.toLowerCase()}/${row.catalog_slug}`, parent: null }
}

const published = rows.filter((r) => r.catalog_published && r.catalog_slug && r.functional_role && r.catalog_pt_id)
const publishedSlugs = new Set(published.map((r) => r.slug))

/** sister/counter ids may be PT-IDs or slugs; resolve to published {pt_id, name}. */
function resolveLinks(ids) {
  if (!Array.isArray(ids)) return []
  const out = []
  for (const id of ids) {
    const r = byPtId.get(id) || bySlug.get(id)
    if (r && publishedSlugs.has(r.slug)) out.push({ pt_id: r.catalog_pt_id, name: r.technique_name })
  }
  return out.slice(0, 5)
}

// ── 2. corpus support (distinct brands per slug, per channel group) ───────
const MODE_OF_TABLE = { examples_openers_aggressive: 'aggressive', examples_openers_balanced: 'balanced', examples_openers_equity: 'equity' }
const modeBrands = new Map() // slug -> Map(mode -> Set(brand))
const globalBrands = new Map() // slug -> Set(brand)
const channelBrands = new Map() // slug -> Map(group -> Set(brand))
let corpusRows = 0
for (const t of CORPUS_TABLES) {
  const data = await pageAll(t, 'id,channel,source_brand,technique_slugs', 'id')
  for (const r of data) {
    corpusRows++
    const brand = (r.source_brand || '').trim().toLowerCase()
    if (!brand) continue
    const group = CHANNEL_GROUP[r.channel] || null
    for (const slug of r.technique_slugs || []) {
      if (!publishedSlugs.has(slug)) continue
      if (!globalBrands.has(slug)) globalBrands.set(slug, new Set())
      globalBrands.get(slug).add(brand)
      const mode = MODE_OF_TABLE[t]
      if (mode) {
        if (!modeBrands.has(slug)) modeBrands.set(slug, new Map())
        const mm = modeBrands.get(slug)
        if (!mm.has(mode)) mm.set(mode, new Set())
        mm.get(mode).add(brand)
      }
      if (group) {
        if (!channelBrands.has(slug)) channelBrands.set(slug, new Map())
        const m = channelBrands.get(slug)
        if (!m.has(group)) m.set(group, new Set())
        m.get(group).add(brand)
      }
    }
  }
  process.stderr.write(`  scanned ${t}: ${data.length} rows\n`)
}

// ── 3. assemble catalog ────────────────────────────────────────────────────
const techniques = published.map((r) => {
  const { path, parent } = routeOf(r)
  const examples = (Array.isArray(r.catalog_examples) ? r.catalog_examples : []).slice(0, 3).map((e) => ({
    brand: clip(e.brand, 80),
    year: e.year ? clip(e.year, 24) : null,
    headline: clip(e.headline, 180),
    excerpt: clip(e.body, 260),
    why: clip(e.why, 260),
  })).filter((e) => e.brand && (e.headline || e.excerpt))
  const ch = channelBrands.get(r.slug)
  const md = modeBrands.get(r.slug)
  return {
    slug: r.slug,
    pt_id: r.catalog_pt_id,
    name: r.technique_name,
    role: r.functional_role,
    family: r.family || null,
    parent: parent ? bySlug.get(parent)?.catalog_pt_id ?? null : null,
    lede: clip(r.catalog_lede, 400),
    what_it_does: clip(r.catalog_what_it_does, 900),
    why_it_works: clip(r.catalog_why_it_works, 700),
    lands_when: clip(r.catalog_lands_when, 400),
    dilutes_when: clip(r.catalog_dilutes_when, 400),
    examples,
    sisters: resolveLinks(r.catalog_sister_ids),
    counters: resolveLinks(r.catalog_counter_ids),
    url: ORIGIN + path,
    brands: globalBrands.get(r.slug)?.size ?? 0,
    channels: ch ? Object.fromEntries([...ch].map(([g, s]) => [g, s.size])) : {},
    modes: md ? Object.fromEntries([...md].map(([m, s]) => [m, s.size])) : {},
  }
}).sort((a, b) => a.pt_id.localeCompare(b.pt_id))

// ── 4. category tiers (tiers only, deep categories only) ───────────────────
const baselines = JSON.parse(readFileSync(join(TAXONOMY_REPO, 'lib/analyzer/data/baselines-latest.json'), 'utf8'))
const clusters = JSON.parse(readFileSync(join(TAXONOMY_REPO, 'lib/analyzer/data/clusters-latest.json'), 'utf8'))
const slug2rep = clusters.slug2cluster || {}
const repMembers = new Map((clusters.clusters || []).map((c) => [c.rep, c.members]))
const categories = {}
for (const [cat, c] of Object.entries(baselines.categories)) {
  if (NOT_CATEGORIES.has(cat) || !c.gradeable || c.brands < MIN_CATEGORY_BRANDS) continue
  const freq = new Map(c.techniques.map((t) => [t.slug, t.pct]))
  // cluster roll-up, as the analyzer does: a move is only "less common" if its near-synonyms are too
  const rolled = new Map()
  for (const slug of publishedSlugs) {
    const members = repMembers.get(slug2rep[slug] || slug) || [slug]
    let best = null
    for (const m of members) { const p = freq.get(m); if (p != null && (best == null || p > best)) best = p }
    if (best != null) rolled.set(slug, best)
  }
  const pcts = [...rolled.values()].sort((a, b) => a - b)
  if (pcts.length < 10) continue
  const q = (f) => pcts[Math.min(pcts.length - 1, Math.floor(f * pcts.length))]
  const p40 = q(0.4), p70 = q(0.7), p90 = q(0.9)
  const tiers = {}
  for (const [slug, p] of rolled) tiers[slug] = p >= p90 ? 'table_stakes' : p >= p70 ? 'common' : p > p40 ? 'occasional' : 'less_common'
  categories[cat] = { brands: c.brands, tiers }
}

const meta = {
  exported_at: new Date().toISOString(),
  techniques: techniques.length,
  corpus_rows: corpusRows,
  baselines_computed_at: baselines.meta?.computed_at ?? null,
  categories: Object.keys(categories).length,
  license: 'CC BY 4.0 — The Persuasion Taxonomy, Coppica (https://taxonomy.coppica.com)',
}
writeFileSync(join(DATA, 'catalog.json'), JSON.stringify({ meta, techniques }))
writeFileSync(join(DATA, 'categories.json'), JSON.stringify({ meta, categories }))
console.log(JSON.stringify(meta, null, 1))
console.log('categories:', Object.entries(categories).map(([k, v]) => `${k}(${v.brands})`).join(', '))
