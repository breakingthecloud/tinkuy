/**
 * Ontology loader — parse `tokenops_ontology.yaml` into a typed `OntologySchema`.
 *
 * Fails fast on malformed YAML or invalid schema shape so a broken config
 * surfaces at startup, not at inference time.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { OntologyEntity, OntologySchema, PropertyType } from './types.js';

const VALID_PROPERTY_TYPES = new Set<string>([
  'UUID',
  'STRING',
  'FLOAT',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
]);

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
    const properties: Record<string, PropertyType> = {};
    for (const [k, v] of Object.entries(props)) {
      if (typeof v !== 'string' || !VALID_PROPERTY_TYPES.has(v)) {
        throw new Error(
          `[ontology] entity "${ent.name}" property "${k}" has invalid type "${String(v)}". ` +
            `Valid: ${Array.from(VALID_PROPERTY_TYPES).join(', ')}`,
        );
      }
      properties[k] = v as PropertyType;
    }
    return { name: ent.name, properties };
  });

  const relationsRaw = ont.allowed_relations;
  if (!Array.isArray(relationsRaw)) {
    throw new Error('[ontology] ontology.allowed_relations must be an array');
  }
  const allowed_relations = relationsRaw.map((r, i) => {
    const rel = r as Record<string, unknown>;
    if (
      typeof rel?.origin !== 'string' ||
      typeof rel.relation !== 'string' ||
      typeof rel.target !== 'string'
    ) {
      throw new Error(`[ontology] allowed_relations[${i}] requires string fields origin/relation/target`);
    }
    return { origin: rel.origin, relation: rel.relation, target: rel.target };
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

  return {
    version: root.version,
    domain: root.domain,
    ontology: { entities, allowed_relations },
    harness_constraints,
  };
}
