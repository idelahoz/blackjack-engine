import { cardValue, dealerKey, evaluateHand } from "../cards.js";
import { S17_RULES } from "../rules.js";
import type { Action, Card, GameState, RuleSet } from "../types.js";
import {
  CARD_PROBABILITIES,
  advanceHand,
  dealerDistribution,
  type DealerDistribution,
} from "./dealer.js";

/**
 * Expected-value calculator for a blackjack position.
 *
 * EV unit convention (used across the whole library): the expected TOTAL
 * RETURN per unit of the original bet.
 *   - 1.0  = break even (you expect your wager back)
 *   - 0.42 = you expect back 42% of the original wager
 *   - 2.5  = a paid 3:2 natural
 * Doubling and splitting commit extra chips, so their values can leave the
 * [0, 2.5] range (a lost double returns -1: the original bet plus one more).
 */
export interface EvEngine {
  /** EV of continuing the hand, playing the best available action. */
  expectedValue(state: GameState): number;
  /** EV of each currently-available action, in the same units. */
  actionValues(state: GameState): Partial<Record<Action, number>>;
}

interface DealerContext {
  key: string;
  dist: DealerDistribution;
}

/**
 * Exact recursive EV under an infinite-deck approximation, with memoization.
 * Split EV is approximated as twice the value of one post-split hand (no
 * resplit modeling). Alternate implementations (finite-deck, Monte Carlo,
 * count-aware) can replace this class behind the EvEngine interface.
 */
export class RecursiveEvEngine implements EvEngine {
  private readonly rules: RuleSet;
  private readonly distCache = new Map<string, DealerDistribution>();
  private readonly bestCache = new Map<string, number>();

  constructor(rules: RuleSet = S17_RULES) {
    this.rules = rules;
  }

  expectedValue(state: GameState): number {
    const values = Object.values(this.actionValues(state));
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  actionValues(state: GameState): Partial<Record<Action, number>> {
    const handResult = evaluateHand(state.playerCards);
    if (handResult.isErr()) return {};
    const hand = handResult.value;
    if (hand.isBust) return { stand: 0 }; // the original bet is already lost

    const ctx = this.dealerContext(state.dealerUpCard);

    if (hand.isBlackjack) {
      // A natural pays immediately; it only pushes against a dealer natural,
      // which is possible here only when the dealer does not peek.
      const profit = this.rules.blackjackPayout * (1 - ctx.dist.blackjack);
      return { stand: 1 + profit };
    }

    const twoCards = state.playerCards.length === 2;
    const canDouble = state.canDouble ?? twoCards;
    const canSplit = hand.isPair && (state.canSplit ?? true);
    const canSurrender =
      this.rules.surrender !== "none" && twoCards && (state.canSurrender ?? true);

    const values: Partial<Record<Action, number>> = {
      stand: 1 + this.standProfit(hand.total, ctx.dist),
      hit: 1 + this.hitProfit(hand.total, hand.isSoft, ctx),
    };
    if (twoCards && canDouble) {
      values.double = 1 + this.doubleProfit(hand.total, hand.isSoft, ctx.dist);
    }
    const first = state.playerCards[0];
    if (twoCards && canSplit && first !== undefined) {
      values.split = 1 + this.splitProfit(first, ctx);
    }
    if (canSurrender) {
      values.surrender = 0.5;
    }
    return values;
  }

  private dealerContext(upCard: Card): DealerContext {
    const key = dealerKey(upCard);
    let dist = this.distCache.get(key);
    if (dist === undefined) {
      dist = dealerDistribution(upCard, this.rules);
      this.distCache.set(key, dist);
    }
    return { key, dist };
  }

  /** Profit (in bets) of standing on `total`. */
  private standProfit(total: number, dist: DealerDistribution): number {
    if (total > 21) return -1;
    let win = dist.bust;
    let lose = dist.blackjack; // a dealer natural beats any non-natural hand
    for (const t of [17, 18, 19, 20, 21] as const) {
      const p = dist.totals[t];
      if (total > t) win += p;
      else if (total < t) lose += p;
    }
    return win - lose;
  }

  /** Profit of taking exactly one more card and then playing on optimally. */
  private hitProfit(total: number, soft: boolean, ctx: DealerContext): number {
    let ev = 0;
    for (const [value, p] of CARD_PROBABILITIES) {
      const next = advanceHand(total, soft, value);
      ev += p * (next.total > 21 ? -1 : this.bestProfit(next.total, next.soft, ctx));
    }
    return ev;
  }

  /** Best profit achievable from a multi-card hand (stand or keep hitting; no double). */
  private bestProfit(total: number, soft: boolean, ctx: DealerContext): number {
    const key = `${ctx.key}|${total}|${soft ? 1 : 0}`;
    const cached = this.bestCache.get(key);
    if (cached !== undefined) return cached;

    const stand = this.standProfit(total, ctx.dist);
    const hit = this.hitProfit(total, soft, ctx);
    const best = Math.max(stand, hit);
    this.bestCache.set(key, best);
    return best;
  }

  /** Profit of doubling: one card, forced stand, twice the stake. */
  private doubleProfit(total: number, soft: boolean, dist: DealerDistribution): number {
    let ev = 0;
    for (const [value, p] of CARD_PROBABILITIES) {
      const next = advanceHand(total, soft, value);
      ev += p * (next.total > 21 ? -1 : this.standProfit(next.total, dist));
    }
    return 2 * ev;
  }

  /**
   * Approximate profit of splitting: twice the EV of a single post-split hand
   * (pair card + one draw, then played optimally). Split aces receive exactly
   * one card; resplits are not modeled.
   */
  private splitProfit(card: Card, ctx: DealerContext): number {
    if (card.rank === "A") {
      let ev = 0;
      for (const [value, p] of CARD_PROBABILITIES) {
        const next = advanceHand(11, true, value);
        ev += p * this.standProfit(next.total, ctx.dist);
      }
      return 2 * ev;
    }

    const startValue = cardValue(card);
    let ev = 0;
    for (const [value, p] of CARD_PROBABILITIES) {
      const next = advanceHand(startValue, false, value);
      let best = this.bestProfit(next.total, next.soft, ctx);
      if (this.rules.doubleAfterSplit && next.total <= 21) {
        best = Math.max(best, this.doubleProfit(next.total, next.soft, ctx.dist));
      }
      ev += p * best;
    }
    return 2 * ev;
  }
}
