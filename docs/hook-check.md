# Hook check: the replacement for evaluate_hook / scoreHook

Status: v1 built in this repo (`src/hookcheck/`), 2026-10-03. Not yet in Coppica.

## Why replace scoreHook

`scoreHook` (persuasion-ecosystem `lib/hook-framework.ts`) is seven regex gates weighted into a
0–10 score. Tested against the Upworthy Research Archive (32,487 real headline A/B tests,
CC BY 4.0; method in `scripts/upworthy-traits.py`), **the higher-scoring headline won 46.3% of
9,904 head-to-head tests in the confirmatory set**: no better than a coin flip, slightly worse.
Causes found:

- A first-word bug: any line starting with a capital letter gets a free "named entity", so
  `Quick question about your order` scores 8.0 and `quick question about your order` 4.5.
- Free points: checks that do not apply (no claim, no awareness level) count as passes.
- It rewards a trait that loses: any `?` passes the curiosity gate, and question headlines lost
  61% of head-to-heads (38.6% win rate, n=4,217).
- Nothing asks whether the line says anything about this product, offer, or reader.
- A 0–10 implies a conversion forecast. Nobody can make one from text: raw model predictions
  recover ~39% of real effects (Spotify, 2026); most tested ideas fail (Kohavi).

## The new question

Not "how good is this line out of 10" but:

1. **Does it do its job in this slot?** (which of the nine reader questions it answers)
2. **Could a competitor send it unchanged?** (the swap test, Thesis II)
3. **What is it a bet on?** (so comparisons end in a test, not a fake ranking)

## Four layers

1. **The job.** The calling model labels which reader question each line answers and quotes
   the words doing it. The server verifies the quote and checks it against the slot's needs.
2. **The swap test.** Line tokens against the brief (product, audience, proof, offer), with
   marketing-generic words removed. `only_you` (names something specific to this product,
   reader, or proof), `concrete_but_swappable` (a number or offer any competitor could match),
   `generic`, or `unknown` (no brief). The corpus cannot do this job: it is curated persuasive
   copy, so "biggest sale" appears in 1 of 6,214 brands' openers.
3. **Hard facts.** What shows before the cutoff, whether the answering words are cut off,
   length and spoken time, AI-tell constructions, unproven superlatives, unproven result
   claims. Facts, not points. Capitalization is irrelevant.
4. **Evidence.** Traits that replicated across all three Upworthy splits, with win rate and n,
   labeled as 2013–15 news-headline clicks. Only headline-like slots.

| Trait | Win rate (confirmatory) | n |
|---|---|---|
| number | 54.4% | 3,316 |
| "this / these / here's" | 55.8% | 5,522 |
| time word | 53.7% | 2,158 |
| longer headline | 53.8% | 9,564 |
| question mark | 38.6% (loses) | 4,217 |
| exclamation mark | 40.3% (loses) | 761 |
| CAPS / *emphasis* | 41.8% (loses) | 1,776 |

## Output

A verdict, not a number:

- **does its job**: every required question answered, swap test `only_you`, no hard failure
- **partly**: some of that
- **doesn't**: no required question answered, or generic and missing a required question

Plus the questions answered, the swap result, what is visible, hard failures, evidence, and one
best fix. Comparing several lines: hard failures drop out, each remaining line is described by
its bet, and the result is a recommended test.

## Slots (PROTOTYPE: needs editorial review)

| Slot | Job | Must answer | Visible |
|---|---|---|---|
| email_subject | Earn the open | (DISRUPT or COMPEL) + IDENTIFY | ~40 chars on mobile |
| ad_opening | Stop the scroll, flag the reader, give a reason to click | DISRUPT + IDENTIFY + (AGITATE or ELEVATE or COMPEL) | ~125 chars before "See more" |
| landing_page_headline | Promise the outcome to the right reader, continuing the ad | (ELEVATE or AGITATE or REFRAME) + IDENTIFY | ≤ 14 words |
| first_line | Pay off the headline, earn the second line | any one question + continuity with what came before | |
| video_hook | Stop the scroll in 3 seconds | DISRUPT + IDENTIFY | ≤ ~9 spoken words |
| social_post_open | Earn the "see more" | DISRUPT + IDENTIFY | ~140 chars |
| sales_letter_headline | Stop the right reader, promise the big idea | (DISRUPT or ELEVATE or AGITATE) + IDENTIFY | |

Most-aware readers: COMPEL (the offer) can stand in for DISRUPT.

## Moving Coppica over (needs approval: changes production scoring)

- `evaluate_hook` in `lib/writing-tools.ts` calls `checkHook` instead of `scoreHook`; its input
  gains `answers` (labels) and the brief comes from the session context.
- The doctrine line "If the score is below 7, revise and re-score" becomes "revise until the
  line does its job with no hard failures".
- `claim-framework.ts` headline claims route to `checkHook` facts.
- One shared module imported by both Coppica and this MCP, so the copies stop drifting.

## Validation

- Done: Upworthy within-test analysis (above).
- Next: re-run the 20-prompt reach-for eval; target is that the model no longer overrules the
  tool, or the tool catches things the model missed.
- Later: read-only check against Coppica's own ad hooks with click-through data.
