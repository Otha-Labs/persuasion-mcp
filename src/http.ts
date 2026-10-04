/**
 * The hosted endpoint: stateless Streamable HTTP, built on web-standard Request and Response so it
 * runs anywhere that speaks fetch (a Next.js route, a Vercel or Cloudflare function, Node 18+).
 *
 * Every request gets its own server and transport. There is no session to keep, and data.ts loads
 * the catalog once per process, so a fresh server costs only the tool registration. Responses are
 * plain JSON, not an SSE stream, because every tool answers in one shot.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { buildServer } from './server.js'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

const ABOUT = `This is the Persuasion Taxonomy MCP server, from Coppica. It's free and needs no key.

To use it, add this URL to any MCP client as a remote server (Streamable HTTP):
https://taxonomy.coppica.com/mcp

Setup for Claude, ChatGPT, Cursor and others: https://github.com/Otha-Labs/persuasion-mcp
`

/** What a JSON-RPC body asks for, without its arguments, so it is safe to log. */
export function describeRequest(body: unknown): { method: string; tool?: string }[] {
  const items = Array.isArray(body) ? body : [body]
  return items.flatMap((m) => {
    if (!m || typeof m !== 'object' || typeof (m as { method?: unknown }).method !== 'string') return []
    const { method, params } = m as { method: string; params?: { name?: unknown } }
    return [{ method, ...(method === 'tools/call' && typeof params?.name === 'string' ? { tool: params.name } : {}) }]
  })
}

/**
 * Answer one MCP request. Pass `parsedBody` if the caller already read the body (to log it, say),
 * since a Request body can only be read once.
 */
export async function handleMcpRequest(request: Request, opts: { parsedBody?: unknown } = {}): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') {
    // Stateless server: no stream to resume and no session to end. A browser that opens the URL
    // gets a short note on how to connect instead of a protocol error.
    return new Response(ABOUT, { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  const server = buildServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(request, opts))
  } finally {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
}
