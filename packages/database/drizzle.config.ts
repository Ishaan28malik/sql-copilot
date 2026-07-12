import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // eslint-disable-next-line no-restricted-globals
    url: process.env.DATABASE_URL ?? '',
  },
});
