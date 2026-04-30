import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "ingest-events.mjs");
const fixturesDir = path.join(rootDir, "automation", "events", "fixtures");
const schemaPath = path.join(rootDir, "config", "event.schema.json");
const approvedSourcesPath = path.join(rootDir, "config", "approved-sources.yaml");
const canonicalOutputPath = path.join(rootDir, "automation", "events", "normalized", "events.normalized.json");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function createIsolatedWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quant-pulse-ingestion-"));
  const tempScriptsDir = path.join(tempRoot, "scripts");
  const tempConfigDir = path.join(tempRoot, "config");
  const tempFixturesDir = path.join(tempRoot, "automation", "events", "fixtures");
  const tempNormalizedDir = path.join(tempRoot, "automation", "events", "normalized");

  fs.mkdirSync(tempScriptsDir, { recursive: true });
  fs.mkdirSync(tempConfigDir, { recursive: true });
  fs.mkdirSync(tempFixturesDir, { recursive: true });
  fs.mkdirSync(tempNormalizedDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    JSON.stringify({ name: "quant-pulse-ingestion-test", private: true, type: "module" }, null, 2)
  );
  fs.symlinkSync(path.join(rootDir, "node_modules"), path.join(tempRoot, "node_modules"), "junction");

  fs.copyFileSync(scriptPath, path.join(tempScriptsDir, "ingest-events.mjs"));
  fs.copyFileSync(schemaPath, path.join(tempConfigDir, "event.schema.json"));
  fs.copyFileSync(approvedSourcesPath, path.join(tempConfigDir, "approved-sources.yaml"));

  for (const entry of fs.readdirSync(fixturesDir)) {
    fs.copyFileSync(path.join(fixturesDir, entry), path.join(tempFixturesDir, entry));
  }

  return {
    tempRoot,
    tempFixturesDir,
    tempOutputPath: path.join(tempNormalizedDir, "events.normalized.json"),
    tempScriptPath: path.join(tempScriptsDir, "ingest-events.mjs")
  };
}

function destroyIsolatedWorkspace(tempRoot: string) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

describe("Event Ingestion Foundation", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);

  it("should generate a single canonical normalized artifact from fixtures", () => {
    const workspace = createIsolatedWorkspace();

    try {
      const result = spawnSync("node", [workspace.tempScriptPath], {
        cwd: workspace.tempRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync(workspace.tempOutputPath)).toBe(true);

      const events = JSON.parse(fs.readFileSync(workspace.tempOutputPath, "utf8"));
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        const isValid = validate(event);
        if (!isValid) {
          console.error("Schema errors for event:", event.id, validate.errors);
        }
        expect(isValid).toBe(true);
      }
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should be perfectly idempotent (byte-identical output)", () => {
    const workspace = createIsolatedWorkspace();

    try {
      spawnSync("node", [workspace.tempScriptPath], { cwd: workspace.tempRoot });
      const output1 = fs.readFileSync(workspace.tempOutputPath, "utf8");

      spawnSync("node", [workspace.tempScriptPath], { cwd: workspace.tempRoot });
      const output2 = fs.readFileSync(workspace.tempOutputPath, "utf8");

      expect(output1).toBe(output2);
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should enforce deterministic IDs and stable sorting", () => {
    const workspace = createIsolatedWorkspace();

    try {
      spawnSync("node", [workspace.tempScriptPath], { cwd: workspace.tempRoot });
      const events = JSON.parse(fs.readFileSync(workspace.tempOutputPath, "utf8"));

      for (const event of events) {
        expect(event.id).toMatch(/^[0-9a-f]{12}$/);
      }

      for (let i = 0; i < events.length - 1; i++) {
        const current = events[i];
        const next = events[i + 1];

        const dateCompare = current.published_at.localeCompare(next.published_at);
        if (dateCompare === 0) {
          expect(current.id.localeCompare(next.id)).toBeLessThanOrEqual(0);
        } else {
          expect(dateCompare).toBeLessThan(0);
        }
      }
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should map sources correctly from approved-sources.yaml", () => {
    const workspace = createIsolatedWorkspace();

    try {
      spawnSync("node", [workspace.tempScriptPath], { cwd: workspace.tempRoot });
      const events = JSON.parse(fs.readFileSync(workspace.tempOutputPath, "utf8"));

      const theBlock = events.find(e => e.source === "The Block");
      const sec = events.find(e => e.source === "SEC");

      expect(theBlock).toBeDefined();
      expect(theBlock.source_tier).toBe(1);
      expect(sec).toBeDefined();
      expect(sec.source_tier).toBe(1);
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should enforce explicit source matches only", () => {
    const workspace = createIsolatedWorkspace();
    const tempFixturePath = path.join(workspace.tempFixturesDir, "__tmp_explicit_match_only.json");
    const tempFixture = [
      {
        feed_source: "The Block Research",
        item_title: "Non-canonical branded source variant",
        item_link: "https://example.com/the-block-research",
        pub_date: "2024-04-15T16:00:00Z",
        channel: "rss"
      }
    ];

    try {
      fs.writeFileSync(tempFixturePath, JSON.stringify(tempFixture, null, 2));
      spawnSync("node", [workspace.tempScriptPath], { cwd: workspace.tempRoot });

      const events = JSON.parse(fs.readFileSync(workspace.tempOutputPath, "utf8"));
      const variant = events.find((event) => event.url === "https://example.com/the-block-research");

      expect(variant).toBeDefined();
      expect(variant.source).toBe("The Block Research");
      expect(variant.source_tier).toBe(3);
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });

  it("should reproduce the published canonical artifact from the committed fixtures", () => {
    const workspace = createIsolatedWorkspace();

    try {
      spawnSync("node", [workspace.tempScriptPath], { cwd: workspace.tempRoot });
      const generated = fs.readFileSync(workspace.tempOutputPath, "utf8");
      const canonical = fs.readFileSync(canonicalOutputPath, "utf8");

      expect(generated).toBe(canonical);
    } finally {
      destroyIsolatedWorkspace(workspace.tempRoot);
    }
  });
});
