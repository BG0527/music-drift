import { z } from 'zod';

/** 契约版本：S0 脚手架基线。契约发生不兼容变更时必须同时提升此值。 */
export const CONTRACT_VERSION = '0.0.0-s0';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  contractVersion: z.string().min(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
