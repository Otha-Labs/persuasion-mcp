// Copied from persuasion-ecosystem lib/hook-framework.ts on 2026-10-03. Pure module: no I/O, no AI calls.
// Keep in sync with the source until both import a shared package.
/**
 * HOOK & HEADLINE FRAMEWORK — single source of truth.
 *
 * Distilled from six independent research passes (classic direct response masters,
 * modern practitioners, and our internal Hook Lab framework). Encodes the universal
 * craft laws every writing bot inherits.
 *
 * This file owns:
 * - The doctrine block injected into every writing bot's system prompt
 * - The 7-gate evaluation function (scoreHook) called by the evaluate_hook tool
 * - The AI-smell detection (banned words + patterns) used as a quality filter
 * - The headline-vs-hook-vs-subhead distinction
 *
 * Pure module — no DB calls, no I/O. The diagnostic tool wraps these functions.
 */

// ──────────────────────────────────────────────────────────────────────────
// AI-SMELL: vocabulary and constructions that mark text as AI-generated
// ──────────────────────────────────────────────────────────────────────────

/**
 * Single words/phrases that became AI tells in 2024-2026.
 * These were "power words" pre-2023; now they actively reduce trust.
 * Match is case-insensitive on word boundaries.
 */
const AI_SMELL_BANNED_WORDS: string[] = [
  // Generic action verbs that signal "AI broadcast voice"
  'unlock', 'unlocks', 'unlocking',
  'leverage', 'leverages', 'leveraging',
  'harness', 'harnesses', 'harnessing',
  'elevate', 'elevates', 'elevating',
  'empower', 'empowers', 'empowering',
  'embark on', 'embarking',
  'delve', 'delves', 'delving',
  'navigate', 'navigates', 'navigating', // when used as "navigate the landscape"

  // Hype phrases
  'game-changer', 'game changer', 'game-changing',
  'dive in', 'dive into', 'diving into',
  'buckle up',
  "let's be real",
  "let's dive",
  'tapestry',
  'testament to',
  'nestled in',
  'a journey through',

  // Clichéd opener phrases
  "in today's fast-paced world",
  "in today's digital age",
  'in an era where',
  'in a world where',
  'in the world of',
  'ever-evolving',
  'fast-paced',
  'cutting-edge',
  'state-of-the-art',
  'paradigm shift',
  'seamless',
  'seamlessly',
  'revolutionize',
  'revolutionizes',
  'revolutionary',

  // Empty intensifiers
  'absolutely critical',
  'truly unique',
  'truly remarkable',
  'utterly transformative',
  'profoundly',
]

/**
 * Constructions that betray ChatGPT-era output.
 * These are matched as RegExp against the full text.
 */
const AI_SMELL_PATTERNS: { name: string; regex: RegExp; reason: string }[] = [
  {
    name: 'em_dash_reversal',
    // Tightened: only matches the ChatGPT signature pattern (short claim + em-dash + "it's" reversal).
    // The previous regex [^—.!?]{2,40} was too greedy and matched legitimate parallel dash constructions
    // like "The method — which I've tested over 6 months — it's working" (parallel asides, not reversal).
    regex: /\b\w[\w\s]{0,20}\s—\s*it'?s\s+\w/i,
    reason: 'Em-dash "X — it\'s Y" reversal is a ChatGPT signature construction. Use a period or restructure.',
  },
  {
    name: 'not_just_but',
    regex: /\bit'?s\s+not\s+(just\s+)?\w[\w\s]{1,40},?\s+it'?s\s+\w/i,
    reason: '"It\'s not just X, it\'s Y" is a ChatGPT signature. Restructure as one assertion.',
  },
  {
    name: 'more_than_just',
    regex: /\bmore\s+than\s+just\b/i,
    reason: '"More than just" is filler. Cut it and name what the thing actually is.',
  },
  {
    name: 'in_the_world_of',
    regex: /\bin\s+the\s+world\s+of\b/i,
    reason: '"In the world of [X]" is throat-clearing. Skip the setup, make the claim.',
  },
  {
    name: 'tripled_adjectives',
    regex: /\b(\w+ly\s+)?\w+,\s+\w+,\s+and\s+\w+\s+(experience|approach|solution|platform|system)\b/i,
    reason: 'Three-adjective stack ("X, Y, and Z platform") is corporate boilerplate. Pick one specific claim.',
  },
  {
    name: 'hope_this_helps',
    regex: /\bhope\s+this\s+helps\b/i,
    reason: '"Hope this helps" is AI assistant filler. Cut it.',
  },
  {
    name: 'absolutely_great_question',
    regex: /\b(absolutely|great\s+question|excellent\s+point|that'?s\s+a\s+great)\b/i,
    reason: 'Sycophantic AI assistant filler. Get to the point.',
  },
]

/**
 * Detect AI-smell in any text. Returns the violations (if any).
 * Used by both scoreHook and as a standalone filter.
 */
export function detectAISmell(text: string): { violations: string[]; hasSmells: boolean } {
  const violations: string[] = []
  const lower = text.toLowerCase()

  for (const word of AI_SMELL_BANNED_WORDS) {
    // Word-boundary match for single words; substring for multi-word phrases
    const pattern = word.includes(' ') || word.includes("'")
      ? new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : new RegExp(`\\b${word}\\b`, 'i')
    if (pattern.test(lower)) {
      violations.push(`Banned word/phrase: "${word}"`)
    }
  }

  for (const pat of AI_SMELL_PATTERNS) {
    if (pat.regex.test(text)) {
      violations.push(`${pat.name}: ${pat.reason}`)
    }
  }

  return { violations, hasSmells: violations.length > 0 }
}

// ──────────────────────────────────────────────────────────────────────────
// 7 EVALUATION GATES — the framework every hook is scored against
// ──────────────────────────────────────────────────────────────────────────

type GateResult = 'pass' | 'warn' | 'fail'

interface GateOutcome {
  name: string
  result: GateResult
  detail: string
}

export type HookFormat =
  | 'ad_headline'
  | 'email_subject'
  | 'first_line'
  | 'video_hook'
  | 'landing_page_h1'
  | 'social_post_open'
  | 'vsl_opening'
  | 'sales_letter_lead'

export type AwarenessLevel =
  | 'unaware'
  | 'problem_aware'
  | 'solution_aware'
  | 'product_aware'
  | 'most_aware'

export interface HookScore {
  score: number // 0-10
  scoreLabel: 'fail' | 'weak' | 'passable' | 'strong' | 'excellent'
  gates: GateOutcome[]
  violations: string[]
  suggestions: string[]
  format?: HookFormat
  awarenessLevel?: AwarenessLevel
}

// Format-specific length and character constraints
const FORMAT_CONSTRAINTS: Record<
  HookFormat,
  { idealMaxChars: number; hardMaxChars: number; idealMaxWords: number; note: string }
> = {
  ad_headline: { idealMaxChars: 125, hardMaxChars: 200, idealMaxWords: 12, note: 'First line of paid social — must work before "See more" cutoff.' },
  email_subject: { idealMaxChars: 40, hardMaxChars: 60, idealMaxWords: 7, note: 'Mobile inbox cuts at ~40 chars. Lowercase preferred.' },
  first_line: { idealMaxChars: 80, hardMaxChars: 140, idealMaxWords: 12, note: 'Opening sentence of body copy. Must earn the second sentence.' },
  video_hook: { idealMaxChars: 60, hardMaxChars: 100, idealMaxWords: 10, note: 'Spoken or text overlay in first 3 seconds. Must complete a thought.' },
  landing_page_h1: { idealMaxChars: 90, hardMaxChars: 140, idealMaxWords: 14, note: 'Hero headline. Must promise the outcome in plain language.' },
  social_post_open: { idealMaxChars: 100, hardMaxChars: 200, idealMaxWords: 15, note: 'First two lines before fold on LinkedIn/X. Identity-flag the reader.' },
  vsl_opening: { idealMaxChars: 100, hardMaxChars: 160, idealMaxWords: 16, note: 'First spoken sentence. Disqualify wrong viewers, hook the right ones.' },
  sales_letter_lead: { idealMaxChars: 120, hardMaxChars: 220, idealMaxWords: 18, note: 'Long-form lead. Sets up the unique mechanism of the problem.' },
}

// Gate 1: SPECIFICITY
function checkSpecificity(hook: string): GateOutcome {
  const hasNumber = /\b\d+([,.]\d+)?[k%+]?\b/.test(hook) || /\$[\d,]+/.test(hook)
  const hasNamedEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/.test(hook.replace(/^[^a-z]*/i, '')) // proper noun not at sentence start
  const hasTimeframe = /\b(day|days|week|weeks|month|months|year|years|hour|hours|minute|minutes|second|seconds|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|2024|2025|2026)\b/i.test(hook)
  const hasMechanismHint = /\b(method|system|formula|framework|protocol|technique|approach|process|secret|trick|hack|loophole|shortcut|trick|mistake)\b/i.test(hook)

  const signals = [hasNumber, hasNamedEntity, hasTimeframe, hasMechanismHint].filter(Boolean).length

  if (signals >= 2) {
    return { name: 'specificity', result: 'pass', detail: 'Has multiple specificity signals (number/name/timeframe/mechanism).' }
  }
  if (signals === 1) {
    return { name: 'specificity', result: 'warn', detail: 'Has one specificity signal. Add a second (e.g. exact number AND timeframe) for credibility.' }
  }
  return {
    name: 'specificity',
    result: 'fail',
    detail: 'No number, named entity, timeframe, or named mechanism. Vague hooks get scrolled past. Add at least one specific.',
  }
}

// Gate 2: CURIOSITY (information gap)
function checkCuriosity(hook: string): GateOutcome {
  // Strong curiosity signals: question, "the X that", "why", "how", "what nobody"
  const hasQuestion = /\?/.test(hook)
  const hasGapPhrase = /\b(the\s+\w+\s+(that|nobody|that\s+nobody|why|how|when))\b/i.test(hook)
  const hasReveal = /\b(nobody|never|won't|no one|secret|hidden|the real|the actual|the truth)\b/i.test(hook)
  const hasContradiction = /\b(but|until|except|despite|wrong|backward|opposite)\b/i.test(hook)
  // Negative: starts with bland statement of fact
  const isFlatStatement = /^(this is|here is|here's a|we are|we offer|our|introducing)/i.test(hook.trim())

  if (isFlatStatement) {
    return { name: 'curiosity', result: 'fail', detail: 'Opens with a flat statement of fact. No gap. Reframe as a question, contradiction, or hidden reveal.' }
  }
  if (hasQuestion || hasGapPhrase || hasReveal || hasContradiction) {
    return { name: 'curiosity', result: 'pass', detail: 'Opens an information gap the body must close.' }
  }
  return { name: 'curiosity', result: 'warn', detail: 'No clear curiosity gap. The reader can predict what comes next. Add tension, reveal, or contradiction.' }
}

// Gate 3: PROOF WELDED TO CLAIM
function checkProofWelded(hook: string): GateOutcome {
  // Detect "claim" verbs that need backing
  const hasBigClaim = /\b(\d+x|doubles?|triples?|quadruples?|increases?|decreases?|cuts?|saves?|earns?|made|generates?|adds?|delivers?)\b/i.test(hook)
  if (!hasBigClaim) {
    return { name: 'proof_welded', result: 'pass', detail: 'No big claim made — proof not required for this hook type.' }
  }
  // If big claim made, look for proof element
  const hasProofMarker =
    /\b\d+([,.]\d+)?[k%+]?\b/.test(hook) || // a number
    /\[CLIENT PROOF/.test(hook) || // explicit placeholder
    /\b(study|harvard|mit|stanford|research|tested|verified|tracked|measured)\b/i.test(hook) || // authority
    /[""]/.test(hook) // a quote (testimonial style)
  if (hasProofMarker) {
    return { name: 'proof_welded', result: 'pass', detail: 'Claim is welded to a proof element (number, study, quote, or [CLIENT PROOF] placeholder).' }
  }
  return {
    name: 'proof_welded',
    result: 'fail',
    detail: 'Hook makes a quantifiable claim without an attached proof element. Either add a number/source/quote, or use [CLIENT PROOF: ...] placeholder.',
  }
}

// Gate 4: VOICE (sounds human, not broadcast)
function checkVoice(hook: string): GateOutcome {
  const hasFiller = /\b(in today's|in a world|in an era|in the world of)\b/i.test(hook)
  // Corporate verbs synced with AI_SMELL_BANNED_WORDS — these are the words that signal
  // "broadcast voice" and should fail the voice gate even before they're caught by anti_smell.
  const hasCorporateVerb = /\b(unlock|leverage|harness|elevate|empower|optimize|streamline|facilitate|utilize|embark|delve|navigate|revolutionize)\b/i.test(hook)
  // Title case with five+ words is a red flag (sounds like a billboard)
  const words = hook.split(/\s+/).filter(Boolean)
  const titleCaseFraction = words.length >= 5 ? words.filter(w => /^[A-Z]/.test(w)).length / words.length : 0
  const isTitleCased = titleCaseFraction > 0.7

  if (hasFiller || hasCorporateVerb) {
    return { name: 'voice_human', result: 'fail', detail: 'Contains broadcast/corporate vocabulary. Read it aloud — does a real person talk this way?' }
  }
  if (isTitleCased) {
    return { name: 'voice_human', result: 'warn', detail: 'Title case throughout reads as broadcast advertising. Try sentence case or lowercase for higher trust.' }
  }
  return { name: 'voice_human', result: 'pass', detail: 'Sounds like a specific person, not a broadcast.' }
}

// Gate 5: CONTRACT (heuristic — structural integrity check)
function checkContract(hook: string, format?: HookFormat): GateOutcome {
  // Heuristic: a hook that promises something must reference a delivery medium
  // Without the body, we can only flag obvious overreach
  const hasGuarantee = /\b(guarantee|guaranteed|promise|always|forever|never fails?)\b/i.test(hook)
  const hasUnverifiableSuperlative = /\b(best|greatest|most|world.?class|number\s*one|#1|undisputed)\b/i.test(hook) && !/\d+/.test(hook)

  if (hasUnverifiableSuperlative) {
    return { name: 'contract', result: 'warn', detail: 'Uses "best/most/#1" without quantification. Either add a specific metric or remove the superlative.' }
  }
  if (hasGuarantee) {
    return { name: 'contract', result: 'warn', detail: 'Promises a guarantee — make sure the body delivers it explicitly with terms.' }
  }
  // Format-specific length check feeds into contract
  if (format) {
    const c = FORMAT_CONSTRAINTS[format]
    if (hook.length > c.hardMaxChars) {
      return { name: 'contract', result: 'fail', detail: `Too long for ${format} (${hook.length} chars vs ${c.hardMaxChars} hard max). Reader won't see the full promise. ${c.note}` }
    }
    if (hook.length > c.idealMaxChars) {
      return { name: 'contract', result: 'warn', detail: `Length (${hook.length}) exceeds ideal (${c.idealMaxChars}) for ${format}. Tighten if possible. ${c.note}` }
    }
  }
  return { name: 'contract', result: 'pass', detail: 'Promise is bounded and deliverable.' }
}

// Gate 6: ANTI-AI-SMELL
function checkAntiSmell(hook: string): GateOutcome {
  const { violations, hasSmells } = detectAISmell(hook)
  if (!hasSmells) {
    return { name: 'anti_smell', result: 'pass', detail: 'No banned vocabulary or patterns detected.' }
  }
  return {
    name: 'anti_smell',
    result: 'fail',
    detail: `AI-smell detected: ${violations.slice(0, 3).join(' | ')}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ''}`,
  }
}

// Gate 7: AWARENESS MATCH (tactic appropriate to audience awareness level)
function checkAwarenessMatch(hook: string, awarenessLevel?: AwarenessLevel): GateOutcome {
  if (!awarenessLevel) {
    return { name: 'awareness_match', result: 'pass', detail: 'No awareness level provided — gate skipped. Pass awareness_level for tighter scoring.' }
  }
  // Heuristic checks per level
  const isCold = awarenessLevel === 'unaware' || awarenessLevel === 'problem_aware'
  const isWarm = awarenessLevel === 'solution_aware' || awarenessLevel === 'product_aware'
  const isHot = awarenessLevel === 'most_aware'

  const hasOfferLanguage = /\b(buy|order|get yours|sale|discount|deal|free shipping|order now)\b/i.test(hook)
  const hasMechanismName = /\b(method|system|formula|framework|protocol)\b/i.test(hook)
  const hasComparisonLanguage = /\b(vs|versus|better than|unlike|compared to)\b/i.test(hook)

  if (isHot && !hasOfferLanguage) {
    return { name: 'awareness_match', result: 'warn', detail: 'Most-aware audience — they want the deal. Lead with offer/price/urgency, not curiosity.' }
  }
  if (isCold && hasOfferLanguage) {
    return { name: 'awareness_match', result: 'warn', detail: 'Cold/unaware audience — leading with offer/price feels premature. Build curiosity or relate to a pain first.' }
  }
  if (isWarm && !(hasMechanismName || hasComparisonLanguage)) {
    return { name: 'awareness_match', result: 'warn', detail: 'Solution/product-aware audience — they already know solutions exist. Differentiate via mechanism or comparison.' }
  }
  return { name: 'awareness_match', result: 'pass', detail: 'Tactic appropriate for audience awareness level.' }
}

// ──────────────────────────────────────────────────────────────────────────
// scoreHook — the main evaluator
// ──────────────────────────────────────────────────────────────────────────

export interface ScoreHookOptions {
  format?: HookFormat
  awarenessLevel?: AwarenessLevel
}

const GATE_WEIGHTS: Record<string, number> = {
  specificity: 2.0,
  curiosity: 2.0,
  proof_welded: 1.5,
  voice_human: 1.5,
  contract: 1.0,
  anti_smell: 1.5,
  awareness_match: 0.5,
}
const TOTAL_WEIGHT = Object.values(GATE_WEIGHTS).reduce((a, b) => a + b, 0)

function gateValue(result: GateResult): number {
  return result === 'pass' ? 1 : result === 'warn' ? 0.5 : 0
}

export function scoreHook(hook: string, opts: ScoreHookOptions = {}): HookScore {
  const trimmed = hook.trim()
  const gates: GateOutcome[] = [
    checkSpecificity(trimmed),
    checkCuriosity(trimmed),
    checkProofWelded(trimmed),
    checkVoice(trimmed),
    checkContract(trimmed, opts.format),
    checkAntiSmell(trimmed),
    checkAwarenessMatch(trimmed, opts.awarenessLevel),
  ]

  // Weighted score 0-10
  let weighted = 0
  for (const g of gates) {
    weighted += gateValue(g.result) * (GATE_WEIGHTS[g.name] ?? 1)
  }
  let score = Math.round((weighted / TOTAL_WEIGHT) * 100) / 10 // 0.0 - 10.0

  // HARD CAPS — a single failed gate on a critical dimension is disqualifying.
  // Other passing gates shouldn't inflate a hook that violates the non-negotiables.
  // The caps below produce score labels that match severity:
  //   fail (< 4) — disqualifying, do not deliver
  //   weak (4-6) — revise required
  //   passable (6-7.5) — usable but suboptimal
  const curiosityFailed = gates.find(g => g.name === 'curiosity')?.result === 'fail'
  const specificityFailed = gates.find(g => g.name === 'specificity')?.result === 'fail'
  const antiSmellFailed = gates.find(g => g.name === 'anti_smell')?.result === 'fail'
  const voiceFailed = gates.find(g => g.name === 'voice_human')?.result === 'fail'

  if (antiSmellFailed) score = Math.min(score, 3.9) // banned vocab = catastrophic, label = fail
  if (curiosityFailed) score = Math.min(score, 4.5) // no curiosity = label, not a hook
  if (specificityFailed) score = Math.min(score, 4.5) // no specifics = generic, not a hook
  if (voiceFailed) score = Math.min(score, 4.5) // broadcast voice = ad-shape, scrolled past
  if (curiosityFailed && specificityFailed) score = Math.min(score, 2.5) // double failure = unusable

  // Aggregate violations and suggestions
  const violations = gates.filter(g => g.result === 'fail').map(g => `${g.name}: ${g.detail}`)
  const warnings = gates.filter(g => g.result === 'warn').map(g => `${g.name}: ${g.detail}`)
  const suggestions = [...violations, ...warnings]

  let scoreLabel: HookScore['scoreLabel']
  if (score < 4) scoreLabel = 'fail'
  else if (score < 6) scoreLabel = 'weak'
  else if (score < 7.5) scoreLabel = 'passable'
  else if (score < 9) scoreLabel = 'strong'
  else scoreLabel = 'excellent'

  return {
    score,
    scoreLabel,
    gates,
    violations,
    suggestions,
    format: opts.format,
    awarenessLevel: opts.awarenessLevel,
  }
}

export type Tactic = 'confession' | 'bold_claim' | 'relatability' | 'contrast' | 'curiosity'

/**
 * Map a hook to one of the Hook Lab 5 tactics, by best-guess heuristic.
 * Used by the persistence layer for aggregation. Order matters: more specific
 * patterns are checked first so they aren't shadowed by broader ones.
 */
export function inferTactic(hook: string): Tactic {
  // Confession is most specific: first-person vulnerability
  if (/\b(i\s+(was|tried|failed|lost|spent|almost)|my\s+\w+\s+(was|told|said))\b/i.test(hook)) return 'confession'
  // Contrast checked BEFORE bold_claim because contrast is structurally more specific.
  // A hook like "We cut costs 40% BUT competitors charge 2x more" is fundamentally a
  // contrast move; checking bold_claim first would mislabel it.
  if (/\b(but|until|except|despite|wrong|backward|actually|really|truly|opposite)\b/i.test(hook)) return 'contrast'
  // Bold claim: specific quantified assertion
  if (/\b(\d+x|doubled?|tripled?|increased|cut|saved|earned|generated|made)\b/i.test(hook)) return 'bold_claim'
  // Relatability: second-person mirror
  if (/\b(if\s+you|when\s+you|ever\s+(tried|wondered|noticed|felt))\b/i.test(hook)) return 'relatability'
  // Default: curiosity (the most universal tactic)
  return 'curiosity'
}

// ──────────────────────────────────────────────────────────────────────────
// THE DOCTRINE — injected into every writing bot's system prompt
// ──────────────────────────────────────────────────────────────────────────

const HOOK_FRAMEWORK_DOCTRINE = `
HOOK & HEADLINE FRAMEWORK (canonical doctrine for all writing bots)

Hooks and headlines do 80%+ of the conversion work. A weak opener kills strong body copy. A strong opener earns the right to be read. These rules are not stylistic preferences — they are the convergent craft laws that every direct response master from Hopkins to Halbert to Hormozi independently arrived at.

THE THREE ARTIFACTS — never confuse them
- HEADLINE: the line on the page or screen that earns the click or first attention. Its job is selection + promise + pattern interrupt. It is read by people who haven't yet decided to read.
- HOOK: the first sentence (or first three sentences) of the body. Its job is to validate the headline's promise and start the slippery slide. It is read by people who have just decided to read and are looking for any reason to leave.
- SUBHEAD: not a label, not a topic marker. It is a second headline. Every subhead must do persuasion work — provoke, claim, or create curiosity. A reader who only reads your subheads should still want to buy. NEVER use placeholder section headers like "The Problem" or "How It Works" — those are dead.

THE 7 GATES (every hook must pass these)
1. SPECIFICITY — has at least one number, named entity, timeframe, or named mechanism. Vague hooks get scrolled past. "$47,329" beats "around $50K". "By Friday" beats "soon". Odd numbers feel audited; round numbers feel fabricated.
2. CURIOSITY — opens an information gap the body must close. Loewenstein's law: curiosity fires when the gap is perceivable but not yet closeable. Give the category, withhold the specific. The brain needs the resolution.
3. PROOF WELDED TO CLAIM — Bencivenga's rule: never trumpet a claim without joining proof at the hip. If you make a quantifiable claim, the proof element travels with it (a number, a study, a quote, a named source). If real proof doesn't exist yet, use [CLIENT PROOF: ...] placeholder. Never fabricate.
4. VOICE — sounds like one specific person talking to one specific person. NOT broadcast voice. NOT corporate. NOT an announcer. Lowercase often beats title case. Fragments beat full sentences. Read it aloud — would a real human say this at a dinner party? If no, rewrite.
5. CONTRACT — whatever the hook promises, the body delivers, in order. Welsh's rule: the hook is a contract. Clickbait that doesn't pay off destroys trust for every future hook from that source.
6. ANTI-AI-SMELL — no banned vocabulary. The 2024 power words are now AI tells: "unlock," "leverage," "harness," "dive in," "game-changer," "buckle up," "elevate," "empower," "in today's fast-paced world," "in a world where," em-dash "X — it's Y" reversal, "It's not just X, it's Y." These actively reduce trust now. Avoid them in hooks especially. Avoid them in body copy whenever possible.
7. AWARENESS MATCH — Schwartz's framework determines tactic selection.
   - Unaware/Cold → curiosity, story, surprising truth (do not lead with offer or mechanism)
   - Problem-Aware → relate to the pain in their language, name the failed solutions
   - Solution-Aware → introduce the unique mechanism, contrast against alternatives
   - Product-Aware → lead with proof, objection killers, urgency, offer details
   - Most-Aware → lead with the deal itself; tactic matters less than price and access

THE ANTI-CLEVERNESS RULE (most violated, most important)
Visceral always beats clever. The masters all converged on this: Ogilvy hated puns, Hopkins said frivolity has no place, Burnett said sell the product not the ad, Bencivenga banned hype.

When writing a hook:
- Lead with ONE concrete physical image. Not three stacked clauses with qualifiers.
- Use ONE visceral verb (steal, inject, trap, bottle, force-feed, slam, shatter). Not "leverage" or "harness."
- The benefit closes the sentence — never leads it.
- If a sentence has two concepts, you have one too many. Cut.
- "Steal the brains of a master copywriter and inject them into every ad you write" beats "trap everything your best campaign ever learned and force-feed it into every campaign that comes after which is honestly the compounding loop you've been missing."

The first one is one image, two verbs, one promise. The second is three concepts pretending to be one sentence.

THE CONTRACT BETWEEN HOOK AND BODY
A hook that promises X must deliver X, in the order it was promised, in the body. The "hook is a contract" rule (Welsh) is the single most-violated modern rule. Don't promise a 7-step framework and then deliver 5 steps. Don't promise a story and then deliver advice. Don't promise a number and then never reference it again.

THE evaluate_hook TOOL
You have access to a tool called evaluate_hook. Use it before finalizing any critical opener — landing page H1, ad headline, email subject, video first frame, VSL opening line. Pass the hook + format + awareness_level. The tool returns a 0-10 score, named gate failures, and revision suggestions. If the score is below 7, revise and re-score before delivering. Do not announce this process to the user — just deliver hooks that have passed.

THE get_winning_hooks TOOL (when available)
Before drafting hooks for a client, call get_winning_hooks to learn what's already converted in their market. Use the returned tactics and patterns as starting weight, not as templates to copy. Hooks that have actually converted for this client or their niche outweigh framework defaults.

WHY THIS MATTERS
Every campaign you've ever run threw away everything it learned. This system is the first place where hook craft compounds — every generated hook is scored, every delivered hook is tagged, every winner feeds back into the framework. The doctrine above is the floor. The data is the ceiling. Use both.
`.trim()

/**
 * Returns the doctrine block for injection into bot system prompts.
 * Wrapped in delimiters so it's visually distinct from the bot's own prompt.
 */
export function buildHookFrameworkBlock(): string {
  return `

================================================================
HOOK FRAMEWORK ALIGNMENT (shared across all writing bots)
================================================================

${HOOK_FRAMEWORK_DOCTRINE}

================================================================
END HOOK FRAMEWORK ALIGNMENT
================================================================
`
}
