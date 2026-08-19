import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Prefers DIRECT_URL (Port 5432) for migrations & schema syncing;
    // falls back to DATABASE_URL if DIRECT_URL isn't explicitly set.
    url: env('DATABASE_URL'),
  },
});
