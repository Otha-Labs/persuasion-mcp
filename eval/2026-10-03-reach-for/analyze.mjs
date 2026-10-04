// Summarize eval sessions: which persuasion-taxonomy tools were called unprompted, how they were found,
// and what the session cost. Writes summary.md plus side-by-side files for the control pairs.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'results')
const rows = []
for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
  const ev = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const calls = ev.filter((e) => e.type === 'assistant').flatMap((e) => (e.message?.content ?? []).filter((b) => b.type === 'tool_use'))
  const ours = calls.filter((c) => c.name.startsWith('mcp__persuasion-taxonomy__')).map((c) => c.name.replace('mcp__persuasion-taxonomy__', ''))
  const searches = calls.filter((c) => c.name === 'ToolSearch').map((c) => c.input?.query)
  const other = calls.filter((c) => !c.name.startsWith('mcp__persuasion-taxonomy__') && c.name !== 'ToolSearch').map((c) => c.name)
  const toolErrors = ev.filter((e) => e.type === 'user').flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : [])).filter((b) => b.type === 'tool_result' && b.is_error).length
  const res = ev.find((e) => e.type === 'result')
  const text = String(res?.result ?? '')
  const ptIds = [...new Set(text.match(/PT-[A-Z]{3}-\d+/g) ?? [])]
  const links = (text.match(/taxonomy\.coppica\.com/g) ?? []).length
  const [id, cond] = f.replace('.jsonl', '').split('__')
  rows.push({ id, cond, ours, searches, other, toolErrors, turns: res?.num_turns, cost: res?.total_cost_usd ?? 0, sec: Math.round((res?.duration_ms ?? 0) / 1000), chars: text.length, ptIds, links, text, ok: !!res && !res.is_error })
}
const mcp = rows.filter((r) => r.cond === 'mcp')
const used = mcp.filter((r) => r.ours.length)
let md = `# Reach-for eval\n\n${used.length}/${mcp.length} treatment sessions called a persuasion-taxonomy tool unprompted.\n`
md += `Total reported cost: $${rows.reduce((s, r) => s + r.cost, 0).toFixed(2)} across ${rows.length} sessions.\n\n`
md += '| case | cond | our tools called (in order) | how found (ToolSearch) | other tools | tool errors | PT-IDs cited | links | turns | sec | $ |\n|---|---|---|---|---|---|---|---|---|---|---|\n'
for (const r of rows) md += `| ${r.id} | ${r.cond} | ${r.ours.join(' → ') || '—'} | ${r.searches.join('; ') || '—'} | ${r.other.join(', ') || '—'} | ${r.toolErrors} | ${r.ptIds.length} | ${r.links} | ${r.turns} | ${r.sec} | ${r.cost.toFixed(2)} |\n`
const tally = {}
for (const r of mcp) for (const t of new Set(r.ours)) tally[t] = (tally[t] ?? 0) + 1
md += `\n## Tool usage (sessions that called each)\n\n${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}: ${n}`).join('\n')}\n`
writeFileSync(join(here, 'summary.md'), md)
for (const r of rows) writeFileSync(join(here, 'results', `${r.id}__${r.cond}.txt`), r.text)
console.log(md)
