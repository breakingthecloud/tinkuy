/**
 * Ontology loader — parse `tokenops_ontology.yaml` into a typed `OntologySchema`.
 *
 * Fails fast on malformed YAML or invalid schema shape so a broken config
 * surfaces at startup, not at inference time.
 *
 * v1.1 additions:
 *  - Property shorthand `"UUID"` OR spec `{ type, required, enum }`
 *  - Relation `cardinality` (`1:1`, `1:N`, `N:1`, `N:M`)
 *  - Entity `min_instances` / `max_instances`
 *  - Optional `meta` block
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type {
  AllowedRelation,
  Cardinality,
  OntologyEntity,
  OntologySchema,
  PropertyMap,
  PropertySpec,
} from './types.js';

const VALID_PROPERTY_TYPES = new Set<string>([
  'UUID',
  'STRING',
  'FLOAT',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
]);

const VALID_CARDINALITIES = new Set<string>(['1:1', '1:N', 'N:1', 'N:M']);

/** Load and validate an ontology schema from a YAML file path. */
export async function loadOntology(path: string): Promise<OntologySchema> {
  const raw = await readFile(path, 'utf8');
  return parseOntologyYaml(raw);
}

/** Parse ontology schema from a YAML string (e.g. inline tests or config). */
export function parseOntologyYaml(raw: string): OntologySchema {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`[ontology] malformed YAML: ${err instanceof Error ? err.message : String(err)}`);
  }
  return validateSchemaShape(parsed);
}

/** Type-guard + normalize the parsed YAML into a strict OntologySchema. */
export function validateSchemaShape(parsed: unknown): OntologySchema {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[ontology] schema must be a YAML object');
  }

  const root = parsed as Record<string, unknown>;

  if (typeof root.version !== 'string') {
    throw new Error('[ontology] missing required string field: version');
  }
  if (typeof root.domain !== 'string') {
    throw new Error('[ontology] missing required string field: domain');
  }

  const ont = root.ontology as Record<string, unknown> | undefined;
  if (!ont || typeof ont !== 'object') {
    throw new Error('[ontology] missing required object field: ontology');
  }

  const entitiesRaw = ont.entities;
  if (!Array.isArray(entitiesRaw)) {
    throw new Error('[ontology] ontology.entities must be an array');
  }

  const entities: OntologyEntity[] = entitiesRaw.map((e, i) => {
    const ent = e as Record<string, unknown>;
    if (typeof ent?.name !== 'string') {
      throw new Error(`[ontology] entity[${i}] missing string field: name`);
    }
    const props = (ent.properties ?? {}) as Record<string, unknown>;
    const properties = parseProperties(ent.name, props);
    return {
      name: ent.name,
      description: typeof ent.description === 'string' ? ent.description : undefined,
      properties,
      min_instances: typeof ent.min_instances === 'number' ? ent.min_instances : undefined,
      max_instances: typeof ent.max_instances === 'number' ? ent.max_instances : undefined,
    };
  });

  const relationsRaw = ont.allowed_relations;
  if (!Array.isArray(relationsRaw)) {
    throw new Error('[ontology] ontology.allowed_relations must be an array');
  }
  const allowed_relations: AllowedRelation[] = relationsRaw.map((r, i) => {
    const rel = r as Record<string, unknown>;
    if (
      typeof rel?.origin !== 'string' ||
      typeof rel.relation !== 'string' ||
      typeof rel.target !== 'string'
    ) {
      throw new Error(`[ontology] allowed_relations[${i}] requires string fields origin/relation/target`);
    }
    if (rel.cardinality !== undefined && !VALID_CARDINALITIES.has(rel.cardinality as string)) {
      throw new Error(
        `[ontology] relation "${rel.relation}" has invalid cardinality "${String(rel.cardinality)}". ` +
          `Valid: ${Array.from(VALID_CARDINALITIES).join(', ')}`,
      );
    }
    return {
      origin: rel.origin,
      relation: rel.relation,
      target: rel.target,
      cardinality: rel.cardinality as Cardinality | undefined,
      description: typeof rel.description === 'string' ? rel.description : undefined,
    };
  });

  const harnessRaw = root.harness_constraints as Record<string, unknown> | undefined;
  if (!harnessRaw || typeof harnessRaw !== 'object') {
    throw new Error('[ontology] missing required object field: harness_constraints');
  }

  const harness_constraints = {
    enforce_json_schema: harnessRaw.enforce_json_schema !== false,
    fail_on_unknown_relation: harnessRaw.fail_on_unknown_relation === true,
    strands_routing: harnessRaw.strands_routing as OntologySchema['harness_constraints']['strands_routing'],
  };

  const schema: OntologySchema = {
    version: root.version,
    domain: root.domain,
    ontology: { entities, allowed_relations },
    harness_constraints,
  };

  const meta = root.meta as Record<string, unknown> | undefined;
  if (meta && typeof meta === 'object') {
    schema.meta = {
      description: typeof meta.description === 'string' ? meta.description : undefined,
      owner: typeof meta.owner === 'string' ? meta.owner : undefined,
      updated_at: typeof meta.updated_at === 'string' ? meta.updated_at : undefined,
    };
  }

  return schema;
}

/** Normalize property definitions: `"UUID"` shorthand → `{ type: "UUID" }` */
function parseProperties(entityName: string, props: Record<string, unknown>): PropertyMap {
  const properties: PropertyMap = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string') {
      if (!VALID_PROPERTY_TYPES.has(v)) {
        throw new Error(
          `[ontology] entity "${entityName}" property "${k}" has invalid type "${v}". ` +
            `Valid: ${Array.from(VALID_PROPERTY_TYPES).join(', ')}`,
        );
      }
      properties[k] = { type: v as PropertySpec['type'] };
      continue;
    }

    // v1.1 spec object form
    if (v && typeof v === 'object') {
      const spec = v as Record<string, unknown>;
      if (typeof spec.type !== 'string' || !VALID_PROPERTY_TYPES.has(spec.type)) {
        throw new Error(
          `[ontology] entity "${entityName}" property "${k}" has invalid spec. ` +
            `Expected { type: UUID|STRING|... }, got ${JSON.stringify(v)}`,
        );
      }
      const out: PropertySpec = { type: spec.type as PropertySpec['type'] };
      if (spec.required !== undefined) {
        if (typeof spec.required !== 'boolean') {
          throw new Error(`[ontology] entity "${entityName}" property "${k}" .required must be boolean`);
        }
        out.required = spec.required;
      }
      if (spec.enum !== undefined) {
        if (!Array.isArray(spec.enum) || !spec.enum.every((x) => typeof x === 'string')) {
          throw new Error(`[ontology] entity "${entityName}" property "${k}" .enum must be a string array`);
        }
        out.enum = spec.enum as string[];
      }
      if (typeof spec.description === 'string') {
        out.description = spec.description;
      }
      properties[k] = out;
      continue;
    }

    throw new Error(
      `[ontology] entity "${entityName}" property "${k}" must be a type string or spec object`,
    );
  }
  return properties;
}
