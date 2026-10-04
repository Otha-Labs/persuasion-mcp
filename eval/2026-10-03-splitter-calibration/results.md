# Flow scorer: sentence splitter fix, calibration check (2026-10-03)

The splitter broke text at every capitalized word or quote, not only after `.`, `!` or `?`.
The fix requires terminal punctuation again and also splits at a line break before a capital.
The question was whether the thresholds, which shipped in the same commit as the broken splitter
(Coppica #34, 2026-04-07), needed retuning once sentences were counted correctly.

Samples (read-only from prod, not committed because the drafts are client work): 1,711 human ad
bodies from `examples_structural` (eras 1920s to 2010s, at least 350 characters, so written before
AI copy existed), and 146 writing-bot drafts from `drafts` (user-pasted ones left out), reduced to
prose and cut into 1,265 chunks the size of the human samples. Context `body` for both.

| | old splitter | fixed splitter |
|---|---|---|
| mean score, human / AI | 5.95 / 4.84 | 8.64 / 6.09 |
| gap | 1.11 | 2.55 |
| burstiness fail, human / AI | 43% / 64% | 19% / 50% |
| threading fail, human / AI | 87% / 83% | 41% / 61% |
| rhythmic contrast warn, human / AI | 60% / 83% | 14% / 60% |
| band distribution warn, human / AI | 56% / 61% | 23% / 40% |
| consecutive band warn, human / AI | 58% / 66% | 26% / 39% |

With the old splitter, threading fired more often on human copy than on AI copy, so it carried no
signal. With the fix, every gate fires about half as often on human copy and keeps most of its hits
on AI copy, and the human/AI gap more than doubles. The thresholds stay as they are.

Still worth a look later: threading fails 41% of human samples, so its threshold (0.4) may be strict
for short ad excerpts.

`calib.mjs` reproduces the table given `human.json` and `ai.json` fetched with the same filters.
