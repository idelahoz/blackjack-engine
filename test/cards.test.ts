import { describe, expect, it } from "vitest";
import { evaluateHand, parseCard, parseHand } from "../src/cards.js";
import type { Card } from "../src/types.js";

const hand = (...ranks: Card["rank"][]): Card[] => ranks.map((rank) => ({ rank }));

describe("parseCard", () => {
  it("parses every rank, case-insensitively and with whitespace", () => {
    expect(parseCard("A")._unsafeUnwrap()).toEqual({ rank: "A" });
    expect(parseCard(" a ")._unsafeUnwrap()).toEqual({ rank: "A" });
    expect(parseCard("10")._unsafeUnwrap()).toEqual({ rank: "10" });
    expect(parseCard("j")._unsafeUnwrap()).toEqual({ rank: "J" });
    expect(parseCard("Q")._unsafeUnwrap()).toEqual({ rank: "Q" });
    expect(parseCard("K")._unsafeUnwrap()).toEqual({ rank: "K" });
  });

  it('accepts "T" as an alias for 10', () => {
    expect(parseCard("T")._unsafeUnwrap()).toEqual({ rank: "10" });
  });

  it("rejects invalid cards", () => {
    for (const bad of ["1", "11", "", "X", "AA", "0"]) {
      const result = parseCard(bad);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("invalid_card");
    }
  });
});

describe("parseHand", () => {
  it("parses comma-separated hands with spaces", () => {
    expect(parseHand("A,7")._unsafeUnwrap()).toEqual(hand("A", "7"));
    expect(parseHand("10, J, 3")._unsafeUnwrap()).toEqual(hand("10", "J", "3"));
  });

  it("parses space-separated hands, including mixed separators", () => {
    expect(parseHand("A 7")._unsafeUnwrap()).toEqual(hand("A", "7"));
    expect(parseHand("10 J 3")._unsafeUnwrap()).toEqual(hand("10", "J", "3"));
    expect(parseHand("A, 7 K")._unsafeUnwrap()).toEqual(hand("A", "7", "K"));
    expect(parseHand("  8   8  ")._unsafeUnwrap()).toEqual(hand("8", "8"));
  });

  it("requires at least two cards", () => {
    expect(parseHand("A")._unsafeUnwrapErr().type).toBe("invalid_hand");
    expect(parseHand("")._unsafeUnwrapErr().type).toBe("invalid_hand");
    expect(parseHand(" , ")._unsafeUnwrapErr().type).toBe("invalid_hand");
  });

  it("reports the first invalid card", () => {
    const result = parseHand("A,X");
    expect(result._unsafeUnwrapErr().type).toBe("invalid_card");
  });
});

describe("evaluateHand", () => {
  it("computes soft totals", () => {
    const value = evaluateHand(hand("A", "7"))._unsafeUnwrap();
    expect(value).toMatchObject({ total: 18, isSoft: true, isBlackjack: false, isBust: false });
  });

  it("hardens aces when needed", () => {
    const value = evaluateHand(hand("A", "7", "10"))._unsafeUnwrap();
    expect(value).toMatchObject({ total: 18, isSoft: false });
  });

  it("counts only one ace as eleven", () => {
    const value = evaluateHand(hand("A", "A"))._unsafeUnwrap();
    expect(value).toMatchObject({ total: 12, isSoft: true, isPair: true });
  });

  it("detects blackjack", () => {
    expect(evaluateHand(hand("A", "K"))._unsafeUnwrap().isBlackjack).toBe(true);
    expect(evaluateHand(hand("A", "5", "5"))._unsafeUnwrap().isBlackjack).toBe(false);
  });

  it("detects pairs by value, not rank", () => {
    expect(evaluateHand(hand("K", "10"))._unsafeUnwrap().isPair).toBe(true);
    expect(evaluateHand(hand("Q", "J"))._unsafeUnwrap().isPair).toBe(true);
    expect(evaluateHand(hand("9", "8"))._unsafeUnwrap().isPair).toBe(false);
  });

  it("detects busts", () => {
    const value = evaluateHand(hand("K", "9", "5"))._unsafeUnwrap();
    expect(value).toMatchObject({ total: 24, isBust: true });
  });

  it("rejects hands with fewer than two cards", () => {
    expect(evaluateHand(hand("A"))._unsafeUnwrapErr().type).toBe("invalid_hand");
  });
});
