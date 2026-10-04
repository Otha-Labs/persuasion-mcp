/**
 * Plain-English rendering for everything the scorers report.
 *
 * The scorers in src/scorers/ are copied from Coppica and stay in sync with it, so their own
 * messages are left alone. Nothing they say reaches a model directly: it goes through here first,
 * and comes out as full sentences in the voice of a working copywriter. Every tool output is a
 * sample of the writing we want people to produce, so it has to read like good writing itself.
 */
import type { FlowScore } from './scorers/flow-framework.js'

type FlowGateResult = FlowScore['gates'][number]

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "a", "a and b", "a, b and c" */
export function joinList(items: string[], conj = 'and'): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Add a period unless the sentence already ends in one, including inside a closing quote ('..."Is this for me?"'). */
export const endSentence = (s: string) => (/[.!?…]["')\]]?$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

/**
 * Shorten text to about n characters at the end of a sentence where possible, otherwise at a word,
 * never mid-word. Text the catalog export already cut (ending in …) is pulled back the same way.
 */
export function clipText(s: string, n: number): string {
  const t = s.trim()
  const cps = Array.from(t)
  const cutByExport = t.endsWith('…')
  if (cps.length <= n && !cutByExport) return t
  const cut = cps.length > n ? cps.slice(0, n).join('') : t.slice(0, -1)
  const ends = [...cut.matchAll(/[.!?]["')\]]?(?=\s)/g)]
  const last = ends[ends.length - 1]
  if (last && last.index! + last[0].length >= cut.length * 0.4) return cut.slice(0, last.index! + last[0].length)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:(\[]+$/, '')}…`
}

/** Catalog text quoted inside our own double quotes: turn its inner double quotes into single ones. */
export const innerQuotes = (s: string) => s.replace(/["“”]/g, "'")

// ── machine-written phrasing ─────────────────────────────────────────────────

const PATTERN_TEXT: Record<string, string> = {
  em_dash_reversal: 'The "X, then a dash, then it\'s Y" reversal is one of the most recognizable machine-written moves. Use a period and make the point straight.',
  not_just_but: '"It\'s not just X, it\'s Y" is one of the most recognizable machine-written lines. Say the one thing you mean and let it stand.',
  more_than_just: '"More than just" is filler. Cut it and say what the thing actually is.',
  in_the_world_of: '"In the world of..." is throat-clearing. Skip the setup and make the claim.',
  tripled_adjectives: 'Three adjectives stacked on one noun, like "fast, simple, and powerful platform", is corporate boilerplate. Keep the one claim you can prove.',
  hope_this_helps: '"Hope this helps" is chatbot filler. Cut it.',
  absolutely_great_question: 'Words like "absolutely" and "great question" are chatbot filler. Get to the point.',
}

/** detectAISmell() violations -> stock words found, and one sentence per machine-written pattern. */
export function readSmell(violations: string[]): { words: string[]; patterns: string[] } {
  const words: string[] = []
  const patterns: string[] = []
  for (const v of violations) {
    const w = v.match(/^Banned word\/phrase: "(.+)"$/)
    if (w) { words.push(w[1]); continue }
    const name = v.split(':')[0]
    patterns.push(PATTERN_TEXT[name] ?? v.slice(name.length + 1).trim())
  }
  return { words, patterns }
}

export function smellSentences(violations: string[]): string[] {
  const { words, patterns } = readSmell(violations)
  const out: string[] = []
  if (words.length) {
    const quoted = joinList(words.slice(0, 5).map((w) => `"${w}"`))
    out.push(`Readers now link ${words.length === 1 ? `the word ${quoted}` : `words like ${quoted}`} with machine-written copy, and they skim past ${words.length === 1 ? 'it' : 'them'}. ` +
      `Use the plain word you would say out loud.`)
  }
  return [...out, ...patterns]
}

// ── flow (craft and rhythm) ──────────────────────────────────────────────────

const BAND_TEXT: [RegExp, string][] = [
  [/no short punches/, 'There isn\'t one short, punchy sentence in it.'],
  [/long sentences/, 'Almost nothing runs long enough to build momentum.'],
  [/medium length/, 'Nearly every sentence is medium length, and that is what makes it feel monotonous.'],
]

/** One failing or warning flow gate -> what a good editor would tell the writer. */
export function flowGateSentence(g: FlowGateResult): string | null {
  const fail = g.status === 'fail'
  switch (g.name) {
    case 'ai_smell_lexicon':
      return smellSentences((g.detail ?? '').split('; ').filter(Boolean)).join(' ')
    case 'em_dash_density':
      return 'There are more em dashes than a person would use in this much copy. Most of them want to be periods.'
    case 'negative_parallelism_cap':
      return 'The copy leans on "it\'s not X, it\'s Y" more than once, and readers now hear that as machine-written. Keep the stronger half and say it plainly.'
    case 'triad_density':
      return 'Several lines stack three adjectives on an abstract noun. People rarely talk that way, so keep the one that is true and specific.'
    case 'burstiness':
      return fail
        ? 'The sentences all run about the same length, and that makes the copy drone. Put a three-word line next to a long one that builds.'
        : 'The sentence lengths are still fairly even. Vary them more.'
    case 'paragraph_variance':
      return 'The paragraphs are all about the same size. Let a one-line paragraph land between the longer ones.'
    case 'rhythmic_contrast':
      return 'In places, several sentences in a row land at the same length. Break the run with a short punch or a longer build.'
    case 'band_distribution': {
      const found = BAND_TEXT.filter(([re]) => re.test(g.detail ?? '')).map(([, t]) => t)
      return found.length ? `${found.join(' ')} Mix in a few of each.` : 'The mix of short and long sentences is off. Vary it.'
    }
    case 'consecutive_band':
      return 'Three or more sentences in a row land at the same length, and that is what makes copy sound flat. Break the run.'
    case 'opening_uniformity':
      return 'Most of the paragraphs start the same way. Vary how they open.'
    case 'bucket_brigade_density':
      return 'Long copy needs small phrases that pull the reader on to the next line, like "Here\'s the thing" or "But there\'s a catch." This has too few of them.'
    case 'threading_ratio':
      return fail
        ? 'The sentences read like a list. Each one should pick up where the last one left off, with a pronoun, a word like "so" or "but", or a key word carried over.'
        : 'A few sentences stand alone when they should pull the reader forward.'
    case 'closing_recap':
      return 'The last paragraph mostly repeats what came before. Cut the recap and end on your strongest line.'
    default:
      return g.detail ? g.detail.replace(/\s+—\s+/g, '. ') : null
  }
}

// ── claims and buttons ───────────────────────────────────────────────────────

export function claimGateSentence(name: string, claim: string, type: 'cta' | 'body_claim'): string | null {
  const text = claim.trim()
  const first = text.split(/\s+/)[0] ?? ''
  const words = text.split(/\s+/).filter(Boolean).length
  switch (name) {
    case 'generic_button_text':
      return `"${text}" is the button everyone uses. Say what they get instead, like "Save my seat", "Book my audit" or "Send me the guide".`
    case 'first_person_or_outcome':
      return 'A button works harder in the reader\'s own voice, like "Get my plan", or when it names the thing they get, like a seat, an audit or a guide.'
    case 'strong_action_verb':
      return `It opens with "${first}". A button should open with the verb of the action, like "Get", "Book" or "Start".`
    case 'low_friction':
      return words ? `At ${words} words it reads like a sentence. Keep a button to a few words.` : 'The button is empty.'
    case 'specificity':
      return 'There is no number, name or timeframe in it, so it is easy to forget. Anchor it with one.'
    case 'mechanism_named':
      return 'It doesn\'t say how the result happens. Readers who have heard the promise before believe it more when you name the mechanism, with a "because" or a "by".'
    case 'proof_welded':
      return type === 'body_claim' ? 'There is nothing in it a skeptic could check. Put a real number or a named source right next to the claim.' : null
    case 'empty':
      return 'The claim is empty.'
    case 'too_long':
      return 'That is too long to check as a single claim. For a whole block of copy, use diagnose_marketing_copy.'
    default:
      return null
  }
}
