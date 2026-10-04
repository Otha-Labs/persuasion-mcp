import { z } from 'zod'
import { GOALS, FORMATS, AWARENESS, ROLE_NAMES, ROLES, normalizeRole } from './roles.js'
import { CATEGORY_NAMES } from './data.js'

export const goalSchema = z.enum(GOALS).describe(
  'What the copy has to get the reader to do. Use purchase when they should buy now, signup for an opt-in, a trial, a demo or a lead form, ' +
  'click when the whole job is the click (most ads and links), and engagement for nurture emails, newsletters and social posts that should be read, answered or followed.',
)

export const formatSchema = z.enum(FORMATS).describe(
  'The kind of copy it is: ad, landing_page, sales_letter for long-form sales copy, email, email_subject, social_post, video_script or headline.',
)

export const awarenessSchema = z.enum(AWARENESS).describe(
  "How much the reader already knows, on Eugene Schwartz's scale. Use unaware if they don't know they have the problem, problem_aware if they feel it, " +
  "solution_aware if they know solutions exist, product_aware if they know you, and most_aware if they're ready and only need the offer.",
)

export const roleSchema = z.preprocess(normalizeRole, z.enum(ROLE_NAMES)).describe(
  'The reader question the text answers, by its role name: ' + ROLE_NAMES.map((r) => `${r} for "${ROLES[r].question}"`).join(', ') + '.',
)

export const categorySchema = z.string().max(60).describe(
  `The industry, if you want to compare against what brands in that category usually do. There is enough data for ${CATEGORY_NAMES.join(', ')}. ` +
  'Any other category still works, just without the comparison.',
)

export const modeSchema = z.enum(['aggressive', 'balanced', 'equity']).default('balanced').describe(
  'How hard the copy is allowed to push. Balanced is the default, persuasive and sustainable over time. Equity protects long-term trust, so it rules out fear, hype and hard-sell moves. ' +
  'Aggressive is for short-term direct response and allows fear, threat and hard scarcity. In every mode, the claims stay true.',
)
