import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Script: generate-intents.mjs
 * Purpose: Transforms signal candidates in 'ready_for_review' state into research intents
 * based on the templates defined in automation/intent-templates.yaml.
 */

// Paths
const rootDir = process.cwd();
const candidatesDir = path.join(rootDir, "automation", "candidates");
const intentsDir = path.join(rootDir, "automation", "research_intents");
const templatesFile = path.join(rootDir, "automation", "intent-templates.yaml");
const schemaFile = path.join(rootDir, "config", "research-intent.schema.json");

// Ensure directories exist
if (!fs.existsSync(intentsDir)) {
  fs.mkdirSync(intentsDir, { recursive: true });
}

/**
 * Simple YAML parser for templates (primitive but sufficient for the schema)
 * Extracted from common patterns in this repo.
 */
function loadTemplates(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const templates = {};
  let currentTemplate = null;

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.search(/\S/);

    if (trimmed.endsWith(":") && indent === 2) {
      // Template key (e.g., "  macro_liquidity:")
      currentTemplate = trimmed.slice(0, -1);
      templates[currentTemplate] = {};
    } else if (indent > 2 && currentTemplate) {
      // Property (e.g., "    hypothesis_type:")
      const firstColon = trimmed.indexOf(":");
      if (firstColon !== -1) {
        const k = trimmed.slice(0, firstColon).trim();
        const v = trimmed.slice(firstColon + 1).trim();

        if (v.startsWith("[") && v.endsWith("]")) {
          templates[currentTemplate][k] = v.slice(1, -1).split(",").map(i => i.trim().replace(/"/g, ""));
        } else {
          templates[currentTemplate][k] = v.replace(/"/g, "");
        }
      }
    }
  }
  return templates;
}

/**
 * Maps candidate category to template key
 */
function mapCategoryToTemplate(category) {
  const map = {
    "Macro_Liquidity": "macro_liquidity",
    "Btc_Whale_Activity": "btc_on_chain_whale",
    "Eth_Regulatory": "eth_regulatory_risk",
    "Web3_Structure": "web3_market_structure",
    "Execution_Risk": "execution_venue_risk",
    "Broker_Rail_Risk": "execution_venue_risk",
    "Technology_Infrastructure": "execution_venue_risk",
    "Other": "web3_market_structure"
  };
  return map[category] || "web3_market_structure";
}

async function main() {
  console.log("Generating research intents...");

  // Load resources
  const templates = loadTemplates(templatesFile);
  const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
  const validate = ajv.compile(schema);

  // Discover candidates
  const files = fs.readdirSync(candidatesDir).filter(f => f.endsWith(".json") && f !== "index.json");

  let generatedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const filePath = path.join(candidatesDir, file);
    try {
      const candidate = JSON.parse(fs.readFileSync(filePath, "utf8"));

      // Only process 'ready_for_review'
      if (candidate.state !== "ready_for_review") {
        continue;
      }

      console.log(`Processing candidate: ${candidate.id}`);

      const templateKey = mapCategoryToTemplate(candidate.category);
      const template = templates[templateKey] || templates["web3_market_structure"];

      if (!template) {
        console.warn(`[warning] No template found for category ${candidate.category}. Skipping.`);
        skippedCount++;
        continue;
      }

      // Construct intent
      const intent = {
        candidate_id: candidate.id,
        hypothesis_type: Array.isArray(template.hypothesis_type) ? template.hypothesis_type[0] : template.hypothesis_type,
        bias_direction: Array.isArray(template.bias_direction) ? template.bias_direction[0] : template.bias_direction,
        affected_universe: template.affected_universe || ["UNKNOWN"],
        time_horizon: template.time_horizon || "unknown",
        validation_goal: template.validation_goal || "Check signal impact",
        invalidation_signal: template.invalidation_signal || "Price action contradicts signal",
        route: template.route || "research_hypothesis",
        score: candidate.score,
        confidence: candidate.confidence,
        timestamp: new Date().toISOString()
      };

      if (template.risk_filter_hint) {
        intent.risk_filter_hint = template.risk_filter_hint;
      }

      // Validate
      const isValid = validate(intent);
      if (!isValid) {
        console.error(`[error] Generated intent for ${candidate.id} is invalid:`);
        console.error(ajv.errorsText(validate.errors));
        skippedCount++;
        continue;
      }

      // Save
      const outputName = `intent_${candidate.id}.json`;
      fs.writeFileSync(path.join(intentsDir, outputName), JSON.stringify(intent, null, 2));
      console.log(`[ok] Generated: ${outputName}`);
      generatedCount++;

    } catch (err) {
      console.error(`[error] Failed to process ${file}: ${err.message}`);
      skippedCount++;
    }
  }

  console.log("\nSummary:");
  console.log(`- Intents generated: ${generatedCount}`);
  console.log(`- Candidates skipped/errors: ${skippedCount}`);

  if (generatedCount === 0 && skippedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
