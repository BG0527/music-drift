import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from './common';
import { HealthResponseSchema } from './health';

describe('HealthResponseSchema', () => {
  it('accepts a well-formed health payload', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      contractVersion: CONTRACT_VERSION,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a payload with an unexpected status literal', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'degraded',
      service: 'api',
      contractVersion: CONTRACT_VERSION,
    });

    expect(result.success).toBe(false);
  });
});
