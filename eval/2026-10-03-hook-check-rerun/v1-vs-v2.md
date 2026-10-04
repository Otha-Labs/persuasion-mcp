| case | v1 tools | v2 tools | diagnose calls v1→v2 | sec v1→v2 | $ v1→v2 | v2 errors | v2 pushback |
|---|---|---|---|---|---|---|---|
| A1-agent-planters | plan_marketing_copy, explain_why_not_converting, score_headlines, diagnose_marketing_copy | explain_why_not_converting, plan_marketing_copy, diagnose_marketing_copy, check_headlines | 4→2 | 173→214 | 0.80→0.83 | 0 | — |
| D1-clicks-no-buys | explain_why_not_converting | explain_why_not_converting | 0→0 | 45→43 | 0.23→0.22 | 0 | — |
| D2-opens-no-clicks | explain_why_not_converting | explain_why_not_converting | 0→0 | 23→26 | 0.18→0.17 | 0 | — |
| D3-trials-no-paid | explain_why_not_converting | explain_why_not_converting | 0→0 | 74→63 | 0.27→0.24 | 0 | — |
| R1-ad-review | diagnose_marketing_copy, check_marketing_claims | diagnose_marketing_copy, check_marketing_claims, check_headlines | 1→1 | 39→27 | 0.24→0.23 | 0 | — |
| R2-roast-hero | diagnose_marketing_copy | diagnose_marketing_copy, check_headlines, check_marketing_claims | 1→1 | 32→51 | 0.21→0.27 | 0 | — |
| R3-subject-lines | score_headlines | check_headlines | 0→0 | 23→16 | 0.16→0.16 | 0 | — |
| R4-product-desc | plan_marketing_copy, diagnose_marketing_copy | plan_marketing_copy, diagnose_marketing_copy | 2→1 | 71→68 | 0.42→0.35 | 0 | — |
| T1-read-test | read_ab_test_result | read_ab_test_result | 0→0 | 18→26 | 0.18→0.18 | 1 | — |
| T2-plan-test | plan_ab_test | plan_ab_test | 0→0 | 24→23 | 0.19→0.18 | 0 | — |
| W1-landing | plan_marketing_copy, score_headlines, diagnose_marketing_copy | plan_marketing_copy, diagnose_marketing_copy, check_headlines | 2→1 | 142→127 | 0.63→0.55 | 0 | — |
| W2-fb-ads | plan_marketing_copy, diagnose_marketing_copy | plan_marketing_copy, diagnose_marketing_copy, check_headlines | 6→3 | 150→168 | 0.71→0.74 | 0 | — |
| W3-welcome-email | plan_marketing_copy, diagnose_marketing_copy | plan_marketing_copy, diagnose_marketing_copy, check_headlines | 2→1 | 70→76 | 0.41→0.41 | 0 | — |
| W4-saas-headline | plan_marketing_copy, score_headlines, diagnose_marketing_copy | plan_marketing_copy, check_headlines, diagnose_marketing_copy | 1→1 | 54→48 | 0.32→0.33 | 0 | — |
| W5-cold-email | plan_marketing_copy, diagnose_marketing_copy | plan_marketing_copy, diagnose_marketing_copy, check_headlines | 2→1 | 68→92 | 0.39→0.42 | 0 | — |
| W6-sales-page | plan_marketing_copy, diagnose_marketing_copy, check_marketing_claims | plan_marketing_copy, diagnose_marketing_copy | 2→1 | 120→87 | 0.58→0.41 | 0 | — |

Totals: cost $5.92 → $5.67; time 1126s → 1155s; diagnose calls 23 → 13
