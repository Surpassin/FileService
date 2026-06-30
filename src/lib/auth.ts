import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { queryOne, execute } from "./database";
import type { User, AuthPayload } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET || "omnii-dev-secret";
const TOKEN_EXPIRY = "24h";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ user: User; token: string } | null> {
  const row = queryOne<UserRow>(
    "SELECT * FROM users WHERE email = ?",
    [email]
  );

  if (!row) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  execute("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [
    row.id,
  ]);

  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as User["role"],
    createdAt: row.created_at,
    lastLoginAt: new Date().toISOString(),
  };

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return { user, token };
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
  role: "admin" | "operator" | "viewer"
): Promise<User> {
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 12);

  execute(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    [id, email, name, hash, role]
  );

  return {
    id,
    email,
    name,
    role,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
}

export function extractTokenFromHeader(
  authHeader: string | null
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export function requireAuth(
  request: Request
): AuthPayload | Response {
  const authHeader = request.headers.get("authorization");
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const payload = verifyToken(token);
  if (!payload) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return payload;
}

export function requireRole(
  request: Request,
  ...roles: string[]
): AuthPayload | Response {
  const result = requireAuth(request);
  if (result instanceof Response) return result;

  if (!roles.includes(result.role)) {
    return new Response(
      JSON.stringify({ success: false, error: "Insufficient permissions" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return result;
}
