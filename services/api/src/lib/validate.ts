import { badRequest } from '@sqlcopilot/shared';
import type { Context } from 'hono';
import type { ZodType, ZodTypeDef } from 'zod';

/** Parses and validates a JSON body, translating failures into 400s. */
export async function parseBody<T>(c: Context, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw badRequest(`Invalid request: ${detail}`);
  }
  return parsed.data;
}
