/**
 * The nine reader questions (Thesis VIII of The 18 Theses) and the framework
 * tables built on them. Role names, questions and "if missing" lines are copied
 * from persuasion-taxonomy (app/the-nine-roles/roles-data.ts). The glosses, gaps,
 * the click goal, the coherence pairs and the symptom map are written here; the
 * last three were reviewed and approved by Elijah on 2026-10-04.
 *
 * Every string in this file reaches a model, and through it a writer. Keep it in
 * the voice of a working copywriter: plain words, full sentences, no em dashes.
 */

export const ROLE_NAMES = [
  'DISRUPT', 'IDENTIFY', 'AGITATE', 'REFRAME', 'PROVE', 'ELEVATE', 'RESOLVE', 'COMPEL', 'BOND',
] as const
export type Role = (typeof ROLE_NAMES)[number]

export interface RoleInfo {
  num: number
  name: Role
  question: string
  ifMissing: string
  /** Completes "Right now, ..." when the copy leaves this question unanswered. */
  gap: string
  /** Completes "It's betting on ..." and "This question is about ...". */
  gloss: string
}

export const ROLES: Record<Role, RoleInfo> = {
  DISRUPT: { num: 1, name: 'DISRUPT', question: 'Why am I even reading this?', ifMissing: 'Nothing below matters.', gap: "nothing in the opening breaks the reader's autopilot, so they never really arrive", gloss: 'earning the first read' },
  IDENTIFY: { num: 2, name: 'IDENTIFY', question: 'Is this written for me?', ifMissing: "I assume it's for someone else.", gap: 'the copy never shows readers themselves, so it reads as if it were written for anybody', gloss: 'making the reader feel seen' },
  AGITATE: { num: 3, name: 'AGITATE', question: 'How bad is my problem, really?', ifMissing: 'I disengage; the problem feels unrelated.', gap: 'the pain stays abstract, so nothing builds the pressure to fix it', gloss: 'making the problem feel real' },
  REFRAME: { num: 4, name: 'REFRAME', question: 'Am I thinking about this correctly?', ifMissing: 'The default frame keeps the default decision.', gap: 'the copy asserts where it should reframe, so the reader keeps the old way of seeing the problem', gloss: 'changing how they see the problem' },
  PROVE: { num: 5, name: 'PROVE', question: 'Can I trust the claim?', ifMissing: 'All gains are discounted.', gap: 'the claims float with nothing under them, so nothing earns belief', gloss: 'making the claim believable' },
  ELEVATE: { num: 6, name: 'ELEVATE', question: 'What does my life look like after?', ifMissing: "I see information; I don't see myself in it.", gap: "the copy lists features and never shows the reader's life after the change", gloss: 'making the payoff vivid' },
  RESOLVE: { num: 7, name: 'RESOLVE', question: "What's stopping me from saying yes?", ifMissing: 'Doubt accumulates faster than belief.', gap: 'the objections and the risk are still standing between the reader and yes', gloss: 'removing what stops the yes' },
  COMPEL: { num: 8, name: 'COMPEL', question: 'Why should I act right now?', ifMissing: 'I bookmark and never return.', gap: 'nothing makes today the day, so the decision can wait forever', gloss: 'getting them to act now' },
  BOND: { num: 9, name: 'BOND', question: "Do I like and trust who's speaking?", ifMissing: 'Arguments become harder to accept.', gap: 'no relationship forms, so the copy sells at the reader instead of talking with them', gloss: 'making them like and trust the one speaking' },
}

/** The question in quotes, with its role name, for the places a model needs both. */
export const roleLabel = (r: Role) => `"${ROLES[r].question}" (${r})`

// ── Goals ────────────────────────────────────────────────────────────────
export const GOALS = ['purchase', 'signup', 'click', 'engagement'] as const
export type Goal = (typeof GOALS)[number]

/** Each requirement is satisfied by ANY of its roles. purchase/signup/engagement
 *  mirror the analyzer's sales/lead_gen/nurture EXPECTED_ROLES; click was added here (reviewed 2026-10-04). */
export const GOAL_REQUIREMENTS: Record<Goal, Role[][]> = {
  purchase: ROLE_NAMES.map((r) => [r]),
  signup: [['DISRUPT'], ['IDENTIFY'], ['AGITATE'], ['REFRAME'], ['PROVE'], ['COMPEL']],
  engagement: [['DISRUPT'], ['IDENTIFY'], ['REFRAME'], ['PROVE'], ['BOND'], ['COMPEL']],
  click: [['DISRUPT'], ['IDENTIFY'], ['AGITATE', 'ELEVATE'], ['COMPEL']],
}

/** "For a signup, ..." */
export const GOAL_NOUN: Record<Goal, string> = {
  purchase: 'a sale',
  signup: 'a signup',
  click: 'a click',
  engagement: 'engagement',
}

/** "a landing page that ..." */
export const GOAL_CLAUSE: Record<Goal, string> = {
  purchase: 'has to make the sale',
  signup: 'has to get the signup',
  click: 'has to earn the click',
  engagement: 'has to get read and answered',
}

export function expectedRoles(goal: Goal): Set<Role> {
  return new Set(GOAL_REQUIREMENTS[goal].flat())
}

// ── Formats ──────────────────────────────────────────────────────────────
export const FORMATS = ['ad', 'landing_page', 'sales_letter', 'email', 'email_subject', 'social_post', 'video_script', 'headline'] as const
export type Format = (typeof FORMATS)[number]

export const FORMAT_LABEL: Record<Format, string> = {
  ad: 'an ad',
  landing_page: 'a landing page',
  sales_letter: 'a sales letter',
  email: 'an email',
  email_subject: 'an email subject line',
  social_post: 'a social post',
  video_script: 'a video script',
  headline: 'a headline',
}

/** Corpus channel groups where evidence for a technique counts toward "fits this format". */
export const FORMAT_CHANNELS: Record<Format, string[]> = {
  ad: ['ads', 'video'],
  landing_page: ['web', 'direct_mail'],
  sales_letter: ['direct_mail', 'web'],
  email: ['email', 'direct_mail'],
  email_subject: ['email'],
  social_post: ['ads', 'web'],
  video_script: ['video', 'ads'],
  headline: ['ads', 'web'],
}

// ── Awareness (Schwartz) ─────────────────────────────────────────────────
export const AWARENESS = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'] as const
export type Awareness = (typeof AWARENESS)[number]

export const AWARENESS_WEIGHT: Record<Awareness, { heavy: Role[]; note: string }> = {
  unaware: { heavy: ['DISRUPT', 'IDENTIFY', 'AGITATE'], note: "They don't know they have the problem yet, so don't open with the product or the price. Open with their world, or with a surprising truth, and earn the problem before you offer the solution." },
  problem_aware: { heavy: ['AGITATE', 'REFRAME', 'IDENTIFY'], note: "They feel the problem but can't see the way out. Show them you understand it better than they do, and then change the way they see it." },
  solution_aware: { heavy: ['REFRAME', 'PROVE', 'ELEVATE'], note: "They know solutions exist. Show them what's different about yours and prove that it works, or you're just one more option." },
  product_aware: { heavy: ['PROVE', 'RESOLVE', 'COMPEL'], note: "They know you, but they haven't said yes. Take away the doubt and the risk, and give them a reason to act now." },
  most_aware: { heavy: ['COMPEL', 'RESOLVE'], note: "They're ready to buy. Lead with the offer and the reason to act today, because a long argument only slows them down." },
}

// ── Coherence (Thesis X) ─────────────────────────────────────────────────
/** Coherence pairs (reviewed 2026-10-04). Readers check the nine answers against each other; a mismatch is what
 *  they feel as "something's off". These are questions for the calling model to ask. */
export const COHERENCE_CHECKS: { roles: [Role, Role]; check: string }[] = [
  { roles: ['DISRUPT', 'ELEVATE'], check: 'Does the rest of the copy pay off what the opening hints at? A bigger promise up top than the body can deliver reads as bait.' },
  { roles: ['ELEVATE', 'PROVE'], check: 'Is the life after you paint any bigger than your proof can support? It should never be.' },
  { roles: ['IDENTIFY', 'BOND'], check: 'Does the voice sound like someone this reader would trust, using their words, at their level?' },
  { roles: ['AGITATE', 'COMPEL'], check: 'Is the urgency in proportion to the pain you set up? A deadline on a mild problem feels manufactured.' },
  { roles: ['REFRAME', 'PROVE'], check: 'Does your proof support the new way of seeing the problem, or the old one you argued against?' },
  { roles: ['RESOLVE', 'COMPEL'], check: 'Is the risk reversal big enough for the size of the ask?' },
  { roles: ['PROVE', 'BOND'], check: 'Does the proof come from people and sources this reader already trusts?' },
]

// ── Symptoms → unanswered questions ──────────────────────────────────────
export const SYMPTOMS = [
  'low_click_through', 'high_bounce', 'reads_but_no_action', 'starts_but_abandons',
  'leads_dont_buy', 'buys_once_no_return', 'low_open_rate', 'opens_no_clicks',
] as const
export type Symptom = (typeof SYMPTOMS)[number]

export interface SymptomInfo {
  /** Completes "Why it isn't converting: ..." */
  label: string
  /** why + check read as one paragraph: what is going wrong, then how to see it for yourself. */
  suspects: { role: Role | 'COHERENCE'; why: string; check: string }[]
  ruleOutFirst: string
}

/** Symptom map (reviewed 2026-10-04), derived from each role's "if missing" consequence. */
export const SYMPTOM_MAP: Record<Symptom, SymptomInfo> = {
  low_click_through: {
    label: "people see it but don't click",
    suspects: [
      { role: 'DISRUPT', why: 'The scroll wins. Nothing in the first line or the first frame interrupts their autopilot, so they never read the rest.', check: 'To check, read only the first line, or only the words on the thumbnail. If it could run for any brand in your category, it fails this question.' },
      { role: 'IDENTIFY', why: 'Nothing tells them this is for them, so they keep moving.', check: 'To check, look at the opening and ask whether the right person would recognize their own situation in it at a glance.' },
      { role: 'COMPEL', why: 'Even interested readers need a reason to click now and not later.', check: 'To check, find the reason to click today. If all you have is "Learn more", there isn\'t one.' },
    ],
    ruleOutFirst: 'Check the targeting, the placement and the image first. If the wrong people are seeing it, or the visual is wrong, no copy will fix it.',
  },
  high_bounce: {
    label: 'people click, then leave fast',
    suspects: [
      { role: 'COHERENCE', why: "The page doesn't pay off what the ad or the link promised. Readers feel the mismatch before they can name it, and they leave.", check: "To check, put the ad next to the page's first screen. They should make the same promise, in the same words, to the same reader." },
      { role: 'IDENTIFY', why: 'The page talks to a different reader than the ad did.', check: 'To check, ask who the first screen is talking to, and whether that is the same person the ad was talking to.' },
      { role: 'DISRUPT', why: 'The page starts over cold when it should carry on the thought that made them click.', check: 'To check, read the headline right after the ad. It should pick up where the ad left off, not start again with a brand slogan.' },
    ],
    ruleOutFirst: 'Check the page speed, the mobile layout and the links first. A slow or broken page looks like a bounce no matter what the copy says.',
  },
  reads_but_no_action: {
    label: "people read it but don't act",
    suspects: [
      { role: 'PROVE', why: 'They hear the promise, but they don\'t believe it.', check: 'To check, go through every big claim and look for the evidence sitting right next to it: a number, a name, a demonstration.' },
      { role: 'RESOLVE', why: 'An objection nobody answered, like the price, the time or "will it work for me?", is standing in the way of yes.', check: 'To check, write down the three reasons a reader would say no, and see whether the copy answers each one before it asks.' },
      { role: 'COMPEL', why: 'Nothing makes today the day.', check: 'To check, look for a real, honest reason to act now. If you can\'t point to one, the reader can\'t either.' },
      { role: 'ELEVATE', why: 'The copy describes the product and never shows the reader after the change.', check: 'To check, look for a specific, concrete picture of their life afterward. A list of features doesn\'t count.' },
    ],
    ruleOutFirst: 'Check the offer itself first, meaning the price, the terms and the fit, and make sure the call to action is easy to find and easy to use.',
  },
  starts_but_abandons: {
    label: 'people start the checkout or the form, then abandon it',
    suspects: [
      { role: 'RESOLVE', why: 'A last-minute objection about cost, commitment or risk comes up at the moment of yes, and nothing answers it.', check: 'To check, look at the form or the checkout itself. The guarantee, the "cancel anytime" and what happens next should all be visible right there.' },
      { role: 'COMPEL', why: 'The urgency that started them fades before the finish line.', check: 'To check, see whether the checkout reminds them why now.' },
      { role: 'PROVE', why: 'Trust drops the moment you ask for money or an email address.', check: 'To check, look for trust signals right where you ask for the card or the email.' },
    ],
    ruleOutFirst: 'Rule out surprise costs like shipping and fees, forced account creation, too many fields and payment errors first.',
  },
  leads_dont_buy: {
    label: "signups and leads don't turn into sales",
    suspects: [
      { role: 'REFRAME', why: 'The lead still sees the problem the old way, so the default decision wins, whether that is doing nothing or sticking with what they know.', check: 'To check, read the follow-up and ask whether it changes how they see the problem or just repeats the pitch.' },
      { role: 'PROVE', why: 'They wanted the free thing. Nothing has convinced them the paid one works.', check: 'To check, list the evidence a lead actually sees between signing up and being asked to buy.' },
      { role: 'RESOLVE', why: "Objections that didn't matter for a free signup matter a great deal for a purchase.", check: 'To check, see whether the nurture sequence answers the objections about price, time and fit.' },
      { role: 'BOND', why: "They don't trust the sender enough yet for a paid ask.", check: 'To check, see whether the sequence builds a relationship, through voice, story and generosity, before it asks.' },
    ],
    ruleOutFirst: 'Check the lead quality first, meaning whether these are the right people at all, and how fast sales follows up.',
  },
  buys_once_no_return: {
    label: 'people buy once, then ask for a refund, cancel or never come back',
    suspects: [
      { role: 'COHERENCE', why: "The promise and the delivery don't match. The sale was made on a life after that the product didn't produce.", check: 'To check, compare the after-picture and the proof in your sales copy with what customers actually experience.' },
      { role: 'BOND', why: 'No relationship formed, so nothing brings them back.', check: 'To check, read what they get after they buy. It should carry the relationship on, not go silent until the next pitch.' },
    ],
    ruleOutFirst: "Rule out problems with the product, the onboarding and the delivery first. Copy can make the promise honest, but it can't make the product deliver.",
  },
  low_open_rate: {
    label: "emails don't get opened",
    suspects: [
      { role: 'DISRUPT', why: 'The subject line reads like every other email in the inbox.', check: 'To check, cover the sender name and ask whether the subject line could have come from anyone.' },
      { role: 'IDENTIFY', why: 'Nothing in the subject or the preview says this one is for them.', check: 'To check, see whether the subject or the preview text names their situation.' },
      { role: 'BOND', why: "They don't know or care who is sending it.", check: 'To check, look at the sender name. It should be a person or a brand they recognize and like.' },
    ],
    ruleOutFirst: "Check deliverability first, meaning the spam folder and your authentication, and the health of the list. Nobody opens an email they never see.",
  },
  opens_no_clicks: {
    label: 'emails get opened but nobody clicks',
    suspects: [
      { role: 'COHERENCE', why: "The body doesn't pay off the subject line, so the open feels like bait.", check: 'To check, read the first line right after the subject. It should deliver what the subject promised.' },
      { role: 'IDENTIFY', why: 'The body drifts away from the reader and toward the brand.', check: 'To check, count the "you"s against the "we"s. The email should be about them.' },
      { role: 'COMPEL', why: 'There is no single, clear reason to click now.', check: 'To check, look for one obvious click with a reason attached. Several competing links split the reader\'s attention.' },
    ],
    ruleOutFirst: 'Rule out broken links, image-only emails and too many competing calls to action first.',
  },
}

export function normalizeRole(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const up = v.trim().toUpperCase()
  if ((ROLE_NAMES as readonly string[]).includes(up)) return up
  // accept the question text itself
  const byQ = ROLE_NAMES.find((r) => ROLES[r].question.toLowerCase().replace(/[^a-z ]/g, '') === v.toLowerCase().replace(/[^a-z ]/g, '').trim())
  return byQ ?? up
}
