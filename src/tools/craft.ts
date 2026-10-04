import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { awarenessSchema, roleSchema } from '../schemas.js'
import { text } from '../format.js'
import { type Role } from '../roles.js'
import { scoreClaims } from '../scorers/claim-framework.js'
import { detectAISmell } from '../scorers/hook-framework.js'
import { SLOTS, SLOT_INFO, checkHook, compareHooks, describeCheck, questionsNeeded, article, VERDICT_LABEL, EVIDENCE_SOURCE, type HookCheck } from '../hookcheck/index.js'
import { claimGateSentence, smellSentences, joinList, plural, endSentence } from '../voice.js'

/** Unproven superlatives the claim scorer can read as "specific" (e.g. "#1"). */
const SUPERLATIVE = /(#\s?1\b|\bnumber one\b|\bthe best\b|\bbest[- ]in[- ]class\b|\bleading\b|\bworld'?s (best|first|most)\b|\btop[- ]rated\b|\bunmatched\b|\brevolutionary\b|\bgame[- ]chang)/i
const BACKED = /\b(according to|rated by|ranked by|verified|audited|source:|by g2|by capterra|survey|study|since \d{4}|\d[\d,.]*\s?(%|customers|users|reviews|stars))/i

const RATING: Record<string, string> = { fail: 'fails', weak: 'is weak', passable: 'is passable', strong: 'is strong', excellent: 'is excellent' }

const briefSchema = z.object({
  brand: z.string().max(200).optional().describe('The brand or product name.'),
  product: z.string().max(400).optional().describe("What you're selling."),
  offer: z.string().max(400).optional().describe('The deal or the ask, like the price, a discount, a trial or a deadline.'),
  audience: z.string().max(400).optional().describe('Who reads it: their role, their situation and what is theirs.'),
  proof: z.string().max(400).optional().describe('Real proof you can point to, like customer counts, results or names.'),
}).describe('The brief. The swap test needs it to tell whether a competitor could send the line unchanged, and without it no line can pass.')

export function registerCraftTools(server: McpServer) {
  server.registerTool(
    'check_headlines',
    {
      title: 'Check and compare headlines, hooks, and subject lines',
      description:
        'Check headlines, email subject lines, ad openings, video hooks, social post openings and first lines, and compare options against each other. ' +
        'For each line it tells you whether the line does its job in that spot, meaning which of the nine reader questions it answers, and whether a competitor could send it unchanged. ' +
        'It also shows exactly what a reader sees before the cutoff, flags anything that fails outright, and brings in evidence from thousands of real headline tests. ' +
        'Then it tells you what each option is betting on and which two to test. Before you call it, list the reader questions each line answers and quote the exact words doing the work. ' +
        'Use it whenever you write headlines, hooks or subject lines, whenever you have to choose between them, and whenever someone asks "which one is best?" ' +
        "You won't get a score out of ten. Nobody can predict a winner from the words alone, and that includes this tool.",
      inputSchema: {
        slot: z.enum(SLOTS).describe(`Where the lines will appear: ${SLOTS.join(', ')}. Each spot has its own job, and the check tells you what it is.`),
        lines: z.array(z.object({
          text: z.string().min(2).max(500).describe('The line, exactly as written.'),
          answers: z.array(z.object({
            question: roleSchema,
            words: z.string().min(1).max(200).describe('The exact words in the line that answer it.'),
          })).max(9).describe('The reader questions this line answers, each with the exact words that do it. Leave it empty if the line answers none.'),
        })).min(1).max(20),
        brief: briefSchema.optional(),
        follows: z.string().max(600).optional().describe('What the reader saw just before this line, like the ad before a landing page headline, or the headline or subject before a first line.'),
        awareness_level: awarenessSchema.optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ slot, lines, brief, follows, awareness_level }) => {
      const info = SLOT_INFO[slot]
      const names = lines.map((_, i) => (lines.length > 1 ? String.fromCharCode(65 + i) : 'This line'))
      const checks: HookCheck[] = lines.map((l) => checkHook({
        text: l.text, slot, brief, follows, awareness: awareness_level,
        answers: l.answers.map((a) => ({ question: a.question as Role, words: a.words })),
      }))
      const out: string[] = []
      out.push(`# ${lines.length > 1 ? `${lines.length} ${info.label}s` : `One ${info.label}`}, checked`)
      out.push(`The job of ${article(info.label)} is to ${info.job}. ${endSentence(`To do that, it has to answer ${questionsNeeded(checks[0].needs)}`)}` +
        `${info.visibleNote ? ` Keep in mind that ${info.visibleNote}.` : ''}`)
      if (lines.length > 1) { out.push(''); out.push('## Which to use'); out.push(compareHooks(checks, names)) }
      checks.forEach((c, i) => {
        out.push('')
        out.push(`## ${lines.length > 1 ? `${names[i]}. ` : ''}"${c.text}" ${VERDICT_LABEL[c.verdict]}`)
        const parts = [describeCheck(c)]
        if (c.visible && c.visible !== c.text && !c.warnings.some((w) => w.includes(c.visible!))) parts.push(`What readers actually see is "${c.visible}".`)
        if (c.unverified.length) {
          parts.push(`${c.unverified.length === 1 ? "One label didn't" : "Some labels didn't"} count, because the quoted words aren't in the line: ` +
            `${joinList(c.unverified.map((a) => `"${a.words}" for ${a.question}`))}.`)
        }
        out.push(parts.join(' '))
        out.push(c.fix.startsWith('Nothing') ? c.fix : `Here's the fix. ${c.fix}`)
      })
      out.push('')
      if (checks.some((c) => c.evidence.length)) out.push(EVIDENCE_SOURCE)
      out.push('Nobody can pick the winner from the words alone, and that includes this check. To find out, test two lines that make different bets, and size the test with plan_ab_test.')
      return text(out.join('\n'))
    },
  )

  server.registerTool(
    'check_marketing_claims',
    {
      title: 'Check marketing claims and CTAs',
      description:
        'Check whether marketing claims and calls to action are specific enough to believe. It catches the vague superlative, like "the best" or "#1", that readers discount on sight. ' +
        'It catches promises with no proof behind them and results with no mechanism, and it flags the generic buttons everyone uses, like "Learn more" and "Get started". ' +
        'Then it tells you how to fix each one. Use it when you write or review claims like "results in days", "trusted by thousands" or "the #1 tool", and for any button text. ' +
        'For headlines, check_headlines does the full job.',
      inputSchema: {
        claims: z.array(z.object({
          text: z.string().min(2).max(600).describe('The claim or the button text, exactly as written.'),
          type: z.enum(['headline', 'cta', 'body_claim']).describe('Use headline, cta for a button or call to action, or body_claim for a claim inside the copy.'),
          context: z.string().max(1500).optional().describe('For a claim in the body, the paragraph around it, so a mechanism named nearby still counts.'),
        })).min(1).max(30),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ claims }) => {
      const out = [`# ${plural(claims.length, 'claim')}, checked`]
      // Headline claims go through the hook check's facts; the old headline scorer did not predict winners.
      const others = claims.filter((c) => c.type !== 'headline')
      const scored = scoreClaims(others.map((c) => ({ text: c.text, type: c.type, context: c.context })))
      let k = 0
      for (const c of claims) {
        out.push('')
        if (c.type === 'headline') {
          const h = checkHook({ text: c.text, slot: 'landing_page_headline', answers: [] })
          const issues = [...h.hardFails, ...h.warnings, ...h.evidenceAgainst]
          out.push(`**"${c.text}"** (a headline). ${issues.length ? issues.join(' ') : 'The claim itself has no problems.'} ` +
            'To find out whether it does its job, and whether a competitor could send it, run check_headlines with the brief.')
          continue
        }
        const r = scored[k++]
        const type = c.type === 'cta' ? 'cta' : 'body_claim'
        const notes: string[] = []
        const stock = r.gates.some((g) => g.name === 'generic_button_text' && g.status === 'fail')
        if (SUPERLATIVE.test(c.text) && !BACKED.test(c.text)) {
          notes.push('It leans on an unproven superlative. Claims like "#1", "the best" and "leading" read as puffery unless the proof is in the same line, ' +
            'meaning who ranked it and by what measure, so name the source or swap it for a specific fact a reader could check.')
        }
        // A stock button gets one sentence about naming what the reader gets, not two.
        for (const g of r.gates.filter((g) => g.status !== 'pass' && !(stock && g.name === 'first_person_or_outcome')).slice(0, 3)) {
          const s = g.name === 'anti_smell' ? smellSentences(detectAISmell(c.text).violations).join(' ') : claimGateSentence(g.name, c.text, type)
          if (s) notes.push(s)
        }
        const label = r.scoreLabel
        const lead = `**"${r.text}"** (${type === 'cta' ? 'a button' : 'a claim in the body'}) ${RATING[label] ?? label}.`
        const bridge = notes.length && (label === 'strong' || label === 'excellent') ? (notes.length === 1 ? ' One thing would make it stronger.' : ' A few things would make it stronger.') : ''
        out.push(`${lead}${bridge} ${notes.length ? notes.join(' ') : 'Nothing in it needs fixing.'}`)
      }
      out.push('')
      out.push("A claim persuades when it's specific, it's true and the proof sits right next to it. For ways to prove a claim, search find_persuasion_techniques with the question set to PROVE.")
      return text(out.join('\n'))
    },
  )
}
