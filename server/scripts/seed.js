import bcrypt from "bcryptjs";
import { pool, transaction } from "../db.js";

const accounts = [
  { username: "requester", email: "requester@demo.test", name: "Demo Requester", role: "requester", department: "hr" },
  { username: "reviewer", email: "reviewer@demo.test", name: "Demo Legal Reviewer", role: "legal_reviewer", department: "legal_affairs" },
  { username: "manager", email: "manager@demo.test", name: "Demo Legal Manager", role: "legal_manager", department: "legal_affairs" },
  { username: "approver", email: "approver@demo.test", name: "Demo Department Approver", role: "department_approver", department: "hr" },
  { username: "admin", email: "admin@demo.test", name: "Demo Administrator", role: "admin_user", department: "it" },
  { username: "owner", email: "owner@demo.test", name: "Demo Platform Owner", role: "owner", department: "legal_affairs" },
];

const passwordHash = await bcrypt.hash("password123", 12);

await transaction(async (client) => {
  for (const account of accounts) {
    const existing = await client.query("select id from users where lower(username) = lower($1)", [account.username]);
    if (existing.rows[0]) {
      await client.query(`update users set email=$1,full_name=$2,password_hash=$3,role_id=$4,department_id=$5,status='Active' where id=$6`, [account.email, account.name, passwordHash, account.role, account.department, existing.rows[0].id]);
    } else {
      await client.query(`insert into users(username,email,full_name,password_hash,role_id,department_id,status) values($1,$2,$3,$4,$5,$6,'Active')`, [account.username, account.email, account.name, passwordHash, account.role, account.department]);
    }
  }
});

await pool.end();
console.log("Seeded six local demonstration accounts. Password: password123");
