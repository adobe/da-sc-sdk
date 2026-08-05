/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { expect } from '@esm-bundle/chai';
import { validateSchema } from '../../src/state-engine/index.js';

describe('validateSchema', () => {
  it('returns valid=true with no issues for a well-formed schema', () => {
    const result = validateSchema({
      schema: {
        type: 'object',
        title: 'Project',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      },
    });
    expect(result.valid).to.equal(true);
    expect(result.schemaIssues).to.deep.equal([]);
  });

  it('returns valid=false with issues for a schema using composition keywords', () => {
    const result = validateSchema({
      schema: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    });
    expect(result.valid).to.equal(false);
    expect(result.schemaIssues).to.have.lengthOf.at.least(1);
    expect(result.schemaIssues[0].reason).to.equal('unsupported-composition');
  });

  it('returns valid=false for a schema with an unsupported type', () => {
    const result = validateSchema({
      schema: {
        type: 'object',
        properties: {
          weird: { type: 'never', title: 'Weird' },
        },
      },
    });
    expect(result.valid).to.equal(false);
    expect(result.schemaIssues.some((i) => i.reason === 'unsupported-type')).to.equal(true);
  });

  it('returns valid=false for a schema with an external $ref', () => {
    const result = validateSchema({
      schema: {
        type: 'object',
        properties: {
          link: { $ref: 'https://elsewhere.example/schema.json' },
        },
      },
    });
    expect(result.valid).to.equal(false);
    expect(result.schemaIssues.some((i) => i.reason === 'external-ref')).to.equal(true);
  });

  it('does NOT report data-level issues (it only checks the schema)', () => {
    // Required field with no data — would trigger a data error in validateData,
    // but validateSchema doesn't validate data at all.
    const result = validateSchema({
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: 'Name' } },
      },
    });
    expect(result.valid).to.equal(true);
    expect(result.schemaIssues).to.deep.equal([]);
    // No `errors` field in the return shape at all.
    expect(result.errors).to.equal(undefined);
  });

  it('reports an invalid regex pattern as a schema issue (matches ajv compile behavior)', () => {
    const result = validateSchema({
      schema: {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '[' },
        },
      },
    });
    expect(result.valid).to.equal(false);
    const issue = result.schemaIssues.find((i) => i.reason === 'invalid-pattern');
    expect(issue).to.exist;
    expect(issue.details).to.deep.equal({ pattern: '[' });
  });

  it('handles null / undefined / non-object input without throwing', () => {
    expect(validateSchema({ schema: null })).to.deep.equal({ valid: false, schemaIssues: [] });
    expect(validateSchema({ schema: undefined })).to.deep.equal({ valid: false, schemaIssues: [] });
    expect(validateSchema({ schema: 'not a schema' })).to.deep.equal({ valid: false, schemaIssues: [] });
    // Calling with no arg at all also handled gracefully.
    expect(validateSchema()).to.deep.equal({ valid: false, schemaIssues: [] });
  });

  describe('schemaPath', () => {
    it('points at the schema root for a missing type', () => {
      const [issue] = validateSchema({ schema: {} }).schemaIssues;
      expect(issue.reason).to.equal('missing-type');
      expect(issue.pointer).to.equal('/data');
      expect(issue.schemaPath).to.equal('/');
    });

    it('points at the property, not the data-instance path', () => {
      const [issue] = validateSchema({
        schema: {
          type: 'object',
          properties: { code: { type: 'string', pattern: '[' } },
        },
      }).schemaIssues;
      expect(issue.reason).to.equal('invalid-pattern');
      expect(issue.pointer).to.equal('/data/code');
      expect(issue.schemaPath).to.equal('/properties/code');
    });

    it('re-roots at the $def a ref points to', () => {
      const [issue] = validateSchema({
        schema: {
          $defs: {
            Achievement: { type: ['object'], properties: { year: { type: 'integer' } } },
          },
          type: 'object',
          properties: {
            timeline: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  achievements: { type: 'array', items: { $ref: '#/$defs/Achievement' } },
                },
              },
            },
          },
        },
      }).schemaIssues;
      expect(issue.reason).to.equal('type-as-array');
      // Instance path threads through the arrays; schema path lands on the def.
      expect(issue.pointer).to.equal('/data/timeline/0/achievements/0');
      expect(issue.schemaPath).to.equal('/$defs/Achievement');
    });

    it('re-roots a ref nested inside another ref\'d def', () => {
      const [issue] = validateSchema({
        schema: {
          $defs: {
            YearAchievement: { type: ['object'], properties: { year: { type: 'integer' } } },
            TimelinePeriod: {
              type: 'object',
              properties: {
                notableAchievements: { type: 'array', items: { $ref: '#/$defs/YearAchievement' } },
              },
            },
          },
          type: 'object',
          properties: {
            historicalTimeline: { type: 'array', items: { $ref: '#/$defs/TimelinePeriod' } },
          },
        },
      }).schemaIssues;
      // The offender is two ref hops deep; the path must land on the inner def,
      // not the outer def's usage site.
      expect(issue.reason).to.equal('type-as-array');
      expect(issue.schemaPath).to.equal('/$defs/YearAchievement');
    });

    it('points a ref\'d property at its def, not the usage site', () => {
      const [issue] = validateSchema({
        schema: {
          $defs: { Project: { type: 'object', properties: { name: { type: ['string', 'number'] } } } },
          type: 'object',
          properties: { projects: { type: 'array', items: { $ref: '#/$defs/Project' } } },
        },
      }).schemaIssues;
      expect(issue.schemaPath).to.equal('/$defs/Project/properties/name');
    });
  });

  describe('message and details', () => {
    it('carries a human message and reason-specific details', () => {
      const typeArray = validateSchema({ schema: { type: ['object'] } }).schemaIssues[0];
      expect(typeArray.message).to.equal('The type must be a single value, not an array.');
      expect(typeArray.details).to.deep.equal({ type: ['object'] });

      const [missing] = validateSchema({ schema: {} }).schemaIssues;
      expect(missing.message).to.equal('A type is required.');
      expect(missing.details).to.equal(null);
    });

    it('folds composition keyword and branch count into details', () => {
      const [issue] = validateSchema({
        schema: { type: 'object', properties: { a: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] } } },
      }).schemaIssues;
      expect(issue.reason).to.equal('unsupported-composition');
      expect(issue.message).to.equal('Composition "oneOf" is not supported.');
      expect(issue.details).to.deep.equal({ keyword: 'oneOf', variants: 3 });
    });

    it('does not carry the removed legacy fields', () => {
      const [issue] = validateSchema({ schema: { type: ['object'] } }).schemaIssues;
      expect(issue).to.not.have.any.keys('feature', 'compositionKeyword', 'variants', 'scope');
      expect(Object.keys(issue).sort()).to.deep.equal(
        ['details', 'message', 'pointer', 'reason', 'schemaPath'],
      );
    });
  });
});
