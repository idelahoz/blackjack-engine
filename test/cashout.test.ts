import { beforeAll, describe, expect, it } from "vitest";
import { CashOutEngine } from "../src/cashout/engine.js";
import type { EvEngine } from "../src/ev/engine.js";
import { StrategyEngine } from "../src/strategy/engine.js";
import { bundledStrategyPath, loadStrategy } from "../src/strategy/loader.js";
import type { Strategy } from "../src/strategy/schema.js";
import type { Card, GameState, Rank } from "../src/types.js";

let s17: Strategy;

beforeAll(async () => {
  s17 = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
});

const cards = (...ranks: Rank[]): Card[] => ranks.map((rank) => ({ rank }));
const state = (playerRanks: Rank[], dealer: Rank): GameState => ({
  playerCards: cards(...playerRanks),
  dealerUpCard: { rank: dealer },
});

/** Fixed-EV stub — exercises the comparison logic in isolation (dependency injection). */
const fixedEv = (ev: number): EvEngine => ({
  expectedValue: () => ev,
  actionValues: () => ({ stand: ev }),
});

describe("CashOutEngine", () => {
  const engine = (ev: number) =>
    new CashOutEngine({
      strategyEngine: new StrategyEngine({ strategy: s17 }),
      evEngine: fixedEv(ev),
    });

  it("recommends cashing out when the offer beats the EV of continuing", () => {
    const result = engine(0.78)
      .evaluate({ bet: 100, cashOut: 82, state: state(["A", "7"], "9") })
      ._unsafeUnwrap();
    expect(result).toEqual({
      recommendation: "cash_out",
      strategyAction: "hit",
      ev: 0.78,
      cashOutValue: 0.82,
    });
  });

  it("recommends continuing when the offer is below the EV", () => {
    const result = engine(0.78)
      .evaluate({ bet: 100, cashOut: 70, state: state(["A", "7"], "9") })
      ._unsafeUnwrap();
    expect(result.recommendation).toBe("continue");
    expect(result.cashOutValue).toBeCloseTo(0.7, 10);
  });

  it("flips exactly when the offer crosses ev * bet", () => {
    expect(
      engine(0.8)
        .evaluate({ bet: 100, cashOut: 80, state: state(["A", "7"], "9") })
        ._unsafeUnwrap().recommendation,
    ).toBe("continue"); // ties go to playing on
    expect(
      engine(0.8)
        .evaluate({ bet: 100, cashOut: 80.01, state: state(["A", "7"], "9") })
        ._unsafeUnwrap().recommendation,
    ).toBe("cash_out");
  });

  it("passes through the strategy action", () => {
    const result = engine(1.0)
      .evaluate({ bet: 50, cashOut: 10, state: state(["8", "8"], "6") })
      ._unsafeUnwrap();
    expect(result.strategyAction).toBe("split");
  });

  it("rejects invalid bets and offers", () => {
    const st = state(["A", "7"], "9");
    expect(engine(1).evaluate({ bet: 0, cashOut: 10, state: st })._unsafeUnwrapErr().type).toBe(
      "invalid_input",
    );
    expect(engine(1).evaluate({ bet: -5, cashOut: 10, state: st })._unsafeUnwrapErr().type).toBe(
      "invalid_input",
    );
    expect(engine(1).evaluate({ bet: NaN, cashOut: 10, state: st })._unsafeUnwrapErr().type).toBe(
      "invalid_input",
    );
    expect(engine(1).evaluate({ bet: 100, cashOut: -1, state: st })._unsafeUnwrapErr().type).toBe(
      "invalid_input",
    );
  });

  it("propagates strategy errors (bust hand)", () => {
    const result = engine(1).evaluate({
      bet: 100,
      cashOut: 50,
      state: state(["10", "9", "5"], "6"),
    });
    expect(result._unsafeUnwrapErr().type).toBe("invalid_input");
  });
});
