import { z } from "zod";
import { DEALER_KEYS } from "../types.js";

/**
 * Cell codes used by strategy JSON files (mirroring printed chart keys):
 *  - H  hit
 *  - S  stand
 *  - D  double if allowed, otherwise hit
 *  - Ds double if allowed, otherwise stand
 *  - P  split
 *  - Pd split only if double-after-split is offered, otherwise play the total
 */
export const STRATEGY_CODES = ["H", "S", "D", "Ds", "P", "Pd"] as const;

export type StrategyCode = (typeof STRATEGY_CODES)[number];

const codeSchema = z.enum(STRATEGY_CODES);
const dealerKeySchema = z.enum(DEALER_KEYS);

/** One table row: an action code for every dealer up card. */
const rowSchema = z.record(dealerKeySchema, codeSchema);

const ruleSetSchema = z.object({
  name: z.string().min(1),
  dealerHitsSoft17: z.boolean(),
  blackjackPayout: z.union([z.literal(1.5), z.literal(1.2)]),
  doubleAfterSplit: z.boolean(),
  resplitAces: z.boolean(),
  surrender: z.enum(["none", "early", "late"]),
  numberOfDecks: z.number().int().min(1).max(8),
  dealerPeek: z.boolean(),
});

const totalsTable = (min: number, max: number) =>
  z.record(z.string(), rowSchema).superRefine((table, ctx) => {
    for (let total = min; total <= max; total++) {
      if (!(String(total) in table)) {
        ctx.addIssue({ code: "custom", message: `missing row for total ${total}` });
      }
    }
    for (const key of Object.keys(table)) {
      const total = Number(key);
      if (!Number.isInteger(total) || total < min || total > max) {
        ctx.addIssue({
          code: "custom",
          message: `unexpected total "${key}" (expected ${min}-${max})`,
        });
      }
    }
  });

const surrenderTable = z
  .record(z.string(), z.partialRecord(dealerKeySchema, z.boolean()))
  .superRefine((table, ctx) => {
    for (const key of Object.keys(table)) {
      const total = Number(key);
      if (!Number.isInteger(total) || total < 4 || total > 21) {
        ctx.addIssue({
          code: "custom",
          message: `unexpected surrender total "${key}" (expected 4-21)`,
        });
      }
    }
  });

/**
 * Schema for external strategy JSON files. Strategies declare the RuleSet
 * they were built for; the tables themselves are pure lookups.
 */
export const strategySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rules: ruleSetSchema,
  /** Hard totals 4-21. */
  hard: totalsTable(4, 21),
  /** Soft totals 12-21. */
  soft: totalsTable(12, 21),
  /** Pair rows keyed by card bucket ("2"-"10", "A"); all ten rows are required. */
  pairs: z.record(dealerKeySchema, rowSchema),
  /** Optional late-surrender cells, keyed by hard total then dealer up card. */
  surrender: surrenderTable.optional(),
});

export type Strategy = z.infer<typeof strategySchema>;
export type StrategyRow = z.infer<typeof rowSchema>;
