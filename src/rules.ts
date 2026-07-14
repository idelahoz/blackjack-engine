import type { RuleSet } from "./types.js";

/** Common multi-deck game: dealer stands on soft 17, 3:2 blackjack, DAS, late surrender. */
export const S17_RULES: RuleSet = {
  name: "s17-6deck-das",
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  doubleAfterSplit: true,
  resplitAces: false,
  surrender: "late",
  numberOfDecks: 6,
  dealerPeek: true,
};

/** Same table but the dealer hits soft 17. */
export const H17_RULES: RuleSet = {
  ...S17_RULES,
  name: "h17-6deck-das",
  dealerHitsSoft17: true,
};
