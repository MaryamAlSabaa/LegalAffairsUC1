export const navigationByRole = {
  Requester: [
    { id: "new-request", label: "Submit Request", icon: "plus" },
    { id: "requests", label: "Active Requests", icon: "inbox" },
    { id: "closed-requests", label: "Closed Requests", icon: "archive" },
    { id: "details", label: "Request Details", icon: "file" },
  ],
  "Admin User": [
    { id: "admin", label: "User Administration", icon: "users" },
    { id: "legal-engine", label: "Legal AI Engine", icon: "cpu" },
    { id: "audit", label: "Audit Log", icon: "activity" },
  ],
  Owner: [
    { id: "dashboard", label: "Executive Overview", icon: "dashboard" },
    { id: "new-request", label: "Submit Request", icon: "plus" },
    { id: "requests", label: "Legal Requests", icon: "inbox" },
    { id: "reviewers", label: "Review Team", icon: "users" },
    { id: "details", label: "Request Details", icon: "file" },
    { id: "admin", label: "User Administration", icon: "settings" },
    { id: "owner-controls", label: "Owner Controls", icon: "shield" },
    { id: "legal-engine", label: "Legal AI Engine", icon: "cpu" },
    { id: "audit", label: "Audit Log", icon: "activity" },
  ],
  "Legal Reviewer": [
    { id: "dashboard", label: "Workload Overview", icon: "dashboard" },
    { id: "reviewer-review-queue", label: "My Review Queue", icon: "clipboard" },
    { id: "details", label: "Request Details", icon: "file" },
  ],
  "Legal Manager": [
    { id: "dashboard", label: "Executive Overview", icon: "dashboard" },
    { id: "requests", label: "All Legal Requests", icon: "inbox" },
    { id: "manager-review-queue", label: "My Approval Queue", icon: "clipboard" },
    { id: "reviewers", label: "Review Team", icon: "users" },
    { id: "details", label: "Request Details", icon: "file" },
  ],
  "Department Approver": [
    { id: "dashboard", label: "Department Overview", icon: "dashboard" },
    { id: "requests", label: "Department Requests", icon: "inbox" },
    { id: "department-review-queue", label: "My Approval Queue", icon: "clipboard" },
    { id: "details", label: "Request Details", icon: "file" },
  ],
};

/*
BEGINNER DOCUMENTATION:

1. Why move navigation here?
App.jsx was becoming crowded. This file keeps role navigation rules in one easy place.

2. What is an object used as a map?
Each role name is a key. The value is the list of sidebar tabs that role can see.
*/
