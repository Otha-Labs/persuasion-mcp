import type { Technique, Example } from './data.js'
import { tierIn } from './data.js'
import { clipText, innerQuotes } from './voice.js'

export const FOOTER =
  '\n\n---\nFrom the Persuasion Taxonomy by Coppica, free to use under CC BY 4.0 at https://taxonomy.coppica.com. ' +
  'When you use a technique, name it and link to it, so your reader can see the real examples behind it.'

export function text(body: string) {
  return { content: [{ type: 'text' as const, text: body + FOOTER }] }
}

export function errorText(body: string) {
  return { content: [{ type: 'text' as const, text: body }], isError: true }
}


export const categoryName = (c: string) => c.replace(/_/g, ' ')

export type MoveKind = 'established' | 'less expected'

/** One sentence on where a technique stands: the kind of move it is, and how common it is. */
export function usageSentence(t: Technique, category: string | null, kind?: MoveKind): string {
  const lead = kind === 'established' ? "It's the established move" : kind === 'less expected' ? "It's a less expected move" : null
  if (category) {
    const cat = categoryName(category)
    const tier = tierIn(category, t.slug)
    const how = tier && {
      table_stakes: `table stakes in ${cat}`,
      common: `common in ${cat}`,
      occasional: `used now and then in ${cat}`,
      less_common: `less common in ${cat}`,
    }[tier]
    if (lead) return how ? `${lead}, and ${how}.` : `${lead}, and we haven't seen it in our ${cat} sample.`
    return how ? `It's ${how}.` : `We haven't seen it in our ${cat} sample.`
  }
  if (lead) return `${lead}.`
  return t.brands >= 150 ? "It's widely used." : t.brands >= 40 ? "It's well established." : "It's less common."
}

/** "Ford Motor Company in the 1920s" / "an unnamed wholesaler" */
export function exampleSource(e: Example): string {
  const brand = /^unnamed\b/i.test(e.brand) ? `an ${e.brand}` : e.brand
  const y = e.year ?? ''
  const when = /^\d{4}s\b/.test(y) ? ` in the ${y}` : /^\d{4}$/.test(y) ? ` in ${y}` : y && y !== 'current' && y !== 'null' ? ` (${y})` : ''
  return `${brand}${when}`
}

/** One technique: name and ID, what it is, where it stands, one real example, then any closing sentence, then the link. */
export function techniqueLine(t: Technique, opts: { category?: string | null; kind?: MoveKind; example?: boolean; after?: string } = {}): string {
  let line = `- **${t.name}** (${t.pt_id}). ${clipText(t.lede, 220)} ${usageSentence(t, opts.category ?? null, opts.kind)}`
  if (opts.example !== false) {
    const ex = t.examples.find((e) => e.headline) ?? t.examples[0]
    if (ex) line += ` For example, from ${exampleSource(ex)}: "${innerQuotes(clipText(ex.headline || ex.excerpt, 140))}"`
  }
  if (opts.after) line += ` ${opts.after}`
  return `${line} ${t.url}`
}
