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

// ─── Schema v1.1: property specs, enums, required, cardinality, instances ───

const SCHEMA_V11 = `
version: "1.1"
domain: "customer_operations"
meta:
  description: "Dominio de operaciones de clientes"
  owner: "finops-platform"
  updated_at: "2026-08-02"
ontology:
  entities:
    - name: "Client"
      min_instances: 1
      properties:
        id:
          type: "UUID"
          required: true
        status:
          type: "STRING"
          enum: ["ACTIVE", "INACTIVE", "BLOCKED"]
          required: true
    - name: "Invoice"
      properties:
        id:
          type: "UUID"
          required: true
        amount:
          type: "FLOAT"
          required: true
        currency:
          type: "STRING"
          enum: ["USD", "EUR", "PEN"]
          required: true
  allowed_relations:
    - origin: "Client"
      relation: "HAS_BILLING_DISPUTE"
      target: "Invoice"
      cardinality: "1:N"
    - origin: "Invoice"
      relation: "BELONGS_TO"
      target: "Client"
      cardinality: "1:1"
harness_constraints:
  enforce_json_schema: true
  fail_on_unknown_relation: false
`;

const v11 = parseOntologyYaml(SCHEMA_V11);

describe('schema v1.1 loader', () => {
  it('parses meta block', () => {
    expect(v11.meta?.owner).toBe('finops-platform');
    expect(v11.meta?.updated_at).toBe('2026-08-02');
  });

  it('normalizes shorthand string properties to spec objects', () => {
    const client = v11.ontology.entities.find((e) => e.name === 'Client')!;
    const id = client.properties.id as { type: string; required: boolean };
    expect(id.type).toBe('UUID');
    expect(id.required).toBe(true);
  });

  it('parses enum and cardinality', () => {
    const invoice = v11.ontology.entities.find((e) => e.name === 'Invoice')!;
    const currency = invoice.properties.currency as { type: string; enum: string[] };
    expect(currency.enum).toEqual(['USD', 'EUR', 'PEN']);
    const rel = v11.ontology.allowed_relations.find((r) => r.relation === 'BELONGS_TO')!;
    expect(rel.cardinality).toBe('1:1');
  });

  it('rejects an invalid cardinality value', () => {
    const bad = SCHEMA_V11.replace('cardinality: "1:1"', 'cardinality: "X:Y"');
    expect(() => parseOntologyYaml(bad)).toThrow('invalid cardinality');
  });

  it('rejects an enum that is not a string array', () => {
    const bad = SCHEMA_V11.replace('enum: ["USD", "EUR", "PEN"]', 'enum: [1, 2, 3]');
    expect(() => parseOntologyYaml(bad)).toThrow('.enum must be a string array');
  });

  it('rejects a property spec missing a valid type', () => {
    const bad = SCHEMA_V11.replace('type: "UUID"', 'type: "WEIRD"');
    expect(() => parseOntologyYaml(bad)).toThrow('invalid spec');
  });
});

describe('schema v1.1 validator', () => {
  const ok = {
    entities: [{ type: 'Client', id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE' }],
    relations: [
      { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
    ],
  };

  it('accepts a fully valid v1.1 response', () => {
    const result = validateResponse(ok, v11);
    expect(result.valid).toBe(true);
  });

  it('rejects a missing required property', () => {
    const res = {
      entities: [{ type: 'Client', status: 'ACTIVE' }], // no id
      relations: [],
    };
    const result = validateResponse(res, v11);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === 'missing_required_property')).toBe(true);
  });

  it('rejects a string value outside the enum', () => {
    const res = {
      entities: [{ type: 'Client', id: '11111111-1111-1111-1111-111111111111', status: 'FLYING' }],
      relations: [],
    };
    const result = validateResponse(res, v11);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === 'invalid_enum_value')).toBe(true);
  });

  it('rejects cardinality 1:1 when the relation appears twice', () => {
    const res = {
      entities: [
        { type: 'Client', id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE' },
        { type: 'Invoice', id: '22222222-2222-2222-2222-222222222222', amount: 10, currency: 'USD' },
      ],
      relations: [
        { origin: 'Invoice', relation: 'BELONGS_TO', target: 'Client' },
        { origin: 'Invoice', relation: 'BELONGS_TO', target: 'Client' },
      ],
    };
    const result = validateResponse(res, v11);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === 'cardinality_exceeded')).toBe(true);
  });

  it('allows 1:N (many disputes per client)', () => {
    const res = {
      entities: [{ type: 'Client', id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE' }],
      relations: [
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
        { origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' },
      ],
    };
    const result = validateResponse(res, v11);
    expect(result.valid).toBe(true);
  });

  it('rejects when min_instances is not met', () => {
    const res = {
      entities: [], // Client required (min_instances: 1)
      relations: [],
    };
    const result = validateResponse(res, v11);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === 'min_instances_not_met')).toBe(true);
  });
});
