import express, { Request, Response } from "express";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { AuthedRequest } from "./auth.js";
import { entityTableName, pool } from "./db.js";
import { emitNotification } from "./notifications.js";
import { AppConfig, AppEntity } from "./types.js";

function validatorForEntity(entity: AppEntity) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of entity.fields) {
    let schema: z.ZodTypeAny = z.any();
    switch (f.type) {
      case "number":
        schema = z.coerce.number();
        break;
      case "boolean":
        schema = z.coerce.boolean();
        break;
      case "date":
        schema = z.string();
        break;
      case "email":
        schema = z.string().email();
        break;
      default:
        schema = z.string();
    }
    shape[f.key] = f.required ? schema : schema.optional();
  }
  return z.object(shape).passthrough();
}

export function buildDynamicRouter(config: AppConfig) {
  const router = express.Router();
  const entityMap = new Map(config.entities.map((e) => [e.name, e]));

  router.get("/metadata", (_req, res) => {
    res.json(config);
  });

  router.get("/:entity", async (req: AuthedRequest, res: Response) => {
    const entity = entityMap.get(req.params.entity);
    if (!entity) return res.status(404).json({ error: "Unknown entity" });

    const table = entityTableName(entity.name);
    const params: unknown[] = [];
    let where = "";
    if (entity.userScoped !== false) {
      where = "WHERE user_id = $1";
      params.push(req.auth!.userId);
    }

    const result = await pool.query(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC`, params);
    return res.json({ items: result.rows });
  });

  router.post("/:entity", async (req: AuthedRequest, res: Response) => {
    const entity = entityMap.get(req.params.entity);
    if (!entity) return res.status(404).json({ error: "Unknown entity" });

    const parsed = validatorForEntity(entity).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const body = parsed.data;
    const table = entityTableName(entity.name);
    const columnKeys = entity.fields.map((f) => f.key);

    const columnsSql = columnKeys.map((k) => `"${k}"`).join(", ");
    const values = columnKeys.map((k) => (body as any)[k] ?? null);
    const placeholders = values.map((_, i) => `$${i + 3}`).join(", ");

    const query = `INSERT INTO ${table} (user_id, data${columnsSql ? `, ${columnsSql}` : ""}) VALUES ($1, $2${placeholders ? `, ${placeholders}` : ""}) RETURNING *`;
    const result = await pool.query(query, [entity.userScoped === false ? null : req.auth!.userId, body, ...values]);

    await emitNotification(req.auth!.userId, "record_created", { entity: entity.name, id: result.rows[0].id });
    return res.status(201).json({ item: result.rows[0] });
  });

  router.put("/:entity/:id", async (req: AuthedRequest, res: Response) => {
    const entity = entityMap.get(req.params.entity);
    if (!entity) return res.status(404).json({ error: "Unknown entity" });

    const parsed = validatorForEntity(entity).partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const body = parsed.data;
    const table = entityTableName(entity.name);
    const setSql = Object.keys(body)
      .map((k, i) => `"${k}" = $${i + 1}`)
      .join(", ");

    if (!setSql) return res.status(400).json({ error: "No fields to update" });

    const baseValues = Object.values(body);
    const userWhere = entity.userScoped !== false ? ` AND user_id = $${baseValues.length + 2}` : "";
    const values = [...baseValues, req.params.id, ...(entity.userScoped !== false ? [req.auth!.userId] : [])];

    const idPosition = baseValues.length + 1;
    const userPosition = baseValues.length + 2;
    const dataPosition = entity.userScoped !== false ? baseValues.length + 3 : baseValues.length + 2;
    const userClause = entity.userScoped !== false ? ` AND user_id = $${userPosition}` : "";

    const result = await pool.query(
      `UPDATE ${table} SET ${setSql}, data = data || $${dataPosition}::jsonb, updated_at = NOW() WHERE id = $${idPosition}${userClause} RETURNING *`,
      [...values, JSON.stringify(body)]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Item not found" });

    await emitNotification(req.auth!.userId, "record_updated", { entity: entity.name, id: req.params.id });
    return res.json({ item: result.rows[0] });
  });

  router.delete("/:entity/:id", async (req: AuthedRequest, res: Response) => {
    const entity = entityMap.get(req.params.entity);
    if (!entity) return res.status(404).json({ error: "Unknown entity" });

    const table = entityTableName(entity.name);
    const result = await pool.query(
      `DELETE FROM ${table} WHERE id = $1 ${entity.userScoped !== false ? "AND user_id = $2" : ""} RETURNING id`,
      entity.userScoped !== false ? [req.params.id, req.auth!.userId] : [req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Item not found" });

    await emitNotification(req.auth!.userId, "record_deleted", { entity: entity.name, id: req.params.id });
    return res.status(204).send();
  });

  router.post("/:entity/import-csv", async (req: AuthedRequest, res: Response) => {
    const entity = entityMap.get(req.params.entity);
    if (!entity) return res.status(404).json({ error: "Unknown entity" });

    const { csvText, mapping } = req.body as { csvText?: string; mapping?: Record<string, string> };
    if (!csvText || !mapping) return res.status(400).json({ error: "csvText and mapping are required" });

    const records = parse(csvText, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    const inserted: number[] = [];

    for (let index = 0; index < records.length; index += 1) {
      const row = records[index];
      const transformed: Record<string, unknown> = {};
      for (const [csvColumn, entityField] of Object.entries(mapping)) {
        transformed[entityField] = row[csvColumn];
      }

      const parsed = validatorForEntity(entity).partial().safeParse(transformed);
      if (!parsed.success) continue;

      const table = entityTableName(entity.name);
      const keys = Object.keys(parsed.data);
      const cols = keys.map((k) => `"${k}"`).join(", ");
      const vals = keys.map((k) => (parsed.data as Record<string, unknown>)[k]);
      const placeholders = vals.map((_, i) => `$${i + 3}`).join(", ");
      await pool.query(
        `INSERT INTO ${table} (user_id, data${cols ? `, ${cols}` : ""}) VALUES ($1, $2${placeholders ? `, ${placeholders}` : ""})`,
        [entity.userScoped === false ? null : req.auth!.userId, parsed.data, ...vals]
      );
      inserted.push(index);
    }

    await emitNotification(req.auth!.userId, "csv_import", { entity: entity.name, totalRows: records.length, inserted: inserted.length });
    return res.json({ totalRows: records.length, inserted: inserted.length, insertedIndexes: inserted });
  });

  return router;
}
