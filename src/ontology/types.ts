/**
 * Ontology types — Deterministic grounding contracts.
 *
 * T-Box (strict graph) schema consumed by the validator. Mirrors the
 * `tokenops_ontology.yaml` structure from the TokenOps research.
 */

/** Supported property value types in the strict schema */
export type PropertyType = 'UUID' | 'STRING' | 'FLOAT' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

/** A named entity with typed properties */
export interface OntologyEntity {
  name: string;
  properties: Record<string, PropertyType>;
}

/** A permitted directed relation origin → relation → target */
export interface AllowedRelation {
  origin: string;
  relation: string;
  target: string;
}

/** Routing / budget constraints carried over for Styrr integration */
export interface StrandsRouting {
  default_tier?: string;
  fallback_tier?: string;
  max_retries_before_abort?: number;
  max_usd_budget_per_strand?: number;
}

/** Financial / enforcement constraints */
export interface HarnessConstraints {
  enforce_json_schema: boolean;
  fail_on_unknown_relation: boolean;
  strands_routing?: StrandsRouting;
}

/** Full parsed ontology schema (T-Box + constraints) */
export interface OntologySchema {
  version: string;
  domain: string;
  ontology: {
    entities: OntologyEntity[];
    allowed_relations: AllowedRelation[];
  };
  harness_constraints: HarnessConstraints;
}

/** A relation detected in an LLM response */
export interface DetectedRelation {
  origin: string;
  relation: string;
  target: string;
}

/** Result of validating an LLM response against the ontology */
export interface ValidationResult {
  valid: boolean;
  /** Detected relations that passed the schema */
  relations: DetectedRelation[];
  /** Relation(s) that caused rejection, if any */
  violations: RelationViolation[];
  /** Pure data extracted (payload compression) */
  extracted: Record<string, unknown>;
}

/** Details of a schema violation (for observability: Qhaway / Phoenix) */
export interface RelationViolation {
  kind: 'unknown_entity' | 'unknown_relation' | 'invalid_target' | 'invalid_property_type' | 'malformed';
  origin?: string;
  relation?: string;
  target?: string;
  entity?: string;
  property?: string;
  expected?: string;
  received?: string;
  message: string;
}
