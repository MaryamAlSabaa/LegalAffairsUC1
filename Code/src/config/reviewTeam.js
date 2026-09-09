export const REVIEW_ASSIGNMENT_MANAGER_EMAIL = "graham.cowan@ku.ac.ae";
export const DEMO_REVIEW_ASSIGNMENT_MANAGER_EMAIL = "manager@demo.test";

export const AVAILABLE_REVIEWER_EMAILS = [
  "omar.elkayal@ku.ac.ae",
  "khalid.malali@ku.ac.ae",
  "antigoni.filippopoulou@ku.ac.ae",
  "mohamed.almaazmi@ku.ac.ae",
];

const availableReviewerEmailSet = new Set(AVAILABLE_REVIEWER_EMAILS);

export function isAvailableLegalReviewer(user) {
  return user?.role === "Legal Reviewer"
    && user?.status === "Active"
    && availableReviewerEmailSet.has(user.email?.toLowerCase());
}

export function canManageReviewerAssignments(user) {
  return user?.role === "Legal Manager"
    && [REVIEW_ASSIGNMENT_MANAGER_EMAIL, DEMO_REVIEW_ASSIGNMENT_MANAGER_EMAIL]
      .includes(user?.email?.toLowerCase());
}
