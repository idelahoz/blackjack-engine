import { describe, expect, it } from "vitest";
import { dealerDistribution } from "../src/ev/dealer.js";
import { RecursiveEvEngine } from "../src/ev/engine.js";
import { H17_RULES, S17_RULES } from "../src/rules.js";
import type { Card, Rank } from "../src/types.js";

const cards = (...ranks: Rank[]): Card[] => ranks.map((rank) => ({ rank }));
const state = (playerRanks: Rank[], dealer: Rank) => ({
  playerCards: cards(...playerRanks),
  dealerUpCard: { rank: dealer },
});

describe("dealerDistribution", () => {
  it("sums to 1 for every up card", () => {
    for (const rank of ["2", "5", "7", "9", "10", "A"] as const) {
      const dist = dealerDistribution({ rank }, S17_RULES);
      const sum =
        dist.totals[17] +
        dist.totals[18] +
        dist.totals[19] +
        dist.totals[20] +
        dist.totals[21] +
        dist.bust +
        dist.blackjack;
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("conditions away naturals when the dealer peeks", () => {
    const dist = dealerDistribution({ rank: "A" }, S17_RULES);
    expect(dist.blackjack).toBe(0);
  });

  it("keeps naturals when the dealer does not peek", () => {
    const dist = dealerDistribution({ rank: "A" }, { ...S17_RULES, dealerPeek: false });
    // P(ten-value under the ace) = 4/13.
    expect(dist.blackjack).toBeCloseTo(4 / 13, 10);
  });

  it("busts a 6 up card far more often than a 10", () => {
    const six = dealerDistribution({ rank: "6" }, S17_RULES);
    const ten = dealerDistribution({ rank: "10" }, S17_RULES);
    expect(six.bust).toBeGreaterThan(0.4);
    expect(ten.bust).toBeLessThan(0.25);
  });

  it("hits soft 17 only under H17 (shifts the 17 mass)", () => {
    const s17 = dealerDistribution({ rank: "A" }, S17_RULES);
    const h17 = dealerDistribution({ rank: "A" }, H17_RULES);
    expect(h17.totals[17]).toBeLessThan(s17.totals[17]);
  });
});

describe("RecursiveEvEngine", () => {
  const engine = new RecursiveEvEngine(S17_RULES);

  it("values a natural at 1 + payout", () => {
    expect(engine.expectedValue(state(["A", "K"], "5"))).toBeCloseTo(2.5, 10);
  });

  it("respects a 6:5 payout rule", () => {
    const cheap = new RecursiveEvEngine({ ...S17_RULES, blackjackPayout: 1.2 });
    expect(cheap.expectedValue(state(["A", "K"], "5"))).toBeCloseTo(2.2, 10);
  });

  it("values 20 vs 6 as a strong favorite", () => {
    const ev = engine.expectedValue(state(["10", "K"], "6"));
    expect(ev).toBeGreaterThan(1.6);
    expect(ev).toBeLessThan(1.8);
  });

  it("values 16 vs 10 as surrender (exactly half the bet back)", () => {
    const values = engine.actionValues(state(["10", "6"], "10"));
    expect(values.surrender).toBe(0.5);
    // Hitting/standing 16 vs 10 returns less than surrendering — that's why the chart says surrender.
    expect(values.hit).toBeLessThan(0.5);
    expect(values.stand).toBeLessThan(0.5);
    expect(engine.expectedValue(state(["10", "6"], "10"))).toBe(0.5);
  });

  it("prefers doubling hard 11 vs 6", () => {
    const values = engine.actionValues(state(["5", "6"], "6"));
    expect(values.double).toBeDefined();
    expect(values.double!).toBeGreaterThan(values.hit!);
    expect(values.double!).toBeGreaterThan(values.stand!);
    expect(values.double!).toBeGreaterThan(1.5); // ~ +0.67 profit
  });

  it("prefers splitting eights vs 6 over playing 16", () => {
    const values = engine.actionValues(state(["8", "8"], "6"));
    expect(values.split!).toBeGreaterThan(values.hit!);
    expect(values.split!).toBeGreaterThan(values.stand!);
  });

  it("omits double/split/surrender when unavailable", () => {
    const values = engine.actionValues({
      ...state(["10", "4", "2"], "10"),
    });
    expect(values.double).toBeUndefined();
    expect(values.split).toBeUndefined();
    expect(values.surrender).toBeUndefined();
  });

  it("returns 0 for a busted hand", () => {
    expect(engine.expectedValue(state(["10", "9", "5"], "6"))).toBe(0);
  });

  it("stays within sane bounds for ordinary two-card hands", () => {
    for (const dealer of ["2", "6", "10", "A"] as const) {
      for (const player of [
        ["10", "6"],
        ["A", "7"],
        ["9", "9"],
        ["2", "3"],
      ] as Rank[][]) {
        const ev = engine.expectedValue(state(player, dealer));
        expect(ev).toBeGreaterThanOrEqual(0);
        expect(ev).toBeLessThanOrEqual(2.6);
      }
    }
  });

  it("matches the known EV of standing on A,7 vs 9 (~0.82 return)", () => {
    const values = new RecursiveEvEngine({ ...S17_RULES, surrender: "none" }).actionValues(
      state(["A", "7"], "9"),
    );
    // Published infinite-deck stand EV for soft 18 vs 9 is about -0.18 profit.
    expect(values.stand!).toBeGreaterThan(0.78);
    expect(values.stand!).toBeLessThan(0.86);
    // Hitting soft 18 vs 9 is the better play.
    expect(values.hit!).toBeGreaterThan(values.stand!);
  });
});
