import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit runs outside the Nest DI container, so this is the one place
 * besides instrument.ts and env.validation.ts that reads process.env directly
 * (eslint exempts it explicitly).
 */
export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Generated SQL is reviewed before it runs. HNSW and partial-unique indexes
  // are hand-written migrations — drizzle-kit cannot express them (02).
  verbose: true,
  strict: true,
});
