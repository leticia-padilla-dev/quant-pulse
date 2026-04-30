import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "validate-candidates.mjs");
const examplesDir = path.join(rootDir, "automation", "candidates", "examples");

function createIsolatedWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quant-pulse-candidates-"));
  const tempScriptsDir = path.join(tempRoot, "scripts");
  const tempConfigDir = path.join(tempRoot, "config");
  const tempGatesDir = path.join(tempRoot, "automation", "gates");
  const tempCandidatesDir = path.join(tempRoot, "automation", "candidates");
  const tempExamplesDir = path.join(tempCandidatesDir, "examples");

  fs.mkdirSync(tempScriptsDir, { recursive: true });
  fs.mkdirSync(tempConfigDir, { recursive: true });
  fs.mkdirSync(tempGatesDir, { recursive: true });
  fs.mkdirSync(tempExamplesDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    JSON.stringify({ name: "quant-pulse-candidates-test", private: true, type: "module" }, null, 2)
  );
  fs.symlinkSync(path.join(rootDir, "node_modules"), path.join(tempRoot, "node_modules"), "junction");

  fs.copyFileSync(scriptPath, path.join(tempScriptsDir, "validate-candidates.mjs"));
  fs.copyFileSync(
    path.join(rootDir, "config", "candidate.schema.json"),
    path.join(tempConfigDir, "candidate.schema.json")
  );
  fs.copyFileSync(
    path.join(rootDir, "automation", "gates", "approval_gates.yaml"),
    path.join(tempGatesDir, "approval_gates.yaml")
  );
  fs.writeFileSync(path.join(tempCandidatesDir, "index.json"), JSON.stringify({ candidates: [] }, null, 2));

  return {
    tempRoot,
    tempCandidatesDir,
    tempExamplesDir,
    tempScriptPath: path.join(tempScriptsDir, "validate-candidates.mjs")
  };
}

function destroyIsolatedWorkspace(tempRoot: string) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function copyExampleFixtures(targetExamplesDir: string) {
  for (const entry of fs.readdirSync(examplesDir)) {
    fs.copyFileSync(
      path.join(examplesDir, entry),
      path.join(targetExamplesDir, entry)
    );
  }
}

describe("Candidate Governance CLI Integration", () => {
  it("should pass validation for all 6 examples", () => {
    const workspace = createIsolatedWorkspace();
    copyExampleFixtures(workspace.tempExamplesDir);

    try {
      const result = spawnSync("node", [workspace.tempScriptPath, "--examples"], {
        cwd: workspace.tempRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("6 candidates validated.");
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should report 0 candidates when no real candidates exist and --examples is absent", () => {
    const workspace = createIsolatedWorkspace();

    try {
      const result = spawnSync("node", [workspace.tempScriptPath], {
        cwd: workspace.tempRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("0 candidates validated.");
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should fail and report drift error when state doesn't match metrics", () => {
    const workspace = createIsolatedWorkspace();
    const driftFile = path.join(workspace.tempCandidatesDir, "drift_test.json");

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

      const result = spawnSync("node", [workspace.tempScriptPath], {
        cwd: workspace.tempRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("[gate consistency error]");
      expect(result.stderr).toContain("state=\"candidate\" but derived gate=\"no_candidate\"");
      expect(result.stderr).toContain("decision.gate_applied=\"candidate\" but derived gate=\"no_candidate\"");
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should fail when schema is invalid", () => {
    const workspace = createIsolatedWorkspace();
    const invalidFile = path.join(workspace.tempCandidatesDir, "schema_error_test.json");

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

      const result = spawnSync("node", [workspace.tempScriptPath], {
        cwd: workspace.tempRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("[schema error]");
      expect(result.stderr).toContain("must have required property 'created_at'");
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });
});
