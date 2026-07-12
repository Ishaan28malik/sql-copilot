/**
 * Node entry point (used on Render and any Node host).
 *
 * The same Hono app runs on Cloudflare Workers (src/index.ts is the Worker
 * entry) and on Node via @hono/node-server. Node is required for the deployed
 * app because the Workers runtime cannot complete a Postgres TLS handshake to
 * arbitrary tenant databases; Node's postgres.js does this natively.
 */
import { serve } from '@hono/node-server';
import app from './index';

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ level: 'info', message: 'api listening', port: info.port }));
});
