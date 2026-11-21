# csv-reader-speed — fast csv-reader 1.0.0 drop-in

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/tanglangbc/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/tanglangbc/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free, faster drop-in for csv-reader 1.0.0: `solve.js` exports
`run(input)` returning exactly `{columns, rows, errors}` for every input,
including the broken-row policy (stray CRs, unterminated quotes, quote junk,
short/long rows). Instead of reading one character at a time it scans with
native `indexOf`/regex searches and `slice`/`split`, with a line-level fast
path for quote-free lines. On the kit's practice set it matches the reference
on all 6 cases and runs ~3x faster than the house baseline (~210ms vs
~640ms per pass over the 6 practice cases on this machine).

## Run it

```sh
node main.ts
```

`main.ts` (the kit's driver, unchanged) reads `/input/cases.json` (or
`$MAKEFUN_INPUT_DIR/cases.json`) and writes `/output/answers.json` (or
`$MAKEFUN_OUTPUT_DIR/answers.json`). Node 22.18 or later.

## Layout

- `solve.js` — the fast parser (ES module, no dependencies)
- `main.ts` — the harness driver (reads cases, writes answers)
- `LICENSE` — MIT

---

<sub>Entered on [make.fun](https://make.fun/?r=NVRADX&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)</sub>
