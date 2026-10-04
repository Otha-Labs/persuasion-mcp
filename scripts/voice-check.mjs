#!/usr/bin/env node
/**
 * Voice check. Every word this server shows a model should read like a working direct-response
 * writer wrote it: plain words, full sentences that lead into each other, no machine tells.
 * This connects to the built server, pulls every model-facing string (instructions, tool and
 * parameter descriptions, prompts and the nine-questions resource), greps for the obvious tells,
 * and runs the server's own flow scorer over the longer prose. Tool outputs are checked by
 * reading `npm run smoke`.
 *
 *   node scripts/voice-check.mjs [path/to/dist/index.js]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'

const entry = resolve(process.argv[2] ?? 'dist/index.js')
// FLOW_SCORER overrides the scorer, e.g. to try a patched sentence splitter.
const { scoreFlow } = await import(pathToFileURL(process.env.FLOW_SCORER ?? resolve(dirname(entry), 'scorers/flow-framework.js')).href)
const c = new Client({ name: 'voice-check', version: '0' })
await c.connect(new StdioClientTransport({ command: 'node', args: [entry] }))

const texts = [['instructions', c.getInstructions() ?? '']]
const { tools } = await c.listTools()
for (const t of tools) {
  texts.push([`desc:${t.name}`, t.description ?? ''])
  for (const [k, v] of Object.entries(t.inputSchema.properties ?? {})) if (v.description) texts.push([`param:${t.name}.${k}`, v.description])
}
const { prompts } = await c.listPrompts()
for (const p of prompts) texts.push([`prompt:${p.name}`, p.description ?? ''])
const res = await c.readResource({ uri: 'persuasion://nine-questions' })
texts.push(['resource:nine-questions', res.contents[0].text])

// Quoted spans are examples of what to avoid, technique IDs are IDs, and the nine "if missing"
// lines are the taxonomy's canonical wording: none of them count against the voice.
const unquote = (s) => s.replace(/"[^"\n]*"/g, '""').replace(/PT-[A-Z]{3}-\d+/g, 'PT-ID')
const CHECKS = [
  ['em dash', /—/],
  ['semicolon', /;/],
  ['shouting', /\b(?!DISRUPT|IDENTIFY|AGITATE|REFRAME|PROVE|ELEVATE|RESOLVE|COMPEL|BOND|VIII|CTR|CTA)[A-Z]{3,}\b/],
  ['label colon', /(^|\n|- )(Note|Check|Fix|FLAG|Warning|Evidence|Returns|Workflow|Job|Missing|Swap test|HARD FAIL|WARN|FAIL):/],
  ["it's not X, it's Y", /\bit'?s not (just )?\w+(\s\w+){0,4}, it'?s\b/i],
]
let flagged = 0
for (const [name, s] of texts) {
  const plain = unquote(s)
  for (const [label, re] of CHECKS) {
    const m = plain.match(re)
    if (m) { flagged++; console.log(`  ${name}: ${label} near "${plain.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, ' ')}"`) }
  }
}

// The flow scorer needs at least four sentences, so it only runs on the longer prose.
const scored = texts
  .filter(([n, s]) => (n === 'instructions' || n.startsWith('desc:')) && s.split(/[.!?]\s/).length >= 4)
  .map(([n, s]) => [n, scoreFlow(s, { context: 'body' })])
console.log('\nflow score, one text at a time:')
for (const [n, f] of scored) {
  const bad = f.gates.filter((g) => g.status !== 'pass').map((g) => `${g.status} ${g.name}`)
  console.log(`  ${f.score.toFixed(1)}  ${n}${bad.length ? `  (${bad.join(', ')})` : ''}`)
}
const avg = scored.reduce((s, [, f]) => s + f.score, 0) / Math.max(1, scored.length)
console.log(`\n${texts.length} strings checked, ${flagged} flagged. Average flow score ${avg.toFixed(1)}/10 over ${scored.length} texts.`)
await c.close()
process.exit(flagged ? 1 : 0)
