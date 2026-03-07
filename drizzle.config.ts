import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['hol'],
  dbCredentials: {
    url: process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      'postgresql://registry:registry@localhost:5432/registry',
  },
});
