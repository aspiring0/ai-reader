 import { interpretItem, LlmError } from '../lib/llm.js';
 import type { InterpretResult } from '../lib/llm.js';
 import { getSettings } from '../lib/config.js';
 import { logger } from '../lib/logger.js';
 import {
   getUninterpretedItems,
   getItemById,
   updateItemFields,
   upsertSyncState,
 } from '../db/repository.js';
 
 const RATE_LIMITER_MS = 500;
 
 export interface InterpretRunResult {
   total: number;
   succeeded: number;
   failed: number;
   errors: string[];
 }
 
 function sleep(ms: number): Promise<void> {
   return new Promise((r) => setTimeout(r, ms));
 }
 
 /** Interpret up to `limit` uninterpreted scored items. */
 export async function runInterpretation(limit = 50): Promise<InterpretRunResult> {
   const settings = getSettings();
   const apiKey = settings.llm_api_key?.trim();
 
   if (!apiKey) {
     return { total: 0, succeeded: 0, failed: 0, errors: [] };
   }
 
   const items = getUninterpretedItems(limit);
   const result: InterpretRunResult = {
     total: items.length,
     succeeded: 0,
     failed: 0,
     errors: [],
   };
 
   if (items.length === 0) {
     return result;
   }
 
   const startTime = Date.now();
   logger.info('interpret', 'start', `Interpreting ${items.length} items`);
 
   for (let i = 0; i < items.length; i++) {
     const item = items[i];
     const itemStart = Date.now();
 
     try {
       const interpreted = await interpretItem(
         { title: item.title, summary: item.summary, raw_data: item.raw_data },
         settings,
       );
 
       updateItemFields(item.id, {
         title_zh: interpreted.title_zh,
         summary: interpreted.summary,
         interpreted_at: new Date().toISOString(),
       });
 
       result.succeeded++;
       logger.info('interpret', item.id, `Interpreted in ${Date.now() - itemStart}ms`, {
         durationMs: Date.now() - itemStart,
       });
     } catch (err) {
       result.failed++;
       const msg = err instanceof Error ? err.message : String(err);
       result.errors.push(`${item.id}: ${msg}`);
       logger.error('interpret', item.id, `Failed: ${msg}`, { durationMs: Date.now() - itemStart });
     }
 
     // Rate limit between calls (skip after last item)
     if (i < items.length - 1) {
       await sleep(RATE_LIMITER_MS);
     }
   }
 
   const duration = Date.now() - startTime;
   const errorMsg = result.failed > 0 ? `${result.failed} items failed` : null;
   upsertSyncState('interpret', {
     last_run: new Date().toISOString(),
     last_success: result.failed === 0 ? new Date().toISOString() : null,
     item_count: result.succeeded,
     error: errorMsg,
   });
 
   logger.info('interpret', 'complete', `Done: ${result.succeeded}/${result.total} succeeded`, {
     durationMs: duration,
   });
 
   return result;
 }
 
 /** Interpret a single item by id. Throws if item not found or API key missing. */
 export async function interpretSingle(id: string): Promise<InterpretResult> {
   const settings = getSettings();
   const apiKey = settings.llm_api_key?.trim();
 
   if (!apiKey) {
     throw new LlmError('auth', 'LLM API key not configured');
   }
 
   const item = getItemById(id);
   if (!item) {
     throw new Error(`Item not found: ${id}`);
   }
 
   const itemStart = Date.now();
   const interpreted = await interpretItem(
     { title: item.title, summary: item.summary, raw_data: item.raw_data },
     settings,
   );
 
   updateItemFields(id, {
     title_zh: interpreted.title_zh,
     summary: interpreted.summary,
     interpreted_at: new Date().toISOString(),
   });
 
   logger.info('interpret', id, `Interpreted in ${Date.now() - itemStart}ms`, {
     durationMs: Date.now() - itemStart,
   });
 
   return interpreted;
 }
