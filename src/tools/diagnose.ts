import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ROLE_NAMES, ROLES, GOAL_REQUIREMENTS, GOAL_NOUN, GOAL_CLAUSE, FORMAT_LABEL, COHERENCE_CHECKS, expectedRoles, roleLabel, type Role, type Format, type Awareness } from '../roles.js'
import { pickMoves, resolveCategory } from '../data.js'
import { goalSchema, formatSchema, awarenessSchema, categorySchema, roleSchema, modeSchema } from '../schemas.js'
import { text, techniqueLine } from '../format.js'
import { scoreFlow, type FlowContext } from '../scorers/flow-framework.js'
import { checkHook, describeCheck, VERDICT_LABEL, type Slot } from '../hookcheck/index.js'
import { flowGateSentence, joinList, plural } from '../voice.js'

export const OPENING_SLOT: Record<Format, Slot> = {
  ad: 'ad_opening', landing_page: 'landing_page_headline', sales_letter: 'sales_letter_headline', email: 'first_line',
  email_subject: 'email_subject', social_post: 'social_post_open', video_script: 'video_hook', headline: 'landing_page_headline',
}

/** Long-form pages: score the prose, not the scaffolding. Headings, buttons, placeholders and
 *  short label lines otherwise count as sentences and wreck the rhythm checks. */
function proseOnly(copy: string, format: Format): { prose: string; skipped: number } {
  if (format !== 'landing_page' && format !== 'sales_letter') return { prose: copy, skipped: 0 }
  let skipped = 0
  const kept = copy.split('\n').filter((raw) => {
    const l = raw.trim()
    if (!l) return true
    const words = l.replace(/[*_#>\-\[\]()]/g, ' ').trim().split(/\s+/).filter(Boolean).length
    const scaffold = /^#{1,6}\s/.test(l) || /^-{3,}$/.test(l) || /^\[.*\]$/.test(l) || /^\*\*\[.*\]\*\*$/.test(l) ||
      (words <= 6 && !/[.!]$/.test(l.replace(/\*+$/, '')))
    if (scaffold) skipped++
    return !scaffold
  }).map((l) => l.replace(/^\s*[-*>]\s+/, '').replace(/\*\*/g, ''))
  const prose = kept.join('\n')
  return prose.trim().split(/\s+/).length >= 60 ? { prose, skipped } : { prose: copy, skipped: 0 }
}

function flowContext(format: Format, words: number): FlowContext {
  switch (format) {
    case 'ad': case 'social_post': return 'ad'
    case 'email': return 'email'
    case 'email_subject': return 'subject'
    case 'headline': return 'header'
    case 'sales_letter': return 'long_form'
    default: return words > 1500 ? 'long_form' : 'body'
  }
}

const normText = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()

type Status = 'clear' | 'partial' | 'missing'
const STATUS_RANK: Record<Status, number> = { missing: 0, partial: 1, clear: 2 }

export function registerDiagnoseTool(server: McpServer) {
  server.registerTool(
    'diagnose_marketing_copy',
    {
      title: 'Diagnose marketing copy (roast / review)',
      description:
        "Review, critique or roast any piece of marketing copy, whether it's an ad, a landing page, an email, a sales page, a social post or a script, and find out why it might not persuade. " +
        'Before you call it, read the copy and label each line with the one reader question it mainly answers, quoting the words exactly. Those labels go in the moves array. ' +
        'You get back which of the nine questions the copy answers for its goal, which it answers weakly and which it skips, along with the biggest gap and what readers do when it is missing. ' +
        'It also checks the order, whether the answers agree with each other, and the craft, pointing to the exact words that read as machine-written, like em dashes, ' +
        '"it\'s not X, it\'s Y" lines and sentences that all run the same length. Then it checks the opening line and suggests techniques from the catalog to fill the gap. ' +
        "Use it before you show anyone a draft you wrote, and whenever someone asks \"is this good?\", \"roast this\", \"what's wrong with this copy?\" or \"how do I make it better?\"",
      inputSchema: {
        copy: z.string().min(10).max(30000).describe('The full copy, exactly as written.'),
        goal: goalSchema,
        format: formatSchema,
        moves: z.array(z.object({
          excerpt: z.string().min(2).max(400).describe('An exact quote from the copy, whether a sentence, a line or a short passage.'),
          question: roleSchema,
          clarity: z.enum(['clear', 'partial']).default('clear').describe('Use clear when the line answers the question well, and partial when it only gestures at it.'),
        })).min(1).max(80).describe('Your line-by-line labels. Quote each persuasive line exactly and name the one reader question it mainly answers. Skip lines that are pure filler.'),
        awareness_level: awarenessSchema.optional(),
        category: categorySchema.optional(),
        headline: z.string().max(300).optional().describe("The headline or opening line, if it isn't the first line of the copy."),
        persuasion_mode: modeSchema,
        brief: z.object({
          brand: z.string().max(200).optional(),
          product: z.string().max(400).optional(),
          offer: z.string().max(400).optional(),
          audience: z.string().max(400).optional(),
          proof: z.string().max(400).optional(),
        }).optional().describe('The brief, if you have it: the brand, product, offer, audience and proof. With it, the opening line gets the swap test, which asks whether a competitor could send it unchanged.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ copy, goal, format, moves, awareness_level, category, headline, persuasion_mode, brief }) => {
      const cat = resolveCategory(category)
      const expected = expectedRoles(goal)
      const normCopy = normText(copy)
      const goalNoun = GOAL_NOUN[goal]

      // where each labeled move sits in the copy (falls back to the order given)
      let unmatched = 0
      const placed = moves.map((m, i) => {
        const ex = normText(m.excerpt)
        let pos = normCopy.indexOf(ex)
        if (pos < 0 && ex.length > 40) pos = normCopy.indexOf(ex.slice(0, 40))
        if (pos < 0) unmatched++
        return { ...m, question: m.question as Role, pos: pos < 0 ? Number.MAX_SAFE_INTEGER - (moves.length - i) : pos }
      })
      const ordered = unmatched > moves.length / 2 ? placed : [...placed].sort((a, b) => a.pos - b.pos)

      const status = new Map<Role, Status>()
      const count = new Map<Role, number>()
      for (const r of ROLE_NAMES) { status.set(r, 'missing'); count.set(r, 0) }
      for (const m of placed) {
        count.set(m.question, (count.get(m.question) ?? 0) + 1)
        const s: Status = m.clarity === 'clear' ? 'clear' : 'partial'
        if (STATUS_RANK[s] > STATUS_RANK[status.get(m.question)!]) status.set(m.question, s)
      }

      const reqs = GOAL_REQUIREMENTS[goal]
      const reqStatus = reqs.map((req) => req.reduce<Status>((best, r) => (STATUS_RANK[status.get(r)!] > STATUS_RANK[best] ? status.get(r)! : best), 'missing'))
      const clearN = reqStatus.filter((s) => s === 'clear').length
      const partialN = reqStatus.filter((s) => s === 'partial').length

      const out: string[] = []
      out.push(`# Diagnosis: ${FORMAT_LABEL[format]} that ${GOAL_CLAUSE[goal]}`)
      out.push(`It clearly answers ${clearN} of the ${reqs.length} questions ${goalNoun} needs${partialN ? `, and ${partialN} more only weakly` : ''}. ` +
        "That tells you what the copy covers. It can't tell you how the copy will convert, and only a test can.")
      if (unmatched) {
        out.push(`${unmatched} of the ${plural(moves.length, 'line')} you labeled ${unmatched === 1 ? "doesn't" : "don't"} appear word for word in the copy` +
          `${unmatched > moves.length / 2 ? ', so the order checks follow the order you gave them' : ''}. Quote the copy exactly and the read gets sharper.`)
      }

      out.push('')
      out.push('## The nine questions')
      for (const r of ROLE_NAMES) {
        const s = status.get(r)!
        const n = count.get(r)!
        const lines = n ? `, in ${plural(n, 'line')}` : ''
        let label: string
        if (expected.has(r)) label = { clear: `Answered clearly${lines}`, partial: `Answered, but only weakly${lines}`, missing: 'Not answered' }[s]
        else label = s === 'missing' ? `Not needed for ${goalNoun}` : `${s === 'clear' ? 'Answered clearly' : 'Answered weakly'}${lines}, though ${goalNoun} can do without it`
        out.push(`${ROLES[r].num}. ${ROLES[r].question} (${r}) ${label}.`)
      }

      // biggest gap: first unmet requirement in canonical order; else first partial; else upgrade
      const idxMissing = reqStatus.findIndex((s) => s === 'missing')
      const idxPartial = reqStatus.findIndex((s) => s === 'partial')
      let gapRole: Role
      let mode: 'fix' | 'strengthen' | 'upgrade'
      if (idxMissing >= 0) { gapRole = reqs[idxMissing][0]; mode = 'fix' }
      else if (idxPartial >= 0) { gapRole = reqs[idxPartial][0]; mode = 'strengthen' }
      else {
        gapRole = [...expected].sort((a, b) => (count.get(a)! - count.get(b)!) || ROLES[a].num - ROLES[b].num)[0]
        mode = 'upgrade'
      }
      const gi = ROLES[gapRole]
      out.push('')
      if (mode === 'upgrade') {
        out.push('## Every question it needs is answered')
        out.push(`The thinnest answer is ${roleLabel(gapRole)}. Deepen it with a less expected move and the copy stops reading like the category default. Here are three ways to do it.`)
      } else {
        const alt = reqs[mode === 'fix' ? idxMissing : idxPartial].slice(1)
        out.push(`## ${mode === 'fix' ? 'The biggest gap' : 'The weakest answer'}: ${roleLabel(gapRole)}`)
        out.push(`${mode === 'strengthen' ? "It's answered, but only weakly. " : ''}Leave it unanswered and this is what happens: "${gi.ifMissing}" Right now, ${gi.gap}.` +
          `${alt.length ? ` Answering ${joinList(alt.map((r) => `"${ROLES[r].question}"`), 'or')} would also do.` : ''} Here are three ways to answer it.`)
      }
      for (const p of pickMoves(gapRole, { n: 3, format, category: cat, seed: copy.slice(0, 500), context: copy.slice(0, 4000), mode: persuasion_mode })) {
        out.push(techniqueLine(p.t, { category: cat, kind: p.kind === 'established' ? 'established' : 'less expected' }))
      }

      // order
      const orderNotes: string[] = []
      const first = ordered[0]
      const lateAwareness: Awareness[] = ['product_aware', 'most_aware']
      if (first && !['DISRUPT', 'IDENTIFY'].includes(first.question) && !(awareness_level && lateAwareness.includes(awareness_level))) {
        orderNotes.push(`It opens by answering "${ROLES[first.question].question}" before it has earned attention or shown readers it's for them. ` +
          `Unless they already know the product, open with "${ROLES.DISRUPT.question}" or "${ROLES.IDENTIFY.question}"`)
      }
      if (goal === 'purchase' || goal === 'signup') {
        const firstCompel = ordered.findIndex((m) => m.question === 'COMPEL')
        const firstProve = ordered.findIndex((m) => m.question === 'PROVE')
        if (firstCompel >= 0 && (firstProve < 0 || firstProve > firstCompel)) orderNotes.push('It asks for action before anything has earned belief. Move the proof ahead of the first ask.')
      }
      if (goal === 'purchase') {
        const lastCompel = ordered.map((m) => m.question).lastIndexOf('COMPEL')
        const resolves = ordered.map((m, i) => (m.question === 'RESOLVE' ? i : -1)).filter((i) => i >= 0)
        if (lastCompel >= 0 && resolves.length && resolves.every((i) => i > lastCompel)) {
          orderNotes.push('It handles the objections after the final ask, so readers reach the ask with their doubts still standing, and that is where they leave. Answer the objections before you close.')
        }
      }
      out.push('')
      out.push('## The order')
      out.push(orderNotes.length ? orderNotes.join(' ') : 'The order works for this goal.')

      // coherence
      const present = (r: Role) => status.get(r) !== 'missing'
      const flags: string[] = []
      if (present('ELEVATE') && !present('PROVE')) flags.push("It promises a better life after, but there's no proof, and readers discount any promise they have no reason to believe.")
      if (present('COMPEL') && !present('AGITATE') && !present('ELEVATE')) flags.push("It pushes for action now without showing what's at stake, and urgency without stakes reads as pressure.")
      if (present('DISRUPT') && goal !== 'click' && !present('PROVE') && expected.has('PROVE')) flags.push("The opening makes a bold move that nothing later backs up, and a hook the body can't support reads as bait.")
      const checks = COHERENCE_CHECKS.filter((c) => present(c.roles[0]) && present(c.roles[1])).slice(0, 4)
      out.push('')
      out.push('## Do the answers agree?')
      if (flags.length) out.push(flags.join(' '))
      if (checks.length) {
        out.push(`${flags.length ? 'Beyond that, ask' : 'Nothing contradicts outright, but ask'} yourself these questions before you finish.`)
        for (const c of checks) out.push(`- ${c.check}`)
      }
      if (!flags.length && !checks.length) out.push('Too few questions are answered yet to check them against each other.')

      // craft + AI tells
      const words = copy.trim().split(/\s+/).length
      const { prose, skipped } = proseOnly(copy, format)
      const flow = scoreFlow(prose, { context: flowContext(format, words) })
      out.push('')
      out.push(`## How it reads: ${flow.score.toFixed(1)} out of 10, ${flow.scoreLabel}`)
      if (skipped) out.push(`This scores the prose only, so it skipped ${plural(skipped, 'heading, button, placeholder or label line', 'headings, buttons, placeholders and label lines')}.`)
      const spans = (pattern: string) => flow.violations.filter((v) => v.pattern === pattern && v.span && v.span.length <= 160).map((v) => v.span)
      const failing = [...flow.gates.filter((g) => g.status === 'fail'), ...flow.gates.filter((g) => g.status === 'warn')].slice(0, 6)
      for (const g of failing) {
        let s = flowGateSentence(g)
        if (!s) continue
        if (g.name === 'negative_parallelism_cap') { const sp = spans('negative_parallelism').slice(0, 2); if (sp.length) s += ` Look at ${joinList(sp.map((x) => `"${x}"`))}.` }
        if (g.name === 'closing_recap') { const [sp] = spans('closing_recap'); if (sp) s += ` It starts with "${sp}".` }
        out.push(`- ${s}`)
      }
      if (!failing.length) out.push('The craft is clean, with no machine-written tells.')

      // headline
      const hl = (headline ?? copy.split('\n').map((l) => l.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '')).find((l) => l.length > 0) ?? '').slice(0, 300)
      if (hl) {
        const nh = normText(hl)
        const answers = placed.flatMap((m) => {
          const ne = normText(m.excerpt)
          if (nh.includes(ne)) return [{ question: m.question, words: m.excerpt }]
          if (ne.includes(nh)) return [{ question: m.question, words: hl }]
          return []
        })
        const hc = checkHook({ text: hl, slot: OPENING_SLOT[format], answers, brief, context: copy.replace(hl, ''), awareness: awareness_level })
        out.push('')
        out.push(`## The opening line ${VERDICT_LABEL[hc.verdict]}`)
        out.push(`"${hl}"`)
        out.push(describeCheck(hc, { evidence: false }))
        if (hc.evidence.length) out.push(`${hc.evidence.join(' ')} Those figures come from thousands of real headline tests on news stories, so treat them as a nudge.`)
        out.push(hc.fix.startsWith('Nothing') ? hc.fix : `Here's the fix. ${hc.fix}`)
      }

      const steps = [`Start by ${mode === 'upgrade' ? 'deepening' : 'answering'} "${gi.question}" with one of the moves above.`]
      if (orderNotes.length) steps.push('Then fix the order.')
      if (failing.length) steps.push(`${orderNotes.length ? 'After that, fix' : 'Then fix'} the first problem in how it reads.`)
      steps.push("One pass is usually enough, so only check again if you changed the structure, and don't chase the craft score.")
      out.push('')
      out.push('## What to do next')
      out.push(steps.join(' '))
      out.push('When you want to know what actually converts, test two different answers to the same question, and size the test with plan_ab_test.')
      return text(out.join('\n'))
    },
  )
}
