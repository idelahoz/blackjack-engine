import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import type { StrategyLoadError } from "../types.js";
import { strategyLoad } from "../types.js";
import { strategySchema, type Strategy } from "./schema.js";

/**
 * Validates already-parsed JSON data as a Strategy. Useful for consumers that
 * do not read from the filesystem (browsers, bundlers, tests).
 */
export function parseStrategy(data: unknown, source?: string): Result<Strategy, StrategyLoadError> {
  const parsed = strategySchema.safeParse(data);
  if (parsed.success) return ok(parsed.data);
  const details = parsed.error.issues
    .slice(0, 5)
    .map((issue) =>
      issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");
  return err(strategyLoad(`Strategy failed validation: ${details}`, source));
}

/** Loads and validates a strategy JSON file from disk. */
export function loadStrategy(path: string): ResultAsync<Strategy, StrategyLoadError> {
  return ResultAsync.fromPromise(readFile(path, "utf8"), (cause) =>
    strategyLoad(`Cannot read strategy file: ${String(cause)}`, path),
  )
    .andThen((text) => {
      try {
        return ok(JSON.parse(text) as unknown);
      } catch (cause) {
        return err(strategyLoad(`Strategy file is not valid JSON: ${String(cause)}`, path));
      }
    })
    .andThen((json) => parseStrategy(json, path));
}

export type BundledStrategyName = "s17" | "h17";

/**
 * Absolute path of a strategy file shipped with this package
 * (`strategies/s17.json`, `strategies/h17.json`).
 */
export function bundledStrategyPath(name: BundledStrategyName): string {
  // Built output lives in dist/ (one level below the package root); source and
  // test runs execute from src/strategy/ (two levels below). Try both.
  const fallback = new URL(`../strategies/${name}.json`, import.meta.url);
  const candidates = [fallback, new URL(`../../strategies/${name}.json`, import.meta.url)];
  for (const url of candidates) {
    const path = fileURLToPath(url);
    if (existsSync(path)) return path;
  }
  return fileURLToPath(fallback);
}
