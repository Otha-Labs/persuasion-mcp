// v1 (results/) vs v2 (results-v2/) for the treatment sessions: calls, loops, time, cost, and whether
// the model pushed back on the tool's judgment in its final answer.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const load = (dir, f) => {
  const p = join(here, dir, f)
  if (!existsSync(p)) return null
  const ev = readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const calls = ev.filter((e) => e.type === 'assistant').flatMap((e) => (e.message?.content ?? []).filter((b) => b.type === 'tool_use'))
  const ours = calls.filter((c) => c.name.startsWith('mcp__persuasion-taxonomy__')).map((c) => c.name.replace('mcp__persuasion-taxonomy__', ''))
  const res = ev.find((e) => e.type === 'result')
  const text = String(res?.result ?? '')
  const pushback = (text.match(/[^.\n]*\b(I disagree|disagree with|the (tool|scorer|checker)('s)? (is wrong|misses|overrates|underrates)|don't trust (the|that) score|ignore (the|that) score|scores? (are|is) (misleading|wrong))[^.\n]*/gi) ?? [])
  const errors = ev.filter((e) => e.type === 'user').flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : [])).filter((b) => b.type === 'tool_result' && b.is_error).length
  return { ours, diag: ours.filter((t) => t === 'diagnose_marketing_copy').length, cost: res?.total_cost_usd ?? 0, sec: Math.round((res?.duration_ms ?? 0) / 1000), pushback, errors, chars: text.length }
}
const files = readdirSync(join(here, 'results-v2')).filter((f) => f.endsWith('__mcp.jsonl')).sort()
let t1 = { cost: 0, sec: 0, diag: 0 }, t2 = { cost: 0, sec: 0, diag: 0 }
console.log('| case | v1 tools | v2 tools | diagnose calls v1→v2 | sec v1→v2 | $ v1→v2 | v2 errors | v2 pushback |\n|---|---|---|---|---|---|---|---|')
for (const f of files) {
  const a = load('results', f), b = load('results-v2', f)
  if (!a || !b) continue
  t1.cost += a.cost; t1.sec += a.sec; t1.diag += a.diag; t2.cost += b.cost; t2.sec += b.sec; t2.diag += b.diag
  console.log(`| ${f.replace('__mcp.jsonl', '')} | ${[...new Set(a.ours)].join(', ')} | ${[...new Set(b.ours)].join(', ') || 'NONE'} | ${a.diag}→${b.diag} | ${a.sec}→${b.sec} | ${a.cost.toFixed(2)}→${b.cost.toFixed(2)} | ${b.errors} | ${b.pushback.length ? b.pushback.map((s) => s.trim().slice(0, 140)).join(' // ') : '—'} |`)
}
console.log(`\nTotals: cost $${t1.cost.toFixed(2)} → $${t2.cost.toFixed(2)}; time ${t1.sec}s → ${t2.sec}s; diagnose calls ${t1.diag} → ${t2.diag}`)
