# Hook-check run vs voice-rewrite run (same 16 prompts, treatment only)

The server under test was a frozen build of commit 3dbb092 (the voice rewrite, still on the old
sentence splitter), so this isolates the effect of the new wording. Previous run: 2026-10-03-hook-check-rerun.

| case | diagnose calls | all calls | turns | sec |
|---|---|---|---|---|
| A1-agent-planters | 2 → 2 | 6 → 6 | 8 → 8 | 214 → 207 |
| D1-clicks-no-buys | 0 → 0 | 2 → 2 | 4 → 4 | 43 → 35 |
| D2-opens-no-clicks | 0 → 0 | 1 → 1 | 3 → 3 | 26 → 24 |
| D3-trials-no-paid | 0 → 0 | 1 → 1 | 3 → 3 | 63 → 61 |
| R1-ad-review | 1 → 2 | 3 → 4 | 5 → 6 | 27 → 71 |
| R2-roast-hero | 1 → 1 | 3 → 3 | 5 → 5 | 51 → 48 |
| R3-subject-lines | 0 → 0 | 1 → 1 | 3 → 3 | 16 → 20 |
| R4-product-desc | 1 → 1 | 2 → 2 | 4 → 4 | 68 → 65 |
| T1-read-test | 0 → 0 | 1 → 1 | 4 → 3 | 26 → 23 |
| T2-plan-test | 0 → 0 | 3 → 3 | 5 → 5 | 23 → 22 |
| W1-landing | 1 → 1 | 3 → 2 | 5 → 4 | 127 → 106 |
| W2-fb-ads | 3 → 3 | 6 → 4 | 8 → 6 | 168 → 121 |
| W3-welcome-email | 1 → 1 | 3 → 2 | 5 → 4 | 76 → 55 |
| W4-saas-headline | 1 → 1 | 3 → 3 | 5 → 5 | 48 → 38 |
| W5-cold-email | 1 → 1 | 3 → 2 | 5 → 4 | 92 → 69 |
| W6-sales-page | 1 → 1 | 2 → 2 | 4 → 4 | 87 → 90 |
| **total** | **13 → 14** | **43 → 39** | **76 → 71** | **1155 → 1055** |

16/16 sessions still called the tools unprompted, with 0 tool errors (the previous run had 1).
Writing sessions got shorter: fewer check_headlines calls after the plan, and less back and forth.

The models' final answers were already clean before (no shouted labels, almost no em dashes), so
the change there is small: answers came out 12% shorter with slightly fewer bullets per 1,000
characters (2.45 → 2.25). What does show is the tool's phrasing carried into the answers, e.g.
R2: "one of the words readers now skim past. It sounds like machine-written copy" and "a skeptic
has nothing to check", both lifted from the new tool output.
