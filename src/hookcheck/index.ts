/**
 * HOOK CHECK: the replacement for scoreHook (see docs/hook-check.md).
 *
 * Asks three things of an opening line: does it do its job in this slot (which of the nine reader
 * questions it answers), could a competitor send it unchanged (swap test against the brief), and
 * what is it a bet on. Reports hard facts and replicated evidence instead of a 0-10 score.
 *
 * Pure module: no I/O, no AI calls. The calling model supplies the labels (which question the
 * line answers, quoting the words); this code verifies them and does the rest.
 *
 * Every message here is read by a model and echoed to a writer, so each one is a full, plain
 * sentence. The fix logic keys off flags, never off the wording, so the wording can change freely.
 */
import { ROLES, type Role, type Awareness } from '../roles.js'
import { detectAISmell } from '../scorers/hook-framework.js'
import { smellSentences, joinList, endSentence } from '../voice.js'
import { safeSlice } from '../scorers/string-utils.js'

// ── slots (reviewed 2026-10-04) ──────────────────────────────────────────────
export const SLOTS = ['email_subject', 'ad_opening', 'landing_page_headline', 'first_line', 'video_hook', 'social_post_open', 'sales_letter_headline'] as const
export type Slot = (typeof SLOTS)[number]

interface SlotInfo { label: string; job: string; requires: Role[][]; visibleChars?: number; visibleNote?: string; maxWords?: number; spoken?: boolean; headlineLike: boolean }

/** label takes an article ("an email subject line"); job completes "Its job is to ..."; visibleNote completes "Keep in mind that ...". */
export const SLOT_INFO: Record<Slot, SlotInfo> = {
  email_subject: { label: 'email subject line', job: 'earn the open', requires: [['DISRUPT', 'COMPEL'], ['IDENTIFY']], visibleChars: 40, visibleNote: 'only about 40 characters show in a mobile inbox', headlineLike: true },
  ad_opening: { label: 'ad opening', job: 'stop the scroll, flag the right reader and give them a reason to click', requires: [['DISRUPT'], ['IDENTIFY'], ['AGITATE', 'ELEVATE', 'COMPEL']], visibleChars: 125, visibleNote: 'only about 125 characters show before "See more"', headlineLike: true },
  landing_page_headline: { label: 'landing page headline', job: 'promise the outcome to the right reader, carrying on from whatever brought them here', requires: [['ELEVATE', 'AGITATE', 'REFRAME'], ['IDENTIFY']], maxWords: 14, headlineLike: true },
  first_line: { label: 'first line of the body', job: 'pay off the headline and earn the second line', requires: [['DISRUPT', 'IDENTIFY', 'AGITATE', 'REFRAME', 'PROVE', 'ELEVATE', 'BOND']], headlineLike: false },
  video_hook: { label: 'video hook', job: 'stop the scroll in the first three seconds', requires: [['DISRUPT'], ['IDENTIFY']], maxWords: 9, spoken: true, headlineLike: false },
  social_post_open: { label: 'social post opening', job: 'earn the tap on "see more"', requires: [['DISRUPT'], ['IDENTIFY']], visibleChars: 140, visibleNote: 'only about 140 characters show before "see more" on a phone', headlineLike: true },
  sales_letter_headline: { label: 'sales letter headline', job: 'stop the right reader and promise the big idea', requires: [['DISRUPT', 'ELEVATE', 'AGITATE'], ['IDENTIFY']], headlineLike: true },
}

export const article = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`)

function requirements(slot: Slot, awareness?: Awareness): Role[][] {
  const req = SLOT_INFO[slot].requires.map((g) => [...g])
  if (awareness === 'most_aware') for (const g of req) if (g.includes('DISRUPT') && !g.includes('COMPEL')) g.push('COMPEL') // the offer is the hook
  return req
}

/** What a set of requirement groups asks for, in words: '"A?" and "B?", plus one of "C?", "D?" or "E?"' */
export function questionsNeeded(groups: Role[][]): string {
  const q = (r: Role) => `"${ROLES[r].question}"`
  const singles = groups.filter((g) => g.length === 1).map((g) => q(g[0]))
  const choices = groups.filter((g) => g.length > 1).map((g) => `${g.length === 2 ? 'either' : 'one of'} ${joinList(g.map(q), 'or')}`)
  if (!singles.length) return joinList(choices)
  return choices.length ? `${joinList(singles)}, plus ${joinList(choices)}` : joinList(singles)
}

// ── evidence: traits that replicated in all three Upworthy splits (data/trait-evidence.json) ──
const EVIDENCE_SOURCE = 'The evidence comes from the Upworthy Research Archive, thousands of real headline tests run on news stories between 2013 and 2015, ' +
  'each one measuring clicks with the image held the same. The effects are small, and they come from news headlines and not ads, so treat them as a nudge and never as a verdict.'
const TRAIT_EVIDENCE: { name: string; test: (s: string) => boolean; text: string; good: boolean }[] = [
  { name: 'question', test: (s) => s.includes('?'), text: 'Headlines phrased as a question won only 39% of 4,217 real head-to-head tests, so consider saying it as a statement.', good: false },
  { name: 'exclamation', test: (s) => s.includes('!'), text: 'Headlines with an exclamation mark won only 40% of 761 tests.', good: false },
  { name: 'emphasis_caps', test: (s) => /\b[A-Z]{3,}\b|\*\w+\*/.test(s), text: 'Headlines with a word in CAPS or *emphasis* won only 42% of 1,776 tests.', good: false },
  { name: 'number', test: (s) => /\d/.test(s.replace(/#\s?1\b|\bno\.?\s?1\b/gi, '')), text: 'Headlines with a number in them won 54% of 3,316 tests.', good: true },
  { name: 'this_these', test: (s) => /\b(this|these|here's|here is)\b/i.test(s), text: 'Headlines that point at something with "this", "these" or "here\'s" won 56% of 5,522 tests.', good: true },
  { name: 'time_word', test: (s) => /\b(day|days|week|weeks|month|months|year|years|minute|minutes|hour|hours|today)\b/i.test(s), text: 'Headlines with a time word, like "days" or "today", won 54% of 2,158 tests.', good: true },
]

// ── text helpers ─────────────────────────────────────────────────────────────
const STOP = new Set('a an the and or of to in on for with by is are be as at it its from their they them who will was were has have had his her he she we i me so if but not no do does did just about into than up out off over can all one my our your you yours this that these those what when why how there here'.split(' '))
/** Marketing-generic words: never count as "only you could say this". */
const GENERIC = new Set(('sale sales deal deals offer offers discount discounts save saving savings percent best great good amazing awesome incredible new now today tonight ' +
  'free shop buy get order product products service services solution solutions platform tool tools app quality premium easy simple fast quick ' +
  'year years day days week weeks month months time limited exclusive biggest ultimate everything more miss dont don black friday cyber monday holiday season special big huge top ' +
  'number help helps make makes need want find start try learn discover join click link finally really actually only every everyone people customer customers ' +
  'business businesses company team teams work life world way ways thing things result results better worse love perfect proven guaranteed').split(' '))

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
function contentTokens(s: string): string[] {
  return (norm(s).match(/[a-z][a-z']+/g) ?? [])
    .map((w) => w.replace(/'s$/, '').replace(/'/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}
const specificTokens = (s: string) => new Set(contentTokens(s).filter((w) => !GENERIC.has(w)))
/** normalized token -> the word as written, for readable output */
function surfaceWords(s: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const raw of s.match(/[A-Za-z][A-Za-z'’]+/g) ?? []) { const [t] = contentTokens(raw); if (t && !m.has(t)) m.set(t, raw) }
  return m
}
const numbersIn = (s: string) => new Set((s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, '').replace(/,/g, '')))
const quoted = (ws: string[]) => joinList(ws.map((w) => `"${w}"`))

// ── types ────────────────────────────────────────────────────────────────────
export interface HookAnswer { question: Role; words: string }
export interface HookBrief { brand?: string; product?: string; offer?: string; audience?: string; proof?: string }
export interface HookInput { text: string; slot: Slot; answers: HookAnswer[]; brief?: HookBrief; context?: string; follows?: string; awareness?: Awareness }
export type Verdict = 'does_its_job' | 'partly' | 'doesnt'
export type SwapLevel = 'only_you' | 'on_target' | 'concrete_but_swappable' | 'generic' | 'unknown'

export interface HookCheck {
  text: string
  slot: Slot
  verdict: Verdict
  needs: Role[][]
  answered: Role[]
  missing: Role[][]
  unverified: HookAnswer[]
  swap: { level: SwapLevel; specifics: string[]; note: string }
  visible: string | null
  /** Problems that stop the line doing its job, each a full sentence. */
  hardFails: string[]
  /** Problems worth fixing, each a full sentence. */
  warnings: string[]
  /** The warnings about believability (an unproven superlative, a result with nothing behind it,
   *  a line that runs past the cutoff). Callers that treat these as blocking use this list. */
  believability: string[]
  evidence: string[]
  /** The subset of evidence that cuts against the line (traits that lost head-to-heads). */
  evidenceAgainst: string[]
  bet: string
  fix: string
}

// ── swap test ────────────────────────────────────────────────────────────────
/** Brand and product names: the explicit brand, plus capitalized words inside the product
 *  description that are not its first word (a first word may just be sentence case). */
function brandTokens(product: string, brand?: string): Set<string> {
  const out = new Set<string>(brand ? contentTokens(brand) : [])
  const words = product.match(/[A-Za-z][A-Za-z'’]+/g) ?? []
  words.forEach((w, i) => { if (/^[A-Z]/.test(w) && (i > 0 || /[a-z][A-Z]/.test(w) || product.trim().split(/\s+/).length <= 3)) for (const t of contentTokens(w)) out.add(t) })
  return out
}

/**
 * The swap test (Thesis II): could a competitor send this line unchanged?
 * only_you: names the brand, or a fact from your proof. on_target: names this reader's situation or the
 * product's specifics (a direct competitor could match it). concrete_but_swappable: only a number or offer
 * term. generic: nothing specific. unknown: no brief.
 */
export function swapTest(text: string, brief?: HookBrief, context?: string): HookCheck['swap'] {
  const line = specificTokens(text)
  const lineNums = numbersIn(text.replace(/#\s?1\b/g, ''))
  const surface = surfaceWords(text)
  const show = (ws: string[]) => ws.map((w) => surface.get(w) ?? w)
  const hasBrief = !!brief && Object.values(brief).some((v) => v && v.trim())
  if (hasBrief) {
    const brand = brandTokens(brief!.product ?? '', brief!.brand)
    const proof = specificTokens(brief!.proof ?? '')
    const proofNums = numbersIn(brief!.proof ?? '')
    const target = specificTokens(`${brief!.brand ?? ''} ${brief!.product ?? ''} ${brief!.audience ?? ''}`)
    const offer = specificTokens(brief!.offer ?? '')
    const mine = [...show([...line].filter((w) => brand.has(w) || proof.has(w))), ...[...lineNums].filter((n) => proofNums.has(n))]
    if (mine.length) return { level: 'only_you', specifics: mine, note: `No competitor could send it, because it names ${quoted(mine)}.` }
    const onTarget = show([...line].filter((w) => target.has(w)))
    if (onTarget.length) return { level: 'on_target', specifics: onTarget, note: `It speaks to this reader and this offer with ${quoted(onTarget)}, but a direct competitor could still send it. Add the brand name or a fact from your proof and it becomes yours alone.` }
    const offerHits = show([...line].filter((w) => offer.has(w)))
    if (lineNums.size || offerHits.length) {
      return { level: 'concrete_but_swappable', specifics: [...lineNums, ...offerHits], note: "It's concrete, but any competitor with the same offer could send it word for word. Nothing in it names this product, this reader or your proof." }
    }
    return { level: 'generic', specifics: [], note: 'Any competitor could send this word for word, because nothing in it belongs to this product, this reader, this offer or your proof.' }
  }
  if (context && context.trim()) {
    const ctx = specificTokens(context)
    const shared = show([...line].filter((w) => ctx.has(w)))
    return { level: 'unknown', specifics: shared, note: shared.length
      ? `It shares ${quoted(shared.slice(0, 4))} with the rest of the copy. Pass the brief, meaning the product, audience, offer and proof, and the swap test can tell you whether a competitor could send it.`
      : 'It shares nothing specific with the rest of the copy. Pass the brief, meaning the product, audience, offer and proof, so the swap test can run.' }
  }
  return { level: 'unknown', specifics: [], note: "The swap test didn't run because there's no brief. Pass the product, audience, offer and proof." }
}

/** Completes 'Answer "<question>" by ...' */
const ROLE_FIX: Record<Role, string> = {
  DISRUPT: "adding one surprising, specific detail, or a tension they didn't see coming",
  IDENTIFY: 'naming the reader or something that is theirs, like "your boots" or "bakery owners"',
  AGITATE: 'naming what the problem is costing them',
  REFRAME: "showing them the problem from an angle they haven't considered",
  PROVE: 'putting the proof right next to the claim',
  ELEVATE: 'showing them, specifically, what life looks like after',
  RESOLVE: "removing the main reason they'd hesitate",
  COMPEL: 'giving them an honest reason to act now, like the offer or the deadline',
  BOND: "sounding like a specific person they'd trust",
}

const SUPERLATIVE = /(#\s?1\b|\bnumber one\b|\bthe best\b|\bbest[- ]in[- ]class\b|\bleading\b|\bworld'?s (best|first|most|leading)\b|\btop[- ]rated\b|\bunmatched\b|\brevolutionary\b|\bbiggest\b|\bultimate\b|\bgreatest\b)/i
const BACKED = /\b(according to|rated by|ranked by|verified|audited|source:|survey|study)\b|\d[\d,.]*\s?(%|customers|users|reviews|stars|brands|teams)/i
const RESULT_CLAIM = /\b(\d+x|doubles?|triples?|increases?|boosts?|cuts?|saves?|earns?|grows?|loses?|gains?)\b/i

// ── the check ────────────────────────────────────────────────────────────────
export function checkHook(input: HookInput): HookCheck {
  const { text, slot } = input
  const info = SLOT_INFO[slot]
  const needs = requirements(slot, input.awareness)
  const nText = norm(text)
  const hardFails: string[] = []
  const warnings: string[] = []
  const believability: string[] = []

  // 1. the job: verify each label's quote is really in the line (and visible)
  const verified: HookAnswer[] = []
  const unverified: HookAnswer[] = []
  const cutoff = info.visibleChars
  const cpLen = Array.from(text).length
  let cutFail = false
  for (const a of input.answers) {
    const w = norm(a.words)
    const at = w ? nText.indexOf(w) : -1
    if (at < 0) { unverified.push(a); continue }
    if (cutoff && cpLen > cutoff && at + w.length > cutoff) {
      cutFail = true
      hardFails.push(`The words that answer "${ROLES[a.question].question}" ("${a.words}") fall past the cutoff, and since ${info.visibleNote}, most readers never see them.`)
      continue
    }
    verified.push(a)
  }
  const answered = [...new Set(verified.map((a) => a.question))]
  const missing = needs.filter((g) => !g.some((r) => answered.includes(r)))

  // 2. swap test
  const swap = swapTest(text, input.brief, input.context)

  // 3. hard facts
  let visible: string | null = null
  if (cutoff) visible = cpLen > cutoff ? Array.from(text).slice(0, cutoff).join('') + '…' : text
  if (cutoff && cpLen > cutoff && !cutFail) {
    const w = `It runs past the cutoff, and since ${info.visibleNote}, readers see only "${visible}". Make sure the point lands before that.`
    warnings.push(w)
    believability.push(w)
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (info.spoken && words > (info.maxWords ?? 9)) warnings.push(`At ${words} words it takes about ${(words / 2.7).toFixed(1)} seconds to say. The hook has to land in the first three seconds, which is about ${info.maxWords} words.`)
  else if (info.maxWords && words > info.maxWords) warnings.push(`It runs ${words} words. Headlines in this spot usually land in ${info.maxWords} or fewer.`)
  const smell = smellSentences(detectAISmell(text).violations)
  hardFails.push(...smell)
  const superlative = SUPERLATIVE.test(text) && !BACKED.test(text)
  const bareResult = RESULT_CLAIM.test(text) && !/\d/.test(text) && !BACKED.test(text)
  if (superlative) {
    const w = 'It makes a superlative claim, like "best", "#1" or "biggest", with no proof in the same line, and readers discount those on sight.'
    warnings.push(w)
    believability.push(w)
  }
  if (bareResult) {
    const w = 'It claims a result without a number, a source or a quote to back it up.'
    warnings.push(w)
    believability.push(w)
  }
  if (input.follows && input.follows.trim()) {
    const prev = specificTokens(input.follows)
    const shared = [...specificTokens(text)].filter((w) => prev.has(w))
    if (!shared.length && (slot === 'first_line' || slot === 'landing_page_headline')) {
      warnings.push(`It picks up nothing specific from what the reader just saw ("${safeSlice(input.follows, 80)}"). Readers feel that break, and that is when they leave.`)
    }
  }

  // 4. evidence (headline-like slots only)
  const traits = info.headlineLike ? TRAIT_EVIDENCE.filter((t) => t.test(text)) : []
  const evidence = traits.map((t) => t.text)
  const evidenceAgainst = traits.filter((t) => !t.good).map((t) => t.text)

  // verdict
  const labeled = input.answers.length > 0
  const jobMet = labeled && missing.length === 0
  // Unproven claims cannot pass: they are what readers discount first.
  const unbacked = superlative || bareResult
  let verdict: Verdict
  if (hardFails.length) verdict = jobMet ? 'partly' : 'doesnt'
  // Passing needs the swap test to have actually run (a brief) and found something specific.
  else if (jobMet && !unbacked && (swap.level === 'only_you' || swap.level === 'on_target')) verdict = 'does_its_job'
  else if (missing.length === needs.length || (swap.level === 'generic' && !jobMet)) verdict = 'doesnt' // answers none of what this slot needs
  else verdict = 'partly'

  // The swap test gets its own sentence, so the bet names only the questions.
  const bet = answered.length
    ? `It's betting on ${joinList(answered.map((r) => ROLES[r].gloss))}.`
    : "It doesn't answer any of the questions this spot needs."

  // one best fix, highest-leverage first
  let fix: string
  if (cutFail) fix = `Move the words that answer the question into the first ${cutoff} characters.`
  else if (smell.length) fix = 'Replace the stock phrasing with something only this product could say.'
  else if (missing.length) fix = `Answer "${ROLES[missing[0][0]].question}" by ${ROLE_FIX[missing[0][0]]}.`
  else if (unbacked) fix = 'Back the claim up in the same line, with who ranked it, a number or a source, or swap it for a specific fact a reader could check.'
  else if (swap.level === 'generic' || swap.level === 'concrete_but_swappable') fix = "Add something specific, like the reader's situation, the product itself or a proof number."
  else if (swap.level === 'unknown') fix = 'Pass the brief, meaning the brand, product, offer, audience and proof, so the swap test can run.'
  else if (traits.some((t) => t.name === 'question')) fix = 'Try it as a statement, since question headlines lose most head-to-head tests.'
  else fix = 'Nothing needs fixing before you test it.'

  return { text, slot, verdict, needs, answered, missing, unverified, swap, visible, hardFails, warnings, believability, evidence, evidenceAgainst, bet, fix }
}

/** Completes a heading like '"Your bakery posted 3 times..." ___' */
export const VERDICT_LABEL: Record<Verdict, string> = { does_its_job: 'does its job', partly: 'partly does its job', doesnt: "doesn't do its job" }
export { EVIDENCE_SOURCE }

/** The body of a checked line as one paragraph: the bet, what is missing, the swap test, the problems. */
export function describeCheck(c: HookCheck, opts: { evidence?: boolean } = {}): string {
  const parts = [c.bet]
  if (c.missing.length) parts.push(endSentence(`It still has to answer ${questionsNeeded(c.missing)}`))
  parts.push(c.swap.note, ...c.hardFails, ...c.warnings)
  if (opts.evidence !== false) parts.push(...c.evidence)
  return parts.join(' ')
}

/** Compare checked lines: drop hard failures, describe each bet, recommend a test. */
export function compareHooks(checks: HookCheck[], names: string[]): string {
  const good = checks.map((c, i) => ({ c, n: names[i] })).filter((x) => x.c.verdict === 'does_its_job')
  const betKey = (c: HookCheck) => c.answered.slice().sort().join('+')
  const betOn = (c: HookCheck) => c.bet.replace(/^It's betting on /, 'is betting on ').replace(/\.$/, '')
  if (good.length >= 2) {
    const [a, ...rest] = good
    const b = rest.find((x) => betKey(x.c) !== betKey(a.c))
    if (b) return `Test ${a.n} against ${b.n}. They make different bets. ${a.n} ${betOn(a.c)}, and ${b.n} ${betOn(b.c)}. Whichever wins tells you which question matters more to this reader.`
    return `${joinList(good.map((x) => x.n))} make the same bet, so testing one against the other won't teach you much. Keep ${a.n}, and write a challenger that answers a different question.`
  }
  if (good.length === 1) return `Use ${good[0].n}. If you want to learn something, test it against a line that answers a different question.`
  const partly = checks.map((c, i) => ({ c, n: names[i] })).filter((x) => x.c.verdict === 'partly')
  if (partly.length) return `None of these does its job yet. ${joinList(partly.map((x) => x.n))} ${partly.length === 1 ? 'comes' : 'come'} closest, so apply the fix below and check again.`
  return 'None of these does its job yet. Start with the fixes below.'
}
