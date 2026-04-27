import { pool } from "./db.js";

export async function emitNotification(userId: string | null, eventName: string, payload: unknown) {
  await pool.query("INSERT INTO app_notifications (user_id, event_name, payload) VALUES ($1, $2, $3)", [
    userId,
    eventName,
    JSON.stringify(payload)
  ]);

  // Mock email sender for demo usage.
  console.log(`[EMAIL_MOCK] event=${eventName} user=${userId ?? "anonymous"} payload=${JSON.stringify(payload)}`);
}
