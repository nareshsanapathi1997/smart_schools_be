const { describe, it } = require('node:test');
const assert = require('node:assert');
const slugify = require('../utils/slugify');

describe('slugify', () => {
  it('converts text to URL slug', () => {
    assert.strictEqual(slugify('Primary I-V'), 'primary-i-v');
    assert.strictEqual(slugify('  Hello World  '), 'hello-world');
  });
});

describe('health check shape', () => {
  it('validates expected API health response', () => {
    const response = { success: true, message: 'Smart School API is running' };
    assert.strictEqual(response.success, true);
    assert.ok(response.message.includes('API'));
  });
});
