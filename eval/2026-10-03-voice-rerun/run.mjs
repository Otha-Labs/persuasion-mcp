// Runs each case through headless Claude Code. Treatment = user's normal setup + persuasion-taxonomy MCP.
// Control (flagged cases only) = user's normal setup without it. Only persuasion-taxonomy tools are pre-approved;
// everything else that needs permission is refused (dontAsk), so sessions cannot touch files or the network.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, process.env.CASES || 'cases.json'), 'utf8'))
const jobs = []
for (const c of cases) {
  jobs.push({ id: `${c.id}__mcp`, prompt: c.prompt, mcp: true })
  if (c.control) jobs.push({ id: `${c.id}__control`, prompt: c.prompt, mcp: false })
}
const run = (job) => new Promise((resolve) => {
  const out = join(here, 'results', `${job.id}.jsonl`)
  if (existsSync(out) && readFileSync(out, 'utf8').includes('"type":"result"')) return resolve()
  const args = ['-p', job.prompt, '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--permission-mode', 'dontAsk']
  if (job.mcp) args.push('--mcp-config', join(here, 'mcp.json'), '--allowedTools', 'mcp__persuasion-taxonomy')
  const child = spawn('claude', args, { cwd: join(here, 'work'), stdio: ['ignore', 'pipe', 'pipe'] })
  let buf = ''
  child.stdout.on('data', (d) => (buf += d))
  child.stderr.on('data', (d) => (buf += JSON.stringify({ type: 'stderr', text: String(d) }) + '\n'))
  const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000)
  child.on('close', (code) => { clearTimeout(timer); writeFileSync(out, buf); console.log(`${job.id} done (exit ${code})`); resolve() })
})
const queue = [...jobs]
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await run(queue.shift()) }))
console.log('ALL DONE')
