import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schemas/admin/index.ts", "./src/db/schemas/public/index.ts"],
  out: "./drizzle",
  dbCredentials: {
    // Fallback only allows offline tooling (`db:generate`) to run; migrations
    // against a live database require a real `DATABASE_URL`.
    url: process.env.DATABASE_URL!,
  },
});
