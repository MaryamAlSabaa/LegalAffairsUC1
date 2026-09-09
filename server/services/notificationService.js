function execute(database, text, values = []) {
  return typeof database === "function" ? database(text, values) : database.query(text, values);
}

function uniqueRecipientIds(values) {
  return [...new Set(values.filter(Boolean))];
}

export function mapNotification(row) {
  return {
    id: String(row.id),
    requestId: row.request_id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    createdAt: new Date(row.created_at).toISOString(),
    createdAtLabel: new Date(row.created_at).toLocaleString("en-AE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export async function createNotifications(database, notifications) {
  for (const notification of notifications) {
    if (!notification.recipientId) continue;
    await execute(
      database,
      `insert into notifications(recipient_id,request_id,notification_type,title,message)
       values($1,$2,$3,$4,$5)`,
      [
        notification.recipientId,
        notification.requestId || null,
        notification.type || "request_activity",
        String(notification.title || "Legal request update").slice(0, 240),
        String(notification.message || "A legal request was updated.").slice(0, 2000),
      ],
    );
  }
}

export async function getRequestNotificationContext(database, requestId) {
  const result = await execute(
    database,
    `select lr.id,lr.title,lr.requester_id,lr.assigned_manager_id,lr.assigned_department_approver_id,
            coalesce(array_agg(distinct a.reviewer_id) filter (where a.reviewer_id is not null),array[]::uuid[]) as reviewer_ids
     from legal_requests lr
     left join request_reviewer_assignments a on a.request_id=lr.id
     where lr.id=$1
     group by lr.id,lr.title,lr.requester_id,lr.assigned_manager_id,lr.assigned_department_approver_id`,
    [requestId],
  );
  return result.rows[0] || null;
}

export async function notifyRequestActivity(database, {
  requestId,
  actor,
  activity,
  includeRequester = true,
  includeManager = false,
  includeAssignedReviewers = false,
  includeDepartmentApprover = false,
  detectUnassignedReviewer = true,
}) {
  const context = await getRequestNotificationContext(database, requestId);
  if (!context) return { coverageTriggered: false, context: null };

  const actorId = actor?.id || null;
  const actorName = actor?.name || "Legal Affairs";
  const reviewerIds = context.reviewer_ids || [];
  const activityWithRequest = activity.includes("{request}")
    ? activity.replace("{request}", `request ${context.id}`)
    : `${activity} request ${context.id}`;
  const activityMessage = `${actorName} ${activityWithRequest}: ${context.title}.`;
  const notificationsByRecipient = new Map();

  if (includeRequester && context.requester_id !== actorId) {
    notificationsByRecipient.set(context.requester_id, {
      recipientId: context.requester_id,
      requestId: context.id,
      type: "request_activity",
      title: `Update on ${context.id}`,
      message: activityMessage,
    });
  }

  const standardRecipients = uniqueRecipientIds([
    includeManager ? context.assigned_manager_id : null,
    includeDepartmentApprover ? context.assigned_department_approver_id : null,
    ...(includeAssignedReviewers ? reviewerIds : []),
  ]).filter((recipientId) => recipientId !== actorId);

  for (const recipientId of standardRecipients) {
    notificationsByRecipient.set(recipientId, {
      recipientId,
      requestId: context.id,
      type: "request_activity",
      title: `Activity on ${context.id}`,
      message: activityMessage,
    });
  }

  const coverageTriggered = Boolean(
    detectUnassignedReviewer
      && actor?.role === "Legal Reviewer"
      && !reviewerIds.includes(actorId),
  );

  if (coverageTriggered) {
    const coverageRecipients = uniqueRecipientIds([
      context.assigned_manager_id,
      ...reviewerIds,
    ]).filter((recipientId) => recipientId !== actorId);

    for (const recipientId of coverageRecipients) {
      notificationsByRecipient.set(recipientId, {
        recipientId,
        requestId: context.id,
        type: "coverage_action",
        title: `Unassigned reviewer activity on ${context.id}`,
        message: `${activityMessage} ${actorName} is not assigned to this request.`,
      });
    }
  }

  await createNotifications(database, [...notificationsByRecipient.values()]);
  return { coverageTriggered, context };
}
