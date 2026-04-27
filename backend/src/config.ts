import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AppConfig } from "./types.js";

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "date", "email"]).catch("string"),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional()
});

const entitySchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1).catch("Unnamed Entity"),
  userScoped: z.boolean().optional(),
  fields: z.array(fieldSchema).default([])
});

const appConfigSchema = z.object({
  appName: z.string().default("Generated App"),
  entities: z.array(entitySchema).default([]),
  views: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["form", "table", "dashboard", "unknown"]).catch("unknown"),
        entity: z.string(),
        title: z.record(z.string()).default({ en: "Untitled" })
      })
    )
    .default([]),
  auth: z
    .object({
      methods: z.array(z.enum(["email_password", "guest_login"]).catch("email_password")).default(["email_password"])
    })
    .default({ methods: ["email_password"] }),
  localization: z
    .object({
      defaultLanguage: z.string().default("en"),
      languages: z.array(z.string()).default(["en"]),
      translations: z.record(z.record(z.string())).default({})
    })
    .default({ defaultLanguage: "en", languages: ["en"], translations: {} }),
  notifications: z
    .object({
      emailEnabled: z.boolean().default(true),
      events: z.array(z.string()).default(["record_created", "record_updated", "record_deleted"])
    })
    .default({ emailEnabled: true, events: ["record_created", "record_updated", "record_deleted"] })
});

export function loadConfig(): AppConfig {
  const filePath = path.resolve(process.cwd(), "../config/app-config.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return appConfigSchema.parse(parsed);
}
