import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const rootDir = process.cwd();
const candidatesDir = path.join(rootDir, "automation", "candidates");
const examplesDir = path.join(candidatesDir, "examples");
const gatesPath = path.join(rootDir, "automation", "gates", "approval_gates.yaml");
const candidateSchemaPath = path.join(rootDir, "config", "candidate.schema.json");

const includeExamples = process.argv.includes("--examples");
const explicitFiles = process.argv
  .filter((arg) => arg.startsWith("--file="))
  .map((arg) => arg.slice("--file=".length));

// ---------------------------------------------------------------------------
// YAML parser — artesanal, tolerante a espacios y líneas vacías,
// extrae solo thresholds numéricos y la lista tier_1 de approved_sources
// ---------------------------------------------------------------------------

function loadGatesConfig(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  const thresholds = {
    confidence_minimum: 0.5,
    confidence_ready_for_review: 0.75,
    score_minimum: 40,
    score_p1_minimum: 70,
  };

  const tier1Sources = new Set();
  let inThresholds = false;
  let inApprovedSources = false;
  let inTier1 = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    // Detect top-level sections
    if (/^thresholds:\s*$/.test(line)) {
      inThresholds = true;
      inApprovedSources = false;
      inTier1 = false;
      continue;
    }

    if (/^approved_sources:\s*$/.test(line)) {
      inThresholds = false;
      inApprovedSources = true;
      inTier1 = false;
      continue;
    }

    // Detect other top-level sections (gates, scoring_bands, audit)
    if (/^[a-zA-Z]/.test(line) && !/^\s/.test(line) && !line.startsWith("#")) {
      inThresholds = false;
      inApprovedSources = false;
      inTier1 = false;
      continue;
    }

    if (inThresholds) {
      // e.g. "  confidence_minimum: 0.50"
      const m = line.match(/^\s+(confidence_minimum|confidence_ready_for_review|score_minimum|score_p1_minimum)\s*:\s*([\d.]+)/);
      if (m) {
        thresholds[m[1]] = parseFloat(m[2]);
      }
      continue;
    }

    if (inApprovedSources) {
      // Detect "  tier_1:" sub-key
      if (/^\s{2}tier_1:\s*$/.test(line)) {
        inTier1 = true;
        continue;
      }
      // Another sub-key like "  tier_2:", "  all:" — stop tier_1 collection
      if (/^\s{2}[a-zA-Z]/.test(line)) {
        inTier1 = false;
        continue;
      }
      if (inTier1) {
        const sm = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
        if (sm) {
          tier1Sources.add(sm[1].trim().toLowerCase());
        }
      }
    }
  }

  return { thresholds, tier1Sources };
}

// ---------------------------------------------------------------------------
// Schema validator
// ---------------------------------------------------------------------------

function createSchemaValidator() {
  const schema = JSON.parse(fs.readFileSync(candidateSchemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

// ---------------------------------------------------------------------------
// Gate derivation (hard-coded rules implementing approval_gates.yaml conditions)
// ---------------------------------------------------------------------------

function deriveGate(candidate, thresholds, tier1Sources) {
  const { score, confidence, source } = candidate;

  // Gate: no_candidate — score OR confidence below minimums
  if (score < thresholds.score_minimum || confidence < thresholds.confidence_minimum) {
    return "no_candidate";
  }

  // Gate: ready_for_review — high score + high confidence + tier_1 source
  const normalizedSource = typeof source === "string" ? source.trim().toLowerCase() : "";
  if (
    score >= thresholds.score_p1_minimum &&
    confidence >= thresholds.confidence_ready_for_review &&
    tier1Sources.has(normalizedSource)
  ) {
    return "ready_for_review";
  }

  // Gate: candidate — everything else above minimums
  return "candidate";
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function discoverCandidateFiles() {
  if (explicitFiles.length > 0) {
    return explicitFiles.map((f) => path.resolve(rootDir, f));
  }

  const files = [];

  // Real candidates (direct children of automation/candidates/, .json, not index.json)
  if (fs.existsSync(candidatesDir)) {
    for (const entry of fs.readdirSync(candidatesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json") {
        files.push(path.join(candidatesDir, entry.name));
      }
    }
  }

  // Examples (only when --examples flag is present)
  if (includeExamples && fs.existsSync(examplesDir)) {
    for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.join(examplesDir, entry.name));
      }
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function formatSchemaError(error) {
  const pathLabel = error.instancePath || "/";
  return `${pathLabel} ${error.message}`.trim();
}

function run() {
  const { thresholds, tier1Sources } = loadGatesConfig(gatesPath);
  const validateSchema = createSchemaValidator();
  const files = discoverCandidateFiles();

  if (files.length === 0) {
    console.log("0 candidates validated.");
    process.exit(0);
  }

  let totalSchemaErrors = 0;
  let totalDriftErrors = 0;

  for (const filePath of files) {
    const rel = path.relative(rootDir, filePath);
    let candidate;

    try {
      candidate = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      console.error(`[schema error] ${rel}: invalid JSON — ${err.message}`);
      totalSchemaErrors++;
      continue;
    }

    // Check 1 + 2: Schema validation
    const valid = validateSchema(candidate);
    if (!valid) {
      for (const schemaError of validateSchema.errors ?? []) {
        console.error(`[schema error] ${rel}: ${formatSchemaError(schemaError)}`);
      }
      totalSchemaErrors += validateSchema.errors?.length ?? 1;
      // Skip gate check if schema is broken — gate fields may be missing
      continue;
    }

    // Check 3: Gate consistency (state + decision.gate_applied vs derived gate)
    const derivedGate = deriveGate(candidate, thresholds, tier1Sources);
    const declaredState = candidate.state;
    const declaredGate = candidate.decision?.gate_applied;

    if (declaredState !== derivedGate) {
      console.error(
        `[gate consistency error] ${rel}: state="${declaredState}" but derived gate="${derivedGate}" ` +
          `(score=${candidate.score}, confidence=${candidate.confidence}, source=${candidate.source}). ` +
          `Fix: align state with actual thresholds or check candidate metrics.`
      );
      totalDriftErrors++;
    }

    if (declaredGate !== derivedGate) {
      console.error(
        `[gate consistency error] ${rel}: decision.gate_applied="${declaredGate}" but derived gate="${derivedGate}". ` +
          `Fix: align decision.gate_applied with actual thresholds.`
      );
      totalDriftErrors++;
    }
  }

  const totalErrors = totalSchemaErrors + totalDriftErrors;

  if (totalErrors > 0) {
    console.error(
      `\nValidation failed: ${totalSchemaErrors} schema error(s), ${totalDriftErrors} gate consistency error(s).`
    );
    process.exit(1);
  }

  console.log(`${files.length} candidate${files.length === 1 ? "" : "s"} validated.`);
  process.exit(0);
}

run();
