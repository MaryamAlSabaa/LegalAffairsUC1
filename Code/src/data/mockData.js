// This file keeps shared demo constants and legacy sample records.
// The main app now loads requests, users, audit logs, PDFs, and workflow changes from the KU API.

export const roles = [
  "Requester",
  "Legal Reviewer",
  "Legal Manager",
  "Department Approver",
  "Admin User",
  "Owner",
];

export const departments = [
  "HR",
  "Procurement",
  "Research Office",
  "Student Affairs",
  "Finance",
  "Legal Affairs",
  "Academic Affairs",
  "IT",
];

export const legalCategories = [
  { code: "LEG-A", name: "Legal Advice / Opinion" },
  { code: "LEG-B", name: "Contract Review" },
  { code: "LEG-C", name: "Research Agreements" },
  { code: "LEG-D", name: "Student Agreements" },
  { code: "LEG-E", name: "Committee / Investigation / Disciplinary Matters" },
  { code: "LEG-F", name: "Administrative Legal Work" },
  { code: "LEG-G", name: "Legal Operations / Reporting" },
];

export const requestStatuses = [
  "New",
  "Under Review",
  "Waiting for More Information",
  "Assigned to Legal Reviewer",
  "Draft Response Prepared",
  "Sent for Internal Approval",
  "Returned for Revision",
  "Approved",
  "Closed",
  "Archived",
];

export const priorityLevels = ["Low", "Medium", "High", "Urgent"];

export const initialUsers = [
  {
    id: "USR-001",
    name: "Aisha Mohamed",
    username: "aisha.mohamed",
    prefix: "Ms.",
    email: "aisha.mohamed@university.edu",
    role: "Requester",
    department: "Procurement",
    status: "Active",
  },
  {
    id: "USR-002",
    name: "Khalid Ali",
    username: "khalid.ali",
    prefix: "Mr.",
    email: "khalid.ali@university.edu",
    role: "Requester",
    department: "HR",
    status: "Active",
  },
  {
    id: "USR-003",
    name: "Sara Nasser",
    username: "sara.nasser",
    prefix: "Dr.",
    email: "sara.nasser@university.edu",
    role: "Requester",
    department: "Research Office",
    status: "Active",
  },
  {
    id: "USR-004",
    name: "Omar Hassan",
    username: "omar.hassan",
    prefix: "Mr.",
    email: "omar.hassan@university.edu",
    role: "Legal Reviewer",
    department: "Legal Affairs",
    status: "Active",
  },
  {
    id: "USR-005",
    name: "Fatima Salem",
    username: "fatima.salem",
    prefix: "Ms.",
    email: "fatima.salem@university.edu",
    role: "Legal Manager",
    department: "Legal Affairs",
    status: "Active",
  },
  {
    id: "USR-006",
    name: "Mariam Ahmed",
    username: "mariam.ahmed",
    prefix: "Ms.",
    email: "mariam.ahmed@university.edu",
    role: "Department Approver",
    department: "Finance",
    status: "Active",
  },
  {
    id: "USR-007",
    name: "Admin User",
    username: "admin",
    prefix: "None",
    email: "admin@university.edu",
    role: "Admin User",
    department: "IT",
    status: "Active",
  },
];

export const legalReviewCriteria = [
  "Document type identified",
  "Parties correctly identified",
  "Request category matches the document",
  "Request description matches the attached document",
  "Effective date identified",
  "Expiry date or end date identified",
  "Scope clearly defined",
  "Key obligations summarized",
  "Payment terms included, if relevant",
  "Funding terms included, if relevant",
  "Term and termination clauses included",
  "Confidentiality clause included",
  "Data protection clause included, if relevant",
  "Intellectual property clause included, if relevant",
  "Publication rights reviewed, if relevant",
  "Liability and indemnity reviewed",
  "Insurance requirements reviewed, if relevant",
  "Governing law and jurisdiction reviewed",
  "Signature authority confirmed",
  "Internal approvals obtained or identified",
  "Missing clauses or missing information identified",
  "Unusual or high-risk terms highlighted",
  "Compared against university-approved template or standard position",
  "Similar past legal opinion or reviewed agreement considered",
  "Reviewer questions for requester identified",
  "Final approved response/document storage needed",
];

export const contractChecklistItems = legalReviewCriteria;

function createChecklist(overrides) {
  return legalReviewCriteria.map((criteria) => ({
    criteria,
    page: overrides[criteria]?.page || "N/A",
    checked: overrides[criteria]?.checked || false,
    note:
      overrides[criteria]?.note ||
      "AI did not confirm this criterion from the demo PDF. Legal Affairs should review it manually.",
  }));
}

const vendorServiceAgreementPdf = {
  name: "sample_vendor_agreement.pdf",
  type: "application/pdf",
  url: "/demo-pdfs/sample_vendor_agreement.pdf",
  checklist: createChecklist({
    "Document type identified": {
      page: 1,
      checked: true,
      note: "AI identifies the PDF as a vendor service agreement.",
    },
    "Parties correctly identified": {
      page: 1,
      checked: true,
      note: "Khalifa University and Falcon Digital Services LLC are named on page 1.",
    },
    "Request category matches the document": {
      page: 1,
      checked: true,
      note: "The document supports the LEG-B Contract Review category.",
    },
    "Request description matches the attached document": {
      page: 1,
      checked: true,
      note: "The request asks for vendor agreement review and the PDF is a vendor service agreement.",
    },
    "Scope clearly defined": {
      page: 1,
      checked: true,
      note: "Website maintenance and support services are described on page 1.",
    },
    "Key obligations summarized": {
      page: 1,
      checked: true,
      note: "AI can summarize service, payment, confidentiality, and termination obligations.",
    },
    "Payment terms included, if relevant": {
      page: 1,
      checked: true,
      note: "Milestone payment terms appear on page 1 and should be confirmed with Finance.",
    },
    "Term and termination clauses included": {
      page: 2,
      checked: true,
      note: "Termination by 30 days written notice appears on page 2.",
    },
    "Confidentiality clause included": {
      page: 2,
      checked: true,
      note: "Confidentiality wording appears on page 2.",
    },
    "Data protection clause included, if relevant": {
      page: 2,
      checked: true,
      note: "Data protection is mentioned for personal data processing approval.",
    },
    "Liability and indemnity reviewed": {
      page: 2,
      checked: false,
      note: "Liability cap may be lower than expected and needs legal review.",
    },
    "Insurance requirements reviewed, if relevant": {
      page: 3,
      checked: false,
      note: "Insurance certificate is missing from the attachment list.",
    },
    "Governing law and jurisdiction reviewed": {
      page: 3,
      checked: true,
      note: "UAE governing law is stated on page 3.",
    },
    "Signature authority confirmed": {
      page: 3,
      checked: false,
      note: "Signature authority is mentioned on page 3 but still needs confirmation.",
    },
    "Internal approvals obtained or identified": {
      page: 1,
      checked: false,
      note: "Finance approval is referenced as needed but not confirmed.",
    },
    "Missing clauses or missing information identified": {
      page: 3,
      checked: true,
      note: "AI identifies missing insurance evidence and unresolved signature authority.",
    },
    "Unusual or high-risk terms highlighted": {
      page: 2,
      checked: true,
      note: "AI highlights the low liability cap as a risk.",
    },
    "Reviewer questions for requester identified": {
      page: 1,
      checked: true,
      note: "Ask whether Finance approved the payment schedule and whether insurance evidence is available.",
    },
    "Final approved response/document storage needed": {
      page: 3,
      checked: true,
      note: "Final approved agreement should be stored after Legal Affairs review.",
    },
  }),
  aiSuggestions: [
    {
      page: 1,
      type: "Finance Check",
      text: "AI draft: Payment milestones should be confirmed by Finance before Legal Affairs approves the agreement.",
    },
    {
      page: 2,
      type: "Risk",
      text: "AI draft: The liability cap appears low. Consider requesting stronger liability and indemnity wording.",
    },
    {
      page: 3,
      type: "Missing Document",
      text: "AI draft: Insurance certificate is not attached. Ask requester to provide it before closure.",
    },
  ],
};

const hrPolicyOpinionPdf = {
  name: "HR_Policy_Legal_Opinion.pdf",
  type: "application/pdf",
  url: "/demo-pdfs/hr-policy-legal-opinion.pdf",
  checklist: createChecklist({
    "Document type identified": {
      page: 1,
      checked: true,
      note: "AI identifies this as an HR legal opinion request.",
    },
    "Request category matches the document": {
      page: 1,
      checked: true,
      note: "The request fits LEG-A Legal Advice / Opinion.",
    },
    "Request description matches the attached document": {
      page: 1,
      checked: true,
      note: "The request and PDF both concern an HR employment policy update.",
    },
    "Scope clearly defined": {
      page: 1,
      checked: false,
      note: "The policy scope needs clarification because affected departments are not fully defined.",
    },
    "Key obligations summarized": {
      page: 3,
      checked: true,
      note: "AI summarizes that Legal Affairs should confirm the scope of authority.",
    },
    "Internal approvals obtained or identified": {
      page: 2,
      checked: false,
      note: "Approval authority needs clearer wording on page 2.",
    },
    "Missing clauses or missing information identified": {
      page: 2,
      checked: true,
      note: "The current approved policy is missing and should be requested.",
    },
    "Unusual or high-risk terms highlighted": {
      page: 2,
      checked: true,
      note: "AI highlights inconsistent department application as a risk.",
    },
    "Similar past legal opinion or reviewed agreement considered": {
      page: 3,
      checked: false,
      note: "No similar past HR opinion is referenced in the PDF.",
    },
    "Reviewer questions for requester identified": {
      page: 1,
      checked: true,
      note: "Ask HR whether the policy applies to all departments or only selected units.",
    },
    "Final approved response/document storage needed": {
      page: 3,
      checked: true,
      note: "Final opinion should be archived under HR legal opinions.",
    },
  }),
  aiSuggestions: [
    {
      page: 1,
      type: "Clarification",
      text: "AI draft: Ask HR whether the policy applies to all departments or only selected units.",
    },
    {
      page: 2,
      type: "Missing Information",
      text: "AI draft: The existing approved policy is needed before Legal Affairs can compare changes.",
    },
    {
      page: 3,
      type: "Knowledge Base",
      text: "AI draft: Store the approved opinion in the HR legal opinions category for reuse.",
    },
  ],
};

const researchDataSharingPdf = {
  name: "Research_Data_Sharing_Agreement.pdf",
  type: "application/pdf",
  url: "/demo-pdfs/research-data-sharing-agreement.pdf",
  checklist: createChecklist({
    "Document type identified": {
      page: 1,
      checked: true,
      note: "AI identifies this as a research data sharing agreement.",
    },
    "Parties correctly identified": {
      page: 1,
      checked: true,
      note: "Khalifa University and Gulf Research Partner are identified on page 1.",
    },
    "Request category matches the document": {
      page: 1,
      checked: true,
      note: "The document supports the LEG-C Research Agreements category.",
    },
    "Request description matches the attached document": {
      page: 1,
      checked: true,
      note: "The request and PDF both concern research data sharing with an external partner.",
    },
    "Scope clearly defined": {
      page: 1,
      checked: true,
      note: "The AI safety study purpose is stated on page 1.",
    },
    "Key obligations summarized": {
      page: 2,
      checked: true,
      note: "AI can summarize confidentiality, access, publication, IP, and data return obligations.",
    },
    "Funding terms included, if relevant": {
      page: "N/A",
      checked: false,
      note: "Funding terms are not shown in the demo PDF.",
    },
    "Confidentiality clause included": {
      page: 2,
      checked: true,
      note: "Confidentiality and access restrictions appear on page 2.",
    },
    "Data protection clause included, if relevant": {
      page: 3,
      checked: false,
      note: "Data breach notification and misuse responsibility need stronger wording.",
    },
    "Intellectual property clause included, if relevant": {
      page: 2,
      checked: true,
      note: "Background IP remains with the original owner.",
    },
    "Publication rights reviewed, if relevant": {
      page: 2,
      checked: false,
      note: "Publication review period is unclear and should be revised.",
    },
    "Liability and indemnity reviewed": {
      page: 3,
      checked: false,
      note: "No indemnity for data misuse is included.",
    },
    "Governing law and jurisdiction reviewed": {
      page: 3,
      checked: false,
      note: "Governing law is missing on page 3.",
    },
    "Internal approvals obtained or identified": {
      page: 1,
      checked: false,
      note: "Ethics approval reference should be confirmed.",
    },
    "Missing clauses or missing information identified": {
      page: 3,
      checked: true,
      note: "AI identifies missing governing law and breach notification wording.",
    },
    "Unusual or high-risk terms highlighted": {
      page: 3,
      checked: true,
      note: "Missing indemnity and data breach obligations are highlighted as risk areas.",
    },
    "Reviewer questions for requester identified": {
      page: 1,
      checked: true,
      note: "Ask for ethics approval reference and confirm data handling controls.",
    },
    "Final approved response/document storage needed": {
      page: 3,
      checked: true,
      note: "Final reviewed agreement should be stored with the research agreement record.",
    },
  }),
  aiSuggestions: [
    {
      page: 1,
      type: "Ethics",
      text: "AI draft: Confirm the ethics approval reference before sharing research data.",
    },
    {
      page: 2,
      type: "Publication Risk",
      text: "AI draft: Add a clear university review period before publication.",
    },
    {
      page: 3,
      type: "Missing Clause",
      text: "AI draft: Governing law is missing. Add UAE law or the university-approved standard clause.",
    },
    {
      page: 3,
      type: "Data Protection",
      text: "AI draft: Add breach notification timing and responsibility for data misuse.",
    },
  ],
};

export const initialRequests = [
  {
    id: "LA-2026-001",
    title: "Review sample vendor agreement"},{
    categoryCode: "LEG-B",
    categoryName: "Contract Review",
    department: "Procurement",
    requester: "Demo User",
    requesterUsername: "demo.user",
    assignedReviewer: "Omar Hassan",
    priority: "High",
    riskLevel: "Medium",
    status: "Under Review",
    deadline: "2026-07-05",
    submittedAt: "06/30/2026, 09:15 AM",
    description:
      "Procurement needs Legal Affairs to review a service agreement before signature.",
    documents: [vendorServiceAgreementPdf],
    aiSummary:
      "AI draft: This appears to be a vendor service agreement. Key review areas include payment terms, termination, liability, confidentiality, and signature authority.",
    reviewerComments: [
      {
        reviewerName: "Omar Hassan",
        text: "Please confirm whether Finance has reviewed the payment schedule.",
      },
      {
        reviewerName: "Omar Hassan",
        text: "Liability clause needs additional review before approval.",
      },
    ],
  },
  {
    id: "LA-2026-002",
    title: "HR legal opinion on employment policy",
    categoryCode: "LEG-A",
    categoryName: "Legal Advice / Opinion",
    department: "HR",
    requester: "Demo User",
    requesterUsername: "demo.user",
    assignedReviewer: "Omar Hassan",
    priority: "Medium",
    riskLevel: "Low",
    status: "Waiting for More Information",
    deadline: "2026-07-08",
    submittedAt: "06/30/2026, 11:20 AM",
    description:
      "HR is requesting legal clarification about an internal employment policy update.",
    documents: [hrPolicyOpinionPdf],
    aiSummary:
      "AI draft: This request asks for legal interpretation of an HR policy. More background information may be needed before final advice is prepared.",
    reviewerComments: [
      {
        reviewerName: "Omar Hassan",
        text: "Requester should provide the current approved policy for comparison.",
      },
    ],
  },
  {
    id: "LA-2026-003",
    title: "Research data sharing agreement",
    categoryCode: "LEG-C",
    categoryName: "Research Agreements",
    department: "Research Office",
    requester: "Sara Nasser",
    requesterUsername: "sara.nasser",
    assignedReviewer: "Omar Hassan",
    priority: "Urgent",
    riskLevel: "High",
    status: "Assigned to Legal Reviewer",
    deadline: "2026-07-02",
    submittedAt: "06/30/2026, 12:10 PM",
    description:
      "Research Office requires review of a data sharing agreement with an external university partner.",
    documents: [researchDataSharingPdf],
    aiSummary:
      "AI draft: This document may involve personal or sensitive research data. Review data usage, confidentiality, publication rights, IP, and liability clauses.",
    reviewerComments: [],
  },
];

export const auditLogs = [
  {
    id: 1,
    requestId: "LA-2026-001",
    action: "Request created",
    user: "Aisha Mohamed",
    time: "2026-06-30 09:15",
  },
  {
    id: 2,
    requestId: "LA-2026-001",
    action: "Document uploaded",
    user: "Aisha Mohamed",
    time: "2026-06-30 09:17",
  },
  {
    id: 3,
    requestId: "LA-2026-001",
    action: "Assigned to Legal Reviewer",
    user: "Legal Manager",
    time: "2026-06-30 10:05",
  },
  {
    id: 4,
    requestId: "LA-2026-002",
    action: "Additional information requested",
    user: "Fatima Salem",
    time: "2026-06-30 11:20",
  },
  {
    id: 5,
    requestId: "LA-2026-003",
    action: "AI draft summary generated",
    user: "AI Assistant",
    time: "2026-06-30 12:10",
  },
];

/*
BEGINNER DOCUMENTATION:

1. What is an array?
An array is a list of values. Example: ['HR', 'Finance', 'IT'].

2. What is an object?
An object stores related information using key-value pairs. Example: { name: 'Aisha', role: 'Requester' }.

3. What is export?
export allows other files to import and use these arrays and objects.

4. Why does this file still exist?
Some shared constants and legacy teaching samples remain here, but the main workflow uses PostgreSQL data through the KU API.

4.1 What are initialUsers?
initialUsers are legacy teaching samples. The Admin page now receives users loaded from the shared database.

4.2 Why are documents objects now?
Each PDF needs more than a file name. The object stores the PDF URL, checklist page notes, and AI page suggestions for the frontend popup.

5. Should new fullstack features depend on this file?
Prefer the shared API, PostgreSQL tables, or dedicated config files for new production features.
*/
