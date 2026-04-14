#!/usr/bin/env node
/**
 * Validate candidates against schema and apply approval gates.
 *
 * Usage: npm run validate:candidates
 * Exit code: 0 if all pass, 1 if any fail
 *
 * Process:
 * 1. Load config/candidate.schema.json (JSON Schema Draft 2020-12)
 * 2. Load automation/gates/approval_gates.yaml (gate definitions + thresholds)
 * 3. For each candidate JSON in automation/candidates/:
 *    - Validate against schema using AJV
 *    - Apply approval gate rules
 *    - Determine action (archive | notify | open_pr_draft)
 * 4. Print validation results to stdout
 * 5. Exit with 0 (success) or 1 (failure)
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ============================================================================
// Configuration & Paths
// ============================================================================

const SCHEMA_PATH = path.join(projectRoot, 'config', 'candidate.schema.json');
const GATES_PATH = path.join(projectRoot, 'automation', 'gates', 'approval_gates.yaml');
const CANDIDATES_DIR = path.join(projectRoot, 'automation', 'candidates');
const EXAMPLES_DIR = path.join(CANDIDATES_DIR, 'examples');

// ============================================================================
// Load Schema & Gates
// ============================================================================

let schema, gates;

try {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  schema = JSON.parse(schemaContent);
  console.log(`✓ Loaded schema from ${SCHEMA_PATH}`);
} catch (err) {
  console.error(`✗ Failed to load schema: ${err.message}`);
  process.exit(1);
}

try {
  const gatesContent = fs.readFileSync(GATES_PATH, 'utf-8');
  gates = parseYaml(gatesContent);
  console.log(`✓ Loaded gates config from ${GATES_PATH}`);
} catch (err) {
  console.error(`✗ Failed to load gates: ${err.message}`);
  process.exit(1);
}

// ============================================================================
// Initialize AJV Validator
// ============================================================================

const ajv = new Ajv({ strict: false, loadSchema: false });
addFormats(ajv);

let validate;
try {
  // Remove $schema reference to avoid meta-schema fetch requirements
  const schemaForCompilation = { ...schema };
  delete schemaForCompilation.$schema;

  validate = ajv.compile(schemaForCompilation);
  console.log(`✓ Compiled JSON Schema validator`);
} catch (err) {
  console.error(`✗ Failed to compile schema: ${err.message}`);
  process.exit(1);
}

// ============================================================================
// Gate Rules
// ============================================================================

/**
 * Apply approval gate rules to determine candidate state.
 *
 * Rules (from automation/gates/approval_gates.yaml):
 * 1. if score < score_min → no_candidate → archive
 * 2. if confidence < confidence_min → no_candidate → archive
 * 3. if confidence < confidence_rtr → candidate → notify
 * 4. else → ready_for_review → open_pr_draft
 */
function applyGates(candidate) {
  const { score, confidence } = candidate;
  const { thresholds } = gates;

  const result = {
    score,
    confidence,
    gate: null,
    action: null,
    reason: null,
  };

  // Rule 1: Score below minimum
  if (score < thresholds.score_minimum) {
    result.gate = 'no_candidate';
    result.action = 'archive';
    result.reason = `Score ${score} < minimum ${thresholds.score_minimum}`;
    return result;
  }

  // Rule 2: Confidence below minimum
  if (confidence < thresholds.confidence_minimum) {
    result.gate = 'no_candidate';
    result.action = 'archive';
    result.reason = `Confidence ${confidence} < minimum ${thresholds.confidence_minimum}`;
    return result;
  }

  // Rule 3: Confidence below ready_for_review threshold
  if (confidence < thresholds.confidence_ready_for_review) {
    result.gate = 'candidate';
    result.action = 'notify';
    result.reason = `Confidence ${confidence} meets candidate threshold but < ready_for_review ${thresholds.confidence_ready_for_review}`;
    return result;
  }

  // Rule 4: High confidence
  result.gate = 'ready_for_review';
  result.action = 'open_pr_draft';
  result.reason = `Confidence ${confidence} >= ready_for_review ${thresholds.confidence_ready_for_review}`;
  return result;
}

// ============================================================================
// Find & Process Candidates
// ============================================================================

function findCandidateFiles() {
  const files = [];

  // Recursively find all .json files in automation/candidates
  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.json') && !entry.startsWith('.')) {
        // Skip metadata files (index.json, audit_trail.json, etc)
        // Only process candidate_*.json and example_*.json files
        if (entry === 'index.json' || entry === 'audit_trail.json') {
          continue;
        }
        if (entry.startsWith('candidate_') || entry.startsWith('example_')) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(CANDIDATES_DIR);
  return files.sort();
}

// ============================================================================
// Validation & Reporting
// ============================================================================

const candidateFiles = findCandidateFiles();
console.log(`\n📁 Found ${candidateFiles.length} candidate file(s)\n`);

const results = {
  valid: [],
  invalid: [],
  gates: {
    no_candidate: 0,
    candidate: 0,
    ready_for_review: 0,
  },
};

for (const filePath of candidateFiles) {
  const relativePath = path.relative(projectRoot, filePath);
  let candidate;

  // Load candidate JSON
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    candidate = JSON.parse(content);
  } catch (err) {
    console.error(`✗ ${relativePath}`);
    console.error(`  JSON parse error: ${err.message}`);
    results.invalid.push({
      file: relativePath,
      error: `JSON parse: ${err.message}`,
    });
    continue;
  }

  // Validate against schema
  const isValid = validate(candidate);
  if (!isValid) {
    console.error(`✗ ${relativePath}`);
    console.error(`  Schema validation failed:`);
    validate.errors?.forEach((err) => {
      console.error(`    - ${err.instancePath || '/'}: ${err.message}`);
    });
    results.invalid.push({
      file: relativePath,
      error: `Schema validation failed`,
      details: validate.errors,
    });
    continue;
  }

  // Apply gates
  const gateResult = applyGates(candidate);
  results.gates[gateResult.gate]++;

  console.log(`✓ ${relativePath}`);
  console.log(`  ID: ${candidate.id}`);
  console.log(`  Score: ${gateResult.score} | Confidence: ${gateResult.confidence}`);
  console.log(`  Gate: ${gateResult.gate} | Action: ${gateResult.action}`);
  console.log(`  Reason: ${gateResult.reason}`);
  console.log();

  results.valid.push({
    file: relativePath,
    id: candidate.id,
    score: gateResult.score,
    confidence: gateResult.confidence,
    gate: gateResult.gate,
    action: gateResult.action,
  });
}

// ============================================================================
// Summary Report
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('VALIDATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Total Files:       ${candidateFiles.length}`);
console.log(`Valid:             ${results.valid.length}`);
console.log(`Invalid:           ${results.invalid.length}`);

if (results.valid.length > 0) {
  console.log(`\nGate Distribution:`);
  console.log(`  no_candidate:        ${results.gates.no_candidate}`);
  console.log(`  candidate:           ${results.gates.candidate}`);
  console.log(`  ready_for_review:    ${results.gates.ready_for_review}`);
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

// ============================================================================
// Exit
// ============================================================================

const hasErrors = results.invalid.length > 0;
if (hasErrors) {
  console.error(`❌ Validation FAILED (${results.invalid.length} error(s))`);
  process.exit(1);
} else {
  console.log(`✅ Validation PASSED (${results.valid.length} candidate(s))`);
  process.exit(0);
}
