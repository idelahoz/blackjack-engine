import { err, type Result } from "neverthrow";
import type { EvEngine } from "../ev/engine.js";
import type { StrategyEngine } from "../strategy/engine.js";
import type { Action, EngineError, GameState } from "../types.js";
import { invalidInput } from "../types.js";

export type CashOutRecommendation = "cash_out" | "continue";

export interface CashOutInput {
  /** Original wager, in currency. */
  bet: number;
  /** The cash-out offer on the table, in the same currency. */
  cashOut: number;
  state: GameState;
}

export interface CashOutResult {
  recommendation: CashOutRecommendation;
  /** What the strategy table says to do if you continue. */
  strategyAction: Action;
  /** Expected total return of continuing, in betting units (1.0 = break even). */
  ev: number;
  /** The offer in the same units: cashOut / bet. */
  cashOutValue: number;
}

/**
 * Compares the EV of continuing a hand against a cash-out offer.
 * Recommends cashing out exactly when the offer exceeds the expected return
 * of playing on (cashOut / bet > ev).
 */
export class CashOutEngine {
  private readonly strategyEngine: StrategyEngine;
  private readonly evEngine: EvEngine;

  constructor(deps: { strategyEngine: StrategyEngine; evEngine: EvEngine }) {
    this.strategyEngine = deps.strategyEngine;
    this.evEngine = deps.evEngine;
  }

  evaluate(input: CashOutInput): Result<CashOutResult, EngineError> {
    if (!Number.isFinite(input.bet) || input.bet <= 0) {
      return err(invalidInput(`bet must be a positive number, got ${input.bet}`));
    }
    if (!Number.isFinite(input.cashOut) || input.cashOut < 0) {
      return err(invalidInput(`cashOut must be a non-negative number, got ${input.cashOut}`));
    }

    return this.strategyEngine.recommend(input.state).map((strategyAction) => {
      const ev = this.evEngine.expectedValue(input.state);
      const cashOutValue = input.cashOut / input.bet;
      return {
        recommendation: (cashOutValue > ev ? "cash_out" : "continue") as CashOutRecommendation,
        strategyAction,
        ev,
        cashOutValue,
      };
    });
  }
}
