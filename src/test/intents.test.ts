import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "generate-intents.mjs");
const candidatesDir = path.join(rootDir, "automation", "candidates");
const intentsDir = path.join(rootDir, "automation", "research_intents");

describe("Intent Emission CLI Integration", () => {
  const testCandidatePath = path.join(candidatesDir, "test_intent_gen.json");
  const expectedIntentPath = path.join(intentsDir, "intent_test_intent_gen.json");
  const fixturePath = path.join(candidatesDir, "fixture_intent_test_001.json");

  beforeEach(() => {
    // Remove fixture to isolate test
    if (fs.existsSync(fixturePath)) fs.renameSync(fixturePath, fixturePath + ".bak");

    // Setup a ready_for_review candidate
    const candidate = {
      id: "test_intent_gen",
      state: "ready_for_review",
      source: "coindesk",
      title: "Test Signal for Intent Gen",
      summary: "Testing the generator script with a long enough summary for schema validation if needed.",
      category: "Btc_Whale_Activity",
      score: 80,
      confidence: 0.90,
      created_at: new Date().toISOString(),
      decision: {
        gate_applied: "ready_for_review",
        timestamp: new Date().toISOString(),
        reason: "Test isolation verification",
        evaluator: "vitest_suite"
      }
    };
    fs.writeFileSync(testCandidatePath, JSON.stringify(candidate, null, 2));
  });

  afterEach(() => {
    if (fs.existsSync(testCandidatePath)) fs.unlinkSync(testCandidatePath);
    if (fs.existsSync(expectedIntentPath)) fs.unlinkSync(expectedIntentPath);
    // Restore fixture
    if (fs.existsSync(fixturePath + ".bak")) fs.renameSync(fixturePath + ".bak", fixturePath);
  });

  it("should generate a valid intent from a ready_for_review candidate", () => {
    const result = spawnSync("node", [scriptPath], {
      cwd: rootDir,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
    }

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("intent_test_intent_gen.json");
    expect(fs.existsSync(expectedIntentPath)).toBe(true);

    const intent = JSON.parse(fs.readFileSync(expectedIntentPath, "utf8"));
    expect(intent.intent_id).toContain("test_intent_gen");
    expect(intent.hypothesis_type).toBe("event_driven");
    expect(intent.bias).toBe("bullish");
    expect(intent.route).toBe("research_hypothesis");
    expect(intent.created_at).toBeDefined();
  });

  it("should skip candidates that are not in ready_for_review state", () => {
    const candidate = JSON.parse(fs.readFileSync(testCandidatePath, "utf8"));
    candidate.state = "candidate";
    fs.writeFileSync(testCandidatePath, JSON.stringify(candidate, null, 2));

    const result = spawnSync("node", [scriptPath], {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Intents generated: 0");
    expect(fs.existsSync(expectedIntentPath)).toBe(false);
  });
});
