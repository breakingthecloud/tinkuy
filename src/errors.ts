/**
 * Tinkuy errors — shared framework exceptions.
 */

import type { RelationViolation } from './ontology/types.js';

/**
 * Thrown when an LLM response violates the configured ontology schema.
 *
 * Carries structured violation details for observability (Qhaway / Phoenix /
 * CloudWatch) so the failure can be traced without re-inference.
 */
export class OntologyViolationException extends Error {
  readonly violations: RelationViolation[];

  constructor(violations: RelationViolation[], message?: string) {
    super(
      message ??
        `Ontology violation: ${violations.map((v) => v.message).join('; ') || 'response does not match schema'}`,
    );
    this.name = 'OntologyViolationException';
    this.violations = violations;
  }
}
