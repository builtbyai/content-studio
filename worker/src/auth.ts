import type { Context, Next } from "hono";
import type { HonoEnv } from "./env";
import { db } from "./db";

// Password hash matches the reference auth service's pattern: SHA-256( password || salt ), hex.
// Keeps an admin row portable between projects.
export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(password + salt);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  // constant-time compare
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

const COOKIE_NAME = "cf_session";

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function isLocalRequest(c: Context<HonoEnv>): boolean {
  const host = c.req.header("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("0.0.0.0");
}

export function setSessionCookie(c: Context<HonoEnv>, sessionId: string) {
  const ttl = Number(c.env.SESSION_TTL_HOURS || "168") * 3600;
  const local = isLocalRequest(c);
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    local ? "" : "Secure",
    "SameSite=Lax",
    `Max-Age=${ttl}`,
    // Allow cookie on both app.* and api.* under example.com.
    // Skip Domain attribute on localhost so dev sessions work.
    local ? "" : "Domain=.example.com",
  ].filter(Boolean);
  c.header("Set-Cookie", attrs.join("; "), { append: true });
}

export function clearSessionCookie(c: Context<HonoEnv>) {
  const local = isLocalRequest(c);
  const attrs = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    local ? "" : "Secure",
    "SameSite=Lax",
    local ? "" : "Domain=.example.com",
    "Max-Age=0",
  ].filter(Boolean);
  c.header("Set-Cookie", attrs.join("; "), { append: true });
}

// Middleware: hydrate c.var.user from session cookie. Does NOT enforce.
export async function loadUser(c: Context<HonoEnv>, next: Next) {
  const sid = parseCookie(c.req.header("cookie") ?? null, COOKIE_NAME);
  if (sid) {
    const result = await db.sessionWithUser(c.env, sid);
    if (result) {
      c.set("user", { id: result.user.id, email: result.user.email, role: result.user.role });
      c.set("sessionId", result.session.id);
    }
  }
  await next();
}

// Middleware: 401 if no user.
export async function requireUser(c: Context<HonoEnv>, next: Next) {
  if (!c.var.user) return c.json({ error: "unauthorized" }, 401);
  await next();
}

export async function requireAdmin(c: Context<HonoEnv>, next: Next) {
  if (!c.var.user || c.var.user.role !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
}
