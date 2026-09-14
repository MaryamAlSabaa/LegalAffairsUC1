import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { query, transaction } from "../db.js";
import { mapUser, requireAuth, requireRoles } from "../middleware/auth.js";
import { highestRiskLevel, reviewLegalDocument } from "../services/aiReviewService.js";
import { createNotifications, mapNotification, notifyRequestActivity } from "../services/notificationService.js";
import { canAccessRequest, getDocumentForUser, listRequestOverview, listRequests } from "../services/requestService.js";
import { createDocumentFileHandler, resolveDocumentStoragePath } from "../services/documentFileService.js";
import { getJobReviewOptions, reviewQueuedEvent } from "../services/reviewSetupService.js";
import { findRelatedCases } from "../services/relatedCaseService.js";

const router = Router();
const reviewableMimeTypes = ["application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedDocumentTypes = {
  ".pdf": { mimeType: "application/pdf", family: "pdf" },
  ".doc": { mimeType: "application/msword", family: "ole" },
  ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", family: "word-zip" },
  ".xls": { mimeType: "application/vnd.ms-excel", family: "ole" },
  ".xlsx": { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", family: "excel-zip" },
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    const isSupported = Boolean(supportedDocumentTypes[path.extname(file.originalname).toLowerCase()]);
    callback(isSupported ? null : Object.assign(new Error("Only PDF, Word (.doc/.docx), and Excel (.xls/.xlsx) documents are accepted."), { status: 400 }), isSupported);
  },
});

function assertSupportedDocument(file) {
  if (!file) throw Object.assign(new Error("A supporting document is required."), { status: 400 });
  const extension = path.extname(file.originalname).toLowerCase();
  const format = supportedDocumentTypes[extension];
  if (!format) throw Object.assign(new Error("Unsupported document type."), { status: 400 });

  const isPdf = file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const isOle = file.buffer.subarray(0, 8).equals(oleSignature);
  const isZip = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  const zipIndex = isZip ? file.buffer.toString("latin1") : "";
  const signatureMatches = format.family === "pdf"
    ? isPdf
    : format.family === "ole"
      ? isOle
      : format.family === "word-zip"
        ? isZip && zipIndex.includes("word/")
        : isZip && zipIndex.includes("xl/");

  if (!signatureMatches) {
    throw Object.assign(new Error(`The uploaded ${extension} file does not match its declared document format.`), { status: 400 });
  }
  return { ...format, extension, isReviewable: [".pdf", ".xls", ".xlsx"].includes(extension) };
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { throw Object.assign(new Error("The submitted request metadata is invalid."), { status: 400 }); }
}

function safeStoragePath(relativePath) {
  return resolveDocumentStoragePath(config.pdfStoragePath, relativePath);
}

async function saveDocument(requestId, file) {
  const format = assertSupportedDocument(file);
  const directory = path.join(config.pdfStoragePath, requestId);
  await fs.promises.mkdir(directory, { recursive: true });
  const relativePath = path.posix.join(requestId, `${crypto.randomUUID()}${format.extension}`);
  const absolutePath = safeStoragePath(relativePath);
  await fs.promises.writeFile(absolutePath, file.buffer, { flag: "wx" });
  return {
    relativePath,
    absolutePath,
    sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    mimeType: format.mimeType,
    isReviewable: format.isReviewable,
  };
}

async function removeStoredFiles(paths) {
  await Promise.all(paths.filter(Boolean).map(async (storedPath) => {
    try { await fs.promises.unlink(safeStoragePath(storedPath)); }
    catch (error) { if (error.code !== "ENOENT") console.error("Could not remove stored document", error); }
  }));
}

function statusForManagerDecision(decision) {
  if (decision === "Closed by Legal Manager") return "Closed";
  if (decision === "Response Approved by Legal Manager") return "Approved";
  if (decision === "Reviewer Assignment Started") return "Assigned to Legal Reviewer";
  return "Under Review";
}

function statusForDepartmentDecision(decision) {
  if (decision === "Department Approved") return "Sent for Internal Approval";
  if (decision === "Department Requested Revision") return "Returned for Revision";
  return "Under Review";
}

const managerDecisions = new Set([
  "Response Approved by Legal Manager",
  "Closed by Legal Manager",
  "Escalated by Legal Manager",
  "Reviewer Assignment Started",
]);
const departmentDecisions = new Set(["Department Approved", "Department Requested Revision"]);
const reviewAssignmentManagerEmail = "graham.cowan@ku.ac.ae";
const demoReviewAssignmentManagerEmail = "manager@demo.test";
const reviewAssignmentManagerEmails = [reviewAssignmentManagerEmail, demoReviewAssignmentManagerEmail];
const availableReviewerEmails = [
  "omar.elkayal@ku.ac.ae",
  "khalid.malali@ku.ac.ae",
  "antigoni.filippopoulou@ku.ac.ae",
  "mohamed.almaazmi@ku.ac.ae",
];

function requireReviewAssignmentManager(req, res, next) {
  if (req.user?.role !== "Legal Manager" || !reviewAssignmentManagerEmails.includes(req.user.email?.toLowerCase())) {
    return res.status(403).json({ error: "Only the designated Legal Manager can manage Legal Reviewer assignments." });
  }
  next();
}

router.use(requireAuth);

router.get("/health/private", (_req, res) => res.json({ ok: true }));

router.post("/activity", async (req, res, next) => {
  try {
    await query("update users set last_seen_at = now() where id = $1", [req.user.id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const result = await query(
      `select id,request_id,notification_type,title,message,is_read,created_at
       from notifications where recipient_id=$1
       order by created_at desc limit 100`,
      [req.user.id],
    );
    res.json(result.rows.map(mapNotification));
  } catch (error) { next(error); }
});

router.patch("/notifications/:notificationId/read", async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.notificationId)) return res.status(400).json({ error: "Invalid notification identifier." });
    const result = await query(
      "update notifications set is_read=true where id=$1 and recipient_id=$2 returning id",
      [req.params.notificationId, req.user.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Notification not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    await query("update notifications set is_read=true where recipient_id=$1 and is_read=false", [req.user.id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/users", async (req, res, next) => {
  try {
    if (!["Owner", "Admin User", "Legal Manager"].includes(req.user.role)) return res.json([]);
    const result = await query(
      `select u.id, u.username, u.full_name, u.email, u.prefix, u.status,
              r.name as role_name, d.name as department_name,
              (u.last_seen_at > now() - interval '2 minutes') as is_active
       from users u join roles r on r.id = u.role_id join departments d on d.id = u.department_id
       order by u.full_name`,
    );
    res.json(result.rows.map(mapUser));
  } catch (error) { next(error); }
});

router.patch("/users/:userId/role", requireRoles("Owner", "Admin User"), async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: "You cannot change your own role." });
    const target = await query(`select r.name as role_name from users u join roles r on r.id = u.role_id where u.id = $1`, [req.params.userId]);
    if (!target.rows[0]) return res.status(404).json({ error: "User not found." });
    if (req.user.role === "Admin User" && ["Admin User", "Owner"].includes(target.rows[0].role_name)) return res.status(403).json({ error: "Only an Owner can manage privileged accounts." });
    if (req.user.role === "Admin User" && req.body.roleName === "Owner") return res.status(403).json({ error: "Only an Owner can assign the Owner role." });
    const role = await query("select id from roles where name = $1", [req.body.roleName]);
    if (!role.rows[0]) return res.status(400).json({ error: "Unknown role." });
    await query(`update users set role_id = $1, department_id = case when $1 = 'department_approver' then department_id else 'legal_affairs' end where id = $2`, [role.rows[0].id, req.params.userId]);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.patch("/users/:userId/department", requireRoles("Owner", "Admin User"), async (req, res, next) => {
  try {
    const department = await query("select id from departments where name = $1", [req.body.departmentName]);
    if (!department.rows[0]) return res.status(400).json({ error: "Unknown department." });
    await query("update users set department_id = $1 where id = $2", [department.rows[0].id, req.params.userId]);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/audit", async (req, res, next) => {
  try {
    if (!["Owner", "Admin User"].includes(req.user.role)) return res.json([]);
    const result = await query("select id, request_id, action, actor_name, created_at from audit_logs order by created_at desc limit 1000");
    res.json(result.rows.map((row) => ({ id: row.id, requestId: row.request_id || "System", action: row.action, user: row.actor_name, time: new Date(row.created_at).toLocaleString("en-AE") })));
  } catch (error) { next(error); }
});

router.post("/audit", async (req, res, next) => {
  try {
    const requestId = req.body.requestId === "System" ? null : req.body.requestId || null;
    await query("insert into audit_logs (request_id, action, actor_id, actor_name, ip_address) values ($1, $2, $3, $4, $5)", [requestId, String(req.body.action || "Activity").slice(0, 1000), req.user.id, req.user.name, req.ip]);
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

router.get("/requests", async (req, res, next) => {
  try { res.json(await listRequests(req.user)); }
  catch (error) { next(error); }
});

router.get("/requests/overview", requireRoles("Legal Reviewer", "Legal Manager", "Owner"), async (req, res, next) => {
  try { res.json(await listRequestOverview(req.user)); }
  catch (error) { next(error); }
});

router.post("/requests", upload.single("attachment"), async (req, res, next) => {
  let savedFile;
  let committed = false;
  try {
    assertSupportedDocument(req.file);
    const data = parseJson(req.body.metadata);
    if (!String(data.title || "").trim() || !String(data.description || "").trim() || !String(data.partyName || "").trim()) return res.status(400).json({ error: "Title, party name, and description are required." });
    if (!['Low', 'Medium', 'High', 'Urgent'].includes(data.priority)) return res.status(400).json({ error: "Invalid priority." });

    const sequence = await query("select nextval('legal_request_number_seq') as number");
    const requestId = `LA-${new Date().getFullYear()}-${String(sequence.rows[0].number).padStart(5, "0")}`;
    savedFile = await saveDocument(requestId, req.file);

    await transaction(async (client) => {
      // A PostgreSQL transaction uses one client connection, so issue its
      // queries sequentially instead of overlapping operations on that client.
      const department = await client.query("select id from departments where name = $1", [data.department]);
      const category = await client.query("select code from legal_categories where code = $1", [data.categoryCode]);
      const manager = await client.query(`select u.id from users u join roles r on r.id = u.role_id where r.id = 'legal_manager' and lower(u.email) = $1 and u.status = 'Active' limit 1`, [reviewAssignmentManagerEmail]);
      const approver = await client.query(`select u.id from users u join roles r on r.id = u.role_id join departments d on d.id = u.department_id where r.id = 'department_approver' and d.name = $1 and u.status = 'Active' order by u.last_seen_at desc nulls last limit 1`, [data.department]);
      if (!department.rows[0] || !category.rows[0]) throw Object.assign(new Error("Department or legal category was not found."), { status: 400 });

      const initialStatus = savedFile.isReviewable ? "AI Review Pending" : "New";
      const initialSummary = savedFile.isReviewable
        ? data.aiSummary || "AI legal review is pending."
        : "Word document secured for manual Legal Affairs review. AI analysis supports PDF and Excel attachments.";

      await client.query(
        `insert into legal_requests (id, title, description, party_name, end_user_name, requester_id, department_id, category_code, assigned_manager_id, assigned_department_approver_id, priority, risk_level, status, deadline, ai_summary)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [requestId, data.title.trim(), data.description.trim(), data.partyName.trim(), String(data.endUser || req.user.name).trim(), req.user.id, department.rows[0].id, data.categoryCode, manager.rows[0]?.id || null, approver.rows[0]?.id || null, data.priority, data.riskLevel || "Not Classified", initialStatus, data.deadline && data.deadline !== "No deadline selected" ? data.deadline : null, initialSummary],
      );
      const document = await client.query(
        `insert into request_documents (request_id, file_name, mime_type, storage_path, size_bytes, sha256) values ($1,$2,$3,$4,$5,$6) returning id`,
        [requestId, req.file.originalname.slice(0, 255), savedFile.mimeType, savedFile.relativePath, req.file.size, savedFile.sha256],
      );

      const checklist = data.documents?.[0]?.checklist || [];
      const criteria = await client.query("select id, criteria from legal_review_criteria");
      const criteriaMap = new Map(criteria.rows.map((item) => [item.criteria, item.id]));
      for (const item of checklist) {
        const criteriaId = criteriaMap.get(item.criteria);
        if (criteriaId) await client.query(`insert into request_checklist_items (request_id, document_id, criteria_id, page, checked, note) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, [requestId, document.rows[0].id, criteriaId, String(item.page || "N/A"), Boolean(item.checked), item.note || ""]);
      }
      if (savedFile.isReviewable) {
        await client.query(
          `insert into ai_review_jobs (request_id, document_id, queue_order, operational_trace) values ($1,$2,$3,$4::jsonb)`,
          [requestId, document.rows[0].id, Date.now(), JSON.stringify([{ at: new Date().toISOString(), step: "queued", message: "Request saved and document secured in the central repository." }])],
        );
      }
      await client.query(
        "insert into audit_logs (request_id, action, actor_id, actor_name, ip_address) values ($1,$2,$3,$4,$5)",
        [requestId, savedFile.isReviewable ? "Request submitted; document review queued" : "Request submitted; Office document secured for manual review", req.user.id, req.user.name, req.ip],
      );
      if (manager.rows[0]?.id) {
        await createNotifications(client, [{
          recipientId: manager.rows[0].id,
          requestId,
          type: "new_request",
          title: `New request awaiting assignment: ${requestId}`,
          message: `${req.user.name} submitted ${requestId}: ${data.title.trim()}.`,
        }]);
      }
    });

    committed = true;
    const created = (await listRequests(req.user)).find((request) => request.id === requestId);
    res.status(201).json(created);
  } catch (error) {
    if (savedFile && !committed) await removeStoredFiles([savedFile.relativePath]);
    next(error);
  }
});

router.patch("/requests/:requestId/documents", upload.array("files", 5), async (req, res, next) => {
  const savedFiles = [];
  let queuedDocumentCount = 0;
  let committed = false;
  try {
    if (req.user.role !== "Requester") return res.status(403).json({ error: "Only the requester can replace requested documents." });
    const ownership = await query("select * from legal_requests where id = $1 and requester_id = $2", [req.params.requestId, req.user.id]);
    if (!ownership.rows[0]) return res.status(404).json({ error: "Request not found." });
    if (ownership.rows[0].status !== "Waiting for More Information") return res.status(409).json({ error: "Documents can only be updated while more information is requested." });
    for (const file of req.files || []) {
      assertSupportedDocument(file);
      savedFiles.push({ file, ...(await saveDocument(req.params.requestId, file)) });
    }
    const metadata = parseJson(req.body.metadata, { removeDocumentIds: [] });
    const removeDocumentIds = Array.isArray(metadata.removeDocumentIds) ? metadata.removeDocumentIds : [];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (removeDocumentIds.some((id) => !uuidPattern.test(String(id)))) throw Object.assign(new Error("A document identifier is invalid."), { status: 400 });
    if (savedFiles.length === 0 && removeDocumentIds.length === 0) throw Object.assign(new Error("Choose at least one document change."), { status: 400 });
    const removedPaths = [];
    const newIds = await transaction(async (client) => {
      const previous = await client.query("select id from request_documents where request_id = $1 and is_current = true order by created_at desc limit 1", [req.params.requestId]);
      if (removeDocumentIds.length) {
        const removed = await client.query("delete from request_documents where request_id = $1 and id = any($2::uuid[]) returning storage_path", [req.params.requestId, removeDocumentIds]);
        removedPaths.push(...removed.rows.map((row) => row.storage_path));
      }
      if (savedFiles.length > 0) {
        await client.query("update request_documents set is_current = false where request_id = $1", [req.params.requestId]);
      }
      const ids = [];
      for (const saved of savedFiles) {
        const document = await client.query(
          `insert into request_documents (request_id,file_name,mime_type,storage_path,size_bytes,sha256,is_current)
           values ($1,$2,$3,$4,$5,$6,true) returning id`,
          [req.params.requestId, saved.file.originalname.slice(0,255), saved.mimeType, saved.relativePath, saved.file.size, saved.sha256],
        );
        ids.push(document.rows[0].id);
        if (saved.isReviewable) {
          queuedDocumentCount += 1;
          await client.query(
            `insert into ai_review_jobs (request_id,document_id,queue_order,operational_trace) values ($1,$2,$3,$4::jsonb)`,
            [req.params.requestId, document.rows[0].id, Date.now(), JSON.stringify([{ at: new Date().toISOString(), step: "queued", message: "Replacement document secured and queued." }])],
          );
        }
      }

      if (savedFiles.length === 0) {
        const remaining = await client.query("select id,mime_type from request_documents where request_id=$1 and is_current=true", [req.params.requestId]);
        if (remaining.rowCount === 0) throw Object.assign(new Error("At least one current document must remain attached."), { status: 400 });
        for (const document of remaining.rows.filter((item) => reviewableMimeTypes.includes(item.mime_type))) {
          queuedDocumentCount += 1;
          await client.query(
            `insert into ai_review_jobs(request_id,document_id,queue_order,operational_trace)
             values($1,$2,$3,$4::jsonb)
             on conflict(request_id,document_id) do update
             set status='queued',queue_order=excluded.queue_order,attempt_count=0,last_error=null,
                 started_at=null,completed_at=null,current_step='Requeued after document update',
                 operational_trace=ai_review_jobs.operational_trace || excluded.operational_trace`,
            [req.params.requestId, document.id, Date.now(), JSON.stringify([{ at: new Date().toISOString(), step: "queued", message: "Remaining document requeued after the document set changed." }])],
          );
        }
      }

      const previousId = previous.rows[0]?.id;
      const retainedPreviousId = previousId && !removeDocumentIds.includes(previousId) ? previousId : null;
      const hasQueuedDocument = queuedDocumentCount > 0;
      await client.query(
        `update legal_requests
         set previous_document_id=case when $1 then $2 else previous_document_id end,
              previous_ai_summary=ai_summary,previous_ai_review_result=ai_review_result,
              ai_summary=case when $3 then 'Updated document set queued for AI review.' else 'Office document set secured for manual Legal Affairs review.' end,
              ai_review_result=null,
              legal_department_status='O',end_user_status='O',
               status=case
                 when $3 then 'AI Review Pending'
                 when exists(select 1 from request_reviewer_assignments a where a.request_id=legal_requests.id) then 'Assigned to Legal Reviewer'
                 else 'New'
               end
         where id=$4`,
        [savedFiles.length > 0, retainedPreviousId, hasQueuedDocument, req.params.requestId],
      );
      await client.query("insert into audit_logs(request_id,action,actor_id,actor_name,ip_address) values($1,'Requester updated supporting documents',$2,$3,$4)", [req.params.requestId, req.user.id, req.user.name, req.ip]);
      await notifyRequestActivity(client, {
        requestId: req.params.requestId,
        actor: req.user,
        activity: "updated the supporting documents for",
        includeRequester: false,
        includeManager: true,
        includeAssignedReviewers: true,
        detectUnassignedReviewer: false,
      });
      return ids;
    });
    committed = true;
    await removeStoredFiles(removedPaths);
    res.json(newIds);
  } catch (error) {
    if (!committed) await removeStoredFiles(savedFiles.map((file) => file.relativePath));
    next(error);
  }
});

router.get("/documents/:documentId/file", createDocumentFileHandler({ getDocumentForUser, storageRoot: config.pdfStoragePath }));

router.post("/requests/:requestId/comments", async (req, res, next) => {
  try {
    if (!await canAccessRequest(req.user, req.params.requestId)) return res.status(404).json({ error: "Request not found." });
    const text = String(req.body.commentText || "").trim();
    if (!text) return res.status(400).json({ error: "Comment text is required." });
    await transaction(async (client) => {
      await client.query("insert into reviewer_comments(request_id,reviewer_id,comment_text) values($1,$2,$3)", [req.params.requestId, req.user.id, text]);
      await client.query("insert into audit_logs(request_id,action,actor_id,actor_name) values($1,$2,$3,$4)", [req.params.requestId, "Comment added", req.user.id, req.user.name]);
      await notifyRequestActivity(client, {
        requestId: req.params.requestId,
        actor: req.user,
        activity: "added a comment to",
      });
    });
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

router.put("/requests/:requestId/reviewers", requireReviewAssignmentManager, async (req, res, next) => {
  try {
    const submittedReviewerIds = Array.isArray(req.body?.reviewerIds) ? req.body.reviewerIds : [];
    const reviewerIds = [...new Set(submittedReviewerIds.map((value) => String(value || "").trim()).filter(Boolean))];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (reviewerIds.length === 0 || reviewerIds.length > availableReviewerEmails.length || reviewerIds.some((id) => !uuidPattern.test(id))) {
      return res.status(400).json({ error: "Select at least one available Legal Reviewer." });
    }

    const assignment = await transaction(async (client) => {
      const request = await client.query("select id from legal_requests where id=$1 for update", [req.params.requestId]);
      if (!request.rows[0]) throw Object.assign(new Error("Request not found."), { status: 404 });

      const reviewers = await client.query(
        `select u.id,u.full_name,u.username,u.email
         from users u join roles r on r.id=u.role_id
         where u.id=any($1::uuid[]) and r.id='legal_reviewer' and u.status='Active'
           and lower(u.email)=any($2::text[])
         order by u.full_name`,
        [reviewerIds, availableReviewerEmails],
      );
      if (reviewers.rowCount !== reviewerIds.length) {
        throw Object.assign(new Error("One or more selected users are not available Legal Reviewers."), { status: 400 });
      }

      await client.query(
        "delete from request_reviewer_assignments where request_id=$1 and not (reviewer_id=any($2::uuid[]))",
        [req.params.requestId, reviewerIds],
      );
      for (const reviewer of reviewers.rows) {
        await client.query(
          `insert into request_reviewer_assignments(request_id,reviewer_id,assigned_by)
           values($1,$2,$3) on conflict(request_id,reviewer_id) do nothing`,
          [req.params.requestId, reviewer.id, req.user.id],
        );
      }

      const updated = await client.query(
        `update legal_requests
         set assigned_reviewer_id=$1,assigned_manager_id=$2,
             manager_decision='Reviewer Assignment Updated',
             status=case when status in ('New','AI Review Complete','AI Review Failed') then 'Assigned to Legal Reviewer' else status end
         where id=$3 returning status,manager_decision`,
        [reviewers.rows[0].id, req.user.id, req.params.requestId],
      );
      const reviewerNames = reviewers.rows.map((reviewer) => reviewer.full_name).join(", ");
      await notifyRequestActivity(client, {
        requestId: req.params.requestId,
        actor: req.user,
        activity: `assigned ${reviewerNames} to`,
        detectUnassignedReviewer: false,
      });
      await createNotifications(client, reviewers.rows.map((reviewer) => ({
        recipientId: reviewer.id,
        requestId: req.params.requestId,
        type: "reviewer_assignment",
        title: `Request assigned to you: ${req.params.requestId}`,
        message: `${req.user.name} assigned you to request ${req.params.requestId}.`,
      })));
      return { reviewers: reviewers.rows, ...updated.rows[0] };
    });

    const assignedReviewers = assignment.reviewers.map((reviewer) => ({
      id: reviewer.id,
      name: reviewer.full_name,
      username: reviewer.username,
      email: reviewer.email,
    }));
    res.json({
      assignedReviewers,
      assignedReviewerIds: assignedReviewers.map((reviewer) => reviewer.id),
      assignedReviewer: assignedReviewers.map((reviewer) => reviewer.name).join(", "),
      assignedReviewerId: assignedReviewers[0].id,
      status: assignment.status,
      managerDecision: assignment.manager_decision,
    });
  } catch (error) { next(error); }
});

router.post("/requests/:requestId/route", requireRoles("Legal Reviewer", "Owner"), async (req, res, next) => {
  try {
    const destinations = { requester: "Waiting for More Information", legal_manager: "Sent for Internal Approval", department_approver: "Under Review" };
    const status = destinations[req.body.destination];
    if (!status) return res.status(400).json({ error: "Unknown routing destination." });
    const workflowRecipient = { requester: "Requester", legal_manager: "Legal Manager", department_approver: "Department Approver" }[req.body.destination];
    const workflowAction = `Sent request to ${workflowRecipient}: ${String(req.body.commentText || "")}`;
    await transaction(async (client) => {
      const result = await client.query("update legal_requests set status=$1,legal_department_status='O',end_user_status='O' where id=$2 returning id", [status, req.params.requestId]);
      if (!result.rows[0]) throw Object.assign(new Error("Request not found."), { status: 404 });
      await client.query("insert into reviewer_comments(request_id,reviewer_id,comment_text) values($1,$2,$3)", [req.params.requestId, req.user.id, String(req.body.commentText || "")]);
      await client.query("insert into audit_logs(request_id,action,actor_id,actor_name) values($1,$2,$3,$4)", [req.params.requestId, workflowAction, req.user.id, req.user.name]);
      const destinationLabel = {
        requester: "the requester",
        legal_manager: "Legal Manager review",
        department_approver: "Department Approver review",
      }[req.body.destination];
      await notifyRequestActivity(client, {
        requestId: req.params.requestId,
        actor: req.user,
        activity: `routed {request} to ${destinationLabel}`,
        includeManager: req.body.destination === "legal_manager",
        includeDepartmentApprover: req.body.destination === "department_approver",
      });
    });
    res.json({ status, workflowAction });
  } catch (error) { next(error); }
});

router.post("/requests/:requestId/manager-action", requireRoles("Legal Manager", "Owner"), async (req, res, next) => {
  try {
    const decision = String(req.body.decision || "");
    if (!managerDecisions.has(decision)) return res.status(400).json({ error: "Unknown manager decision." });
    const status = statusForManagerDecision(decision);
    await transaction(async (client) => {
      await client.query("insert into manager_actions(request_id,manager_id,action) values($1,$2,$3)", [req.params.requestId, req.user.id, decision]);
      const updated = await client.query(
        `update legal_requests
         set manager_decision=$1,status=$2,
             legal_department_status=case when $2 in ('Approved','Closed','Archived') then 'C' else 'O' end,
             end_user_status=case when $2 in ('Approved','Closed','Archived') then 'C' else 'O' end,
             completed_at=case when $2 in ('Approved','Closed','Archived') then coalesce(completed_at,now()) else completed_at end
         where id=$3 returning id`,
        [decision, status, req.params.requestId],
      );
      if (!updated.rows[0]) throw Object.assign(new Error("Request not found."), { status: 404 });
      await client.query("insert into audit_logs(request_id,action,actor_id,actor_name) values($1,$2,$3,$4)", [req.params.requestId, decision, req.user.id, req.user.name]);
      const managerActivity = {
        "Response Approved by Legal Manager": "approved the legal response and completed",
        "Closed by Legal Manager": "closed",
        "Escalated by Legal Manager": "flagged {request} for escalation",
        "Reviewer Assignment Started": "started reviewer assignment for",
      }[decision] || "updated";
      await notifyRequestActivity(client, {
        requestId: req.params.requestId,
        actor: req.user,
        activity: managerActivity,
        includeAssignedReviewers: true,
        detectUnassignedReviewer: false,
      });
    });
    res.json({ managerDecision: decision, status, workflowAction: decision });
  } catch (error) { next(error); }
});

router.post("/requests/:requestId/department-approval", requireRoles("Department Approver", "Owner"), async (req, res, next) => {
  try {
    const decision = String(req.body.decision || "");
    if (!departmentDecisions.has(decision)) return res.status(400).json({ error: "Unknown department decision." });
    const status = statusForDepartmentDecision(decision);
    const workflowAction = req.body.commentText ? `${decision}: ${String(req.body.commentText)}` : decision;
    await transaction(async (client) => {
      const updated = await client.query(
        `update legal_requests
         set department_decision=$1,status=$2,legal_department_status='O',end_user_status='O'
         where id=$3
           and ($4='Owner' or assigned_department_approver_id=$5 or department_id=$6)
         returning id`,
        [decision, status, req.params.requestId, req.user.role, req.user.id, req.user.departmentId],
      );
      if (!updated.rows[0]) throw Object.assign(new Error("Request not found or not assigned to your department."), { status: 403 });
      await client.query("insert into department_approvals(request_id,approver_id,decision,comment_text) values($1,$2,$3,$4)", [req.params.requestId, req.user.id, decision, String(req.body.commentText || "")]);
      await client.query("insert into audit_logs(request_id,action,actor_id,actor_name) values($1,$2,$3,$4)", [req.params.requestId, workflowAction, req.user.id, req.user.name]);
      await notifyRequestActivity(client, {
        requestId: req.params.requestId,
        actor: req.user,
        activity: decision === "Department Approved" ? "approved the department review for" : "requested revisions to",
        includeManager: true,
        includeAssignedReviewers: true,
        detectUnassignedReviewer: false,
      });
    });
    res.json({ departmentDecision: decision, status, workflowAction });
  } catch (error) { next(error); }
});

router.patch("/checklist/:itemId", requireRoles("Legal Reviewer", "Owner"), async (req, res, next) => {
  try {
    await transaction(async (client) => {
      const result = await client.query(
        `update request_checklist_items ci
         set checked=$1
         from legal_requests lr
         where ci.id=$2 and lr.id=ci.request_id
         returning ci.id,ci.request_id`,
        [Boolean(req.body.checked), req.params.itemId],
      );
      if (!result.rows[0]) throw Object.assign(new Error("Checklist item not found."), { status: 404 });
      await notifyRequestActivity(client, {
        requestId: result.rows[0].request_id,
        actor: req.user,
        activity: `${req.body.checked ? "selected" : "cleared"} a contract checklist item on`,
      });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/engine/state", requireRoles("Admin User", "Owner"), async (_req, res, next) => {
  try {
    const result = await query(`select c.is_running,c.updated_at,u.full_name from ai_engine_control c left join users u on u.id=c.updated_by where c.id='legal_affair_engine'`);
    const row = result.rows[0];
    res.json({ isRunning: row.is_running, updatedAt: new Date(row.updated_at).toLocaleString("en-AE"), updatedBy: row.full_name || "System" });
  } catch (error) { next(error); }
});

router.patch("/engine/state", requireRoles("Admin User", "Owner"), async (req, res, next) => {
  try {
    const result = await query(`update ai_engine_control set is_running=$1,updated_by=$2,updated_at=now() where id='legal_affair_engine' returning is_running,updated_at`, [Boolean(req.body.isRunning), req.user.id]);
    res.json({ isRunning: result.rows[0].is_running, updatedAt: new Date(result.rows[0].updated_at).toLocaleString("en-AE"), updatedBy: req.user.name });
  } catch (error) { next(error); }
});

router.get("/engine/events", requireRoles("Admin User", "Owner"), async (_req, res, next) => {
  try {
    const result = await query(`select e.*,u.full_name from ai_engine_events e left join users u on u.id=e.actor_id order by e.created_at desc limit 200`);
    res.json(result.rows.map((event) => ({ id: event.id, eventType: event.event_type, level: event.level, message: event.message, requestId: event.request_id, jobId: event.job_id, metadata: event.metadata || {}, actorName: event.full_name || "System", createdAt: event.created_at, displayTime: new Date(event.created_at).toLocaleString("en-AE") })));
  } catch (error) { next(error); }
});

router.post("/engine/events", requireRoles("Admin User", "Owner"), async (req, res, next) => {
  try {
    await query(`insert into ai_engine_events(event_type,level,message,request_id,job_id,actor_id,metadata) values($1,$2,$3,$4,$5,$6,$7::jsonb)`, [req.body.eventType, req.body.level || "info", req.body.message, req.body.requestId || null, req.body.jobId || null, req.user.id, JSON.stringify(req.body.metadata || {})]);
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

router.patch("/ai-jobs/:jobId/order", requireRoles("Admin User", "Owner"), async (req, res, next) => {
  try { await query(`update ai_review_jobs set queue_order=$1,current_step='Queue order adjusted by administrator' where id=$2 and status='queued'`, [Number(req.body.queueOrder), req.params.jobId]); res.status(204).end(); }
  catch (error) { next(error); }
});

router.post("/engine/rebuild", requireRoles("Admin User", "Owner"), async (_req, res, next) => {
  try {
    const result = await query(`insert into ai_review_jobs(request_id,document_id,queue_order) select d.request_id,d.id,(extract(epoch from now())*1000)::bigint+row_number() over() from request_documents d join legal_requests lr on lr.id=d.request_id left join ai_review_jobs j on j.document_id=d.id where d.is_current=true and d.mime_type in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and lr.ai_review_result is null and j.id is null on conflict do nothing returning id`);
    res.json({ count: result.rowCount });
  } catch (error) { next(error); }
});

router.put("/requests/:requestId/review-references", requireRoles("Legal Reviewer", "Legal Manager"), async (req, res, next) => {
  try {
    if (!await canAccessRequest(req.user, req.params.requestId)) return res.sendStatus(404);
    const references = req.body.references;
    if (!Array.isArray(references) || references.length > 5 || references.some(r =>
      !r || typeof r.title !== "string" || !r.title.trim() || r.title.length > 200 ||
      typeof r.text !== "string" || !r.text.trim() || r.text.length > 40000 || r.approved !== true)) {
      return res.status(400).json({ error: "Provide up to five approved templates, each with a title and at most 40,000 characters of reference text." });
    }
    const normalized = references.map(r => ({ id: crypto.randomUUID(), title: r.title.trim(), text: r.text.trim(), approved: true, approvedBy: req.user.id }));
    await query("update legal_requests set review_references=$1::jsonb where id=$2", [JSON.stringify(normalized), req.params.requestId]);
    res.json(normalized);
  } catch (error) { next(error); }
});

router.post("/requests/:requestId/publish-response", requireRoles("Legal Reviewer", "Legal Manager"), async (req, res, next) => {
  try {
    if (!await canAccessRequest(req.user, req.params.requestId)) return res.sendStatus(404);
    const response = req.body.response;
    if (req.body.confirmed !== true || typeof response !== "string" || !response.trim() || response.length > 20000) {
      return res.status(400).json({ error: "Review and confirm a response of 1 to 20,000 characters before sharing." });
    }
    const publication = await transaction(async client => {
      const record = await client.query("select requester_id from legal_requests where id=$1 for update", [req.params.requestId]);
      const saved = await client.query("insert into legal_response_publications(request_id,response_text,published_by) values($1,$2,$3) returning id,published_at", [req.params.requestId,response.trim(),req.user.id]);
      const shared = { id: saved.rows[0].id, text: response.trim(), publishedBy: req.user.name, publishedAt: saved.rows[0].published_at };
      await client.query("update legal_requests set shared_response=$1::jsonb where id=$2", [JSON.stringify(shared),req.params.requestId]);
      await client.query("insert into audit_logs(request_id,action,actor_id,actor_name) values($1,$2,$3,$4)", [req.params.requestId,"Legal response reviewed and shared with requester",req.user.id,req.user.name]);
      await createNotifications(client, [{ recipientId: record.rows[0].requester_id, requestId: req.params.requestId, title: "Legal response available", message: "Legal Affairs has reviewed and shared a response to your request." }]);
      return shared;
    });
    res.json(publication);
  } catch (error) { next(error); }
});

router.post("/requests/:requestId/queue-review", requireRoles("Legal Reviewer", "Legal Manager"), async (req,res,next) => {
  try {
    const documentId = req.body?.documentId ?? null;
    if (documentId !== null && (typeof documentId !== "string" || !documentIdPattern.test(documentId))) return res.status(400).json({error:"Invalid document identifier."});
    const useApprovedTemplates = req.body?.useApprovedTemplates ?? false;
    if (typeof useApprovedTemplates !== "boolean") return res.status(400).json({error:"Template comparison must be enabled or disabled."});
    if (!await canAccessRequest(req.user,req.params.requestId)) return res.sendStatus(404);
    if (config.useMockAiReview || !config.gemini.apiKey) return res.status(503).json({error:"Actual AI analysis is not configured. Configure GEMINI_API_KEY and set USE_MOCK_AI_REVIEW=false on the server."});
    if (useApprovedTemplates) {
      const source = await query("select review_references from legal_requests where id=$1", [req.params.requestId]);
      if (!source.rows[0]?.review_references?.some(reference => reference.approved === true && reference.title?.trim() && reference.text?.trim())) {
        return res.status(400).json({error:"Add an approved template for comparison, or run without templates."});
      }
    }
    const result = await query(`insert into ai_review_jobs(request_id,document_id,queue_order,operational_trace)
      select request_id,id,(extract(epoch from now())*1000)::bigint,$3::jsonb from request_documents
      where request_id=$1 and is_current=true and mime_type in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        and ($2::uuid is null or id=$2)
      on conflict(request_id,document_id) do update set status='queued',last_error=null,completed_at=null,
        operational_trace=ai_review_jobs.operational_trace || excluded.operational_trace
      where ai_review_jobs.status <> 'processing' returning id`, [req.params.requestId, documentId, JSON.stringify([reviewQueuedEvent(useApprovedTemplates)])]);
    if (!result.rowCount) return res.status(409).json({error:"Choose a current PDF or Excel attachment, or wait for its review to finish."});
    res.json({queued:result.rowCount});
  } catch(error) {next(error);}
});

router.post("/ai/process-next", requireRoles("Admin User", "Owner", "Requester", "Legal Reviewer", "Legal Manager"), async (req, res, next) => {
  let claimedJob = null;
  try {
    const documentId = req.body?.documentId ?? null;
    if (documentId !== null && (typeof documentId !== "string" || !documentIdPattern.test(documentId) || !req.body?.requestId)) return res.status(400).json({error:"A valid document and request are required."});
    claimedJob = await transaction(async (client) => {
      const engine = await client.query(`select is_running from ai_engine_control where id='legal_affair_engine'`);
      if (!engine.rows[0]?.is_running) return null;
      const job = await client.query(
        `select j.*,d.storage_path,d.file_name,d.mime_type
         from ai_review_jobs j
         join legal_requests lr on lr.id=j.request_id
         join request_documents d on d.id=j.document_id
         where j.status='queued' and d.is_current=true and d.mime_type in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and ($1<>'Requester' or lr.requester_id=$2) and ($3::text is null or j.request_id=$3)
           and ($4::uuid is null or j.document_id=$4)
         order by case lr.priority when 'Urgent' then 1 when 'High' then 2 when 'Medium' then 3 else 4 end,j.queue_order
         for update skip locked limit 1`,
        [req.user.role, req.user.id, req.body.requestId || null, documentId],
      );
      if (!job.rows[0]) return null;
      await client.query(
        `update ai_review_jobs
         set status='processing',attempt_count=attempt_count+1,started_at=now(),locked_at=now(),completed_at=null,
             current_step='Preparing isolated document review',
             operational_trace=operational_trace || $1::jsonb
         where id=$2`,
        [JSON.stringify([{ at: new Date().toISOString(), step: "processing", message: "The server claimed this document for an isolated draft review." }]), job.rows[0].id],
      );
      return job.rows[0];
    });

    if (!claimedJob) return res.json({ processed: false, message: "No queued AI review jobs are available or the engine is stopped." });

    const criteriaResult = await query("select id,criteria from legal_review_criteria order by sort_order");
    const criteria = criteriaResult.rows.map((item) => item.criteria);
    const context = await query("select title,description,category_code,review_references from legal_requests where id=$1", [claimedJob.request_id]);
    const categories = await query("select code,name from legal_categories order by code");
    const reviewOptions = getJobReviewOptions(claimedJob);
    let pastCaseLookupStatus = "available";
    const pastCases = await findRelatedCases({ requestId: claimedJob.request_id, categoryCode: context.rows[0].category_code,
      title: context.rows[0].title, description: context.rows[0].description }).catch(() => {
      pastCaseLookupStatus = "unavailable";
      return [];
    });
    claimedJob.reviewContext = { title: context.rows[0].title, description: context.rows[0].description,
      submittedCategory: context.rows[0].category_code, categories: categories.rows,
      approvedTemplates: reviewOptions.useApprovedTemplates ? context.rows[0].review_references || [] : [],
      pastCases, pastCaseLookupStatus };
    const review = await reviewLegalDocument(claimedJob, criteria, safeStoragePath(claimedJob.storage_path));
    const criteriaByName = new Map(criteriaResult.rows.map((item) => [item.criteria.toLowerCase(), item.id]));

    await transaction(async (client) => {
      for (const criterion of criteria) {
        const aiItem = review.review_checklist.find((item) => String(item?.criteria || "").toLowerCase() === criterion.toLowerCase());
        await client.query(
          `insert into request_checklist_items(request_id,document_id,criteria_id,page,checked,note)
           values($1,$2,$3,$4,$5,$6)
           on conflict(request_id,document_id,criteria_id) do update
           set page=excluded.page,checked=excluded.checked,note=excluded.note`,
          [claimedJob.request_id, claimedJob.document_id, criteriaByName.get(criterion.toLowerCase()), String(aiItem?.page || "N/A").slice(0, 50), Boolean(aiItem?.checked), String(aiItem?.note || "AI did not confirm this criterion. A Legal Reviewer must review it manually.").slice(0, 4000)],
        );
      }

      await client.query("update request_documents set ai_review_result=$1::jsonb where id=$2", [JSON.stringify(review), claimedJob.document_id]);
      await client.query("delete from document_ai_suggestions where document_id=$1", [claimedJob.document_id]);
      const suggestions = [
        ...review.risk_highlights.map((item) => ({ page: item?.page, type: `Risk: ${item?.risk_level || "review"}`, text: `${item?.term || "Term"}: ${item?.reason || "Review required"}` })),
        ...review.missing_or_unusual_clauses.map((item) => ({ page: item?.page, type: `${item?.issue_type || "Review"} clause`, text: `${item?.clause_title || "Clause"}: ${item?.explanation || "Review required"}` })),
      ].slice(0, 200);
      for (const suggestion of suggestions) {
        await client.query(
          "insert into document_ai_suggestions(document_id,page,suggestion_type,suggestion_text) values($1,$2,$3,$4)",
          [claimedJob.document_id, String(suggestion.page || "N/A").slice(0, 50), String(suggestion.type).slice(0, 200), String(suggestion.text).slice(0, 4000)],
        );
      }

      await client.query(
        `update legal_requests
         set status=case
               when status not in ('New','AI Review Pending','AI Review Failed','AI Review Complete','Assigned to Legal Reviewer') then status
               when exists(select 1 from request_reviewer_assignments a where a.request_id=legal_requests.id) then 'Assigned to Legal Reviewer'
               else 'AI Review Complete'
             end,
             risk_level=$1,ai_summary=$2,ai_review_result=$3::jsonb
         where id=$4`,
        [highestRiskLevel(review), review.draft_review_note, JSON.stringify(review), claimedJob.request_id],
      );
      await client.query(
        `update ai_review_jobs
         set status='completed',completed_at=now(),locked_at=null,current_step='Draft review completed',
             operational_trace=operational_trace || $1::jsonb
         where id=$2`,
        [JSON.stringify([{ at: new Date().toISOString(), step: "completed", message: `${review.ai_mode} draft review saved; human assessment is required.` }]), claimedJob.id],
      );
      await client.query(
        `insert into ai_engine_events(event_type,level,message,request_id,job_id,metadata)
         values('job_processing_completed','status','AI draft review completed; human review required.',$1,$2,$3::jsonb)`,
        [claimedJob.request_id, claimedJob.id, JSON.stringify({ aiMode: review.ai_mode })],
      );
      await notifyRequestActivity(client, {
        requestId: claimedJob.request_id,
        actor: { name: "Legal AI Engine", role: "System" },
        activity: "completed the initial document review for",
        detectUnassignedReviewer: false,
      });
    });

    res.json({ processed: true, requestId: claimedJob.request_id, jobId: claimedJob.id, aiMode: review.ai_mode });
  } catch (error) {
    if (claimedJob) {
      const message = error instanceof Error ? error.message : String(error);
      await transaction(async (client) => {
        await client.query(
          `update ai_review_jobs
           set status='failed',last_error=$1,completed_at=now(),locked_at=null,current_step='Draft review failed',
               operational_trace=operational_trace || $2::jsonb
           where id=$3`,
          [message.slice(0, 4000), JSON.stringify([{ at: new Date().toISOString(), step: "failed", message: message.slice(0, 1000) }]), claimedJob.id],
        );
        await client.query("update legal_requests set status='AI Review Failed' where id=$1 and status in ('New','AI Review Pending','AI Review Failed','AI Review Complete','Assigned to Legal Reviewer')", [claimedJob.request_id]);
        await client.query(
          `insert into ai_engine_events(event_type,level,message,request_id,job_id,metadata)
           values('job_processing_failed','error',$1,$2,$3,'{}')`,
          [message.slice(0, 1000), claimedJob.request_id, claimedJob.id],
        );
        await notifyRequestActivity(client, {
          requestId: claimedJob.request_id,
          actor: { name: "Legal AI Engine", role: "System" },
          activity: "reported a document-review issue for",
          detectUnassignedReviewer: false,
        });
      }).catch(() => {});
    }
    next(error);
  }
});

router.post("/owner/reset-ai", requireRoles("Owner"), async (_req, res, next) => {
  try {
    const result = await transaction(async (client) => {
      const updated = await client.query(`update legal_requests set ai_summary='AI legal review is pending.',ai_review_result=null,status='AI Review Pending',legal_department_status='O',end_user_status='O' where id in(select request_id from request_documents where is_current=true and mime_type in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) returning id`);
      await client.query(`update ai_review_jobs set status='queued',attempt_count=0,last_error=null,started_at=null,completed_at=null,current_step='Reset by Owner',operational_trace=operational_trace || $1::jsonb where document_id in(select id from request_documents where is_current=true and mime_type in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))`, [JSON.stringify([reviewQueuedEvent()])]);
      return updated.rowCount;
    });
    res.json({ count: result });
  } catch (error) { next(error); }
});

router.delete("/owner/closed", requireRoles("Owner"), async (_req, res, next) => {
  try {
    const documents = await query(`select d.storage_path from request_documents d join legal_requests lr on lr.id=d.request_id where lr.status='Closed'`);
    const deleted = await query(`delete from legal_requests where status='Closed' returning id`);
    await removeStoredFiles(documents.rows.map((row) => row.storage_path));
    res.json({ count: deleted.rowCount });
  } catch (error) { next(error); }
});

router.delete("/requests/:requestId", requireRoles("Owner"), async (req, res, next) => {
  try {
    const documents = await query("select storage_path from request_documents where request_id=$1", [req.params.requestId]);
    const deleted = await query("delete from legal_requests where id=$1 returning id", [req.params.requestId]);
    if (!deleted.rows[0]) return res.status(404).json({ error: "Request not found." });
    await removeStoredFiles(documents.rows.map((row) => row.storage_path));
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
