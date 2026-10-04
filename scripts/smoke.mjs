#!/usr/bin/env node
/**
 * Connects as a real MCP client and calls every tool once: over stdio to dist/index.js by default,
 * with --http over Streamable HTTP to dist/http.js served on a local port, or with --url=<endpoint>
 * against a running server.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer } from 'node:http'

const remote = process.argv.find((a) => a.startsWith('--url='))?.slice(6)
const useHttp = process.argv.includes('--http') || !!remote
let httpServer
const client = new Client({ name: 'smoke', version: '0.0.0' })
if (remote) {
  const get = await fetch(remote)
  console.log(`GET ${remote}: ${get.status}, ${(await get.text()).split('\n')[0]}`)
  await client.connect(new StreamableHTTPClientTransport(new URL(remote)))
} else if (useHttp) {
  const { handleMcpRequest } = await import('../dist/http.js')
  httpServer = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body })
    const response = await handleMcpRequest(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise((r) => httpServer.listen(0, r))
  const url = `http://localhost:${httpServer.address().port}/mcp`
  const get = await fetch(url)
  console.log(`GET ${url}: ${get.status}, ${(await get.text()).split('\n')[0]}`)
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
} else {
  await client.connect(new StdioClientTransport({ command: 'node', args: ['dist/index.js'] }))
}

const instr = client.getInstructions()
console.log(`instructions: ${instr?.length ?? 0} chars`)
const { tools } = await client.listTools()
console.log(`tools (${tools.length}): ${tools.map((t) => t.name).join(', ')}`)
const { prompts } = await client.listPrompts()
console.log(`prompts: ${prompts.map((p) => p.name).join(', ')}`)
const { resources } = await client.listResources()
console.log(`resources: ${resources.map((r) => r.uri).join(', ')}`)
const defChars = JSON.stringify(tools).length
console.log(`tool definitions: ${defChars} chars (~${Math.round(defChars / 4)} tokens)\n`)

const COPY = `Stop guessing what to post.
Most small business owners spend 6 hours a week on social media and get nothing back.
PostPilot writes a month of posts in 10 minutes, tuned to what your customers actually engage with.
Over 2,400 bakeries, salons, and gyms use it — and it's not just a scheduler, it's a strategist.
Imagine opening Instagram on Monday and seeing your week already done.
Try it free for 14 days. No card required.
Start your free trial today.`

const calls = [
  ['plan_marketing_copy', { goal: 'signup', format: 'landing_page', audience: 'owners of small local service businesses (salons, gyms, bakeries) who post on Instagram themselves and feel it is a waste of time', offer: 'PostPilot: AI that writes a month of social posts in 10 minutes; 14-day free trial', awareness_level: 'problem_aware', category: 'b2b saas' }],
  ['diagnose_marketing_copy', { copy: COPY, goal: 'signup', format: 'landing_page', category: 'b2b_saas', moves: [
    { excerpt: 'Stop guessing what to post.', question: 'DISRUPT' },
    { excerpt: 'Most small business owners spend 6 hours a week on social media and get nothing back.', question: 'AGITATE' },
    { excerpt: 'PostPilot writes a month of posts in 10 minutes, tuned to what your customers actually engage with.', question: 'ELEVATE', clarity: 'partial' },
    { excerpt: 'Over 2,400 bakeries, salons, and gyms use it', question: 'PROVE' },
    { excerpt: "it's not just a scheduler, it's a strategist.", question: 'REFRAME', clarity: 'partial' },
    { excerpt: 'Imagine opening Instagram on Monday and seeing your week already done.', question: 'ELEVATE' },
    { excerpt: 'Try it free for 14 days. No card required.', question: 'RESOLVE' },
    { excerpt: 'Start your free trial today.', question: 'COMPEL', clarity: 'partial' },
  ] }],
  ['explain_why_not_converting', { symptom: 'reads_but_no_action', format: 'landing_page', details: 'Landing page gets 40% scroll depth but 0.8% trial signups from Meta ads.' }],
  ['find_persuasion_techniques', { query: 'prove it works without testimonials', format: 'landing_page', limit: 5 }],
  ['get_persuasion_technique', { id: 'PT-PRV-10000' }],
  ['check_headlines', { slot: 'ad_opening', brief: { product: 'PostPilot, AI that writes a month of social posts', audience: 'owners of bakeries, salons, and gyms who post on Instagram themselves', offer: '14-day free trial', proof: '2,400 businesses use it' }, lines: [
    { text: 'Unlock the power of AI for your social media', answers: [{ question: 'ELEVATE', words: 'the power of AI' }] },
    { text: 'Your bakery posted 3 times last month. This writes 30 in 10 minutes.', answers: [{ question: 'IDENTIFY', words: 'Your bakery posted 3 times last month' }, { question: 'DISRUPT', words: 'Your bakery posted 3 times last month.' }, { question: 'ELEVATE', words: 'This writes 30 in 10 minutes' }] },
    { text: 'Stop guessing what to post', answers: [{ question: 'AGITATE', words: 'guessing what to post' }] },
  ] }],
  ['check_marketing_claims', { claims: [{ text: 'The #1 AI social media tool for small businesses', type: 'headline' }, { text: 'Get started', type: 'cta' }, { text: 'Over 2,400 bakeries, salons, and gyms use PostPilot every week', type: 'body_claim' }] }],
  ['plan_ab_test', { baseline_conversion_rate_percent: 0.8, minimum_detectable_lift_percent: 25, daily_visitors: 900, question: 'PROVE', version_a: 'customer count (2,400 businesses)', version_b: 'a live demo of a month of posts generated on the page' }],
  ['read_ab_test_result', { versions: [{ name: 'Customer count', visitors: 10400, conversions: 83 }, { name: 'Live demo', visitors: 10310, conversions: 112 }], question: 'PROVE' }],
]

let failed = 0
for (const [name, args] of calls) {
  try {
    const res = await client.callTool({ name, arguments: args })
    const body = res.content.map((c) => c.text).join('\n')
    console.log(`\n==================== ${name} ${res.isError ? '(ERROR)' : ''} ${body.length} chars (~${Math.round(body.length / 4)} tokens)`)
    console.log(body)
    if (res.isError) failed++
  } catch (e) {
    failed++
    console.log(`\n==================== ${name} THREW: ${e.message}`)
  }
}
await client.close()
httpServer?.close()
console.log(`\n${calls.length - failed}/${calls.length} tools OK${useHttp ? ' over HTTP' : ''}`)
process.exit(failed ? 1 : 0)
