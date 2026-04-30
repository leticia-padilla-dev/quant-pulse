import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Script: ingest-events.mjs
 * Purpose: Normalize raw events from local fixtures into a canonical system contract.
 * Features: Deterministic IDs, Source Tier Mapping, Idempotency.
 */

// Paths
const rootDir = process.cwd();
const fixturesDir = path.join(rootDir, "automation", "events", "fixtures");
const outputDir = path.join(rootDir, "automation", "events", "normalized");
const outputPath = path.join(outputDir, "events.normalized.json");
const approvedSourcesPath = path.join(rootDir, "config", "approved-sources.yaml");

// Ensure directories exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Simple YAML parser for approved sources (primitive but sufficient for Phase 3 baseline)
 */
function loadApprovedSources(filePath) {
  if (!fs.existsSync(filePath)) {
    return { tier_1: [], tier_2: [], tier_3: [] };
  }
  const content = fs.readFileSync(filePath, "utf8");
  const sources = { tier_1: [], tier_2: [], tier_3: [] };
  let currentTier = null;
  let inExplicitSources = false;

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("tier_1:")) {
      currentTier = "tier_1";
      inExplicitSources = false;
    } else if (trimmed.startsWith("tier_2:")) {
      currentTier = "tier_2";
      inExplicitSources = false;
    } else if (trimmed.startsWith("tier_3:")) {
      currentTier = "tier_3";
      inExplicitSources = false;
    } else if (trimmed.startsWith("explicit_sources:")) {
      inExplicitSources = true;
    } else if (/^[a-zA-Z_]+:/.test(trimmed)) {
      inExplicitSources = false;
    } else if (trimmed.startsWith("- ") && currentTier && inExplicitSources) {
      sources[currentTier].push(trimmed.replace("- ", "").replace(/"/g, "").trim());
    }
  }
  return sources;
}

/**
 * Generates a deterministic ID from core fields
 */
function generateDeterministicId(source, url, publishedAt) {
  const data = `${source}|${url}|${publishedAt}`;
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 12);
}

/**
 * Maps raw source to approved source identity and tier
 */
function mapSource(rawName, approvedSources) {
  for (const tier of ["tier_1", "tier_2", "tier_3"]) {
    const matched = approvedSources[tier].find((sourceName) =>
      sourceName.toLowerCase() === rawName.toLowerCase()
    );
    if (matched) {
      return {
        source: matched,
        tier: parseInt(tier.split("_")[1], 10)
      };
    }
  }
  return { source: rawName, tier: 3 }; // Default to Tier 3 if unknown
}

function main() {
  console.log("Starting event ingestion...");

  const approvedSources = loadApprovedSources(approvedSourcesPath);
  const normalizedEvents = [];

  // Read fixtures
  if (!fs.existsSync(fixturesDir)) {
    console.warn("No fixtures directory found. Skipping.");
    return;
  }

  const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.endsWith(".json"));

  for (const file of fixtureFiles) {
    const rawData = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));

    // Support single objects or arrays
    const items = Array.isArray(rawData) ? rawData : [rawData];

    for (const item of items) {
      // Basic normalization logic for different "raw" formats
      const rawSource = item.feed_source || item.source_id || "Unknown";
      const title = item.item_title || item.headline || "No title";
      const url = item.item_link || item.original_url || "";
      const publishedAt = item.pub_date || item.timestamp || new Date().toISOString();
      const rawType = item.channel || item.format || "manual_injection";

      const mapping = mapSource(rawSource, approvedSources);

      const event = {
        id: generateDeterministicId(mapping.source, url, publishedAt),
        title,
        source: mapping.source,
        source_tier: mapping.tier,
        published_at: publishedAt,
        url,
        raw_type: ["rss", "api", "scrap", "manual_injection"].includes(rawType) ? rawType : "manual_injection"
      };

      normalizedEvents.push(event);
    }
  }

  // Stable sorting for determinism
  normalizedEvents.sort((a, b) => {
    const dateCompare = a.published_at.localeCompare(b.published_at);
    if (dateCompare !== 0) return dateCompare;
    return a.id.localeCompare(b.id);
  });

  // Write canonical output
  fs.writeFileSync(outputPath, JSON.stringify(normalizedEvents, null, 2));
  console.log(`[ok] Ingestion complete. Stable artifact generated at: ${path.relative(rootDir, outputPath)}`);
  console.log(`     Total events processed: ${normalizedEvents.length}`);
}

main();
