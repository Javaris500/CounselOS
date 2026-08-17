import { HttpStatus, type ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ERROR_CODES } from '@counselos/shared';

import { AppException } from '../errors/app.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * The pipe is the first thing an untrusted request meets, and the last chance
 * to reject it before a service runs. Everything here is deterministic — no
 * I/O, no container — so it belongs in the unit tier.
 */
describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  const schema = z.object({
    contactName: z.string().min(1).max(100),
    summary: z.string().min(1).max(500),
    occurredAt: z.iso.datetime(),
  });

  /** Stands in for what createZodDto() produces: a class carrying `.schema`. */
  class CreateCommunicationDto {
    static schema = schema;
  }

  const meta = (metatype: unknown): ArgumentMetadata =>
    ({ type: 'body', metatype, data: undefined }) as ArgumentMetadata;

  const valid = {
    contactName: 'Maria Delgado',
    summary: 'Confirmed the title commitment is ordered.',
    occurredAt: '2026-01-15T16:30:00.000Z',
  };

  it('returns the parsed value when the payload is valid', () => {
    expect(pipe.transform(valid, meta(CreateCommunicationDto))).toEqual(valid);
  });

  it('returns Zod output, not the raw input — coercion and stripping apply', () => {
    // The service must receive what the schema produced. If the pipe returned
    // the raw input, every downstream type would be a lie.
    const withExtra = { ...valid, isAdmin: true };
    const result = pipe.transform(withExtra, meta(CreateCommunicationDto)) as Record<
      string,
      unknown
    >;
    expect(result).not.toHaveProperty('isAdmin');
  });

  it('throws 422 with a typed code — never NestJS default 400', () => {
    // 400 vs 422 is the contract: the frontend renders 422 per field.
    expect.assertions(3);
    try {
      pipe.transform({ ...valid, contactName: '' }, meta(CreateCommunicationDto));
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect((error as AppException).code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it('reports field-level details keyed by field name', () => {
    // This is what the frontend maps onto the form with setError(field, …), so
    // the keys must be the field names and nothing else.
    expect.assertions(3);
    try {
      pipe.transform(
        { contactName: '', summary: '', occurredAt: 'not-a-date' },
        meta(CreateCommunicationDto),
      );
    } catch (error) {
      const details = (error as AppException).details;
      expect(Object.keys(details ?? {}).sort()).toEqual(['contactName', 'occurredAt', 'summary']);
      expect(details?.contactName?.length).toBeGreaterThan(0);
      expect(details?.occurredAt?.length).toBeGreaterThan(0);
    }
  });

  it('enforces the documented field limits, not just presence', () => {
    // 500 chars on a communication summary is a limit from packages/shared, and
    // the pipe is where it is enforced — before anything reaches the service.
    expect(() =>
      pipe.transform({ ...valid, summary: 'x'.repeat(501) }, meta(CreateCommunicationDto)),
    ).toThrow(AppException);
    expect(() =>
      pipe.transform({ ...valid, summary: 'x'.repeat(500) }, meta(CreateCommunicationDto)),
    ).not.toThrow();
  });

  it('passes through arguments that declare no schema', () => {
    // A route with nothing to validate must not 422. The pipe validates what is
    // declared; it does not invent requirements.
    expect(pipe.transform('raw-string', meta(String))).toBe('raw-string');
    expect(pipe.transform(42, meta(Number))).toBe(42);
    expect(pipe.transform({ any: 'thing' }, meta(undefined))).toEqual({ any: 'thing' });
  });

  it('rejects a malformed UUID at the pipe rather than in a repository', () => {
    // Otherwise it surfaces as a Postgres cast error deep in a query — a 500
    // for what is really a client mistake.
    class ParamsDto {
      static schema = z.object({ id: z.uuid() });
    }
    expect(() => pipe.transform({ id: 'not-a-uuid' }, meta(ParamsDto))).toThrow(AppException);
    expect(() =>
      pipe.transform({ id: '00000000-0000-4000-8000-000000000001' }, meta(ParamsDto)),
    ).not.toThrow();
  });
});
