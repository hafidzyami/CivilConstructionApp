import { z } from 'zod';

export const createDetailSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().optional(),
  environment: z.record(z.any()).optional(),
  decision: z.string().optional(),
  explanation: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
});

export const updateDetailSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  environment: z.record(z.any()).optional(),
  decision: z.string().optional(),
  explanation: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
});

export type CreateDetailInput = z.infer<typeof createDetailSchema>;
export type UpdateDetailInput = z.infer<typeof updateDetailSchema>;
