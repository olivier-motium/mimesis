import { defineConfig } from "drizzle-kit";
import path from "node:path";
import os from "node:os";

const dbPath = process.env.DB_PATH ?? path.join(os.homedir(), ".claude-code-ui", "data.db");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
