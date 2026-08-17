import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType } from 'zod';
import { ERROR_CODES } from '@counselos/shared';

import { UnprocessableException } from '../errors/app.exception';

/**
 * Validates every body, param, and query before a controller runs (05 §1D).
 *
 * WHY IT IS OURS RATHER THAN nestjs-zod's DEFAULT
 *   The stock pipe throws a 400. We return **422** with field-level `details`,
 *   because a validation failure is a business outcome the frontend renders per
 *   field, not a malformed request that never parsed. Both apps agree on that
 *   shape via `ApiError` in packages/shared, and the frontend maps
 *   VALIDATION_ERROR straight onto the form with `setError(field, …)`.
 *
 * The schema comes from the DTO produced by `createZodDto()`, so the canonical
 * Zod schema in packages/shared is the same object the controller types
 * against and Swagger documents. One definition, three uses.
 *
 * Nothing unvalidated reaches a service. A malformed UUID in a path 422s here
 * rather than surfacing later as a Postgres cast error inside a repository.
 */
interface ZodDto {
  schema: ZodType;
}

function hasSchema(metatype: unknown): metatype is ZodDto {
  return (
    typeof metatype === 'function' &&
    'schema' in metatype &&
    typeof (metatype as ZodDto).schema?.safeParse === 'function'
  );
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Primitives and un-annotated params have no schema to check. Passing them
    // through is correct: this pipe validates what is declared, and a route
    // that declares nothing is a route with nothing to validate.
    if (!hasSchema(metadata.metatype)) return value;

    const result = metadata.metatype.schema.safeParse(value);
    if (result.success) return result.data;

    throw this.toException(result.error);
  }

  private toException(error: ZodError): UnprocessableException {
    // flatten().fieldErrors is already { field: [messages] } — the exact shape
    // ApiError.details declares, so nothing is reshaped on the way out.
    const fieldErrors = error.flatten().fieldErrors as Record<string, string[]>;
    return new UnprocessableException(
      'Validation failed',
      ERROR_CODES.VALIDATION_ERROR,
      fieldErrors,
    );
  }
}
