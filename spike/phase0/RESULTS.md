# Phase 0 results

Model claude-sonnet-5-5. 18 sketch runs, 9 text-only runs, 205 model calls besides the judge, 25 s each on average.

## Turn 0: does the first generation follow the sketch?

| App | fit to sketch | overlap with the text-only layout | text-only fit to the same sketch |
|---|---|---|---|
| dashboard | 1.00 (1.00–1.00) | 0.11 | 0.11 |
| inbox | 1.00 (1.00–1.00) | 0.10 | 0.10 |
| shop | 1.00 (1.00–1.00) | 0.13 | 0.13 |

## Revisions: does the sketch hold, and does state survive?

Fit to the sketch after each revision. A patches regions only; B returns the whole component. Both apply through `swap()` on the running instance.

| Turn | Request | A fit | B fit | A mode | B mode | A state kept | B state kept | A done | B done |
|---|---|---|---|---|---|---|---|---|---|
| 1 | content | 1.00 (1.00–1.00) | 1.00 (1.00–1.00) | 0.12 | 0.12 | 100% | 100% | 100% | 100% |
| 2 | style | 1.00 (1.00–1.00) | 1.00 (1.00–1.00) | 0.12 | 0.12 | 100% | 100% | 100% | 100% |
| 3 | add | 1.00 (1.00–1.00) | 0.99 (0.87–1.00) | 0.12 | 0.12 | 100% | 100% | 81% | 97% |
| 4 | add-unplaced | 1.00 (1.00–1.00) | 0.99 (0.87–1.00) | 0.12 | 0.12 | 100% | 100% | 100% | 97% |
| 5 | vague | 1.00 (0.93–1.00) | 0.59 (0.04–0.97) | 0.12 | 0.26 | 100% | 100% | 86% | 100% |

Revisions that never applied: A 0, B 0. Applied after a retry: A 2, B 1. Never run: A 0, B 5. Not judged: A 0, B 2.

## Drift: fit at turn 5 minus fit at turn 0, per run

| Sketch | Run | A | B |
|---|---|---|---|
| dashboard-a | 1 | 0.00 | -0.49 |
| dashboard-a | 2 | 0.00 | -0.48 |
| dashboard-a | 3 | 0.00 | -0.43 |
| dashboard-b | 1 | 0.00 | -0.80 |
| dashboard-b | 2 | 0.00 | -0.49 |
| dashboard-b | 3 | -0.07 | -0.47 |
| inbox-a | 1 | 0.00 | -0.11 |
| inbox-a | 2 | 0.00 | -0.89 |
| inbox-a | 3 | 0.00 | -0.03 |
| inbox-b | 1 | 0.00 | -0.89 |
| inbox-b | 2 | 0.00 | -0.09 |
| inbox-b | 3 | 0.00 | -0.09 |
| shop-a | 1 | 0.00 | -0.10 |
| shop-a | 2 | 0.00 | -0.96 |
| shop-a | 3 | 0.00 | -0.10 |
| shop-b | 1 | 0.00 | -0.19 |
| shop-b | 2 | 0.00 | — |
| shop-b | 3 | 0.00 | — |

## The CSS the revisions wrote, as patch operations

- **A:** add rule 958, remove rule 84, change declaration 270, add declaration 272. Features in the resulting sheet: :hover (61 turns), box-shadow (73 turns), pseudo-element (14 turns), gradient (35 turns), :focus (15 turns), transition (18 turns), backdrop-filter (3 turns).
- **B:** add rule 475, change declaration 1228, add declaration 1041, remove rule 52. Features in the resulting sheet: :hover (59 turns), box-shadow (69 turns), gradient (32 turns), :focus (16 turns), transition (16 turns), pseudo-element (7 turns), backdrop-filter (2 turns).
- A's patches wrote 0 rule(s) outside their own region, which the rig dropped.

