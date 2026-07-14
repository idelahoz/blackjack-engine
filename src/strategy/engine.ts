import { err, ok, type Result } from "neverthrow";
import { dealerKey, evaluateHand } from "../cards.js";
import type { Action, EngineError, GameState, RuleSet } from "../types.js";
import { invalidInput, strategyLookup } from "../types.js";
import type { Strategy, StrategyCode, StrategyRow } from "./schema.js";

export interface StrategyEngineOptions {
  strategy: Strategy;
  /** Table rules the engine plays under; defaults to the rules declared by the strategy file. */
  rules?: RuleSet;
}

/**
 * Pure strategy-table lookups. This engine NEVER calculates probabilities —
 * it only resolves the chart cell for (player hand, dealer up card) into an
 * action, honoring what the table currently allows (double/split/surrender).
 */
export class StrategyEngine {
  readonly strategy: Strategy;
  readonly rules: RuleSet;

  constructor(options: StrategyEngineOptions) {
    this.strategy = options.strategy;
    this.rules = options.rules ?? options.strategy.rules;
  }

  recommend(state: GameState): Result<Action, EngineError> {
    const handResult = evaluateHand(state.playerCards);
    if (handResult.isErr()) return err(handResult.error);
    const hand = handResult.value;
    if (hand.isBust) {
      return err(invalidInput(`Hand is bust (total ${hand.total}); no move to recommend`));
    }

    const dealer = dealerKey(state.dealerUpCard);
    const twoCards = state.playerCards.length === 2;
    const canDouble = state.canDouble ?? twoCards;
    const canSplit = hand.isPair && (state.canSplit ?? true);
    const canSurrender =
      this.rules.surrender !== "none" && twoCards && (state.canSurrender ?? true);

    // 1. Pairs — charts are consulted top-down, splitting decisions first.
    if (canSplit) {
      const first = state.playerCards[0];
      if (first !== undefined) {
        const pairBucket = dealerKey(first);
        const code = this.strategy.pairs[pairBucket]?.[dealer];
        if (code === undefined) {
          return err(strategyLookup(`No pair entry for ${pairBucket},${pairBucket} vs ${dealer}`));
        }
        if (code === "P") return ok("split");
        if (code !== "Pd") return ok(resolveCode(code, canDouble));
        if (this.rules.doubleAfterSplit) return ok("split");
        // "Pd" without DAS: do not split — fall through and play the total.
      }
    }

    // 2. Late surrender — first two cards only, hard totals.
    if (canSurrender && !hand.isSoft) {
      if (this.strategy.surrender?.[String(hand.total)]?.[dealer] === true) {
        return ok("surrender");
      }
    }

    // 3. Soft / hard totals.
    const table = hand.isSoft ? this.strategy.soft : this.strategy.hard;
    const row: StrategyRow | undefined = table[String(hand.total)];
    const code = row?.[dealer];
    if (code === undefined) {
      return err(
        strategyLookup(
          `No ${hand.isSoft ? "soft" : "hard"} entry for total ${hand.total} vs dealer ${dealer}`,
        ),
      );
    }
    return ok(resolveCode(code, canDouble));
  }
}

function resolveCode(code: StrategyCode, canDouble: boolean): Action {
  switch (code) {
    case "H":
      return "hit";
    case "S":
      return "stand";
    case "D":
      return canDouble ? "double" : "hit";
    case "Ds":
      return canDouble ? "double" : "stand";
    case "P":
      return "split";
    case "Pd":
      // Only reachable if a Pd code appears outside the pair flow; treat as no-split.
      return "hit";
  }
}

/**
 * Compares the rules a strategy was built for against the table rules in
 * play; returns a human-readable warning per mismatched field.
 */
export function checkCompatibility(strategy: Strategy, rules: RuleSet): string[] {
  const warnings: string[] = [];
  const built = strategy.rules;
  const fields = [
    "dealerHitsSoft17",
    "blackjackPayout",
    "doubleAfterSplit",
    "resplitAces",
    "surrender",
    "numberOfDecks",
    "dealerPeek",
  ] as const;
  for (const field of fields) {
    if (built[field] !== rules[field]) {
      warnings.push(
        `Strategy "${strategy.name}" was built for ${field}=${String(built[field])} ` +
          `but the table rules use ${field}=${String(rules[field])}`,
      );
    }
  }
  return warnings;
}
