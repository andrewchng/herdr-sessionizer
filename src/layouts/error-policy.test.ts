import { describe, expect, it } from 'bun:test';

import { createLenientLayoutErrorPolicy } from './error-policy.ts';

describe('createLenientLayoutErrorPolicy', () => {
  it('swallows ignored operation errors', async () => {
    const policy = createLenientLayoutErrorPolicy();

    await expect(
      policy.ignore('rename tab', async () => {
        throw new Error('boom');
      }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined for optional operation errors', async () => {
    const policy = createLenientLayoutErrorPolicy();

    await expect(
      policy.optional('create tab', async () => {
        throw new Error('boom');
      }),
    ).resolves.toBeUndefined();
  });
});
