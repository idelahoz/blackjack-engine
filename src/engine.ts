import { okAsync, type Result, type ResultAsync } from "neverthrow";
import { CashOutEngine, type CashOutInput, type CashOutResult } from "./cashout/engine.js";
import { RecursiveEvEngine, type EvEngine } from "./ev/engine.js";
import { StrategyEngine, checkCompatibility } from "./strategy/engine.js";
import { loadStrategy } from "./strategy/loader.js";
import type { Strategy } from "./strategy/schema.js";
import type { Action, EngineError, GameState, RuleSet } from "./types.js";

export interface BlackjackEngineOptions {
  /** Path to a strategy JSON file, or an already-loaded Strategy object. */
  strategy: string | Strategy;
  /** Table rules; defaults to the rules the strategy declares it was built for. */
  rules?: RuleSet;
  /** Custom EV implementation; defaults to RecursiveEvEngine(rules). */
  evEngine?: EvEngine;
}

/**
 * Facade wiring the three engines together. Each engine remains usable on
 * its own (see StrategyEngine, RecursiveEvEngine, CashOutEngine).
 */
export class BlackjackEngine {
  readonly strategy: Strategy;
  readonly rules: RuleSet;
  private readonly strategyEngine: StrategyEngine;
  private readonly evEngine: EvEngine;
  private readonly cashOutEngine: CashOutEngine;

  private constructor(strategy: Strategy, rules: RuleSet, evEngine: EvEngine) {
    this.strategy = strategy;
    this.rules = rules;
    this.strategyEngine = new StrategyEngine({ strategy, rules });
    this.evEngine = evEngine;
    this.cashOutEngine = new CashOutEngine({
      strategyEngine: this.strategyEngine,
      evEngine,
    });
  }

  static create(options: BlackjackEngineOptions): ResultAsync<BlackjackEngine, EngineError> {
    const strategyResult: ResultAsync<Strategy, EngineError> =
      typeof options.strategy === "string"
        ? loadStrategy(options.strategy)
        : okAsync(options.strategy);
    return strategyResult.map((strategy) => {
      const rules = options.rules ?? strategy.rules;
      const evEngine = options.evEngine ?? new RecursiveEvEngine(rules);
      return new BlackjackEngine(strategy, rules, evEngine);
    });
  }

  /** Strategy-table action for the hand. Pure lookup — no probabilities. */
  recommend(state: GameState): Result<Action, EngineError> {
    return this.strategyEngine.recommend(state);
  }

  /** Expected total return of continuing, in betting units (1.0 = break even). */
  expectedValue(state: GameState): number {
    return this.evEngine.expectedValue(state);
  }

  /** EV of each currently-available action. */
  actionValues(state: GameState): Partial<Record<Action, number>> {
    return this.evEngine.actionValues(state);
  }

  /** Full cash-out comparison: strategy action + EV vs the offer. */
  evaluateCashOut(input: CashOutInput): Result<CashOutResult, EngineError> {
    return this.cashOutEngine.evaluate(input);
  }

  /** Warnings when the table rules differ from what the strategy was built for. */
  compatibilityWarnings(): string[] {
    return checkCompatibility(this.strategy, this.rules);
  }
}
