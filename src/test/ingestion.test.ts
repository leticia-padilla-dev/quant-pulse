import { afterEach, describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "ingest-events.mjs");
const fixturesDir = path.join(rootDir, "automation", "events", "fixtures");
const outputPath = path.join(rootDir, "automation", "events", "normalized", "events.normalized.json");
const schemaPath = path.join(rootDir, "config", "event.schema.json");
const tempFixturePath = path.join(fixturesDir, "__tmp_explicit_match_only.json");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

describe("Event Ingestion Foundation", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);

  afterEach(() => {
    if (fs.existsSync(tempFixturePath)) {
      fs.unlinkSync(tempFixturePath);
      spawnSync("node", [scriptPath], { cwd: rootDir });
    }
  });

  it("should generate a single canonical normalized artifact from fixtures", () => {
    const result = spawnSync("node", [scriptPath], {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const events = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);

    // Validate schema for all items
    for (const event of events) {
      const isValid = validate(event);
      if (!isValid) {
        console.error("Schema errors for event:", event.id, validate.errors);
      }
      expect(isValid).toBe(true);
    }
  });

  it("should be perfectly idempotent (byte-identical output)", () => {
    // Run 1
    spawnSync("node", [scriptPath], { cwd: rootDir });
    const output1 = fs.readFileSync(outputPath, "utf8");

    // Run 2
    spawnSync("node", [scriptPath], { cwd: rootDir });
    const output2 = fs.readFileSync(outputPath, "utf8");

    // Check byte-to-byte equality for determinism
    expect(output1).toBe(output2);
  });

  it("should enforce deterministic IDs and stable sorting", () => {
    spawnSync("node", [scriptPath], { cwd: rootDir });
    const events = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    // Verify IDs are 12-char hex
    for (const event of events) {
      expect(event.id).toMatch(/^[0-9a-f]{12}$/);
    }

    // Verify sorting (by published_at, then id)
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i+1];
      
      const dateCompare = current.published_at.localeCompare(next.published_at);
      if (dateCompare === 0) {
        expect(current.id.localeCompare(next.id)).toBeLessThanOrEqual(0);
      } else {
        expect(dateCompare).toBeLessThan(0);
      }
    }
  });

  it("should map sources correctly from approved-sources.yaml", () => {
    spawnSync("node", [scriptPath], { cwd: rootDir });
    const events = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    const theBlock = events.find(e => e.source === "The Block");
    const sec = events.find(e => e.source === "SEC");

    expect(theBlock).toBeDefined();
    expect(theBlock.source_tier).toBe(1);
    expect(sec).toBeDefined();
    expect(sec.source_tier).toBe(1);
  });

  it("should enforce explicit source matches only", () => {
    const tempFixture = [
      {
        feed_source: "The Block Research",
        item_title: "Non-canonical branded source variant",
        item_link: "https://example.com/the-block-research",
        pub_date: "2024-04-15T16:00:00Z",
        channel: "rss"
      }
    ];

    fs.writeFileSync(tempFixturePath, JSON.stringify(tempFixture, null, 2));
    spawnSync("node", [scriptPath], { cwd: rootDir });

    const events = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const variant = events.find((event) => event.url === "https://example.com/the-block-research");

    expect(variant).toBeDefined();
    expect(variant.source).toBe("The Block Research");
    expect(variant.source_tier).toBe(3);
  });
});
