import bcrypt from "bcryptjs";
import { pool, transaction } from "../db.js";

const demoRequestPrefix = "DEMO-LA-";
const assignmentManagerEmail = "graham.cowan@ku.ac.ae";

const demoRequesters = [
  { username: "dummy.aisha", email: "dummy.aisha@demo.test", name: "Aisha Mohamed", department: "hr" },
  { username: "dummy.sara", email: "dummy.sara@demo.test", name: "Sara Nasser", department: "research_office" },
  { username: "dummy.fatima", email: "dummy.fatima@demo.test", name: "Fatima Salem", department: "procurement" },
  { username: "dummy.hassan", email: "dummy.hassan@demo.test", name: "Hassan Ali", department: "finance" },
  { username: "dummy.mariam", email: "dummy.mariam@demo.test", name: "Mariam Ibrahim", department: "academic_affairs" },
];

function dateFromToday(dayOffset) {
  if (dayOffset === null) return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function timestampFromToday(dayOffset, hour) {
  const date = new Date();
  date.setHours(hour, 15, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

const requests = [
  { id: "DEMO-LA-001", title: "Employment policy amendment review", description: "Review proposed amendments to the staff remote-working policy before executive circulation.", party: "Workplace Solutions LLC", endUser: "Aisha Mohamed", requester: "dummy.aisha", department: "hr", category: "LEG-A", priority: "High", risk: "Medium", status: "Under Review", deadline: 2, submitted: -9, hour: 9, reviewers: ["omar.elkayal@ku.ac.ae"] },
  { id: "DEMO-LA-002", title: "Research collaboration agreement", description: "Review a collaboration agreement with an international research institution.", party: "Global Research Institute", endUser: "Sara Nasser", requester: "dummy.sara", department: "research_office", category: "LEG-C", priority: "Urgent", risk: "High", status: "Assigned to Legal Reviewer", deadline: 4, submitted: -8, hour: 11, reviewers: ["khalid.malali@ku.ac.ae"] },
  { id: "DEMO-LA-003", title: "Data sharing terms for joint study", description: "Confirm confidentiality, publication, intellectual property, and data protection clauses.", party: "Genomics Research Consortium", endUser: "Sara Nasser", requester: "dummy.sara", department: "research_office", category: "LEG-C", priority: "High", risk: "High", status: "Under Review", deadline: -2, submitted: -7, hour: 14, reviewers: ["antigoni.filippopoulou@ku.ac.ae", "mohamed.almaazmi@ku.ac.ae"] },
  { id: "DEMO-LA-004", title: "Supplier framework contract", description: "Initial intake for a new university-wide supplier framework contract.", party: "Emirates Supply Partners", endUser: "Fatima Salem", requester: "dummy.fatima", department: "procurement", category: "LEG-B", priority: "Medium", risk: "Not Classified", status: "New", deadline: 14, submitted: -6, hour: 10, reviewers: [] },
  { id: "DEMO-LA-005", title: "Software licensing renewal", description: "Review renewal, liability, service-level, and data-hosting provisions.", party: "Enterprise Software Middle East", endUser: "Hassan Ali", requester: "dummy.hassan", department: "finance", category: "LEG-B", priority: "High", risk: "Medium", status: "Waiting for More Information", deadline: 6, submitted: -5, hour: 13, reviewers: ["omar.elkayal@ku.ac.ae", "khalid.malali@ku.ac.ae"] },
  { id: "DEMO-LA-006", title: "Student sponsorship undertaking", description: "Review the proposed sponsorship undertaking and repayment obligations.", party: "National Scholarship Foundation", endUser: "Mariam Ibrahim", requester: "dummy.mariam", department: "student_affairs", category: "LEG-D", priority: "Medium", risk: "Low", status: "Sent for Internal Approval", deadline: 1, submitted: -4, hour: 15, reviewers: ["mohamed.almaazmi@ku.ac.ae"] },
  { id: "DEMO-LA-007", title: "Committee terms of reference", description: "Confirm authority, membership, quorum, and reporting requirements.", party: "Academic Governance Committee", endUser: "Mariam Ibrahim", requester: "dummy.mariam", department: "academic_affairs", category: "LEG-F", priority: "Low", risk: "Low", status: "Closed", deadline: null, submitted: -12, hour: 9, reviewers: ["antigoni.filippopoulou@ku.ac.ae"] },
  { id: "DEMO-LA-008", title: "Consultancy statement of work", description: "Final legal review of scope, deliverables, payment milestones, and termination rights.", party: "Strategic Advisory LLC", endUser: "Fatima Salem", requester: "dummy.fatima", department: "procurement", category: "LEG-B", priority: "Medium", risk: "Medium", status: "Approved", deadline: -5, submitted: -11, hour: 12, reviewers: ["khalid.malali@ku.ac.ae"] },
  { id: "DEMO-LA-009", title: "Finance delegation clarification", description: "Provide a legal opinion on approval authority under the revised finance delegation matrix.", party: "Finance Governance Committee", endUser: "Hassan Ali", requester: "dummy.hassan", department: "finance", category: "LEG-A", priority: "Low", risk: "Low", status: "Returned for Revision", deadline: 21, submitted: -3, hour: 10, reviewers: ["omar.elkayal@ku.ac.ae"] },
  { id: "DEMO-LA-010", title: "Visiting scholar memorandum", description: "New request to review the standard memorandum for visiting scholars.", party: "Visiting Scholars Institute", endUser: "Mariam Ibrahim", requester: "dummy.mariam", department: "academic_affairs", category: "LEG-C", priority: "Medium", risk: "Not Classified", status: "AI Review Complete", deadline: 3, submitted: -1, hour: 16, reviewers: [] },
];

const passwordHash = await bcrypt.hash("password123", 12);

function trackerAction(request, reviewerNames) {
  if (request.status === "New") return "Request received; reviewer assignment pending";
  if (request.status === "Assigned to Legal Reviewer") return `Assigned to ${reviewerNames.join(", ")}`;
  if (request.status === "Under Review") return "Legal review and follow-up in progress";
  if (request.status === "Waiting for More Information") return "Returned to requester for supporting information";
  if (request.status === "Sent for Internal Approval") return "Sent to the Legal Manager for internal approval";
  if (request.status === "Returned for Revision") return "Revision requested following legal review";
  if (request.status === "Approved") return "Legal Manager approved the response";
  if (request.status === "Closed") return "Matter completed and closed";
  return "AI draft review completed; human review pending";
}

await transaction(async (client) => {
  for (const account of demoRequesters) {
    const existing = await client.query("select id from users where lower(username)=lower($1) or lower(email)=lower($2)", [account.username, account.email]);
    if (existing.rows[0]) {
      await client.query(
        `update users set username=$1,email=$2,full_name=$3,password_hash=$4,role_id='requester',department_id=$5,status='Active' where id=$6`,
        [account.username, account.email, account.name, passwordHash, account.department, existing.rows[0].id],
      );
    } else {
      await client.query(
        `insert into users(username,email,full_name,password_hash,role_id,department_id,status)
         values($1,$2,$3,$4,'requester',$5,'Active')`,
        [account.username, account.email, account.name, passwordHash, account.department],
      );
    }
  }

  await client.query("delete from audit_logs where request_id like $1", [`${demoRequestPrefix}%`]);
  await client.query("delete from legal_requests where id like $1", [`${demoRequestPrefix}%`]);

  const people = await client.query(
    `select id,username,full_name,lower(email) as email from users
     where username like 'dummy.%' or lower(email)=any($1::text[])`,
    [[assignmentManagerEmail, "omar.elkayal@ku.ac.ae", "khalid.malali@ku.ac.ae", "antigoni.filippopoulou@ku.ac.ae", "mohamed.almaazmi@ku.ac.ae"]],
  );
  const requesterByUsername = new Map(people.rows.map((person) => [person.username, person.id]));
  const userByEmail = new Map(people.rows.map((person) => [person.email, person.id]));
  const managerId = userByEmail.get(assignmentManagerEmail);
  if (!managerId) throw new Error("Seed the KU review team before adding demonstration requests.");

  for (const request of requests) {
    const reviewerIds = request.reviewers.map((email) => userByEmail.get(email)).filter(Boolean);
    const isCompleted = ["Approved", "Closed", "Archived"].includes(request.status);
    const completedAt = isCompleted ? timestampFromToday(request.submitted + 5, 16) : null;
    await client.query(
      `insert into legal_requests(
         id,title,description,party_name,end_user_name,requester_id,department_id,category_code,
         assigned_reviewer_id,assigned_manager_id,priority,risk_level,status,
         deadline,submitted_at,manager_decision,department_decision,ai_summary,
         legal_department_status,end_user_status,completed_at,anasign_signature
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        request.id,
        request.title,
        request.description,
        request.party,
        request.endUser,
        requesterByUsername.get(request.requester),
        request.department,
        request.category,
        reviewerIds[0] || null,
        managerId,
        request.priority,
        request.risk,
        request.status,
        dateFromToday(request.deadline),
        timestampFromToday(request.submitted, request.hour),
        reviewerIds.length ? "Reviewer Assignment Updated" : "Pending Legal Manager Review",
        "Pending Department Review",
        "Demonstration request: AI findings are intentionally omitted.",
        isCompleted ? "C" : "O",
        isCompleted ? "C" : "O",
        completedAt,
        isCompleted ? `AnaSign demo signature — ${request.id}` : null,
      ],
    );

    for (const reviewerId of reviewerIds) {
      await client.query(
        "insert into request_reviewer_assignments(request_id,reviewer_id,assigned_by) values($1,$2,$3)",
        [request.id, reviewerId, managerId],
      );
    }

    const actorId = reviewerIds[0] || managerId;
    const actor = people.rows.find((person) => person.id === actorId);
    const reviewerNames = reviewerIds.map((reviewerId) => people.rows.find((person) => person.id === reviewerId)?.full_name).filter(Boolean);
    const action = trackerAction(request, reviewerNames);
    const actionAt = completedAt || timestampFromToday(request.submitted + 1, 14);
    await client.query(
      "insert into reviewer_comments(request_id,reviewer_id,comment_text,created_at) values($1,$2,$3,$4)",
      [request.id, actorId, `Demo tracker note: ${action}.`, actionAt],
    );
    await client.query(
      "insert into audit_logs(request_id,action,actor_id,actor_name,created_at) values($1,$2,$3,$4,$5)",
      [request.id, action, actorId, actor?.full_name || "Legal Affairs", actionAt],
    );
    await client.query(
      `insert into notifications(recipient_id,request_id,notification_type,title,message,created_at)
       values($1,$2,'request_activity',$3,$4,$5)`,
      [
        requesterByUsername.get(request.requester),
        request.id,
        `Update on ${request.id}`,
        `${actor?.full_name || "Legal Affairs"} ${action.toLowerCase()} on ${request.id}: ${request.title}.`,
        actionAt,
      ],
    );
    for (const reviewerId of reviewerIds) {
      await client.query(
        `insert into notifications(recipient_id,request_id,notification_type,title,message,created_at)
         values($1,$2,'reviewer_assignment',$3,$4,$5)`,
        [reviewerId, request.id, `Assigned request: ${request.id}`, `Graham Cowan assigned you to ${request.id}: ${request.title}.`, timestampFromToday(request.submitted, request.hour + 1)],
      );
    }
    if (reviewerIds.length === 0) {
      await client.query(
        `insert into notifications(recipient_id,request_id,notification_type,title,message,created_at)
         values($1,$2,'new_request',$3,$4,$5)`,
        [managerId, request.id, `Request awaiting assignment: ${request.id}`, `${request.id}: ${request.title} still needs a reviewer assignment.`, actionAt],
      );
    }
  }
});

await pool.end();
console.log(`Seeded ${requests.length} removable demonstration requests and ${demoRequesters.length} dummy requester accounts.`);
