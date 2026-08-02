/**
 * Ontology validator — deterministic grounding of LLM responses.
 *
 * Validates a raw model response against a strict T-Box schema (entities +
 * allowed relations + property types) in pure CPU/memory — zero token cost.
 *
 * Replaces LLM-as-a-judge: instead of paying GPU tokens to evaluate output,
 * the response is parsed against the graph and rejected with structured
 * violations when it does not conform.
 *
 * From the TokenOps research:
 *   "Validar la salida de un LLM contra una ontología estricta cuesta
 *    fracciones de un centavo de cómputo tradicional (CPU/Memoria) en lugar
 *    de costosos tokens de GPU."
 *
 * Schema v1.1 support:
 *  - Required properties (`missing_required_property`)
 *  - Enum-constrained string values (`invalid_enum_value`)
 *  - Relation cardinality `1:1` / `1:N` / `N:1` (`cardinality_exceeded`)
 *  - Entity min/max instance counts (`min_instances_not_met`)
 */

import { OntologyViolationException } from '../errors.js';
import type {
  Cardinality,
  DetectedRelation,
  OntologyEntity,
  OntologySchema,
  PropertySpec,
  PropertyType,
  RelationViolation,
  ValidationResult,
} from './types.js';

const TYPE_PATTERNS: Record<PropertyType, RegExp> = {
  UUID: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  STRING: /.*/,
  FLOAT: /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/,
  INTEGER: /^-?\d+$/,
  BOOLEAN: /^(true|false)$/i,
  ARRAY: /.*/, // structural check below
  OBJECT: /.*/, // structural check below
};

/**
 * Validate a raw LLM response against the ontology schema.
 *
 * Accepts either:
 *  - a parsed object `{ entities: [...], relations: [...] }`, or
 *  - a raw JSON string (auto-parsed).
 *
 * When the schema has `fail_on_unknown_relation`, any violation throws
 * `OntologyViolationException` (kill switch) instead of returning `valid: false`.
 */
export function validateResponse(
  response: unknown,
  schema: OntologySchema,
  options?: { throwOnViolation?: boolean },
): ValidationResult {
  const input = normalizeResponse(response);
  const violations: RelationViolation[] = [];
  const relations: DetectedRelation[] = [];

  const entities = extractEntities(input);
  const detected = extractRelations(input);

  // ── 1. Entity existence ──
  for (const entity of entities) {
    if (!hasEntity(schema, entity)) {
      violations.push({
        kind: 'unknown_entity',
        entity,
        message: `unknown entity "${entity}" (not in schema)`,
      });
    }
  }

  // ── 2. Relation + target validation ──
  for (const rel of detected) {
    const allowed = schema.ontology.allowed_relations.find(
      (a) =>
        a.origin === rel.origin &&
        a.relation === rel.relation &&
        (a.target === '*' || a.target === rel.target),
    );

    if (allowed) {
      relations.push(rel);
    } else {
      const targetOk = schema.ontology.allowed_relations.some(
        (a) => a.origin === rel.origin && a.relation === rel.relation,
      );
      violations.push({
        kind: targetOk ? 'invalid_target' : 'unknown_relation',
        origin: rel.origin,
        relation: rel.relation,
        target: rel.target,
        message: targetOk
          ? `relation "${rel.origin} -> ${rel.relation}" targets "${rel.target}" but that target is not allowed`
          : `relation "${rel.origin} -> ${rel.relation}" is not allowed by schema`,
      });
    }
  }

  // ── 3. Cardinality enforcement ──
  violations.push(...checkCardinality(schema, detected));

  // ── 4. Property type / required / enum enforcement (when enabled) ──
  if (schema.harness_constraints.enforce_json_schema) {
    for (const entity of entities) {
      const def = schema.ontology.entities.find((e) => e.name === entity);
      if (!def) continue;
      const node = findEntityNode(input, entity);
      violations.push(...validateProperties(def, node));
    }
  }

  // ── 5. Min / max instance counts ──
  violations.push(...checkInstanceCounts(schema, entities));

  // ── Kill switch ──
  if (violations.length > 0 && schema.harness_constraints.fail_on_unknown_relation) {
    throw new OntologyViolationException(violations);
  }
  if (violations.length > 0 && options?.throwOnViolation) {
    throw new OntologyViolationException(violations);
  }

  return {
    valid: violations.length === 0,
    relations,
    violations,
    extracted: extractPureData(input, relations),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

type NormalizedResponse = {
  entities?: unknown;
  relations?: unknown;
  nodes: Record<string, unknown>;
  counts: Record<string, number>;
};

/** Normalize object or JSON-string responses into a traversable shape. */
function normalizeResponse(response: unknown): NormalizedResponse {
  let value = response;
  if (typeof response === 'string') {
    try {
      value = JSON.parse(response);
    } catch {
      return { nodes: {}, counts: {}, entities: [], relations: [] };
    }
  }

  if (typeof value !== 'object' || value === null) {
    return { nodes: {}, counts: {}, entities: [], relations: [] };
  }

  const obj = value as Record<string, unknown>;
  const nodes = collectNodes(obj);
  const counts = countEntities(obj.entities);

  // Support both `{ entities: ["Client", ...] }` and `{ entities: [{ id, type }, ...] }`
  let entities: string[] = [];
  const rawEntities = obj.entities;
  if (Array.isArray(rawEntities)) {
    entities = rawEntities.map((e): string => {
      if (typeof e === 'string') return e;
      if (e && typeof e === 'object') {
        const o = e as Record<string, unknown>;
        return typeof o.type === 'string' ? o.type : typeof o.name === 'string' ? o.name : String(e);
      }
      return String(e);
    });
  }

  return { entities, relations: obj.relations, nodes, counts };
}

/** Count entity instances from the response `entities` array (object form). */
function countEntities(raw: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(raw)) return counts;
  for (const e of raw) {
    if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      const type = typeof o.type === 'string' ? o.type : typeof o.name === 'string' ? o.name : undefined;
      if (type) counts[type] = (counts[type] ?? 0) + 1;
    } else if (typeof e === 'string') {
      // String form can't be counted reliably; mark presence only
      counts[e] = Math.max(counts[e] ?? 0, 1);
    }
  }
  return counts;
}

/** Collect every node that carries an entity type/name marker. */
function collectNodes(obj: Record<string, unknown>): Record<string, unknown> {
  const nodes: Record<string, unknown> = {};
  const visit = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, key));
      return;
    }
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>;
      const type = o.type ?? o.entityType ?? o.name;
      if (typeof type === 'string' && key !== 'entityType') {
        nodes[type] = o;
      }
      for (const [k, v] of Object.entries(o)) visit(v, k);
    }
  };
  visit(obj);
  return nodes;
}

/** Extract entity type names present in the response. */
function extractEntities(input: NormalizedResponse): string[] {
  const fromArray = Array.isArray(input.entities) ? (input.entities as string[]) : [];
  return Array.from(new Set([...fromArray, ...Object.keys(input.nodes)]));
}

/** Extract relations from `{ relations: [{ origin, relation, target }] }`. */
function extractRelations(input: NormalizedResponse): DetectedRelation[] {
  if (!Array.isArray(input.relations)) return [];
  return (input.relations as unknown[])
    .map((r) => {
      const rel = r as Record<string, unknown>;
      if (
        !rel ||
        typeof rel.origin !== 'string' ||
        typeof rel.relation !== 'string' ||
        typeof rel.target !== 'string'
      ) {
        return null;
      }
      return { origin: rel.origin, relation: rel.relation, target: rel.target };
    })
    .filter((r): r is DetectedRelation => r !== null);
}

function hasEntity(schema: OntologySchema, name: string): boolean {
  return schema.ontology.entities.some((e) => e.name === name);
}

function findEntityNode(input: NormalizedResponse, entity: string): unknown {
  if (input.nodes[entity]) return input.nodes[entity];
  const arr = input.entities;
  if (Array.isArray(arr)) {
    const found = (arr as unknown[]).find((e) => {
      const o = e as Record<string, unknown>;
      return o?.type === entity || o?.name === entity;
    });
    return found;
  }
  return undefined;
}

// ─── v1.1 checks ────────────────────────────────────────────────────────

/** Enforce `cardinality` on detected relations (edge count per relation). */
function checkCardinality(
  schema: OntologySchema,
  detected: DetectedRelation[],
): RelationViolation[] {
  const violations: RelationViolation[] = [];

  for (const def of schema.ontology.allowed_relations) {
    if (!def.cardinality) continue;

    const edges = detected.filter(
      (r) => r.origin === def.origin && r.relation === def.relation && r.target === def.target,
    );

    const maxEdges = cardinalityMax(def.cardinality);
    if (maxEdges !== undefined && edges.length > maxEdges) {
      violations.push({
        kind: 'cardinality_exceeded',
        origin: def.origin,
        relation: def.relation,
        target: def.target,
        cardinality: def.cardinality,
        count: edges.length,
        message: `relation "${def.origin} -> ${def.relation}" cardinality ${def.cardinality} allows at most ${maxEdges} edge(s), got ${edges.length}`,
      });
    }
  }

  return violations;
}

/** Return max allowed edges for a cardinality (undefined = no limit). */
function cardinalityMax(cardinality: Cardinality): number | undefined {
  switch (cardinality) {
    case '1:1':
      return 1; // single edge
    case '1:N':
    case 'N:1':
    case 'N:M':
      return undefined; // many edges allowed at schema level
  }
}

/** Validate property types, required presence, and enum membership. */
function validateProperties(def: OntologyEntity, node: unknown): RelationViolation[] {
  const violations: RelationViolation[] = [];
  if (!node || typeof node !== 'object') {
    return violations;
  }
  const obj = node as Record<string, unknown>;
  for (const [prop, rawSpec] of Object.entries(def.properties)) {
    const spec = toSpec(rawSpec);
    const value = obj[prop];

    // required presence
    if (spec.required && value === undefined) {
      violations.push({
        kind: 'missing_required_property',
        entity: def.name,
        property: prop,
        message: `entity "${def.name}" missing required property "${prop}"`,
      });
      continue;
    }
    if (value === undefined) continue;

    // type check
    if (!matchesType(value, spec.type)) {
      violations.push({
        kind: 'invalid_property_type',
        entity: def.name,
        property: prop,
        expected: spec.type,
        received: typeof value === 'object' ? JSON.stringify(value) : String(value),
        message: `entity "${def.name}" property "${prop}" should be ${spec.type}, got ${JSON.stringify(value)}`,
      });
      continue;
    }

    // enum membership (string values)
    if (spec.enum && typeof value === 'string' && !spec.enum.includes(value)) {
      violations.push({
        kind: 'invalid_enum_value',
        entity: def.name,
        property: prop,
        expected: spec.enum.join('|'),
        received: value,
        message: `entity "${def.name}" property "${prop}" value "${value}" not in allowed set [${spec.enum.join(', ')}]`,
      });
    }
  }
  return violations;
}

/** Normalize a property entry (spec object or shorthand type string) to a spec. */
function toSpec(raw: PropertySpec | PropertyType): PropertySpec {
  return typeof raw === 'string' ? { type: raw } : raw;
}

function matchesType(value: unknown, expected: PropertyType): boolean {
  if (expected === 'ARRAY') return Array.isArray(value);
  if (expected === 'OBJECT') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (typeof value !== 'string') {
    if (expected === 'FLOAT' || expected === 'INTEGER') return typeof value === 'number';
    if (expected === 'BOOLEAN') return typeof value === 'boolean';
    return false;
  }
  return TYPE_PATTERNS[expected].test(value);
}

/** Enforce entity `min_instances` / `max_instances` against response counts. */
function checkInstanceCounts(
  schema: OntologySchema,
  entitiesInResponse: string[],
): RelationViolation[] {
  const violations: RelationViolation[] = [];
  for (const def of schema.ontology.entities) {
    if (def.min_instances === undefined && def.max_instances === undefined) continue;
    const present = entitiesInResponse.filter((e) => e === def.name).length;
    if (def.min_instances !== undefined && present < def.min_instances) {
      violations.push({
        kind: 'min_instances_not_met',
        entity: def.name,
        expected: String(def.min_instances),
        count: present,
        message: `entity "${def.name}" requires at least ${def.min_instances} instance(s), found ${present}`,
      });
    }
    if (def.max_instances !== undefined && present > def.max_instances) {
      violations.push({
        kind: 'cardinality_exceeded',
        entity: def.name,
        expected: String(def.max_instances),
        count: present,
        message: `entity "${def.name}" allows at most ${def.max_instances} instance(s), found ${present}`,
      });
    }
  }
  return violations;
}

/** Extract only the pure data relations/entities — payload compression. */
function extractPureData(input: NormalizedResponse, relations: DetectedRelation[]): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  const kept = new Set<string>();
  for (const rel of relations) {
    kept.add(rel.origin);
    kept.add(rel.target);
  }
  for (const [type, node] of Object.entries(input.nodes)) {
    if (kept.has(type)) extracted[type] = node;
  }
  if (Array.isArray(input.relations)) {
    extracted.relations = relations;
  }
  return extracted;
}
