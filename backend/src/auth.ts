import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "./db.js";

const jwtSecret = process.env.JWT_SECRET ?? "local-dev-secret";

const registerSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
const loginSchema = registerSchema;

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const hash = await bcrypt.hash(parsed.data.password, 10);
  const result = await pool.query(
    "INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
    [parsed.data.email.toLowerCase(), hash]
  );
  return res.json({ user: result.rows[0] });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await pool.query("SELECT id, email, password_hash FROM app_users WHERE email = $1", [
    parsed.data.email.toLowerCase()
  ]);

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ sub: user.id, email: user.email, method: "email_password" }, jwtSecret, { expiresIn: "1d" });
  return res.json({ token, user: { id: user.id, email: user.email } });
}

export async function guestLogin(_req: Request, res: Response) {
  const token = jwt.sign({ sub: "guest-user", email: "guest@example.com", method: "guest_login" }, jwtSecret, {
    expiresIn: "7d"
  });
  return res.json({ token, user: { id: "guest-user", email: "guest@example.com" } });
}

export interface AuthedRequest extends Request {
  auth?: { userId: string; email: string };
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, jwtSecret) as { sub: string; email: string };
    req.auth = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
