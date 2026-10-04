import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ROLES, type Role } from '../roles.js'
import { roleSchema } from '../schemas.js'
import { text, errorText } from '../format.js'
import { sampleSizePerArm, compare, srmPValue } from '../stats.js'
import { joinList, plural } from '../voice.js'

const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`
const points = (v: number) => `${(v * 100).toFixed(2)}`
const fmt = (n: number) => n.toLocaleString('en-US')
const pValue = (p: number) => (p < 0.0001 ? 'below 0.0001' : p.toFixed(4))

export function registerTestingTools(server: McpServer) {
  server.registerTool(
    'plan_ab_test',
    {
      title: 'Plan an A/B test',
      description:
        'Plan an A/B test for marketing copy. Give it the current conversion rate, the smallest lift worth detecting and the daily traffic, ' +
        'and it tells you how many visitors each version needs and how many days to run. It also frames the test as two different answers to the same reader question, ' +
        'so the result teaches you something you can reuse, and not just that "B won". ' +
        'Use it when someone asks how long to run a test, how much traffic they need, whether a test is worth running, or what to test next.',
      inputSchema: {
        baseline_conversion_rate_percent: z.number().positive().lt(100).describe('The current conversion rate, in percent, so 3 means 3% and 0.8 means 0.8%.'),
        minimum_detectable_lift_percent: z.number().positive().max(500).describe('The smallest relative lift worth detecting, in percent. 20 means a 20% lift, like going from 3% to 3.6%.'),
        daily_visitors: z.number().positive().describe('How many visitors a day enter the test, across all versions.'),
        versions: z.number().int().min(2).max(6).default(2).describe('How many versions, counting the original.'),
        confidence: z.number().min(0.8).max(0.999).default(0.95),
        power: z.number().min(0.5).max(0.99).default(0.8),
        question: roleSchema.optional().describe('The reader question both versions answer, each in its own way.'),
        version_a: z.string().max(600).optional().describe('How version A answers it.'),
        version_b: z.string().max(600).optional().describe('How version B answers it.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async (a) => {
      const base = a.baseline_conversion_rate_percent / 100
      const lift = a.minimum_detectable_lift_percent / 100
      if (base * (1 + lift) >= 1) return errorText('That lift would push the conversion rate past 100%, so use a smaller lift.')
      const comparisons = a.versions - 1
      const alpha = (1 - a.confidence) / comparisons
      const perArm = sampleSizePerArm(base, lift, alpha, a.power)
      const total = perArm * a.versions
      const days = Math.ceil(total / a.daily_visitors)
      const weeks = Math.max(1, Math.ceil(days / 7))

      const out: string[] = []
      out.push(`# A/B test plan for ${a.versions} versions`)
      out.push(`To detect a ${pct(lift, 0)} lift on a ${pct(base)} conversion rate, which means going from ${pct(base)} to ${pct(base * (1 + lift))}, ` +
        `at ${pct(a.confidence, 0)} confidence and ${pct(a.power, 0)} power${comparisons > 1 ? `, corrected for ${comparisons} comparisons` : ''}, ` +
        `you need ${fmt(perArm)} visitors for each version, or ${fmt(total)} in total.`)
      out.push(`At ${fmt(a.daily_visitors)} visitors a day, that takes about ${plural(days, 'day')}. Run it in whole weeks, so ${plural(weeks, 'week')}, ` +
        'and weekdays and weekends both get counted.')
      out.push(`Expect about ${fmt(Math.round(perArm * base))} conversions for each version. Decide now when you'll stop, and don't stop early because one day looks good.`)
      if (days > 56) {
        out.push('')
        out.push('That is more than eight weeks, which is a long time to wait, and you have three ways to shorten it. You can test a bigger difference, meaning two genuinely different answers ' +
          'to a reader question instead of a change in wording. You can test a step with more traffic, like clicks instead of purchases. ' +
          `Or you can accept that you'll only catch a bigger lift, since a ${pct(Math.min(lift * 2, 4), 0)} lift needs roughly a quarter of the traffic.`)
      }
      out.push('')
      out.push('## Make the test teach you something')
      if (a.question) {
        const r = a.question as Role
        out.push(`Your hypothesis is that for this audience, ${a.version_b ? `"${a.version_b}"` : 'version B'} is a better answer to "${ROLES[r].question}" than ${a.version_a ? `"${a.version_a}"` : 'version A'}. ` +
          'Change only that answer between the versions. Whichever wins tells you something about these readers that carries over to your next ad, page and email.')
      } else {
        out.push('Pick one reader question and test two different answers to it, like proof by demonstration against proof by testimonial, and keep everything else the same. ' +
          `"Version B won" teaches you nothing. "For these buyers, a demonstration answers '${ROLES.PROVE.question}' better than a testimonial" carries over to everything you write next.`)
      }
      out.push('When the test is done, read the result with read_ab_test_result.')
      return text(out.join('\n'))
    },
  )

  server.registerTool(
    'read_ab_test_result',
    {
      title: 'Read an A/B test result',
      description:
        "Read the result of an A/B test. You get each version's conversion rate and lift, whether the difference is statistically significant, the confidence interval, " +
        'and the chance each version really beats the original. It also warns you about the things that make a test result lie. Those include too few conversions, ' +
        "traffic that didn't split the way it should (a sample ratio mismatch), stopping the moment it looked good, and testing too many versions at once. " +
        "So use it whenever someone shares test numbers, or asks \"did my test win?\", \"is this significant?\", \"which version won?\" or \"should I keep it running?\"",
      inputSchema: {
        versions: z.array(z.object({
          name: z.string().min(1).max(120),
          visitors: z.number().int().positive(),
          conversions: z.number().int().min(0),
        })).min(2).max(6).describe('Each version with its visitors and conversions. Put the original, the control, first.'),
        intended_split: z.array(z.number().positive()).optional().describe('How you meant to split the traffic, like [50, 50]. The default is an even split.'),
        confidence: z.number().min(0.8).max(0.999).default(0.95),
        question: roleSchema.optional().describe('The reader question the versions answered in different ways.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ versions, intended_split, confidence, question }) => {
      if (versions.some((v) => v.conversions > v.visitors)) return errorText('One of the versions has more conversions than visitors, so check the numbers.')
      if (intended_split && intended_split.length !== versions.length) return errorText('intended_split needs one share for each version.')
      const [ctrl, ...rest] = versions
      const comparisons = rest.length
      const alpha = (1 - confidence) / comparisons
      const out: string[] = []
      out.push(`# A/B test result for ${versions.length} versions, with "${ctrl.name}" as the original`)
      out.push(`"${ctrl.name}" converted ${fmt(ctrl.conversions)} of ${fmt(ctrl.visitors)} visitors, or ${pct(ctrl.conversions / ctrl.visitors)}.`)
      let anyWinner = false
      for (const v of rest) {
        const c = compare(ctrl.conversions, ctrl.visitors, v.conversions, v.visitors, alpha)
        const sig = c.p < alpha
        if (sig && c.diff > 0) anyWinner = true
        const verdict = sig
          ? (c.diff > 0 ? "That's a statistically significant win." : "That's a statistically significant loss.")
          : "That difference isn't statistically significant yet."
        out.push('')
        out.push(`"${v.name}" converted ${fmt(v.conversions)} of ${fmt(v.visitors)}, or ${pct(c.rateB)}, which is a ${pct(Math.abs(c.relLift), 1)} ${c.relLift >= 0 ? 'lift' : 'drop'}. ${verdict} ` +
          `The p-value is ${pValue(c.p)}${comparisons > 1 ? `, against a threshold of ${alpha.toFixed(4)} after correcting for ${comparisons} comparisons` : ''}. ` +
          `At ${pct(confidence, 0)} confidence${comparisons > 1 ? ' (corrected)' : ''}, the true difference sits somewhere between ${points(c.ciLow)} and ${points(c.ciHigh)} percentage points, ` +
          `and the chance it really beats the original is ${pct(c.probBBetter, 0)}.`)
      }

      const warnings: string[] = []
      const shares = intended_split ?? versions.map(() => 1)
      const srm = srmPValue(versions.map((v) => v.visitors), shares)
      if (srm < 0.001) {
        warnings.push(`The traffic didn't split the way you intended, which is called a sample ratio mismatch (p-value ${pValue(srm)}). ` +
          "It means something in the assignment or the tracking is broken, so don't trust this result until you find it.")
      }
      const lowConv = versions.filter((v) => v.conversions < 30)
      if (lowConv.length) {
        warnings.push(`${joinList(lowConv.map((v) => `"${v.name}"`))} ${lowConv.length === 1 ? 'has' : 'have'} fewer than 30 conversions. ` +
          'Results that small swing wildly, so keep the test running to the sample you planned.')
      }
      if (anyWinner) warnings.push("Big lifts from small tests usually shrink once you roll them out. It's called the winner's curse, so expect less than the lift you measured.")
      warnings.push('And if you checked the results over and over and stopped when they looked good, the p-value overstates how sure you can be. Stop at the sample size you planned with plan_ab_test.')
      out.push('')
      out.push('## Before you act')
      out.push(warnings.join(' '))

      out.push('')
      out.push('## What you learned')
      if (question) {
        const r = question as Role
        out.push(anyWinner
          ? `Write it down. For this audience, the winning answer to "${ROLES[r].question}" beat the original. Use it in your next ad, page and email, and test a new challenger against it.`
          : `These versions answer "${ROLES[r].question}" in different ways, and so far there's no reliable difference between them. Either both answers work about equally well for this audience, ` +
            'or the test needs more traffic. Next time, try an answer that is more different.')
      } else {
        out.push('Name the reader question the versions answered differently, and the technique each one used. That turns this result into a rule you can reuse, instead of a one-off winner.')
      }
      out.push('To find your next challenger, use find_persuasion_techniques.')
      return text(out.join('\n'))
    },
  )
}
