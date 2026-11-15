import type {z} from 'zod';

import {ValidationError} from './errors';

/** Parses a JSON body with a zod schema, turning failures into a 400. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ValidationError('Body must be JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(
      issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid body',
    );
  }
  return result.data;
}
