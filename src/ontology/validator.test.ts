import { describe, it, expect } from 'vitest';
import { parseOntologyYaml, validateResponse } from './index.js';
import { OntologyViolationException } from '../errors.js';

const SCHEMA_YAML = `
version: "1.0"
domain: "customer_operations"
ontology:
  entities:
    - name: "Client"
      properties:
        id: "UUID"
        status: "STRING"
    - name: "Invoice"
      properties:
        id: "UUID"
        amount: "FLOAT"
        currency: "STRING"
  allowed_relations:
    - origin: "Client"
      relation: "HAS_BILLING_DISPUTE"
      target: "Invoice"
harness_constraints:
  enforce_json_schema: true
  fail_on_unknown_relation: true
  strands_routing:
    default_tier: "economy"
    fallback_tier: "reasoning"
    max_retries_before_abort: 2
    max_usd_budget_per_strand: 0.02
`;

const schema = parseOntologyYaml(SCHEMA_YAML);

describe('parseOntologyYaml', () => {
  it('parses entities, relations and constraints from YAML', () => {
    expect(schema.ontology.entities.map((e) => e.name)).toEqual(['Client', 'Invoice']);
    expect(schema.ontology.allowed_relations).toEqual([
      { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
    ]);
    expect(schema.harness_constraints.fail_on_unknown_relation).toBe(true);
    expect(schema.harness_constraints.strands_routing?.max_usd_budget_per_strand).toBe(0.02);
  });

  it('rejects malformed YAML', () => {
    expect(() => parseOntologyYaml('ontology: [unclosed')).toThrow('[ontology] malformed YAML');
  });

  it('rejects invalid property type', () => {
    const bad = SCHEMA_YAML.replace('id: "UUID"', 'id: "MYSTERY_TYPE"');
    expect(() => parseOntologyYaml(bad)).toThrow('invalid type');
  });
});

describe('validateResponse', () => {
  it('accepts a valid relation between known entities', () => {
    const response = {
      entities: [{ type: 'Client' }, { type: 'Invoice' }],
      relations: [
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
      ],
    };
    const result = validateResponse(response, schema);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.relations).toHaveLength(1);
  });

  it('rejects an unknown entity (hallucination)', () => {
    const response = {
      entities: [{ type: 'Teleporter' }, { type: 'Invoice' }],
      relations: [
        { origin: 'Teleporter', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
      ],
    };
    expect(() => validateResponse(response, schema)).toThrow(OntologyViolationException);
    try {
      validateResponse(response, schema);
    } catch (err) {
      const ex = err as OntologyViolationException;
      expect(ex.violations.some((v) => v.kind === 'unknown_entity')).toBe(true);
    }
  });

  it('rejects an unknown relation when kill switch is on', () => {
    const response = {
      entities: [{ type: 'Client' }, { type: 'Invoice' }],
      relations: [
        { origin: 'Client', relation: 'CALLS_CEO_AT_3AM', target: 'Invoice' },
      ],
    };
    expect(() => validateResponse(response, schema)).toThrow(OntologyViolationException);
  });

  it('rejects a relation to a disallowed target', () => {
    const response = {
      entities: [{ type: 'Client' }, { type: 'Invoice' }],
      relations: [
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Client' },
      ],
    };
    const result = validateResponse(response, { ...schema, harness_constraints: { ...schema.harness_constraints, fail_on_unknown_relation: false } });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === 'invalid_target')).toBe(true);
  });

  it('enforces property types when enforce_json_schema is set', () => {
    const response = {
      entities: [{ type: 'Invoice', id: 'not-a-uuid', amount: 'lots' }],
      relations: [
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
      ],
    };
    const result = validateResponse(response, { ...schema, harness_constraints: { ...schema.harness_constraints, fail_on_unknown_relation: false } });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === 'invalid_property_type')).toBe(true);
  });

  it('parses a raw JSON string response', () => {
    const json = JSON.stringify({
      entities: [{ type: 'Client' }],
      relations: [
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
      ],
    });
    const result = validateResponse(json, schema);
    expect(result.valid).toBe(true);
  });

  it('extracts only pure data (payload compression)', () => {
    const response = {
      entities: [{ type: 'Client' }, { type: 'Invoice' }, { type: 'Comment' }],
      relations: [
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
      ],
    };
    const result = validateResponse(response, { ...schema, harness_constraints: { ...schema.harness_constraints, fail_on_unknown_relation: false } });
    expect(result.extracted.relations).toHaveLength(1);
  });
});
