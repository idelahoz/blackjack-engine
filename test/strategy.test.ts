import { beforeAll, describe, expect, it } from "vitest";
import { StrategyEngine, checkCompatibility } from "../src/strategy/engine.js";
import { bundledStrategyPath, loadStrategy } from "../src/strategy/loader.js";
import type { Strategy } from "../src/strategy/schema.js";
import type { Card, GameState } from "../src/types.js";

let s17: Strategy;
let h17: Strategy;

beforeAll(async () => {
  s17 = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
  h17 = (await loadStrategy(bundledStrategyPath("h17")))._unsafeUnwrap();
});

const cards = (...ranks: Card["rank"][]): Card[] => ranks.map((rank) => ({ rank }));
const state = (playerRanks: Card["rank"][], dealer: Card["rank"], extra?: Partial<GameState>) => ({
  playerCards: cards(...playerRanks),
  dealerUpCard: { rank: dealer },
  ...extra,
});

describe("StrategyEngine (s17 chart)", () => {
  const engine = () => new StrategyEngine({ strategy: s17 });

  it("doubles hard 11 vs 6, hits when doubling is unavailable", () => {
    expect(
      engine()
        .recommend(state(["5", "6"], "6"))
        ._unsafeUnwrap(),
    ).toBe("double");
    expect(
      engine()
        .recommend(state(["5", "6"], "6", { canDouble: false }))
        ._unsafeUnwrap(),
    ).toBe("hit");
  });

  it("hits hard 11 vs A under S17", () => {
    expect(
      engine()
        .recommend(state(["5", "6"], "A"))
        ._unsafeUnwrap(),
    ).toBe("hit");
  });

  it("hits multi-card 16 vs 10 (no surrender after two cards)", () => {
    expect(
      engine()
        .recommend(state(["10", "4", "2"], "10"))
        ._unsafeUnwrap(),
    ).toBe("hit");
  });

  it("surrenders two-card 16 vs 9, 10, A and 15 vs 10", () => {
    expect(
      engine()
        .recommend(state(["10", "6"], "9"))
        ._unsafeUnwrap(),
    ).toBe("surrender");
    expect(
      engine()
        .recommend(state(["10", "6"], "10"))
        ._unsafeUnwrap(),
    ).toBe("surrender");
    expect(
      engine()
        .recommend(state(["10", "6"], "A"))
        ._unsafeUnwrap(),
    ).toBe("surrender");
    expect(
      engine()
        .recommend(state(["10", "5"], "10"))
        ._unsafeUnwrap(),
    ).toBe("surrender");
  });

  it("does not surrender when the rules forbid it", () => {
    const noSurrender = new StrategyEngine({
      strategy: s17,
      rules: { ...s17.rules, surrender: "none" },
    });
    expect(noSurrender.recommend(state(["10", "6"], "10"))._unsafeUnwrap()).toBe("hit");
  });

  it("plays soft 18 correctly: double 3-6, stand 2/7/8, hit 9-A", () => {
    expect(
      engine()
        .recommend(state(["A", "7"], "2"))
        ._unsafeUnwrap(),
    ).toBe("stand");
    expect(
      engine()
        .recommend(state(["A", "7"], "3"))
        ._unsafeUnwrap(),
    ).toBe("double");
    expect(
      engine()
        .recommend(state(["A", "7"], "7"))
        ._unsafeUnwrap(),
    ).toBe("stand");
    expect(
      engine()
        .recommend(state(["A", "7"], "9"))
        ._unsafeUnwrap(),
    ).toBe("hit");
  });

  it("falls back to stand for Ds when doubling is unavailable", () => {
    expect(
      engine()
        .recommend(state(["A", "7"], "6", { canDouble: false }))
        ._unsafeUnwrap(),
    ).toBe("stand");
  });

  it("always splits aces and eights", () => {
    expect(
      engine()
        .recommend(state(["8", "8"], "A"))
        ._unsafeUnwrap(),
    ).toBe("split");
    expect(
      engine()
        .recommend(state(["A", "A"], "10"))
        ._unsafeUnwrap(),
    ).toBe("split");
  });

  it("stands on tens (including face-card pairs)", () => {
    expect(
      engine()
        .recommend(state(["K", "Q"], "6"))
        ._unsafeUnwrap(),
    ).toBe("stand");
    expect(
      engine()
        .recommend(state(["10", "J"], "A"))
        ._unsafeUnwrap(),
    ).toBe("stand");
  });

  it("treats 5,5 as hard 10 (double, never split)", () => {
    expect(
      engine()
        .recommend(state(["5", "5"], "6"))
        ._unsafeUnwrap(),
    ).toBe("double");
    expect(
      engine()
        .recommend(state(["5", "5"], "10"))
        ._unsafeUnwrap(),
    ).toBe("hit");
  });

  it("splits nines vs 2-6/8/9 but stands vs 7, 10, A", () => {
    expect(
      engine()
        .recommend(state(["9", "9"], "6"))
        ._unsafeUnwrap(),
    ).toBe("split");
    expect(
      engine()
        .recommend(state(["9", "9"], "7"))
        ._unsafeUnwrap(),
    ).toBe("stand");
    expect(
      engine()
        .recommend(state(["9", "9"], "9"))
        ._unsafeUnwrap(),
    ).toBe("split");
    expect(
      engine()
        .recommend(state(["9", "9"], "A"))
        ._unsafeUnwrap(),
    ).toBe("stand");
  });

  it("honors DAS-dependent splits (2,2 vs 2)", () => {
    expect(
      engine()
        .recommend(state(["2", "2"], "2"))
        ._unsafeUnwrap(),
    ).toBe("split");
    const noDas = new StrategyEngine({
      strategy: s17,
      rules: { ...s17.rules, doubleAfterSplit: false },
    });
    // Without DAS the pair is played as hard 4 → hit.
    expect(noDas.recommend(state(["2", "2"], "2"))._unsafeUnwrap()).toBe("hit");
  });

  it("respects canSplit=false by playing the total", () => {
    expect(
      engine()
        .recommend(state(["8", "8"], "10", { canSplit: false }))
        ._unsafeUnwrap(),
    ).toBe("surrender"); // hard 16 vs 10
  });

  it("errors on bust hands", () => {
    const result = engine().recommend(state(["10", "9", "5"], "6"));
    expect(result._unsafeUnwrapErr().type).toBe("invalid_input");
  });
});

describe("h17 vs s17 chart deltas", () => {
  it("doubles 11 vs A only under H17", () => {
    const h = new StrategyEngine({ strategy: h17 });
    const s = new StrategyEngine({ strategy: s17 });
    expect(h.recommend(state(["5", "6"], "A"))._unsafeUnwrap()).toBe("double");
    expect(s.recommend(state(["5", "6"], "A"))._unsafeUnwrap()).toBe("hit");
  });

  it("doubles soft 18 vs 2 only under H17", () => {
    const h = new StrategyEngine({ strategy: h17 });
    const s = new StrategyEngine({ strategy: s17 });
    expect(h.recommend(state(["A", "7"], "2"))._unsafeUnwrap()).toBe("double");
    expect(s.recommend(state(["A", "7"], "2"))._unsafeUnwrap()).toBe("stand");
  });

  it("doubles soft 19 vs 6 only under H17", () => {
    const h = new StrategyEngine({ strategy: h17 });
    const s = new StrategyEngine({ strategy: s17 });
    expect(h.recommend(state(["A", "8"], "6"))._unsafeUnwrap()).toBe("double");
    expect(s.recommend(state(["A", "8"], "6"))._unsafeUnwrap()).toBe("stand");
  });
});

describe("checkCompatibility", () => {
  it("returns no warnings when rules match", () => {
    expect(checkCompatibility(s17, s17.rules)).toEqual([]);
  });

  it("warns per mismatched field", () => {
    const warnings = checkCompatibility(s17, {
      ...s17.rules,
      dealerHitsSoft17: true,
      numberOfDecks: 2,
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toContain("dealerHitsSoft17");
    expect(warnings.join(" ")).toContain("numberOfDecks");
  });
});
