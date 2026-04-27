import "dotenv/config";
import express from "express";
import cors from "cors";
import { authMiddleware, guestLogin, login, register } from "./auth.js";
import { loadConfig } from "./config.js";
import { ensureTablesFromConfig, pool } from "./db.js";
import { buildDynamicRouter } from "./dynamicRoutes.js";

async function bootstrap() {
  const config = loadConfig();
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  await ensureTablesFromConfig(config);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/auth/register", register);
  app.post("/auth/login", login);
  app.post("/auth/guest", guestLogin);

  app.use("/api", authMiddleware, buildDynamicRouter(config));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
