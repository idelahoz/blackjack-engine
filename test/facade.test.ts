import { describe, expect, it } from "vitest";
import { BlackjackEngine } from "../src/engine.js";
import { H17_RULES } from "../src/rules.js";
import { bundledStrategyPath } from "../src/strategy/loader.js";
import type { Card, GameState, Rank } from "../src/types.js";

const cards = (...ranks: Rank[]): Card[] => ranks.map((rank) => ({ rank }));
const state = (playerRanks: Rank[], dealer: Rank): GameState => ({
  playerCards: cards(...playerRanks),
  dealerUpCard: { rank: dealer },
});

describe("BlackjackEngine facade", () => {
  it("loads a strategy from a file path and wires all engines", async () => {
    const engine = (
      await BlackjackEngine.create({ strategy: bundledStrategyPath("s17") })
    )._unsafeUnwrap();

    expect(engine.recommend(state(["A", "7"], "9"))._unsafeUnwrap()).toBe("hit");

    const ev = engine.expectedValue(state(["A", "7"], "9"));
    expect(ev).toBeGreaterThan(0.8);
    expect(ev).toBeLessThan(1.0);

    const cashOut = engine
      .evaluateCashOut({ bet: 100, cashOut: 95, state: state(["A", "7"], "9") })
      ._unsafeUnwrap();
    expect(cashOut.strategyAction).toBe("hit");
    expect(cashOut.recommendation).toBe("cash_out"); // 0.95 units beats ~0.9 EV
  });

  it("fails to create when the strategy file is missing", async () => {
    const result = await BlackjackEngine.create({ strategy: "/nope/missing.json" });
    expect(result._unsafeUnwrapErr().type).toBe("strategy_load");
  });

  it("reports compatibility warnings when table rules differ from the chart's", async () => {
    const engine = (
      await BlackjackEngine.create({
        strategy: bundledStrategyPath("s17"),
        rules: H17_RULES,
      })
    )._unsafeUnwrap();
    const warnings = engine.compatibilityWarnings();
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toContain("dealerHitsSoft17");
  });

  it("has no warnings when using the strategy's own rules", async () => {
    const engine = (
      await BlackjackEngine.create({ strategy: bundledStrategyPath("s17") })
    )._unsafeUnwrap();
    expect(engine.compatibilityWarnings()).toEqual([]);
  });
});
