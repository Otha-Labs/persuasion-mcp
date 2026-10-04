// Copied from persuasion-ecosystem lib/flow-framework.ts on 2026-10-03. Pure module: no I/O, no AI calls.
// Keep in sync with the source until both import a shared package.
import { detectAISmell } from './hook-framework.js'
import { safeSlice } from './string-utils.js'

/**
 * FLOW & CADENCE FRAMEWORK — Phase 1 of the writing-tools strategy.
 *
 * The hook framework scores individual openers. The flow framework scores
 * everything else: paragraphs, body sections, ad scripts, email bodies. It
 * is the post-generation statistical detector that catches the "AI smell"
 * patterns no prompt instruction can reliably suppress, in particular the
 * "Five bots. Ten principles. That's not X, it's Y." rhythm tic.
 *
 * Three layers, called in order. Each layer cheaper than the next.
 *
 *   Layer 1 — SURFACE: regex/lexicon. Banned words, em-dash density,
 *             negative-parallelism cap, triad ratio. Always fires.
 *   Layer 2 — CADENCE: statistical. Sentence-length burstiness, paragraph
 *             variance, rhythmic contrast, opening uniformity. Skipped on
 *             non-prose contexts (bullets, headers, ad copy, subject lines)
 *             where uniformity is by design.
 *   Layer 3 — FLOW: discourse-aware approximations (no POS tagger). Bucket-
 *             brigade density, threading ratio, closing-recap detection.
 *             Same context gating as Layer 2.
 *
 * Pure module — no I/O, no DB. The evaluate_flow tool wraps this and
 * persists the result. Reuses AI-smell lexicon from hook-framework.ts so
 * the banned-word list has a single source of truth.
 */

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type FlowContext =
  | 'hero'
  | 'body'
  | 'long_form'
  | 'email'
  | 'ad'
  | 'bullets'
  | 'header'
  | 'subject'
  | 'tldr'

interface FlowGateResult {
  name: string
  layer: 'surface' | 'cadence' | 'flow'
  status: 'pass' | 'warn' | 'fail'
  detail?: string
}

interface FlowViolation {
  pattern: string
  span: string
  reason: string
}

export interface FlowScore {
  score: number // 0.0 - 10.0
  scoreLabel: 'fail' | 'weak' | 'passable' | 'strong' | 'excellent'
  gates: FlowGateResult[]
  violations: FlowViolation[]
  suggestions: string[]
  metadata: {
    /** Counts for the ORIGINAL input. Always reflect what the bot passed in,
     *  not what was actually scored. When `sampled` is true, the scoring
     *  numbers came from the windows below — these stats describe the whole. */
    wordCount: number
    sentenceCount: number
    paragraphCount: number
    /** True when input exceeded MAX_FULL_WORDS and was sampled. */
    sampled: boolean
    /** When sampled: number of paragraphs/windows that were actually scored. */
    sampledWindowCount?: number
    /** When sampled: word count of the scored subset (so the user can see
     *  how representative the sample is). */
    sampledWordCount?: number
    contextGated: ('cadence' | 'flow')[]
  }
}

export interface ScoreFlowOptions {
  context?: FlowContext
  /** Bot opts in to deliberate negative parallelism (Copy Autopsy diagnosing,
   *  The Closer / Modern Masters teaching, White Stag character voice). */
  allowAntithesis?: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Tunables
// ──────────────────────────────────────────────────────────────────────────

/** Layer 2/3 do not fire on these contexts — they violate the gates by design. */
const NON_PROSE_CONTEXTS: ReadonlySet<FlowContext> = new Set([
  'bullets',
  'header',
  'subject',
  'tldr',
])

/** Above this word count, sample 3 random 1.5k-word windows + first/last paragraph. */
const MAX_FULL_WORDS = 8000
const SAMPLE_WINDOW_WORDS = 1500
const SAMPLE_WINDOW_COUNT = 3

/** Negative-parallelism cap: at most 1 per N words (default), unless allow_antithesis. */
const NEGATIVE_PARALLELISM_PER_WORDS = 500

/** Em-dash density: max em-dashes per 150 words. */
const EM_DASH_DENSITY_THRESHOLD = 1.0

/** Triad-ratio: 3-item adjective stacks / total adjective stacks. */
const TRIAD_RATIO_THRESHOLD = 0.4

/** Burstiness target: stdev of sentence word counts in [8, 14]. Flag if < 6. */
const BURSTINESS_TARGET_MIN = 8
const BURSTINESS_FAIL_BELOW = 6

/** Threading ratio target: at least 0.5 of sentences thread to the prior. */
const THREADING_TARGET = 0.5
const THREADING_FAIL_BELOW = 0.4

/** Bucket-brigade density target: > 1 per 300 words in long-form. */
const BUCKET_BRIGADE_PER_WORDS_LONG_FORM = 300

/** Closing-recap noun overlap fail threshold. */
const RECAP_OVERLAP_THRESHOLD = 0.7
const RECAP_NEW_NOUN_THRESHOLD = 2

// ──────────────────────────────────────────────────────────────────────────
// Tokenization helpers (deliberately lightweight, no POS tagger)
// ──────────────────────────────────────────────────────────────────────────

// Sentence splitter. A sentence ends at terminal punctuation (. ! ? or …, maybe
// followed by a closing quote or bracket) before whitespace and a capital, quote
// or bracket, or at a line break before one, since ad copy often runs one
// thought per line with no full stop. A negative lookbehind for the most common
// abbreviations + initials keeps "Mr. Smith" / "U.S. Air Force" / "e.g. Smith"
// as ONE sentence instead of emitting a 2-word fragment that would drag
// burstiness σ toward zero.
//
// REGRESSION (fixed 2026-10-03): the abbreviation fix described below dropped
// the `(?<=[.!?])` requirement altogether, so the splitter broke at EVERY
// capitalized word or quote. "This is the Persuasion Taxonomy, from Coppica."
// came out as four sentences, which skewed burstiness, band distribution,
// threading and recap checks on any copy with a brand name or a quote in it.
// Terminal punctuation is required again, through its own positive lookbehind.
//
// CRITICAL: the trailing `\.` must live INSIDE the lookbehind alternation, not
// be inferred from `(?<=[.!?])` separately. For "Mr. Smith" the cursor sits
// AFTER the period, so the chars "before the cursor" are "Mr." (4 chars
// including the period). The previous version used `(?<!\bMr)(?<=[.!?])`
// which checked "are the last 2 chars 'Mr'?" — but the last 2 chars are "r."
// not "Mr", so the assertion always passed and the regex never excluded any
// abbreviation. The fix is `(?<!\bMr\.)\s+` which correctly checks "are the
// last 3 chars 'Mr.'?". JS regex supports variable-width lookbehind (Node
// 16+, V8) so the alternation can have entries of different lengths.
//
// Pure-JS approximation — a real NLP tagger would catch more edge cases at
// the cost of a 250kb dep we explicitly avoid.
// At a line break only titles that come before a name are guarded, so "Dr." wrapped onto a new
// line before "Smith" stays one sentence, while "Acme Inc." or "etc." at the end of a line still
// ends that line's thought.
const NOT_AFTER_ABBREVIATION = String.raw`(?<!\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Prof|Rev|Hon|U\.S|U\.K|U\.S\.A|e\.g|i\.e|etc|vs|cf|ca|approx|incl|excl|fig|ref|Inc|Ltd|Co|Corp)\.)`
const NOT_AFTER_TITLE = String.raw`(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|Hon|St)\.)`
const SENTENCE_SPLIT = new RegExp(
  String.raw`(?<=[.!?…]["'’”)\]]?)${NOT_AFTER_ABBREVIATION}\s+(?=[A-Z"'“‘(])` +
    String.raw`|${NOT_AFTER_TITLE}[^\S\n]*\n\s*(?=[A-Z"'“‘(])`,
  'g',
)
const WORD_SPLIT = /\s+/

export function splitSentences(text: string): string[] {
  // Collapse whitespace runs first. A long run made the split regex backtrack
  // quadratically (60k spaces took ~3 s); paragraphs are split separately, from
  // the raw text, so nothing downstream needs the original spacing.
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

function countWords(text: string): number {
  if (!text) return 0
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(WORD_SPLIT).length
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(WORD_SPLIT)
    .filter((w) => w.length >= 4)
}

// Words too generic to count as "shared content nouns" between sentences.
const STOPWORDS: ReadonlySet<string> = new Set([
  'this', 'that', 'these', 'those', 'with', 'from', 'will', 'have', 'were',
  'been', 'they', 'them', 'their', 'there', 'which', 'when', 'where', 'what',
  'about', 'into', 'over', 'than', 'then', 'just', 'only', 'every', 'some',
  'most', 'more', 'other', 'such', 'also', 'even', 'much', 'very', 'still',
  'because', 'while', 'after', 'before', 'between', 'across', 'through',
  'something', 'someone', 'nothing', 'really', 'should', 'would', 'could',
  'going', 'made', 'make', 'many', 'know', 'like', 'good', 'best', 'work',
  'works', 'working', 'used', 'using',
])

function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of tokenizeWords(text)) {
    if (!STOPWORDS.has(w)) out.add(w)
  }
  return out
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length
  return Math.sqrt(variance)
}

// ──────────────────────────────────────────────────────────────────────────
// Sampling for length-capped inputs
// ──────────────────────────────────────────────────────────────────────────

function sampleWindows(text: string): { sampledText: string; sampledWindowCount: number } {
  const words = text.trim().split(WORD_SPLIT)
  if (words.length <= MAX_FULL_WORDS) {
    return { sampledText: text, sampledWindowCount: 0 }
  }
  const windows: string[] = []
  // First and last paragraphs always included for opening/closing scoring.
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length >= 2) {
    windows.push(paragraphs[0])
    windows.push(paragraphs[paragraphs.length - 1])
  } else {
    // Single-paragraph 8k+ word block: rare. Fall back to word-slice but
    // pad to nearest sentence boundary on both ends.
    windows.push(words.slice(0, 200).join(' '))
    windows.push(words.slice(-200).join(' '))
  }
  // Sample SAMPLE_WINDOW_COUNT windows by paragraph index (NOT word offset).
  // Word-slicing at random offsets cuts sentences mid-stream and creates
  // 1-3 word fragments at boundaries that pollute burstiness/threading.
  // Paragraphs are the natural structural unit — keep them intact.
  if (paragraphs.length > 4) {
    // Each window: ~SAMPLE_WINDOW_WORDS worth of contiguous paragraphs.
    const interiorParagraphs = paragraphs.slice(1, -1)
    const avgPara = interiorParagraphs.reduce((s, p) => s + countWords(p), 0) / interiorParagraphs.length
    const parasPerWindow = Math.max(1, Math.round(SAMPLE_WINDOW_WORDS / Math.max(1, avgPara)))

    for (let i = 0; i < SAMPLE_WINDOW_COUNT; i++) {
      const maxStart = Math.max(0, interiorParagraphs.length - parasPerWindow)
      const startIdx = Math.floor(Math.random() * (maxStart + 1))
      const slice = interiorParagraphs.slice(startIdx, startIdx + parasPerWindow)
      if (slice.length > 0) windows.push(slice.join('\n\n'))
    }
  }
  return {
    sampledText: windows.join('\n\n'),
    sampledWindowCount: windows.length,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 1 — SURFACE
// ──────────────────────────────────────────────────────────────────────────

const NEGATIVE_PARALLELISM_REGEX = /\bit'?s\s+not\s+(just\s+)?[^.!?]{1,60}[,.]?\s+it'?s\s+[^.!?]{1,60}[.!?]/gi

function layerSurface(
  text: string,
  options: ScoreFlowOptions,
): { gates: FlowGateResult[]; violations: FlowViolation[] } {
  const gates: FlowGateResult[] = []
  const violations: FlowViolation[] = []
  const wordCount = countWords(text)

  // 1a. Banned words (delegates to hook-framework's lexicon for SSOT).
  const smell = detectAISmell(text)
  if (smell.hasSmells) {
    gates.push({
      name: 'ai_smell_lexicon',
      layer: 'surface',
      status: 'fail',
      detail: smell.violations.slice(0, 5).join('; '),
    })
    for (const v of smell.violations) {
      violations.push({ pattern: 'banned_word', span: v, reason: 'AI-smell vocabulary' })
    }
  } else {
    gates.push({ name: 'ai_smell_lexicon', layer: 'surface', status: 'pass' })
  }

  // 1b. Em-dash density: max EM_DASH_DENSITY_THRESHOLD per 150 words.
  const emDashCount = (text.match(/—/g) || []).length
  const emDashDensity = emDashCount / Math.max(1, wordCount / 150)
  if (emDashDensity > EM_DASH_DENSITY_THRESHOLD) {
    gates.push({
      name: 'em_dash_density',
      layer: 'surface',
      status: 'fail',
      detail: 'Too many em-dashes for this word count — humans use them less often.',
    })
  } else {
    gates.push({ name: 'em_dash_density', layer: 'surface', status: 'pass' })
  }

  // 1c. Negative parallelism cap (the "Five bots. Ten principles." tic).
  const matches = text.match(NEGATIVE_PARALLELISM_REGEX) || []
  const allowance = Math.max(1, Math.floor(wordCount / NEGATIVE_PARALLELISM_PER_WORDS))
  const cap = options.allowAntithesis ? Math.max(allowance * 3, 5) : allowance
  if (matches.length > cap) {
    gates.push({
      name: 'negative_parallelism_cap',
      layer: 'surface',
      status: 'fail',
      detail: `Too many "it's not X, it's Y" constructions for this length${options.allowAntithesis ? ' (you set deliberate=true, but still over the deliberate cap)' : ' — cut to one assertion'}.`,
    })
    for (const m of matches.slice(0, 5)) {
      violations.push({
        pattern: 'negative_parallelism',
        span: m.trim(),
        reason: 'Antithesis construction is the highest-frequency AI-smell rhythm. Cut to one assertion.',
      })
    }
  } else {
    gates.push({
      name: 'negative_parallelism_cap',
      layer: 'surface',
      status: 'pass',
      detail: `${matches.length}/${cap}`,
    })
  }

  // 1d. Triad density — three-adjective stacks attached to abstract corporate
  // nouns ("innovative, scalable, and robust platform"). Tightened from a
  // generic three-item list pattern (which false-positived on legitimate
  // lists like "apples, oranges, and bananas") to require an abstract closer
  // noun. Mirrors the hook-framework `tripled_adjectives` pattern.
  const triadMatches = text.match(
    /\b(\w+ly\s+)?\w+,\s+\w+,?\s+and\s+\w+\s+(experience|approach|solution|platform|system|journey|landscape|ecosystem|framework|method)\b/gi,
  ) || []
  const triadDensity = triadMatches.length / Math.max(1, wordCount / 200)
  if (triadDensity > TRIAD_RATIO_THRESHOLD) {
    gates.push({
      name: 'triad_density',
      layer: 'surface',
      status: 'warn',
      detail: 'Multiple three-adjective stacks attached to abstract nouns — humans pile up modifiers less often.',
    })
  } else {
    gates.push({ name: 'triad_density', layer: 'surface', status: 'pass' })
  }

  return { gates, violations }
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 2 — CADENCE
// ──────────────────────────────────────────────────────────────────────────

function layerCadence(text: string): { gates: FlowGateResult[]; violations: FlowViolation[] } {
  const gates: FlowGateResult[] = []
  const violations: FlowViolation[] = []
  const sentences = splitSentences(text)
  const paragraphs = splitParagraphs(text)

  if (sentences.length < 4) {
    gates.push({
      name: 'burstiness',
      layer: 'cadence',
      status: 'pass',
      detail: 'too few sentences to score',
    })
    return { gates, violations }
  }

  // 2a. Sentence-length burstiness (the single best statistical AI tell).
  const sentenceLengths = sentences.map(countWords)
  const sigma = stdev(sentenceLengths)
  if (sigma < BURSTINESS_FAIL_BELOW) {
    gates.push({
      name: 'burstiness',
      layer: 'cadence',
      status: 'fail',
      detail: 'Sentences are too uniform in length — humans vary. Drop a 3-word punch next to a 25-word build.',
    })
    violations.push({
      pattern: 'low_burstiness',
      span: '',
      reason: 'Mix sentence lengths. Drop a 3-word punch next to a 25-word build.',
    })
  } else if (sigma < BURSTINESS_TARGET_MIN) {
    gates.push({
      name: 'burstiness',
      layer: 'cadence',
      status: 'warn',
      detail: 'Sentence lengths are still pretty uniform — vary more.',
    })
  } else {
    gates.push({
      name: 'burstiness',
      layer: 'cadence',
      status: 'pass',
      detail: 'ok',
    })
  }

  // 2b. Paragraph-length variance.
  if (paragraphs.length >= 5) {
    const paragraphLengths = paragraphs.map(countWords)
    const paragraphSigma = stdev(paragraphLengths)
    if (paragraphSigma < 1.5) {
      gates.push({
        name: 'paragraph_variance',
        layer: 'cadence',
        status: 'warn',
        detail: 'Paragraphs are similar in length — vary the rhythm.',
      })
    } else {
      gates.push({
        name: 'paragraph_variance',
        layer: 'cadence',
        status: 'pass',
      })
    }
  }

  // 2c. Rhythmic contrast — every 4-sentence stretch should have a (max-min)
  //     of at least 10 words.
  let lowContrastWindows = 0
  for (let i = 0; i + 4 <= sentenceLengths.length; i++) {
    const window = sentenceLengths.slice(i, i + 4)
    if (Math.max(...window) - Math.min(...window) < 10) {
      lowContrastWindows += 1
    }
  }
  if (lowContrastWindows > Math.max(1, Math.floor(sentenceLengths.length / 8))) {
    gates.push({
      name: 'rhythmic_contrast',
      layer: 'cadence',
      status: 'warn',
      detail: 'Stretches of sentences are landing at similar lengths — vary the rhythm with a short punch or long build.',
    })
  } else {
    gates.push({ name: 'rhythmic_contrast', layer: 'cadence', status: 'pass' })
  }

  // 2d. Sentence length band distribution — practitioner-derived targets:
  //     Short (1-5): ~10%, Medium (6-15): ~55-60%, Long (16-25): ~20-25%, Very Long (26+): ~5-10%
  //     The specific percentages are heuristics, not peer-reviewed. The principle
  //     of variation IS validated (stylometry, readability research). We flag
  //     extreme imbalances, not minor deviations from the target.
  if (sentenceLengths.length >= 8) {
    const total = sentenceLengths.length
    const shortCount = sentenceLengths.filter((l) => l <= 5).length
    const mediumCount = sentenceLengths.filter((l) => l >= 6 && l <= 15).length
    const longCount = sentenceLengths.filter((l) => l >= 16 && l <= 25).length
    const veryLongCount = sentenceLengths.filter((l) => l >= 26).length

    const shortPct = shortCount / total
    const longPlusPct = (longCount + veryLongCount) / total

    // Flag if zero short punches (no impact sentences) or zero long builds (no crescendo)
    const bandIssues: string[] = []
    if (shortPct === 0) bandIssues.push('no short punches (1-5 words) — add impact sentences')
    if (longPlusPct < 0.1) bandIssues.push('< 10% long sentences (16+ words) — copy lacks crescendo and momentum')
    if (mediumCount / total > 0.85) bandIssues.push('> 85% medium length — monotonous middle-of-the-road rhythm')

    if (bandIssues.length > 0) {
      gates.push({
        name: 'band_distribution',
        layer: 'cadence',
        status: 'warn',
        detail: bandIssues.join('. ') + '.',
      })
    } else {
      gates.push({
        name: 'band_distribution',
        layer: 'cadence',
        status: 'pass',
        detail: 'ok',
      })
    }
  }

  // 2e. Consecutive same-band — 3+ consecutive sentences in the same length
  //     band produces a flat, robotic rhythm. The "never 2+ consecutive" rule
  //     is strict; we flag at 3+ as a warn (practitioners vary on threshold).
  if (sentenceLengths.length >= 6) {
    const getBand = (len: number): string =>
      len <= 5 ? 'short' : len <= 15 ? 'medium' : len <= 25 ? 'long' : 'vlong'
    let maxConsecutive = 1
    let currentRun = 1
    for (let i = 1; i < sentenceLengths.length; i++) {
      if (getBand(sentenceLengths[i]) === getBand(sentenceLengths[i - 1])) {
        currentRun++
        if (currentRun > maxConsecutive) maxConsecutive = currentRun
      } else {
        currentRun = 1
      }
    }
    if (maxConsecutive >= 4) {
      gates.push({
        name: 'consecutive_band',
        layer: 'cadence',
        status: 'warn',
        detail: 'Multiple sentences in a row are the same approximate length — flatline rhythm. Break it up with a short punch or a long build.',
      })
      violations.push({
        pattern: 'consecutive_same_band',
        span: '',
        reason: 'Never let 3+ consecutive sentences land in the same length band. This produces flat, robotic copy.',
      })
    } else {
      gates.push({ name: 'consecutive_band', layer: 'cadence', status: 'pass' })
    }
  }

  // 2f. Paragraph opening uniformity — first 3 tokens of each paragraph.
  if (paragraphs.length >= 4) {
    const openings = paragraphs.map((p) =>
      p.toLowerCase().split(/\s+/).slice(0, 3).join(' '),
    )
    const counts = new Map<string, number>()
    for (const o of openings) counts.set(o, (counts.get(o) || 0) + 1)
    const maxRepeat = Math.max(...counts.values())
    const repeatRatio = maxRepeat / openings.length
    if (repeatRatio > 0.6) {
      gates.push({
        name: 'opening_uniformity',
        layer: 'cadence',
        status: 'warn',
        detail: 'Most paragraphs open with the same shape — vary the openings.',
      })
    } else {
      gates.push({ name: 'opening_uniformity', layer: 'cadence', status: 'pass' })
    }
  }

  return { gates, violations }
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 3 — FLOW (discourse-aware, no POS tagger)
// ──────────────────────────────────────────────────────────────────────────

const PRONOUN_OPENERS = new Set([
  'it', "it's", 'this', 'that', 'these', 'those', 'they', "they're", 'he', 'she',
  'his', 'her', 'their', 'theirs', 'them',
])

const DISCOURSE_OPENERS = new Set([
  'so', 'but', 'and', 'then', 'because', 'which', "that's", "here's", 'still',
  'yet', 'now', 'plus', 'except', 'meanwhile', 'because', 'since',
])

const BUCKET_BRIGADES = [
  "here's the thing", 'but', 'look:', 'now,', 'the kicker', 'bottom line',
  'and yet', 'still,', 'even so', 'watch this', 'imagine', 'the catch?',
  "here's what", "the truth is", 'one more thing', "here's why",
]

function firstWord(sentence: string): string {
  return (sentence.toLowerCase().match(/^[a-z']+/) || [''])[0]
}

function layerFlow(
  text: string,
  context: FlowContext,
): { gates: FlowGateResult[]; violations: FlowViolation[] } {
  const gates: FlowGateResult[] = []
  const violations: FlowViolation[] = []
  const sentences = splitSentences(text)
  const paragraphs = splitParagraphs(text)
  const wordCount = countWords(text)

  if (sentences.length < 4) return { gates, violations }

  // 3a. Bucket-brigade density (long-form / body only).
  const isLongForm = context === 'long_form' || (context === 'body' && wordCount >= 400)
  if (isLongForm) {
    const lower = text.toLowerCase()
    let bucketCount = 0
    for (const phrase of BUCKET_BRIGADES) {
      // Trailing (?!\w) (negative lookahead for word char) acts as a "right
      // boundary" that works whether the phrase ends in a word char ("but")
      // OR punctuation ("look:" / "the catch?"). A plain \b would only work
      // for word-char endings and would cause "but" to match inside
      // "butterfly".
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matches = lower.match(new RegExp(`\\b${escaped}(?!\\w)`, 'g'))
      if (matches) bucketCount += matches.length
    }
    const target = Math.max(1, Math.floor(wordCount / BUCKET_BRIGADE_PER_WORDS_LONG_FORM))
    if (bucketCount < target) {
      gates.push({
        name: 'bucket_brigade_density',
        layer: 'flow',
        status: 'warn',
        detail: 'The prose needs more pull-through phrases — short connectives that drag the reader from one line to the next.',
      })
    } else {
      gates.push({
        name: 'bucket_brigade_density',
        layer: 'flow',
        status: 'pass',
        detail: 'ok',
      })
    }
  }

  // 3b. Threading ratio approximation. A sentence "threads" to the prior if:
  //     (a) it starts with a pronoun referring to the prior, OR
  //     (b) it starts with a discourse connector, OR
  //     (c) it shares at least one 4+ char content noun with the prior.
  let threaded = 0
  for (let i = 1; i < sentences.length; i++) {
    const opener = firstWord(sentences[i])
    if (PRONOUN_OPENERS.has(opener) || DISCOURSE_OPENERS.has(opener)) {
      threaded += 1
      continue
    }
    const prevTokens = contentTokens(sentences[i - 1])
    const currTokens = contentTokens(sentences[i])
    let overlap = false
    for (const t of currTokens) {
      if (prevTokens.has(t)) {
        overlap = true
        break
      }
    }
    if (overlap) threaded += 1
  }
  const threadingRatio = threaded / Math.max(1, sentences.length - 1)
  if (threadingRatio < THREADING_FAIL_BELOW) {
    gates.push({
      name: 'threading_ratio',
      layer: 'flow',
      status: 'fail',
      detail: 'Sentences read as a list, not pulling each other forward. Each one should pick up where the last left off — pronoun reference, discourse connector, or shared key noun.',
    })
    violations.push({
      pattern: 'no_threading',
      span: '',
      reason: 'Each sentence should pick up where the last left off — pronoun reference, discourse connector, or shared key noun.',
    })
  } else if (threadingRatio < THREADING_TARGET) {
    gates.push({
      name: 'threading_ratio',
      layer: 'flow',
      status: 'warn',
      detail: 'Some sentences read as standalone instead of pulling forward.',
    })
  } else {
    gates.push({
      name: 'threading_ratio',
      layer: 'flow',
      status: 'pass',
      detail: 'ok',
    })
  }

  // 3c. Closing recap detection — final paragraph is a recap if it overlaps
  //     heavily with prior content AND adds few new content nouns.
  if (paragraphs.length >= 3 && context !== 'tldr') {
    const finalParagraph = paragraphs[paragraphs.length - 1]
    const priorText = paragraphs.slice(0, -1).join(' ')
    const priorTokens = contentTokens(priorText)
    const finalTokens = contentTokens(finalParagraph)

    if (finalTokens.size > 0) {
      let shared = 0
      let novel = 0
      for (const t of finalTokens) {
        if (priorTokens.has(t)) shared += 1
        else novel += 1
      }
      const overlapRatio = shared / finalTokens.size
      if (overlapRatio > RECAP_OVERLAP_THRESHOLD && novel < RECAP_NEW_NOUN_THRESHOLD) {
        gates.push({
          name: 'closing_recap',
          layer: 'flow',
          status: 'fail',
          detail: 'Final paragraph mostly restates earlier content instead of moving forward. Cut the recap — end on the strongest unique line.',
        })
        violations.push({
          pattern: 'closing_recap',
          span: safeSlice(finalParagraph, 80) + (finalParagraph.length > 80 ? '…' : ''),
          reason: 'Recap paragraphs are AI tell. End on the strongest unique line.',
        })
      } else {
        gates.push({ name: 'closing_recap', layer: 'flow', status: 'pass' })
      }
    }
  }

  return { gates, violations }
}

// ──────────────────────────────────────────────────────────────────────────
// Composition
// ──────────────────────────────────────────────────────────────────────────

function computeScore(gates: FlowGateResult[]): { score: number; label: FlowScore['scoreLabel'] } {
  if (gates.length === 0) return { score: 7.0, label: 'passable' }
  // Each fail costs 2.0, each warn 0.7, baseline 10.
  let score = 10.0
  for (const g of gates) {
    if (g.status === 'fail') score -= 2.0
    else if (g.status === 'warn') score -= 0.7
  }
  if (score < 0) score = 0
  let label: FlowScore['scoreLabel']
  if (score < 3) label = 'fail'
  else if (score < 5.5) label = 'weak'
  else if (score < 7.5) label = 'passable'
  else if (score < 9) label = 'strong'
  else label = 'excellent'
  return { score: Math.round(score * 10) / 10, label }
}

function buildSuggestions(gates: FlowGateResult[]): string[] {
  const out: string[] = []
  for (const g of gates) {
    if (g.status !== 'fail') continue
    switch (g.name) {
      case 'ai_smell_lexicon':
        out.push('Strip the banned vocabulary. Use plain Anglo-Saxon verbs.')
        break
      case 'em_dash_density':
        out.push('Cut em-dashes. Replace with periods or restructure as two clauses.')
        break
      case 'negative_parallelism_cap':
        out.push('Cut "it\'s not X, it\'s Y" constructions. Make one direct assertion instead.')
        break
      case 'burstiness':
        out.push('Vary sentence length aggressively — drop a 3-word punch between longer builds.')
        break
      case 'threading_ratio':
        out.push('Make each sentence pick up the previous one — pronoun, connector, or shared key noun.')
        break
      case 'closing_recap':
        out.push('End on a forward-pointing line. Recaps are an AI tell.')
        break
      case 'consecutive_band':
        out.push('Break up same-length sentence runs. Drop a 3-word punch between medium builds, or let one sentence roll long.')
        break
    }
  }
  return out.slice(0, 3)
}

// ──────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ──────────────────────────────────────────────────────────────────────────

export function scoreFlow(rawText: string, options: ScoreFlowOptions = {}): FlowScore {
  const context: FlowContext = options.context || 'body'

  // Capture the ORIGINAL counts BEFORE sampling so the metadata reflects what
  // the bot passed in, not what was actually scored. When the input exceeds
  // MAX_FULL_WORDS the scoring numbers come from the sampled subset, but the
  // user/bot needs to see the true input size to interpret the score honestly.
  const originalWordCount = countWords(rawText)
  const originalSentenceCount = splitSentences(rawText).length
  const originalParagraphCount = splitParagraphs(rawText).length

  const { sampledText, sampledWindowCount } = sampleWindows(rawText)
  const text = sampledText
  const sampledWordCount = countWords(text)

  const gates: FlowGateResult[] = []
  const violations: FlowViolation[] = []
  const contextGated: ('cadence' | 'flow')[] = []

  // Layer 1 always fires.
  const surface = layerSurface(text, options)
  gates.push(...surface.gates)
  violations.push(...surface.violations)

  // Layers 2 & 3 only fire on prose contexts.
  const isProse = !NON_PROSE_CONTEXTS.has(context)
  if (isProse) {
    const cadence = layerCadence(text)
    gates.push(...cadence.gates)
    violations.push(...cadence.violations)
    const flow = layerFlow(text, context)
    gates.push(...flow.gates)
    violations.push(...flow.violations)
  } else {
    contextGated.push('cadence', 'flow')
  }

  const { score, label } = computeScore(gates)
  const suggestions = buildSuggestions(gates)

  const wasSampled = sampledWindowCount > 0
  return {
    score,
    scoreLabel: label,
    gates,
    violations,
    suggestions,
    metadata: {
      wordCount: originalWordCount,
      sentenceCount: originalSentenceCount,
      paragraphCount: originalParagraphCount,
      sampled: wasSampled,
      sampledWindowCount: wasSampled ? sampledWindowCount : undefined,
      sampledWordCount: wasSampled ? sampledWordCount : undefined,
      contextGated,
    },
  }
}
