import { createDatabaseClient } from "./_qoder/backend.mjs";
import { createHandler } from "./routes.ts";

Deno.serve(createHandler(createDatabaseClient()));
