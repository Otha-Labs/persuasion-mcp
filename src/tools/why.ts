import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ROLES, SYMPTOMS, SYMPTOM_MAP, roleLabel, type Role } from '../roles.js'
import { pickMoves, resolveCategory } from '../data.js'
import { formatSchema, categorySchema, modeSchema } from '../schemas.js'
import { text, techniqueLine } from '../format.js'

export function registerWhyTool(server: McpServer) {
  server.registerTool(
    'explain_why_not_converting',
    {
      title: 'Explain why marketing is not converting',
      description:
        "Work out why an ad, a landing page, an email or a whole funnel isn't converting. Start from what you can see. " +
        "Maybe people don't click (a low CTR), or they click and bounce, or they read and don't buy. Maybe they abandon the checkout or the form, the leads never buy, " +
        "customers buy once and leave, or emails don't get opened or get opened and nobody clicks. " +
        "Whatever the symptom, you get back the reader questions most likely going unanswered, what to check in the copy first, and the problems copy can't fix that you should rule out, " +
        'along with techniques to try and the test that would confirm the diagnosis. ' +
        "So use it whenever someone says their marketing \"isn't working\", \"isn't converting\" or \"isn't selling\", or asks why results dropped.",
      inputSchema: {
        symptom: z.enum(SYMPTOMS).describe(
          'What you can see happening. Use low_click_through when people see it and don\'t click, high_bounce when they click and leave fast, reads_but_no_action when they read and don\'t convert, ' +
          'starts_but_abandons when they abandon the checkout or form, leads_dont_buy when signups never buy, buys_once_no_return for refunds, churn and no repeat orders, ' +
          'low_open_rate when emails don\'t get opened, and opens_no_clicks when they get opened but not clicked.',
        ),
        format: formatSchema.optional(),
        details: z.string().max(2000).optional().describe('Anything you know: the numbers, what changed recently, the offer and the audience.'),
        category: categorySchema.optional(),
        persuasion_mode: modeSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ symptom, format, details, category, persuasion_mode }) => {
      const info = SYMPTOM_MAP[symptom]
      const cat = resolveCategory(category)
      const out: string[] = []
      out.push(`# Why it isn't converting: ${info.label}`)
      if (details) out.push(`The situation: ${details}`)
      out.push('')
      out.push(`Before you touch the copy, rule out the things copy can't fix. ${info.ruleOutFirst}`)
      out.push('')
      out.push('If those check out, the problem is most likely a question the copy leaves unanswered. Here are the suspects, most likely first.')
      info.suspects.forEach((s, i) => {
        out.push('')
        if (s.role === 'COHERENCE') {
          out.push(`## ${i + 1}. The answers don't agree with each other`)
          out.push(`${s.why} ${s.check}`)
          return
        }
        const role = s.role as Role
        out.push(`## ${i + 1}. ${roleLabel(role)}`)
        out.push(`Leave it unanswered and this is what happens: "${ROLES[role].ifMissing}" ${s.why} ${s.check}`)
        if (i < 2) {
          out.push('Here are two ways to answer it.')
          for (const p of pickMoves(role, { n: 2, format: format ?? null, category: cat, seed: `${symptom}|${details ?? ''}`, context: `${info.label} ${s.check} ${details ?? ''}`, mode: persuasion_mode })) {
            out.push(techniqueLine(p.t, { category: cat, kind: p.kind === 'established' ? 'established' : 'less expected', example: false }))
          }
        }
      })
      const top = info.suspects.find((s) => s.role !== 'COHERENCE')
      out.push('')
      out.push('## Confirm it with a test')
      out.push(top
        ? `Keep everything else the same and test two versions that answer "${ROLES[top.role as Role].question}" in different ways, for example the established move above against the less expected one. ` +
          'If this was the gap, the version that answers it better will move the number. Size the test with plan_ab_test.'
        : 'Fix the mismatch on one side only and test it against the current version. Size the test with plan_ab_test.')
      out.push('If you have the copy itself, label each line and run diagnose_marketing_copy for a line-by-line read.')
      return text(out.join('\n'))
    },
  )
}
