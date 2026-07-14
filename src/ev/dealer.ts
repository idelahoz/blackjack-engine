import { cardValue } from "../cards.js";
import type { Card, RuleSet } from "../types.js";

/**
 * Probability of drawing each card value from an infinite shoe
 * (ace as 1; 10/J/Q/K collapse into the value 10).
 */
export const CARD_PROBABILITIES: ReadonlyArray<readonly [value: number, probability: number]> = [
  [1, 1 / 13],
  [2, 1 / 13],
  [3, 1 / 13],
  [4, 1 / 13],
  [5, 1 / 13],
  [6, 1 / 13],
  [7, 1 / 13],
  [8, 1 / 13],
  [9, 1 / 13],
  [10, 4 / 13],
];

export interface HandState {
  total: number;
  soft: boolean;
}

/** Adds one card value (ace = 1) to a running total, tracking softness. */
export function advanceHand(total: number, soft: boolean, value: number): HandState {
  let nextTotal = total;
  let nextSoft = soft;
  if (value === 1 && nextTotal + 11 <= 21) {
    nextTotal += 11;
    nextSoft = true;
  } else {
    nextTotal += value;
  }
  if (nextTotal > 21 && nextSoft) {
    nextTotal -= 10;
    nextSoft = false;
  }
  return { total: nextTotal, soft: nextSoft };
}

export interface DealerDistribution {
  /** P(dealer finishes on 17..21), excluding two-card naturals. */
  totals: Record<17 | 18 | 19 | 20 | 21, number>;
  bust: number;
  /** P(two-card natural 21). Zero when conditioned away by dealer peek. */
  blackjack: number;
}

// Distribution vector indices: 0..4 = final totals 17..21, 5 = bust.
type Dist = readonly [number, number, number, number, number, number];

const BUST: Dist = [0, 0, 0, 0, 0, 1];

function pointMass(total: number): Dist {
  const dist = [0, 0, 0, 0, 0, 0];
  dist[total - 17] = 1;
  return dist as unknown as Dist;
}

function playOut(total: number, soft: boolean, rules: RuleSet, memo: Map<string, Dist>): Dist {
  if (total > 21) return BUST;
  const mustHit = total < 17 || (total === 17 && soft && rules.dealerHitsSoft17);
  if (!mustHit) return pointMass(total);

  const key = `${total}|${soft ? 1 : 0}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const acc = [0, 0, 0, 0, 0, 0];
  for (const [value, p] of CARD_PROBABILITIES) {
    const next = advanceHand(total, soft, value);
    const sub = playOut(next.total, next.soft, rules, memo);
    for (let i = 0; i < 6; i++) {
      acc[i] = (acc[i] ?? 0) + p * (sub[i] ?? 0);
    }
  }
  const dist = acc as unknown as Dist;
  memo.set(key, dist);
  return dist;
}

/**
 * Final-total distribution for the dealer's hand given the up card, under an
 * infinite-deck approximation. When `rules.dealerPeek` is true and the up
 * card is an ace or a ten, the distribution is conditioned on "no natural"
 * (the hand would not be played out otherwise).
 */
export function dealerDistribution(upCard: Card, rules: RuleSet): DealerDistribution {
  const memo = new Map<string, Dist>();
  const isAce = upCard.rank === "A";
  const start: HandState = isAce
    ? { total: 11, soft: true }
    : { total: cardValue(upCard), soft: false };
  const canBlackjack = isAce || cardValue(upCard) === 10;

  const acc = [0, 0, 0, 0, 0, 0];
  let blackjack = 0;
  for (const [value, p] of CARD_PROBABILITIES) {
    const next = advanceHand(start.total, start.soft, value);
    if (canBlackjack && next.total === 21) {
      blackjack += p;
      continue;
    }
    const sub = playOut(next.total, next.soft, rules, memo);
    for (let i = 0; i < 6; i++) {
      acc[i] = (acc[i] ?? 0) + p * (sub[i] ?? 0);
    }
  }

  if (rules.dealerPeek && blackjack > 0) {
    const scale = 1 / (1 - blackjack);
    for (let i = 0; i < 6; i++) {
      acc[i] = (acc[i] ?? 0) * scale;
    }
    blackjack = 0;
  }

  return {
    totals: {
      17: acc[0] ?? 0,
      18: acc[1] ?? 0,
      19: acc[2] ?? 0,
      20: acc[3] ?? 0,
      21: acc[4] ?? 0,
    },
    bust: acc[5] ?? 0,
    blackjack,
  };
}
