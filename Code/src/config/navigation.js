export const navigationByRole = {
  Requester: [
    { id: "dashboard", label: "My Overview", icon: "dashboard" },
    { id: "new-request", label: "Submit Request", icon: "plus" },
    { id: "requests", label: "Active Requests", icon: "inbox" },
    { id: "completed-requests", label: "Completed Requests", icon: "archive" },
  ],
  "Admin User": [
    { id: "admin", label: "User Administration", icon: "users" },
    { id: "legal-engine", label: "Legal AI Engine", icon: "cpu" },
    { id: "audit", label: "Audit Log", icon: "activity" },
  ],
  Owner: [
    { id: "dashboard", label: "Executive Overview", icon: "dashboard" },
    { id: "new-request", label: "Submit Request", icon: "plus" },
    { id: "completed-requests", label: "Completed Requests", icon: "archive" },
    { id: "reviewers", label: "Review Team", icon: "users" },
    { id: "admin", label: "User Administration", icon: "settings" },
    { id: "owner-controls", label: "Owner Controls", icon: "shield" },
    { id: "legal-engine", label: "Legal AI Engine", icon: "cpu" },
    { id: "audit", label: "Audit Log", icon: "activity" },
  ],
  "Legal Reviewer": [
    { id: "dashboard", label: "Workload Overview", icon: "dashboard" },
    { id: "requests", label: "All Legal Requests", icon: "inbox" },
    { id: "completed-requests", label: "Completed Requests", icon: "archive" },
  ],
  "Legal Manager": [
    { id: "dashboard", label: "Executive Overview", icon: "dashboard" },
    { id: "completed-requests", label: "Completed Requests", icon: "archive" },
    { id: "manager-review-queue", label: "My Approval Queue", icon: "clipboard" },
    { id: "reviewers", label: "Review Team", icon: "users" },
  ],
  "Department Approver": [
    { id: "dashboard", label: "Department Overview", icon: "dashboard" },
    { id: "requests", label: "Department Requests", icon: "inbox" },
    { id: "completed-requests", label: "Completed Requests", icon: "archive" },
    { id: "department-review-queue", label: "My Approval Queue", icon: "clipboard" },
  ],
};

/*
BEGINNER DOCUMENTATION:

1. Why move navigation here?
App.jsx was becoming crowded. This file keeps role navigation rules in one easy place.

2. What is an object used as a map?
Each role name is a key. The value is the list of sidebar tabs that role can see.
*/
