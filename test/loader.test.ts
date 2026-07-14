import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { bundledStrategyPath, loadStrategy, parseStrategy } from "../src/strategy/loader.js";

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "blackjack-engine-test-"));
});

describe("bundled strategies", () => {
  it("loads s17.json", async () => {
    const strategy = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
    expect(strategy.name).toBe("s17-multideck-basic");
    expect(strategy.rules.dealerHitsSoft17).toBe(false);
    expect(strategy.hard["11"]?.A).toBe("H");
  });

  it("loads h17.json", async () => {
    const strategy = (await loadStrategy(bundledStrategyPath("h17")))._unsafeUnwrap();
    expect(strategy.name).toBe("h17-multideck-basic");
    expect(strategy.rules.dealerHitsSoft17).toBe(true);
    expect(strategy.hard["11"]?.A).toBe("D");
  });
});

describe("loadStrategy failures", () => {
  it("reports missing files", async () => {
    const result = await loadStrategy(join(tmp, "does-not-exist.json"));
    const error = result._unsafeUnwrapErr();
    expect(error.type).toBe("strategy_load");
    expect(error.message).toContain("Cannot read");
  });

  it("reports malformed JSON", async () => {
    const path = join(tmp, "broken.json");
    await writeFile(path, "{ not json", "utf8");
    const error = (await loadStrategy(path))._unsafeUnwrapErr();
    expect(error.type).toBe("strategy_load");
    expect(error.message).toContain("not valid JSON");
  });

  it("reports schema violations with details", async () => {
    const path = join(tmp, "invalid.json");
    await writeFile(path, JSON.stringify({ name: "bad", rules: {} }), "utf8");
    const error = (await loadStrategy(path))._unsafeUnwrapErr();
    expect(error.type).toBe("strategy_load");
    expect(error.message).toContain("validation");
  });

  it("rejects tables with missing rows", async () => {
    const base = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
    const { "16": _dropped, ...hardWithout16 } = base.hard;
    const error = parseStrategy({ ...base, hard: hardWithout16 })._unsafeUnwrapErr();
    expect(error.message).toContain("missing row for total 16");
  });

  it("rejects unknown action codes", async () => {
    const base = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
    const mangled = structuredClone(base) as Record<string, unknown>;
    (mangled.hard as Record<string, Record<string, string>>)["16"]!["10"] = "X";
    const error = parseStrategy(mangled)._unsafeUnwrapErr();
    expect(error.type).toBe("strategy_load");
  });
});

describe("parseStrategy", () => {
  it("accepts an already-parsed strategy object", async () => {
    const base = (await loadStrategy(bundledStrategyPath("s17")))._unsafeUnwrap();
    const reparsed = parseStrategy(JSON.parse(JSON.stringify(base)));
    expect(reparsed._unsafeUnwrap().name).toBe("s17-multideck-basic");
  });
});
