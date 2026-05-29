/**
 * Minimal local type declaration for `pg-copy-streams` v7.
 *
 * The published package ships no `.d.ts`, and `@types/pg-copy-streams@1.2.5`
 * targets the pre-6.x callback API (incompatible with v7's stream-only API).
 * We only use `from()` (COPY FROM STDIN), so we declare just what we consume.
 */
declare module 'pg-copy-streams' {
  import { Writable } from 'node:stream';

  /** Returns a Writable that is also a pg `Submittable` (pass to client.query). */
  export function from(text: string, options?: Record<string, unknown>): Writable;

  /** COPY TO STDOUT — declared for completeness; not currently used. */
  export function to(text: string, options?: Record<string, unknown>): NodeJS.ReadableStream;
}
