/**
 * Tinkuy Ontology — deterministic grounding module.
 *
 * Optional validation layer: parse `tokenops_ontology.yaml`, validate LLM
 * responses against the strict T-Box schema (zero-token cost), and throw
 * `OntologyViolationException` when the kill switch is enabled.
 *
 * @example
 * import { loadOntology, validateResponse } from '@carloscortezcloud/tinkuy-agent/ontology';
 *
 * const schema = await loadOntology('schema/tokenops_ontology.yaml');
 * const result = validateResponse(modelResponse, schema); // throws on violation
 */

export { loadOntology, parseOntologyYaml, validateSchemaShape } from './loader.js';
export { validateResponse } from './validator.js';
export { OntologyViolationException } from '../errors.js';
export type {
  AllowedRelation,
  DetectedRelation,
  HarnessConstraints,
  OntologyEntity,
  OntologySchema,
  PropertyType,
  RelationViolation,
  StrandsRouting,
  ValidationResult,
} from './types.js';
