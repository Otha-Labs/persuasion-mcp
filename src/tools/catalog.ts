import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ROLES, roleLabel, type Role } from '../roles.js'
import { searchTechniques, lookupTechnique, resolveCategory, TECHNIQUES } from '../data.js'
import { formatSchema, categorySchema, roleSchema } from '../schemas.js'
import { text, errorText, techniqueLine, usageSentence, exampleSource } from '../format.js'
import { joinList, clipText, innerQuotes } from '../voice.js'

export function registerCatalogTools(server: McpServer) {
  server.registerTool(
    'find_persuasion_techniques',
    {
      title: 'Find persuasion techniques',
      description:
        `Search the Persuasion Taxonomy, ${TECHNIQUES.length} named persuasion techniques documented from real advertising and organized by the nine reader questions they answer. ` +
        'Describe what you want the copy to do, like build trust without testimonials, create urgency without fake scarcity, handle a price objection, make an opening less generic, ' +
        'prove a claim or reframe a problem. It finds the techniques that do it. Each one comes with its name and ID, a one-line definition, a real example, ' +
        'how common it is in a category if you name one, and a link. So reach for it when a draft relies on the obvious move and you want a less expected one, ' +
        'or when someone asks for tactics, angles, hooks or ideas.',
      inputSchema: {
        query: z.string().min(2).max(300).describe('What you want the copy to do, in plain words, like "prove it works without testimonials".'),
        question: roleSchema.optional().describe('Set this to see only the techniques that answer one reader question.'),
        format: formatSchema.optional(),
        category: categorySchema.optional(),
        limit: z.number().int().min(1).max(20).default(8),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ query, question, format, category, limit }) => {
      const cat = resolveCategory(category)
      const role = (question as Role | undefined) ?? null
      const hits = searchTechniques(query, { role, format: format ?? null, limit })
      if (!hits.length) {
        return text(`Nothing matched "${query}"${role ? ` among the techniques that answer ${roleLabel(role)}` : ''}. ` +
          `Describe the effect you want in plainer words${role ? ', or drop the question filter' : ''}.`)
      }
      const out = [`# Techniques for "${query}"${role ? `, each one a way to answer ${roleLabel(role)}` : ''}`]
      for (const t of hits) out.push(techniqueLine(t, { category: cat, after: role ? undefined : `It answers ${roleLabel(t.role)}.` }))
      out.push('')
      out.push('For the full entry, with how it works, when it backfires and more examples, call get_persuasion_technique with the ID.')
      return text(out.join('\n'))
    },
  )

  server.registerTool(
    'get_persuasion_technique',
    {
      title: 'Get a persuasion technique',
      description:
        'Look up one persuasion technique by its ID (like PT-PRV-10000), its slug or its name. You get the full definition, why it works, when it lands and when it backfires, ' +
        'real examples from advertising, related and opposite techniques, and a link you can cite. ' +
        'Use it before you apply or recommend a technique so you get it right, and whenever someone asks what a tactic is called or how it works.',
      inputSchema: {
        id: z.string().min(2).max(160).describe('The PT-ID, the slug or the exact name of the technique.'),
        category: categorySchema.optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ id, category }) => {
      const t = lookupTechnique(id)
      if (!t) {
        const near = searchTechniques(id, { limit: 5 })
        return errorText(`There's no technique called "${id}".${near.length ? ` The closest matches are ${joinList(near.map((n) => `${n.name} (${n.pt_id})`))}.` : ''} ` +
          'You can search the catalog with find_persuasion_techniques.')
      }
      const cat = resolveCategory(category)
      const out: string[] = []
      out.push(`# ${t.name} (${t.pt_id})`)
      out.push(`It answers ${roleLabel(t.role)}, which is about ${ROLES[t.role].gloss}. ${usageSentence(t, cat)} ${t.url}`)
      out.push('')
      // Catalog fields: whole sentences only (the export cuts long fields), and condition lists read as sentences.
      const prose = (s: string) => clipText(s.replace(/;\s+(?=[A-Z])/g, '. '), 4000)
      out.push(prose(t.lede))
      if (t.what_it_does) out.push(`\n**What it does.** ${prose(t.what_it_does)}`)
      if (t.why_it_works) out.push(`\n**Why it works.** ${prose(t.why_it_works)}`)
      if (t.lands_when) out.push(`\n**When it lands.** ${prose(t.lands_when)}`)
      if (t.dilutes_when) out.push(`\n**When it backfires.** ${prose(t.dilutes_when)}`)
      if (t.examples.length) {
        out.push('\n**Real examples**')
        for (const e of t.examples) {
          out.push(`- From ${exampleSource(e)}: "${innerQuotes(prose(e.headline || e.excerpt))}"${e.why ? ` ${prose(e.why)}` : ''}`)
        }
      }
      if (t.sisters.length) out.push(`\nRelated techniques: ${joinList(t.sisters.map((s) => `${s.name} (${s.pt_id})`))}.`)
      if (t.counters.length) out.push(`The opposite approach: ${joinList(t.counters.map((s) => `${s.name} (${s.pt_id})`))}.`)
      out.push(`\nCite it as ${t.name} (${t.pt_id}), The Persuasion Taxonomy, Coppica, ${t.url}`)
      return text(out.join('\n'))
    },
  )
}
