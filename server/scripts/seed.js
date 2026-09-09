import bcrypt from "bcryptjs";
import { pool, transaction } from "../db.js";

const accounts = [
  { username: "requester", email: "requester@demo.test", name: "Demo Requester", role: "requester", department: "hr" },
  { username: "reviewer", email: "reviewer@demo.test", name: "Demo Legal Reviewer", role: "legal_reviewer", department: "legal_affairs" },
  { username: "manager", email: "manager@demo.test", name: "Demo Legal Manager", role: "legal_manager", department: "legal_affairs" },
  { username: "approver", email: "approver@demo.test", name: "Demo Department Approver", role: "department_approver", department: "hr" },
  { username: "admin", email: "admin@demo.test", name: "Demo Administrator", role: "admin_user", department: "it" },
  { username: "owner", email: "owner@demo.test", name: "Demo Platform Owner", role: "owner", department: "legal_affairs" },
  { username: "omar.elkayal", email: "omar.elkayal@ku.ac.ae", name: "Omar Elkayal", role: "legal_reviewer", department: "legal_affairs" },
  { username: "khalid.malali", email: "khalid.malali@ku.ac.ae", name: "Khalid Malali", role: "legal_reviewer", department: "legal_affairs" },
  { username: "graham.cowan", email: "graham.cowan@ku.ac.ae", name: "Graham Cowan", role: "legal_manager", department: "legal_affairs" },
  { username: "antigoni.filippopoulou", email: "antigoni.filippopoulou@ku.ac.ae", name: "Antigoni Filippopoulou", role: "legal_reviewer", department: "legal_affairs" },
  { username: "mohamed.almaazmi", email: "mohamed.almaazmi@ku.ac.ae", name: "Mohamed Almaazmi", role: "legal_reviewer", department: "legal_affairs" },
];

const passwordHash = await bcrypt.hash("password123", 12);

await transaction(async (client) => {
  for (const account of accounts) {
    const existing = await client.query("select id from users where lower(username) = lower($1) or lower(email) = lower($2)", [account.username, account.email]);
    if (existing.rows[0]) {
      await client.query(`update users set username=$1,email=$2,full_name=$3,password_hash=$4,role_id=$5,department_id=$6,status='Active' where id=$7`, [account.username, account.email, account.name, passwordHash, account.role, account.department, existing.rows[0].id]);
    } else {
      await client.query(`insert into users(username,email,full_name,password_hash,role_id,department_id,status) values($1,$2,$3,$4,$5,$6,'Active')`, [account.username, account.email, account.name, passwordHash, account.role, account.department]);
    }
  }

  const assignmentManager = await client.query("select id from users where lower(email)='graham.cowan@ku.ac.ae'");
  if (assignmentManager.rows[0]) {
    await client.query("update legal_requests set assigned_manager_id=$1", [assignmentManager.rows[0].id]);
  }
});

await pool.end();
console.log(`Seeded ${accounts.length} local demonstration accounts. Password: password123`);
