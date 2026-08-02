/**
 * Ontology types — Deterministic grounding contracts.
 *
 * T-Box (strict graph) schema consumed by the validator. Mirrors the
 * `tokenops_ontology.yaml` structure from the TokenOps research.
 *
 * Schema v1.1 additions (backward compatible):
 *  - Property specs: `{ type, required?, enum? }` (shorthand string still valid)
 *  - Relation cardinality: `1:1` / `1:N` / `N:M`
 *  - Entity / relation metadata (description)
 *  - Entity required-entity enforcement (`min_instances` in response)
 */

/** Supported property value types in the strict schema */
export type PropertyType = 'UUID' | 'STRING' | 'FLOAT' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

/** Enum-like shorthand: allows the schema to constrain allowed string values */
export type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:M';

/** A single property definition. `PropertyType` shorthand is still accepted. */
export interface PropertySpec {
  type: PropertyType;
  /** Whether the property MUST be present in the response */
  required?: boolean;
  /** Constrains STRING values to an allowed set */
  enum?: string[];
  /** Human-readable description */
  description?: string;
}

/** Property map: full spec or shorthand type string */
export type PropertyMap = Record<string, PropertySpec | PropertyType>;

/** A named entity with typed properties */
export interface OntologyEntity {
  name: string;
  description?: string;
  properties: PropertyMap;
  /** If set, the validator requires this many instances of the entity in the response */
  min_instances?: number;
  /** If set, the validator caps how many instances of the entity may appear */
  max_instances?: number;
}

/** A permitted directed relation origin → relation → target */
export interface AllowedRelation {
  origin: string;
  relation: string;
  target: string;
  /** Multiplicity of the edge (default: no constraint) */
  cardinality?: Cardinality;
  description?: string;
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
  /** Optional metadata for governance */
  meta?: {
    description?: string;
    owner?: string;
    updated_at?: string;
  };
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
  kind:
    | 'unknown_entity'
    | 'unknown_relation'
    | 'invalid_target'
    | 'invalid_property_type'
    | 'missing_required_property'
    | 'invalid_enum_value'
    | 'cardinality_exceeded'
    | 'min_instances_not_met'
    | 'malformed';
  origin?: string;
  relation?: string;
  target?: string;
  entity?: string;
  property?: string;
  expected?: string;
  received?: string;
  cardinality?: Cardinality;
  count?: number;
  message: string;
}
