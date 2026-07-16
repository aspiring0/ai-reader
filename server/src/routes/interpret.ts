 import type { FastifyInstance } from 'fastify';
 import { getSettings } from '../lib/config.js';
 import { runInterpretation, interpretSingle } from '../interpreter/index.js';
 import { ok, fail } from './helpers.js';
 
 export async function interpretRoutes(app: FastifyInstance): Promise<void> {
   app.post<{ Querystring: { limit?: string } }>(
     '/api/interpret/run',
     async (req, reply) => {
       const settings = getSettings();
       if (!settings.llm_api_key?.trim()) {
         return fail(reply, 'LLM_NOT_CONFIGURED', 'LLM API key not set in settings', 400);
       }
 
       const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : 50;
       const result = await runInterpretation(limit);
       return ok(reply, result);
     },
   );
 
   app.post<{ Params: { id: string } }>(
     '/api/interpret/:id',
     async (req, reply) => {
       const settings = getSettings();
       if (!settings.llm_api_key?.trim()) {
         return fail(reply, 'LLM_NOT_CONFIGURED', 'LLM API key not set in settings', 400);
       }
 
       try {
         const result = await interpretSingle(req.params.id);
         return ok(reply, result);
       } catch (err) {
         const msg = err instanceof Error ? err.message : String(err);
         if (msg.includes('not found')) {
           return fail(reply, 'NOT_FOUND', msg, 404);
         }
         return fail(reply, 'INTERPRET_ERROR', msg, 500);
       }
     },
   );
 }
