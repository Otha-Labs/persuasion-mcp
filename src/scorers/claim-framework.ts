// Copied from persuasion-ecosystem lib/claim-framework.ts on 2026-10-03. Pure module: no I/O, no AI calls.
// Keep in sync with the source until both import a shared package.
import { detectAISmell, scoreHook, type HookFormat, type AwarenessLevel } from './hook-framework.js'
import { safeSlice } from './string-utils.js'

/**
 * CLAIM FRAMEWORK — Phase 2 of the writing-tools strategy.
 *
 * The hook framework scores openers (single sentences). The flow framework
 * scores blocks (paragraphs). This sits between them: it scores SENTENCES
 * with role-specific gates. v1 ships three claim types:
 *
 *   - headline      → delegates to scoreHook (single source of truth for
 *                     opener scoring; reconciles with the universal headline
 *                     rule from Layer 1)
 *   - cta           → button / CTA-specific gates (generic-text fail,
 *                     first-person or outcome, single-verb strength,
 *                     low-friction word cap, anti-smell)
 *   - body_claim    → in-body assertion gates (specificity, mechanism named,
 *                     proof welded, anti-smell)
 *
 * Phase 2.5 will add: subhead, bullet, proof_statement, objection_rebuttal,
 * guarantee. Per the v3 plan: ship 3 first, expand based on observed gaps.
 *
 * Pure module — no I/O, no DB. The evaluate_claims tool wraps this and
 * persists results to claim_evaluations. Reuses detectAISmell from
 * hook-framework so the banned-word list has one source of truth.
 *
 * Batched scoring is the default: scoreClaims(claims[]) keeps token cost low
 * by scoring an array of mixed-type claims in one call.
 */

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type ClaimType = 'headline' | 'cta' | 'body_claim'

interface ClaimGateResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  detail?: string
}

export interface ClaimScore {
  /** Echoed back so the bot can correlate batched results to its inputs. */
  text: string
  type: ClaimType
  score: number // 0.0 - 10.0
  scoreLabel: 'fail' | 'weak' | 'passable' | 'strong' | 'excellent'
  gates: ClaimGateResult[]
  violations: string[]
  suggestions: string[]
}

interface ScoreClaimOptions {
  /** Optional context paragraph — used for the body_claim mechanism check
   *  (a claim "passes" mechanism_named if it OR its surrounding context
   *  names a mechanism). Ignored for headline/cta. */
  context?: string
  /** For headline only — passed through to scoreHook for format-specific
   *  length constraints. Ignored for cta/body_claim. */
  headlineFormat?: HookFormat
  /** For headline only — passed through to scoreHook. */
  awarenessLevel?: AwarenessLevel
}

// ──────────────────────────────────────────────────────────────────────────
// Tunables
// ──────────────────────────────────────────────────────────────────────────

const MAX_CLAIM_LENGTH = 1000

/** CTA hard-fails on these literal words (case insensitive). */
// Note: trailing punctuation is stripped by `replace(/[!.?]+$/, '')` in scoreCta
// before this Set is consulted, so dotted variants ('click here.', 'learn more.')
// would never match — kept the canonical un-dotted forms only.
const CTA_GENERIC_BUTTONS = new Set([
  'submit',
  'click here',
  'click',
  'learn more',
  'read more',
  'continue',
  'next',
  'go',
  'enter',
  'send',
  'okay',
  'ok',
  // Stock buttons that name no outcome. "Buy now" / "Shop now" stay off the list:
  // for a ready buyer they are the clear, honest button.
  'get started',
  'sign up',
  'sign up now',
  'start now',
  'start here',
  'try it',
  'try it now',
  'find out more',
  'discover more',
  'see more',
])

/** Strong action verbs that indicate the CTA names a real action. */
const CTA_STRONG_VERBS = [
  'get', 'grab', 'claim', 'reserve', 'save', 'book', 'unlock', 'start',
  'try', 'join', 'download', 'install', 'send', 'request', 'apply',
  'see', 'show', 'reveal', 'discover', 'open', 'activate', 'enroll',
  'enter', 'subscribe', 'access', 'create', 'build', 'launch', 'fix',
  'cancel', 'stop', 'remove', 'delete', 'add',
]

/** Outcome words that indicate the CTA promises something specific. */
const CTA_OUTCOME_NOUNS = [
  'spot', 'seat', 'session', 'demo', 'access', 'guide', 'report',
  'audit', 'review', 'plan', 'kit', 'template', 'discount', 'sample',
  'consult', 'consultation', 'invitation', 'invite', 'preview', 'trial',
  'subscription', 'license', 'key', 'pass', 'ticket', 'copy', 'edition',
  'meeting', 'call',
]

// Pre-compiled regex for CTA outcome detection. Compiling once at module load
// is N× faster than building a new RegExp inside scoreCta on every call,
// which matters in batched mode (up to 50 claims per evaluate_claims call).
const CTA_OUTCOME_REGEX = new RegExp(`\\b(${CTA_OUTCOME_NOUNS.join('|')})\\b`, 'i')

/** CTAs longer than this many words feel like sentences, not buttons. */
const CTA_LOW_FRICTION_WORDS = 6

/** Mechanism markers — words that indicate the claim names HOW. */
const MECHANISM_MARKERS = [
  'because', 'by ', 'through ', 'via ', 'using ', 'thanks to ',
  'powered by ', 'based on ', 'driven by ', 'built on ',
]

// ──────────────────────────────────────────────────────────────────────────
// Headline — delegates to scoreHook
// ──────────────────────────────────────────────────────────────────────────

function normalizeHookResult(text: string, options: ScoreClaimOptions): ClaimScore {
  // Hook framework owns the 7-gate logic for openers. Translate its return
  // shape into the unified ClaimScore shape so the consumer (the bot) sees
  // a consistent structure across claim types.
  const result = scoreHook(text, {
    format: options.headlineFormat,
    awarenessLevel: options.awarenessLevel,
  })
  const gates: ClaimGateResult[] = result.gates.map((g) => ({
    name: g.name,
    status: g.result,
    detail: g.detail,
  }))
  return {
    text,
    type: 'headline',
    score: result.score,
    scoreLabel: result.scoreLabel,
    gates,
    violations: result.violations,
    suggestions: result.suggestions.slice(0, 3),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// CTA gates
// ──────────────────────────────────────────────────────────────────────────

function scoreCta(text: string): ClaimScore {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase().replace(/[!.?]+$/, '')
  const words = trimmed.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const gates: ClaimGateResult[] = []
  const violations: string[] = []
  const suggestions: string[] = []

  // CTA 1: hard-fail on generic button text
  if (CTA_GENERIC_BUTTONS.has(lower)) {
    gates.push({
      name: 'generic_button_text',
      status: 'fail',
      detail: `"${trimmed}" is a generic button label. Replace with a specific outcome ("Save my seat", "Book my audit", "Send me the guide").`,
    })
    violations.push('generic_button_text')
    suggestions.push('Replace with a benefit-oriented action ("Save my seat" not "Submit").')
  } else {
    gates.push({ name: 'generic_button_text', status: 'pass' })
  }

  // CTA 2: first-person possessive OR specific outcome noun
  const hasFirstPerson = /\b(my|me|i)\b/i.test(trimmed)
  const lowerForOutcome = lower.replace(/[^a-z\s]/g, ' ')
  const hasOutcome = CTA_OUTCOME_REGEX.test(lowerForOutcome)
  if (hasFirstPerson || hasOutcome) {
    gates.push({
      name: 'first_person_or_outcome',
      status: 'pass',
      detail: hasFirstPerson ? 'first-person possessive' : 'specific outcome noun',
    })
  } else {
    gates.push({
      name: 'first_person_or_outcome',
      status: 'fail',
      detail: 'CTA needs first-person ("Get my X") or a specific outcome noun ("seat", "session", "audit").',
    })
    violations.push('first_person_or_outcome')
    suggestions.push('Use first-person ("Get my plan") — Unbounce documents +90% lift over second-person.')
  }

  // CTA 3: starts with a strong action verb
  const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, '') || ''
  if (CTA_STRONG_VERBS.includes(firstWord)) {
    gates.push({
      name: 'strong_action_verb',
      status: 'pass',
      detail: firstWord,
    })
  } else {
    gates.push({
      name: 'strong_action_verb',
      status: 'warn',
      detail: `First word "${firstWord || '(none)'}" is not a strong action verb. CTAs should open with the verb of the action.`,
    })
  }

  // CTA 4: low-friction word cap
  if (wordCount === 0) {
    gates.push({ name: 'low_friction', status: 'fail', detail: 'empty CTA' })
  } else if (wordCount > CTA_LOW_FRICTION_WORDS) {
    gates.push({
      name: 'low_friction',
      status: 'warn',
      detail: `${wordCount} words. Buttons over ${CTA_LOW_FRICTION_WORDS} words read as sentences, not actions.`,
    })
  } else {
    gates.push({
      name: 'low_friction',
      status: 'pass',
      detail: `${wordCount} words`,
    })
  }

  // CTA 5: anti-smell
  const smell = detectAISmell(trimmed)
  if (smell.hasSmells) {
    gates.push({
      name: 'anti_smell',
      status: 'fail',
      detail: smell.violations.slice(0, 3).join('; '),
    })
    violations.push(...smell.violations.map((v) => `anti_smell: ${v}`))
  } else {
    gates.push({ name: 'anti_smell', status: 'pass' })
  }

  return finalizeScore(trimmed, 'cta', gates, violations, suggestions)
}

// ──────────────────────────────────────────────────────────────────────────
// Body-claim gates
// ──────────────────────────────────────────────────────────────────────────

function scoreBodyClaim(text: string, options: ScoreClaimOptions): ClaimScore {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  const gates: ClaimGateResult[] = []
  const violations: string[] = []
  const suggestions: string[] = []

  // Body 1: specificity — number, $, %, year, named entity, or timeframe
  const hasNumber = /\b\d+([,.]\d+)?[%kKmM]?\b/.test(trimmed) || /\$[\d,]+/.test(trimmed)
  // Named-entity check: skip the first capitalized word of the sentence so
  // sentence-initial "The" / "This" / "They" / "We" / "Our" don't false-
  // positive every sentence into a "specificity pass". Strip leading
  // punctuation, then strip the first capitalized word, then look for
  // proper-noun patterns in what remains.
  const stripped = trimmed.replace(/^[^a-zA-Z]*/, '').replace(/^[A-Z][a-z]*(?:'s)?\s*/, '')
  const hasNamedEntity = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*\b/.test(stripped)
  const hasTimeframe = /\b(day|days|week|weeks|month|months|year|years|hour|hours|minute|minutes|2024|2025|2026)\b/i.test(trimmed)
  if (hasNumber || hasNamedEntity || hasTimeframe) {
    const sources: string[] = []
    if (hasNumber) sources.push('number')
    if (hasNamedEntity) sources.push('named entity')
    if (hasTimeframe) sources.push('timeframe')
    gates.push({
      name: 'specificity',
      status: 'pass',
      detail: sources.join(', '),
    })
  } else {
    gates.push({
      name: 'specificity',
      status: 'fail',
      detail: 'No number, named entity, or timeframe. Generic claims are forgettable.',
    })
    violations.push('specificity')
    suggestions.push('Anchor the claim with a number, dollar amount, percentage, year, or named entity.')
  }

  // Body 2: mechanism named — claim or its surrounding context names HOW.
  // This mirrors the Schwartz "stage 4-5 sophistication" requirement: at
  // higher market sophistication, the audience needs to know HOW the result
  // is produced, not just WHAT the result is.
  const haystack = `${lower} ${(options.context || '').toLowerCase()}`
  const hasMechanism = MECHANISM_MARKERS.some((m) => haystack.includes(m))
  if (hasMechanism) {
    gates.push({ name: 'mechanism_named', status: 'pass' })
  } else {
    gates.push({
      name: 'mechanism_named',
      status: 'warn',
      detail: 'Claim does not name HOW the result happens (no "because", "by", "through", "via"). At sophistication stage 4+, mechanism > pure benefit.',
    })
  }

  // Body 3: proof welded — claim has at least one verifiable hook (number,
  // source attribution, or named source). Reuses the specificity check but
  // weights it differently: a number alone is enough here.
  const hasSourceAttribution = /\b(according to|study|research|survey|reported|documented|measured|tested)\b/i.test(trimmed)
  if (hasNumber || hasSourceAttribution) {
    gates.push({
      name: 'proof_welded',
      status: 'pass',
      detail: hasSourceAttribution ? 'source attribution' : 'verifiable number',
    })
  } else {
    gates.push({
      name: 'proof_welded',
      status: 'warn',
      detail: 'No verifiable number or source attribution. Body claims need a proof anchor a skeptic can check.',
    })
  }

  // Body 4: anti-smell
  const smell = detectAISmell(trimmed)
  if (smell.hasSmells) {
    gates.push({
      name: 'anti_smell',
      status: 'fail',
      detail: smell.violations.slice(0, 3).join('; '),
    })
    violations.push(...smell.violations.map((v) => `anti_smell: ${v}`))
    suggestions.push('Strip the AI-smell vocabulary and rewrite in plain Anglo-Saxon verbs.')
  } else {
    gates.push({ name: 'anti_smell', status: 'pass' })
  }

  return finalizeScore(trimmed, 'body_claim', gates, violations, suggestions)
}

// ──────────────────────────────────────────────────────────────────────────
// Composition
// ──────────────────────────────────────────────────────────────────────────

function finalizeScore(
  text: string,
  type: ClaimType,
  gates: ClaimGateResult[],
  violations: string[],
  suggestions: string[],
): ClaimScore {
  // Each fail costs 2.5, each warn 0.7, baseline 10.
  let score = 10.0
  for (const g of gates) {
    if (g.status === 'fail') score -= 2.5
    else if (g.status === 'warn') score -= 0.7
  }
  if (score < 0) score = 0

  // Auto-suggestions from any failed gate that didn't already contribute one.
  for (const g of gates) {
    if (g.status === 'fail' && g.detail && suggestions.length < 3) {
      // Skip if a more specific suggestion already exists.
      const alreadyCovered = suggestions.some((s) => s.toLowerCase().includes(g.name.replace(/_/g, ' ')))
      if (!alreadyCovered) suggestions.push(g.detail)
    }
  }

  let scoreLabel: ClaimScore['scoreLabel']
  if (score < 4) scoreLabel = 'fail'
  else if (score < 6) scoreLabel = 'weak'
  else if (score < 7.5) scoreLabel = 'passable'
  else if (score < 9) scoreLabel = 'strong'
  else scoreLabel = 'excellent'

  return {
    text,
    type,
    score: Math.round(score * 10) / 10,
    scoreLabel,
    gates,
    violations,
    suggestions: suggestions.slice(0, 3),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public entrypoints
// ──────────────────────────────────────────────────────────────────────────

function scoreClaim(
  text: string,
  type: ClaimType,
  options: ScoreClaimOptions = {},
): ClaimScore {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      text: '',
      type,
      score: 0,
      scoreLabel: 'fail',
      gates: [{ name: 'empty', status: 'fail', detail: 'Empty claim.' }],
      violations: ['empty'],
      suggestions: ['Pass non-empty text.'],
    }
  }
  if (trimmed.length > MAX_CLAIM_LENGTH) {
    return {
      text: safeSlice(trimmed, 80) + '…',
      type,
      score: 0,
      scoreLabel: 'fail',
      gates: [{ name: 'too_long', status: 'fail', detail: `Claims must be ≤${MAX_CLAIM_LENGTH} chars (received ${trimmed.length}). Use evaluate_flow for longer blocks.` }],
      violations: ['too_long'],
      suggestions: [`Pass a single sentence, not a paragraph (max ${MAX_CLAIM_LENGTH} chars).`],
    }
  }

  switch (type) {
    case 'headline':
      return normalizeHookResult(trimmed, options)
    case 'cta':
      return scoreCta(trimmed)
    case 'body_claim':
      return scoreBodyClaim(trimmed, options)
  }
}

export interface BatchClaimInput {
  text: string
  type: ClaimType
  context?: string
  headline_format?: HookFormat
  awareness_level?: AwarenessLevel
}

export function scoreClaims(claims: BatchClaimInput[]): ClaimScore[] {
  return claims.map((c) =>
    scoreClaim(c.text, c.type, {
      context: c.context,
      headlineFormat: c.headline_format,
      awarenessLevel: c.awareness_level,
    }),
  )
}
