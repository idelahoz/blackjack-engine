# @blackjack/engine

![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-blue) ![ESM only](https://img.shields.io/badge/modules-ESM-yellow) ![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

A UI-agnostic blackjack recommendation engine for Node.js 22+ (ESM, TypeScript, strict mode). It answers three questions about a hand in play:

1. **What does basic strategy say?** — pure table lookup, loaded from external JSON charts.
2. **What is the hand worth?** — expected value via a recursive, memoized calculator.
3. **Should I take a cash-out offer?** — EV of continuing vs. the offer.

The engine has **no dependency on any UI**. The CLI ([idelahoz/blackjack-cli](https://github.com/idelahoz/blackjack-cli)) is just its first consumer; a React app, REST API, browser extension, or mobile app can consume the same API.

## Install

```sh
pnpm add @blackjack/engine
# local development (unpublished): "@blackjack/engine": "link:../blackjack-engine"
```

## Quick start

```ts
import { BlackjackEngine, bundledStrategyPath } from "@blackjack/engine";

const engine = (
  await BlackjackEngine.create({ strategy: bundledStrategyPath("s17") })
)._unsafeUnwrap(); // or handle the Result properly

const state = {
  playerCards: [{ rank: "A" }, { rank: "7" }],
  dealerUpCard: { rank: "9" },
};

engine.recommend(state); // ok("hit")           — strategy lookup only
engine.expectedValue(state); // 0.899…              — EV in betting units
engine.actionValues(state); // { stand: 0.82, hit: 0.90, double: 0.80, surrender: 0.5 }
engine.evaluateCashOut({ bet: 100, cashOut: 82, state });
// ok({ recommendation: "continue", strategyAction: "hit", ev: 0.90, cashOutValue: 0.82 })
```

All fallible APIs return [neverthrow](https://github.com/supermacro/neverthrow) `Result` / `ResultAsync` values — nothing throws.

## Core concepts

### GameState

The shared input for every engine. Only cards — totals, softness, pairs, and blackjack are derived internally.

```ts
interface GameState {
  playerCards: readonly Card[]; // e.g. [{ rank: "A" }, { rank: "7" }]
  dealerUpCard: Card;
  canDouble?: boolean;    // default: exactly two cards
  canSplit?: boolean;     // default: two cards of equal value (K,10 is a pair of tens)
  canSurrender?: boolean; // default: two cards, and the rules allow surrender
}

type Card = { rank: "A" | "2" | … | "10" | "J" | "Q" | "K" }; // suits are irrelevant
```

### RuleSet

Table rules are injected at construction (per-table), never passed per-hand:

```ts
interface RuleSet {
  name: string;
  dealerHitsSoft17: boolean;
  blackjackPayout: 1.5 | 1.2;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  surrender: "none" | "early" | "late";
  numberOfDecks: number;
  dealerPeek: boolean;
}
```

Presets: `S17_RULES`, `H17_RULES`. If you omit `rules`, the engine adopts the rules the strategy file declares it was built for. `engine.compatibilityWarnings()` lists mismatches between the two.

### EV units

Every EV in this library is the **expected total return per unit of the original bet**:

| value  | meaning                                 |
| ------ | --------------------------------------- |
| `1.0`  | break even — you expect your wager back |
| `0.42` | you expect back 42% of the wager        |
| `0.5`  | exactly a surrender                     |
| `2.5`  | a paid 3:2 natural                      |

Doubling/splitting commit extra chips, so those action values can leave this range (a lost double returns `-1`).

## The three engines

Each is independently usable; `BlackjackEngine` is just a facade that wires them.

### StrategyEngine — lookups only

```ts
import { StrategyEngine, loadStrategy, bundledStrategyPath } from "@blackjack/engine";

const strategy = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
const engine = new StrategyEngine({ strategy }); // rules default to strategy.rules
engine.recommend(state); // Result<"hit" | "stand" | "double" | "split" | "surrender", EngineError>
```

It never calculates probabilities. Lookup order mirrors printed charts: pairs → late surrender → soft/hard totals, resolving `D`/`Ds` fallbacks and DAS-conditional splits from the rules and the state's capability flags.

### EvEngine — expected value

```ts
import { RecursiveEvEngine, S17_RULES } from "@blackjack/engine";

const ev = new RecursiveEvEngine(S17_RULES);
ev.expectedValue(state); // best-action EV
ev.actionValues(state); // per-action EVs
```

`RecursiveEvEngine` computes exact stand/hit/double EVs under an infinite-deck approximation using recursion + memoization (dealer outcome distributions are cached per up card). Split EV is approximated as twice one post-split hand (no resplit modeling); split aces get exactly one card. `EvEngine` is an interface — finite-deck, Monte Carlo, or count-aware implementations can be swapped in without any API change:

```ts
interface EvEngine {
  expectedValue(state: GameState): number;
  actionValues(state: GameState): Partial<Record<Action, number>>;
}
```

### CashOutEngine

```ts
import { CashOutEngine } from "@blackjack/engine";

const cashOut = new CashOutEngine({ strategyEngine, evEngine }); // dependency injection
cashOut.evaluate({ bet: 100, cashOut: 82, state });
```

Recommends `"cash_out"` exactly when `cashOut / bet > expectedValue(state)`; ties go to playing on.

## Strategy files

Strategies are **external JSON**, never hardcoded. Two charts ship with the package:

- `strategies/s17.json` — standard multi-deck S17 basic strategy (default).
- `strategies/h17.json` — the Blackjack Apprenticeship H17 chart, encoded cell-for-cell. (Differs from S17 in three cells: hard 11 vs A, soft 18 vs 2, soft 19 vs 6.)

Resolve them with `bundledStrategyPath("s17" | "h17")`, or load your own file with `loadStrategy(path)` / validate a plain object with `parseStrategy(data)` (Zod-validated).

Format:

```jsonc
{
  "name": "s17-multideck-basic",
  "rules": { /* the RuleSet the chart was built for */ },
  "hard":  { "4": { "2": "H", …, "A": "H" }, …, "21": { … } },  // totals 4–21
  "soft":  { "12": { … }, …, "21": { … } },                      // totals 12–21
  "pairs": { "2": { … }, …, "10": { … }, "A": { … } },
  "surrender": { "15": { "10": true }, "16": { "9": true, "10": true, "A": true } }
}
```

Cell codes match printed chart keys: `H` hit · `S` stand · `D` double else hit · `Ds` double else stand · `P` split · `Pd` split only if DAS is offered, else play the total. Every row must cover all ten dealer up cards (`2`–`10`, `A`); validation fails loudly otherwise.

## Extensibility

Designed so the following land **without public-API changes**:

- **H17/S17, decks, DAS, RSA, surrender, 6:5 payouts** — already expressed via `RuleSet`.
- **Casino-specific rules** — define your own `RuleSet` preset and matching strategy JSON.
- **Composition-dependent strategy / card counting** — additive optional `GameState` fields (e.g. `seenCards`, `trueCount`) plus an alternate `EvEngine`/`StrategyEngine` implementation.
- **Monte Carlo / finite-deck EV** — new classes behind the `EvEngine` interface.

## Errors

Tagged unions returned as `Result` values:

`invalid_card` · `invalid_hand` · `invalid_input` · `strategy_load` · `strategy_lookup` — all with a human-readable `message`.

## Development

```sh
pnpm install
pnpm test        # vitest
pnpm build       # tsup → dist/ (ESM + d.ts)
pnpm lint
pnpm typecheck
```

## Creator

**Israel De La Hoz**

- GitHub: [@idelahoz](https://github.com/idelahoz)
- LinkedIn: [israel-de-la-hoz](https://www.linkedin.com/in/israel-de-la-hoz-ba973326/)
