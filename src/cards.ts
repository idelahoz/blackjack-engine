import { err, ok, Result } from "neverthrow";
import type {
  Card,
  DealerKey,
  HandValue,
  InvalidCardError,
  InvalidHandError,
  Rank,
} from "./types.js";
import { RANKS, invalidCard, invalidHand } from "./types.js";

const RANK_SET: ReadonlySet<string> = new Set(RANKS);

/** Parses a single card token such as "A", "7", "10", "J" ("T" is accepted as an alias for "10"). */
export function parseCard(input: string): Result<Card, InvalidCardError> {
  const raw = input.trim().toUpperCase();
  const normalized = raw === "T" ? "10" : raw;
  if (RANK_SET.has(normalized)) {
    return ok({ rank: normalized as Rank });
  }
  return err(invalidCard(input));
}

/**
 * Parses a hand of comma- and/or space-separated cards, such as "A,7",
 * "A 7", or "10, J, 3". Requires at least two cards.
 */
export function parseHand(input: string): Result<Card[], InvalidCardError | InvalidHandError> {
  const parts = input
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return err(invalidHand(`A hand needs at least two cards, got ${parts.length} ("${input}")`));
  }
  return Result.combine(parts.map(parseCard));
}

/** Blackjack value of a card; aces count as 11 (softness is resolved by evaluateHand). */
export function cardValue(card: Card): number {
  if (card.rank === "A") return 11;
  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return Number(card.rank);
}

/** Strategy-table bucket for a card: "A" or its numeric value ("10" for faces). */
export function dealerKey(card: Card): DealerKey {
  return card.rank === "A" ? "A" : (String(cardValue(card)) as DealerKey);
}

/** Computes the derived value of a hand (best total, softness, pair, blackjack, bust). */
export function evaluateHand(cards: readonly Card[]): Result<HandValue, InvalidHandError> {
  if (cards.length < 2) {
    return err(invalidHand(`A hand needs at least two cards, got ${cards.length}`));
  }

  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card);
    if (card.rank === "A") aces += 1;
  }
  let elevenAces = aces;
  while (total > 21 && elevenAces > 0) {
    total -= 10;
    elevenAces -= 1;
  }

  const first = cards[0];
  const second = cards[1];
  const isPair =
    cards.length === 2 &&
    first !== undefined &&
    second !== undefined &&
    cardValue(first) === cardValue(second);

  return ok({
    total,
    isSoft: elevenAces > 0,
    isPair,
    isBlackjack: cards.length === 2 && total === 21,
    isBust: total > 21,
  });
}
