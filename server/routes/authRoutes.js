import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { query, transaction } from "../db.js";
import { config } from "../config.js";
import {
  clearSessionCookies,
  ensureCsrfCookie,
  hashToken,
  issueSession,
  loadUserById,
  requireAuth,
} from "../middleware/auth.js";

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

function validateRegistration(body) {
  if (!USERNAME_PATTERN.test(body.username?.trim() || "")) return "Username must be 3–32 characters using letters, numbers, or underscores.";
  if (!EMAIL_PATTERN.test(body.email?.trim() || "")) return "Enter a valid email address.";
  if ((body.password || "").length < 8) return "Password must contain at least 8 characters.";
  if (!(body.fullName || "").trim()) return "Full name is required.";
  return "";
}

router.get("/availability", async (req, res, next) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const username = String(req.query.username || "").trim().toLowerCase();
    const result = await query(
      `select
        not exists(select 1 from users where lower(email) = $1) as email_available,
        not exists(select 1 from users where lower(username) = $2) as username_available`,
      [email, username],
    );
    res.json({ emailAvailable: result.rows[0].email_available, usernameAvailable: result.rows[0].username_available });
  } catch (error) {
    next(error);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const validationError = validateRegistration(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const email = req.body.email.trim().toLowerCase();
    const username = req.body.username.trim();
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const userId = await transaction(async (client) => {
      const department = await client.query("select id from departments where name = $1", [req.body.department || "Legal Affairs"]);
      if (department.rowCount !== 1) throw Object.assign(new Error("Selected department does not exist."), { status: 400 });
      const result = await client.query(
        `insert into users (username, full_name, email, password_hash, prefix, role_id, department_id)
         values ($1, $2, $3, $4, $5, 'requester', $6) returning id`,
        [username, req.body.fullName.trim(), email, passwordHash, req.body.prefix || "None", department.rows[0].id],
      );
      await client.query(
        `insert into audit_logs (action, actor_id, actor_name, ip_address) values ('Requester account registered', $1, $2, $3)`,
        [result.rows[0].id, req.body.fullName.trim(), req.ip],
      );
      return result.rows[0].id;
    });

    await issueSession(req, res, userId);
    res.status(201).json({ user: await loadUserById(userId) });
  } catch (error) {
    if (error.code === "23505") {
      const code = error.constraint?.includes("email") ? "EMAIL_ALREADY_REGISTERED" : "USERNAME_ALREADY_TAKEN";
      return res.status(409).json({ error: code });
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!identifier || !password) return res.status(400).json({ error: "Username/email and password are required." });

    const result = await query(
      `select id, password_hash, status from users where lower(username) = $1 or lower(email) = $1 limit 1`,
      [identifier],
    );
    const account = result.rows[0];
    const validPassword = account ? await bcrypt.compare(password, account.password_hash) : false;
    if (!account || !validPassword || account.status !== "Active") {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    await issueSession(req, res, account.id);
    await query("update users set last_seen_at = now() where id = $1", [account.id]);
    res.json({ user: await loadUserById(account.id) });
  } catch (error) {
    next(error);
  }
});

router.get("/session", requireAuth, async (req, res) => {
  ensureCsrfCookie(req, res);
  res.json({ user: req.user });
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await query("delete from sessions where token_hash = $1", [req.sessionTokenHash]);
    clearSessionCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    if (newPassword.length < 8) return res.status(400).json({ error: "Use at least 8 characters for the new password." });
    const result = await query("select password_hash from users where id = $1", [req.user.id]);
    if (!await bcrypt.compare(currentPassword, result.rows[0].password_hash)) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await transaction(async (client) => {
      await client.query("update users set password_hash = $1 where id = $2", [passwordHash, req.user.id]);
      await client.query("delete from sessions where user_id = $1", [req.user.id]);
      await client.query(`insert into audit_logs (action, actor_id, actor_name, ip_address) values ('Password changed; all sessions revoked', $1, $2, $3)`, [req.user.id, req.user.name, req.ip]);
    });
    clearSessionCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/password-reset/request", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const result = await query("select id, full_name from users where lower(email) = $1 and status = 'Active'", [email]);

    if (result.rowCount === 1) {
      const rawToken = crypto.randomBytes(32).toString("base64url");
      await query("insert into password_reset_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '20 minutes')", [hashToken(rawToken), result.rows[0].id]);
      const resetUrl = `${config.publicAppUrl}?reset-token=${encodeURIComponent(rawToken)}`;

      if (config.smtp.host && config.smtp.user) {
        const transporter = nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          auth: { user: config.smtp.user, pass: config.smtp.password },
        });
        await transporter.sendMail({
          from: config.smtp.from,
          to: email,
          subject: "KU Legal Affairs password reset",
          text: `Hello ${result.rows[0].full_name},\n\nUse this link within 20 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, no action is required.`,
        });
      } else if (config.nodeEnv !== "production") {
        console.warn(`SMTP is not configured. Development password-reset link: ${resetUrl}`);
      }
    }
    res.status(202).json({ message: "If the account exists, reset instructions have been sent." });
  } catch (error) {
    next(error);
  }
});

router.post("/password-reset/confirm", async (req, res, next) => {
  try {
    const token = String(req.body.token || "");
    const newPassword = String(req.body.newPassword || "");
    if (!token || newPassword.length < 8) return res.status(400).json({ error: "The reset link or new password is invalid." });
    const tokenHash = hashToken(token);
    const tokenResult = await query("select user_id from password_reset_tokens where token_hash = $1 and expires_at > now() and used_at is null", [tokenHash]);
    if (tokenResult.rowCount !== 1) return res.status(400).json({ error: "This password-reset link is invalid or expired." });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await transaction(async (client) => {
      await client.query("update users set password_hash = $1 where id = $2", [passwordHash, tokenResult.rows[0].user_id]);
      await client.query("update password_reset_tokens set used_at = now() where token_hash = $1", [tokenHash]);
      await client.query("delete from sessions where user_id = $1", [tokenResult.rows[0].user_id]);
    });
    clearSessionCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
