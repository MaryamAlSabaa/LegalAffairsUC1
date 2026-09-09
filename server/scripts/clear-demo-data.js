import { pool, transaction } from "../db.js";

const removed = await transaction(async (client) => {
  const auditLogs = await client.query("delete from audit_logs where request_id like 'DEMO-LA-%' returning id");
  const requests = await client.query("delete from legal_requests where id like 'DEMO-LA-%' returning id");
  const users = await client.query("delete from users where username like 'dummy.%' returning id");
  return { requests: requests.rowCount, users: users.rowCount, auditLogs: auditLogs.rowCount };
});

await pool.end();
console.log(`Removed ${removed.requests} demonstration requests, ${removed.users} dummy requester accounts, and ${removed.auditLogs} demo audit entries.`);
