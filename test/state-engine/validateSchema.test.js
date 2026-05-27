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
});
