import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ROLE_NAMES, ROLES, GOAL_REQUIREMENTS, GOAL_NOUN, GOAL_CLAUSE, FORMAT_LABEL, AWARENESS_WEIGHT, COHERENCE_CHECKS, expectedRoles, roleLabel, type Role } from '../roles.js'
import { pickMoves, resolveCategory } from '../data.js'
import { goalSchema, formatSchema, awarenessSchema, categorySchema, modeSchema } from '../schemas.js'
import { text, techniqueLine } from '../format.js'
import { cap, joinList } from '../voice.js'

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function registerPlanTool(server: McpServer) {
  server.registerTool(
    'plan_marketing_copy',
    {
      title: 'Plan marketing copy (the nine reader questions)',
      description:
        "Plan any piece of marketing copy before you write it, whether it's an ad, a landing page, a sales page or sales letter, an email, a subject line, a social post, a headline or a video script. " +
        'Give it the goal, the reader and the offer, and it tells you which of the nine questions every reader silently asks this piece has to answer, which ones deserve the most words for this reader, ' +
        'and a few ways to answer each one, drawn from real advertising and linked to the Persuasion Taxonomy. One option is always the established move and the rest are less expected, ' +
        'because left to itself a model answers every question with the move everyone else makes, and readers have learned to skim past it. ' +
        "So call it before you draft, even when you're sure you know how to write the piece, and when the draft is done, check it with diagnose_marketing_copy.",
      inputSchema: {
        goal: goalSchema,
        format: formatSchema,
        audience: z.string().min(2).max(600).describe('Who will read it, as specifically as you can put it: their role, their situation and what they already believe.'),
        offer: z.string().min(2).max(600).describe("What you're selling or asking for, and the main promise."),
        awareness_level: awarenessSchema.optional(),
        category: categorySchema.optional(),
        persuasion_mode: modeSchema,
        options_per_question: z.number().int().min(2).max(6).default(4).describe('How many ways to answer each question you want to see. The default is 4.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ goal, format, audience, offer, awareness_level, category, persuasion_mode, options_per_question }) => {
      const cat = resolveCategory(category)
      const awareness = awareness_level ?? 'problem_aware'
      const weight = AWARENESS_WEIGHT[awareness]
      const expected = expectedRoles(goal)
      const reqs = GOAL_REQUIREMENTS[goal]
      const seed = `${goal}|${format}|${audience}|${offer}|${cat ?? ''}`
      const context = `${audience} ${offer}`
      const mode = persuasion_mode
      const used = new Set<string>()
      const piece = FORMAT_LABEL[format].replace(/^an? /, '')
      const lines: string[] = []

      lines.push(`# Copy plan: ${FORMAT_LABEL[format]} that ${GOAL_CLAUSE[goal]}`)
      lines.push(`The reader: ${audience}`)
      lines.push(`The offer: ${offer}`)
      lines.push('')
      lines.push(awareness_level
        ? weight.note
        : `${weight.note} This plan assumes the reader is at that stage, so pass awareness_level if you know otherwise.`)
      if (category && !cat) lines.push(`There isn't enough data on "${category}" to compare against, so this plan skips the category comparison.`)
      lines.push('')
      lines.push(`Every reader is silently asking nine questions. For ${GOAL_NOUN[goal]}, this ${piece} has to answer ${reqs.length === 9 ? 'all nine' : `${NUM[reqs.length]} of them`}, ` +
        'roughly in the order below, and the ones marked as a priority deserve the most words for this reader.')
      lines.push(`Under each question you'll find a few ways to answer it, ranked for this brief in ${mode} mode. Pick the one that fits this reader and this offer best, ` +
        "and make sure at least one of your picks is a less expected move, because that's where the copy stops sounding like everyone else in the category. " +
        'To see real examples of a technique, and when it backfires, call get_persuasion_technique with its ID.')

      const either = reqs.filter((req) => req.length > 1)
      for (const role of ROLE_NAMES) {
        if (!expected.has(role)) continue
        const info = ROLES[role]
        const alt = either.find((req) => req.includes(role))
        lines.push('')
        lines.push(`## ${info.num}. ${info.question} (${role})`)
        let body = `Leave it unanswered and this is what happens: "${info.ifMissing}"`
        if (weight.heavy.includes(role)) body += ' This is a priority for this reader, so give it more words than most.'
        if (alt) body += ` You can answer this one or ${joinList(alt.filter((r) => r !== role).map((r) => `"${ROLES[r].question}"`), 'or')}, and one of them is enough.`
        lines.push(body)
        const picks = pickMoves(role, { n: options_per_question, format, category: cat, seed, context, mode, exclude: used })
        for (const p of picks) {
          used.add(p.t.slug)
          lines.push(techniqueLine(p.t, { category: cat, kind: p.kind === 'established' ? 'established' : 'less expected', example: false }))
        }
      }

      const optional = ROLE_NAMES.filter((r) => !expected.has(r))
      if (optional.length) {
        lines.push('')
        lines.push('## The other questions')
        lines.push(`${cap(GOAL_NOUN[goal])} doesn't strictly need these, but one well-placed line can still help.`)
        for (const role of optional) {
          const [p] = pickMoves(role, { n: 1, format, category: cat, seed, context, mode, exclude: used })
          lines.push(`- ${roleLabel(role)}${p ? ` One way in is **${p.t.name}** (${p.t.pt_id}). ${p.t.url}` : ''}`)
        }
      }

      const checks = COHERENCE_CHECKS.filter((c) => expected.has(c.roles[0]) && expected.has(c.roles[1])).slice(0, 4)
      if (checks.length) {
        lines.push('')
        lines.push('## Make the answers agree')
        lines.push("Readers hold each answer up against the others. When two don't match, they can't always say why, but they feel that something is off, " +
          'and everything else loses weight. Before you finish, ask yourself these questions.')
        for (const c of checks) lines.push(`- ${c.check}`)
      }

      lines.push('')
      lines.push('## Then write it')
      lines.push("Choose one move for each question. The less expected choices are where the copy stops sounding like everyone else, so don't play every one safe, " +
        'and keep every claim true. When the draft is done, label each line with the question it answers and run diagnose_marketing_copy before you show it to anyone.')
      return text(lines.join('\n'))
    },
  )
}

export type { Role }
