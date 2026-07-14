/**
 * Core domain types shared by every engine in the library.
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Rank = (typeof RANKS)[number];

/** A playing card. Suits never influence blackjack decisions, so only the rank is kept. */
export interface Card {
  readonly rank: Rank;
}

/** Moves an engine can recommend for a hand in play. */
export type Action = "hit" | "stand" | "double" | "split" | "surrender";

/** Dealer up-card buckets used by strategy tables (10/J/Q/K collapse to "10"). */
export const DEALER_KEYS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"] as const;

export type DealerKey = (typeof DEALER_KEYS)[number];

/**
 * The state of a single blackjack hand — the shared input consumed by the
 * strategy, EV, and cash-out engines.
 *
 * Table rules (`RuleSet`) are deliberately NOT part of the state: they are
 * per-table, not per-hand, and are injected into each engine at construction.
 */
export interface GameState {
  playerCards: readonly Card[];
  dealerUpCard: Card;
  /** Defaults to `true` when the hand has exactly two cards. */
  canDouble?: boolean;
  /** Defaults to `true` when the hand is exactly two cards of equal value. */
  canSplit?: boolean;
  /** Defaults to `true` on two-card hands; only honored when the rules allow surrender. */
  canSurrender?: boolean;
}

/** Derived value of a hand, computed internally from the cards. */
export interface HandValue {
  /** Best total (aces counted as 11 where possible without busting). */
  total: number;
  isSoft: boolean;
  isPair: boolean;
  /** Two-card 21. */
  isBlackjack: boolean;
  isBust: boolean;
}

/**
 * The rules a blackjack table plays under. Strategy and EV engines are
 * parameterized by a RuleSet so H17/S17, deck counts, DAS, surrender, etc.
 * never require public-API changes.
 */
export interface RuleSet {
  name: string;
  dealerHitsSoft17: boolean;
  blackjackPayout: 1.5 | 1.2;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  surrender: "none" | "early" | "late";
  numberOfDecks: number;
  dealerPeek: boolean;
}

/* ------------------------------------------------------------------------ */
/* Errors — returned as neverthrow Result values, never thrown.              */
/* ------------------------------------------------------------------------ */

export interface InvalidCardError {
  readonly type: "invalid_card";
  readonly message: string;
  readonly input: string;
}

export interface InvalidHandError {
  readonly type: "invalid_hand";
  readonly message: string;
}

export interface StrategyLoadError {
  readonly type: "strategy_load";
  readonly message: string;
  readonly path?: string;
}

export interface StrategyLookupError {
  readonly type: "strategy_lookup";
  readonly message: string;
}

export interface InvalidInputError {
  readonly type: "invalid_input";
  readonly message: string;
}

export type EngineError =
  InvalidCardError | InvalidHandError | StrategyLoadError | StrategyLookupError | InvalidInputError;

export const invalidCard = (input: string): InvalidCardError => ({
  type: "invalid_card",
  message: `Invalid card: "${input}" (expected A, 2-10, J, Q, or K)`,
  input,
});

export const invalidHand = (message: string): InvalidHandError => ({
  type: "invalid_hand",
  message,
});

export const strategyLoad = (message: string, path?: string): StrategyLoadError => ({
  type: "strategy_load",
  message,
  path,
});

export const strategyLookup = (message: string): StrategyLookupError => ({
  type: "strategy_lookup",
  message,
});

export const invalidInput = (message: string): InvalidInputError => ({
  type: "invalid_input",
  message,
});
