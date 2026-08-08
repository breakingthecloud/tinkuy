/**
 * 06 — Deterministic grounding with the ontology module
 *
 * Validate LLM output against a strict T-Box schema (entities + relations +
 * property types) with ZERO token cost — no LLM-as-a-judge.
 * See docs/ONTOLOGIES-101.md for the concepts.
 *
 * When the schema sets `fail_on_unknown_relation: true` (kill switch), any
 * violation throws `OntologyViolationException` before the response is
 * persisted or billed.
 *
 * Run: node examples/06-ontology.mjs
 */

import { Agent } from '@carloscortezcloud/tinkuy-agent';
import { parseOntologyYaml, validateResponse, OntologyViolationException } from '@carloscortezcloud/tinkuy-agent/ontology';

// Schema requires `version`, `domain`, `ontology`, `harness_constraints`.
const schema = await parseOntologyYaml(`
version: "1.1"
domain: "finops"
meta:
  description: "Dominio de operaciones de clientes"
  owner: "finops-platform"
ontology:
  entities:
    - name: "Client"
      min_instances: 1
      properties:
        id: { type: "UUID", required: true }
        status:
          type: "STRING"
          enum: ["ACTIVE", "INACTIVE", "BLOCKED"]
          required: true
    - name: "Invoice"
      properties:
        id: { type: "UUID", required: true }
        amount: { type: "FLOAT", required: true }
  allowed_relations:
    - origin: "Client"
      relation: "HAS_BILLING_DISPUTE"
      target: "Invoice"
      cardinality: "1:N"
harness_constraints:
  enforce_json_schema: true
  fail_on_unknown_relation: true
`);

// ── Valid response: passes, zero cost ────────────────────────────────────
const validResponse = {
  entities: [
    { type: 'Client', id: '9f2c1e5a-3d44-4a8e-bb21-2c1c4b7a8d01', status: 'ACTIVE' },
    { type: 'Invoice', id: '7b1a9e0c-6f2b-4a9e-9d41-3f5c6a7b8c9d', amount: '250.50' },
  ],
  relations: [
    { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
  ],
};

try {
  const result = validateResponse(validResponse, schema);
  console.log('VALID response →', JSON.stringify({ valid: result.valid, relations: result.relations }));
} catch (err) {
  console.log('valid response threw?!', err.message);
}

// ── Invalid response: kill switch throws with structured violations ──────
const invalid = {
  data: [
    { type: 'Client', id: 'not-a-uuid', status: 'FLYING' },         // bad UUID + enum
    { type: 'Teleporter' },                                          // unknown entity
  ],
  relations: [
    { origin: 'Client', relation: 'CALLS_CEO_AT_3AM', target: 'Invoice' }, // unknown relation
  ],
};

try {
  validateResponse(invalid, schema);
  console.log('INVALID response → passed (unexpected)');
} catch (err) {
  if (err instanceof OntologyViolationException) {
    console.log('KILL SWITCH triggered:');
    for (const v of err.violations) {
      console.log(`  · [${v.kind}] ${v.message}`);
    }
  } else {
    console.log('Other error:', err.message);
  }
}

// ── Hook integration on the agent ────────────────────────────────────────
// The same schema can be passed to an Agent; every response is validated
// transparently (see onOntologyValidated in the AgentConfig).
console.log('\nSchema loaded:', schema.version, '·', schema.domain, '·', schema.ontology.entities.length, 'entities');