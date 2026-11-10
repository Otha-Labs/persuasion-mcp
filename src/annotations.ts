import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

/**
 * The title and annotations every tool here shares. Each tool only reads the bundled catalog or does
 * arithmetic: it writes, deletes and sends nothing, gives the same answer to the same input, and
 * reaches nothing outside the catalog.
 *
 * The hints are spelled out on purpose. Claude's directory wants a title plus readOnlyHint or
 * destructiveHint on every tool, and OpenAI's plugin review wants readOnlyHint, destructiveHint and
 * openWorldHint as explicit booleans. The title goes in the annotations too, for clients on the
 * 2025-03-26 protocol, which read it from there.
 */
export function readOnlyTool(title: string): { title: string; annotations: ToolAnnotations } {
  return {
    title,
    annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }
}
