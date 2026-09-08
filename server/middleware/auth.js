import crypto from "node:crypto";
import { query } from "../db.js";
import { config } from "../config.js";

export const SESSION_COOKIE = "ku_legal_session";
export const CSRF_COOKIE = "ku_legal_csrf";

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function mapUser(row) {
  return {
    id: row.id,
    name: row.full_name,
    username: row.username,
    email: row.email,
    prefix: row.prefix,
    role: row.role_name,
    department: row.department_name,
    status: row.status,
    isActive: row.is_active ?? false,
  };
}

const userSelect = `
  select u.id, u.username, u.full_name, u.email, u.prefix, u.status,
         r.name as role_name, d.name as department_name, u.department_id,
         (u.last_seen_at > now() - interval '2 minutes') as is_active
  from users u
  join roles r on r.id = u.role_id
  join departments d on d.id = u.department_id
`;

export async function authenticate(req, _res, next) {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE];
    if (!rawToken) return next();

    const tokenHash = hashToken(rawToken);
    const result = await query(
      `${userSelect}
       join sessions s on s.user_id = u.id
       where s.token_hash = $1 and s.expires_at > now() and u.status = 'Active'`,
      [tokenHash],
    );

    if (result.rowCount === 1) {
      req.user = mapUser(result.rows[0]);
      req.user.departmentId = result.rows[0].department_id;
      req.sessionTokenHash = tokenHash;
      query("update sessions set last_seen_at = now() where token_hash = $1", [tokenHash]).catch(() => {});
      query("update users set last_seen_at = now() where id = $1", [req.user.id]).catch(() => {});
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required." });
  next();
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Your role is not permitted to perform this action." });
    next();
  };
}

export async function issueSession(req, res, userId) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const maxAge = config.sessionHours * 60 * 60 * 1000;

  await query(
    `insert into sessions (token_hash, user_id, expires_at, ip_address, user_agent)
     values ($1, $2, now() + ($3 || ' hours')::interval, $4, $5)`,
    [tokenHash, userId, String(config.sessionHours), req.ip, req.get("user-agent")?.slice(0, 500) || null],
  );

  res.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookies(res) {
  const options = { secure: config.secureCookies, sameSite: "lax", path: "/" };
  res.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}

export function ensureCsrfCookie(req, res) {
  if (req.user && !req.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, crypto.randomBytes(24).toString("base64url"), {
      httpOnly: false,
      secure: config.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionHours * 60 * 60 * 1000,
    });
  }
}

export function verifyCsrf(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || !req.user) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE] || "";
  const headerToken = req.get("x-csrf-token") || "";
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
    return res.status(403).json({ error: "Security token validation failed. Refresh the page and try again." });
  }
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ error: "Security token validation failed. Refresh the page and try again." });
  }
  next();
}

export async function loadUserById(userId) {
  const result = await query(`${userSelect} where u.id = $1`, [userId]);
  return result.rowCount === 1 ? mapUser(result.rows[0]) : null;
}
