import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApiResponse } from '@shared/types';

/** Wrap success responses. */
export function ok<T>(reply: FastifyReply, data: T, status = 200): FastifyReply {
  const body: ApiResponse<T> = { ok: true, data };
  return reply.status(status).send(body);
}

/** Wrap error responses. */
export function fail(reply: FastifyReply, code: string, message: string, status = 400): FastifyReply {
  const body: ApiResponse<never> = { ok: false, error: { code, message } };
  return reply.status(status).send(body);
}

/** Register the unified response plugin. */
export async function responsePlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err, _req, reply) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = (err as { statusCode?: number }).statusCode || 500;
    const body: ApiResponse<never> = {
      ok: false,
      error: { code: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST', message },
    };
    reply.status(status).send(body);
  });
}
