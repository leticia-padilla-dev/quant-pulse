import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "validate-candidates.mjs");
const examplesDir = path.join(rootDir, "automation", "candidates", "examples");

describe("Candidate Governance CLI Integration", () => {
  it("should pass validation for all 6 examples", () => {
    const result = spawnSync("node", [scriptPath, "--examples"], {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("6 candidates validated.");
  });

  it("should report 0 candidates when no real candidates exist and --examples is absent", () => {
    // In this repo state, automation/candidates/ only contains index.json and examples/
    // so the discoverer should find 0 files.
    const result = spawnSync("node", [scriptPath], {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 candidates validated.");
  });

  it("should fail and report drift error when state doesn't match metrics", () => {
    const driftFile = path.join(rootDir, "automation", "candidates", "drift_test.json");
    
    // Low score signal (35) marked as 'candidate' (needs 40)
    const driftData = {
      id: "drift_test_001",
      state: "candidate", // DRIFT: should be no_candidate
      source: "coindesk",
      title: "Drift Test Signal",
      summary: "This signal has low score but is incorrectly marked as candidate.",
      category: "Other",
      score: 35,
      confidence: 0.60,
      created_at: new Date().toISOString(),
      decision: {
        gate_applied: "candidate", // DRIFT: should be no_candidate
        timestamp: new Date().toISOString(),
        reason: "Manual override error"
      }
    };

    try {
      fs.writeFileSync(driftFile, JSON.stringify(driftData, null, 2));

      const result = spawnSync("node", [scriptPath], {
        cwd: rootDir,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("[gate consistency error]");
      expect(result.stderr).toContain("state=\"candidate\" but derived gate=\"no_candidate\"");
      expect(result.stderr).toContain("decision.gate_applied=\"candidate\" but derived gate=\"no_candidate\"");
    } finally {
      if (fs.existsSync(driftFile)) {
        fs.unlinkSync(driftFile);
      }
    }
  });

  it("should fail when schema is invalid", () => {
    const invalidFile = path.join(rootDir, "automation", "candidates", "schema_error_test.json");
    
    // Missing required field 'created_at'
    const invalidData = {
      id: "schema_error_001",
      state: "candidate",
      source: "coindesk",
      score: 58,
      confidence: 0.62,
      decision: {
        gate_applied: "candidate",
        timestamp: new Date().toISOString(),
        reason: "invalid"
      }
      // created_at is missing
    };

    try {
      fs.writeFileSync(invalidFile, JSON.stringify(invalidData, null, 2));

      const result = spawnSync("node", [scriptPath], {
        cwd: rootDir,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("[schema error]");
      expect(result.stderr).toContain("must have required property 'created_at'");
    } finally {
      if (fs.existsSync(invalidFile)) {
        fs.unlinkSync(invalidFile);
      }
    }
  });
});
