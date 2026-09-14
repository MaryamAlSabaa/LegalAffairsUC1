import { useEffect, useRef, useState } from "react";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import ForgotPasswordPage from "./components/auth/ForgotPasswordPage";
import ResetPasswordPage from "./components/auth/ResetPasswordPage";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import DashboardCards from "./components/dashboard/DashboardCards";
import RequestTable from "./components/requests/RequestTable";
import RequestForm from "./components/requests/RequestForm";
import RequestDetails from "./components/requests/RequestDetails";
import ReviewerCoverageConfirmation from "./components/requests/ReviewerCoverageConfirmation";
import AdminUsers from "./components/admin/AdminUsers";
import LegalAffairEngine from "./components/admin/LegalAffairEngine";
import OwnerControls from "./components/admin/OwnerControls";
import AuditLog from "./components/audit/AuditLog";
import LegalReviewers from "./components/reviewers/LegalReviewers";
import { navigationByRole } from "./config/navigation";

import {
  changePassword,
  getExistingSessionUser,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
} from "./services/authService";
import {
  assignReviewersAsManager,
  checkBackendConnection,
  createBackendAuditLog,
  createBackendDepartmentApproval,
  createBackendManagerAction,
  createBackendRequest,
  createBackendRequestComment,
  createLegalAffairEngineEvent,
  routeRequestAsReviewer,
  rebuildAiReviewQueue,
  deleteRequestAsOwner,
  ownerResetAiResults,
  ownerDeleteClosedRequests,
  updateRequesterDocuments,
  recordCurrentUserActivity,
  fetchBackendAuditLogs,
  fetchBackendRequests,
  fetchBackendUsers,
  fetchNotifications,
  fetchLegalAffairEngineEvents,
  fetchLegalAffairEngineState,
  setLegalAffairEngineRunning,
  markAllNotificationsRead,
  markNotificationRead,
  updateAiReviewJobQueueOrder,
  updateBackendChecklistItem,
  updateBackendUserDepartment,
  updateBackendUserRole,
} from "./services/backendDataService";
import { triggerAiReviewQueue } from "./services/legalReviewApi";
import { formatDateTimeForAudit } from "./utils/dateFormat";
import {
  canManageDepartmentApproval,
  canManageManagerActions,
  canManageReview,
} from "./utils/permissions";
import {
  getSelectedVisibleRequest,
  getVisibleRequests,
} from "./utils/requestFilters";
import { canManageReviewerAssignments } from "./config/reviewTeam";

const completedRequestStatuses = new Set(["Approved", "Closed", "Archived"]);

function currentTrackerTimestamp() {
  return new Date().toLocaleString("en-AE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isDueSoonOrOverdue(request) {
  if (!request.deadline || request.deadline === "No deadline selected" || completedRequestStatuses.has(request.status)) return false;
  const deadline = new Date(`${request.deadline}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000) <= 7;
}

function describeAppError(value) {
  if (!value) return "Unknown error";
  if (typeof value === "string") return value;

  if (value instanceof Error) {
    if (value.message && value.message !== "[object Object]") {
      return value.message;
    }
  }

  if (typeof value === "object") {
    const candidates = [
      value.message,
      value.error,
      value.details,
      value.hint,
      value.statusText,
      value.name,
    ].filter(Boolean);

    if (candidates.length > 0) {
      const described = candidates.map(describeAppError).join(" | ");
      if (described && described !== "[object Object]") return described;
    }

    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  return String(value);
}

function matchesDashboardFilter(request, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "pending") {
    return !completedRequestStatuses.has(request.status);
  }
  if (filter === "under-review") {
    return ![
      "Closed",
      "Archived",
      "Approved",
      "Waiting for More Information",
    ].includes(request.status);
  }
  if (filter === "returned-to-requester") {
    return request.status === "Waiting for More Information";
  }
  if (filter === "completed") {
    return completedRequestStatuses.has(request.status);
  }
  if (filter === "due") {
    return isDueSoonOrOverdue(request);
  }
  if (filter === "unassigned") {
    const reviewerIds = request.assignedReviewerIds || [request.assignedReviewerId].filter(Boolean);
    return reviewerIds.length === 0 && !completedRequestStatuses.has(request.status);
  }
  return true;
}

function App() {
  const requestMutationVersion = useRef(0);
  // isLoggedIn controls whether the user sees auth screens or the main platform.
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // authMode decides whether to show LoginPage or RegisterPage.
  const [authMode, setAuthMode] = useState("login");

  // currentPage decides which main section is visible after login.
  const [currentPage, setCurrentPage] = useState("new-request");

  // currentUser is loaded from the shared PostgreSQL API after login.
  const [currentUser, setCurrentUser] = useState({
    id: "demo-user",
    name: "Demo User",
    username: "demo.user",
    email: "demo.user@university.edu",
    prefix: "None",
    role: "Requester",
    department: "Legal Affairs",
  });

  // These collections are loaded from the shared PostgreSQL server after login.
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [engineState, setEngineState] = useState(null);
  const [engineEvents, setEngineEvents] = useState([]);
  const [activeUserIds, setActiveUserIds] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [reviewerActionConfirmation, setReviewerActionConfirmation] = useState(null);
  const reviewerActionConfirmationResolver = useRef(null);

  // selectedRequestId controls which request appears on the Request Details page.
  // It starts as null so users must open a request from a table before seeing details.
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [requestReturnPage, setRequestReturnPage] = useState(null);
  const [dashboardRequestFilter, setDashboardRequestFilter] = useState(null);
  const [reviewerRequestScope, setReviewerRequestScope] = useState("all");

  // currentRole/currentDepartment come from the logged-in user's database profile.
  const [currentRole, setCurrentRole] = useState("Requester");
  const [currentDepartment, setCurrentDepartment] = useState("Legal Affairs");

  const [backendMessage, setBackendMessage] = useState(
    "Connecting to the KU Legal Affairs server...",
  );

  // theme remembers whether the user wants light mode or dark mode.
  // The function inside useState runs once when the app first loads.
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("legal-affairs-theme");
    return savedTheme || "light";
  });

  const accessibleNavigation =
    navigationByRole[currentRole] || navigationByRole.Requester;
  const accessiblePageIds = accessibleNavigation.map((item) => item.id);
  const canOpenRequestDetails = ["Requester", "Owner", "Legal Reviewer", "Legal Manager", "Department Approver"].includes(currentRole);
  const legalTrackerMode = ["Legal Reviewer", "Legal Manager"].includes(currentRole);

  // Requesters should see only their own requests. Legal roles can see all requests.
  const visibleRequests = getVisibleRequests({
    requests,
    role: currentRole,
    currentUser,
    department: currentDepartment,
  });
  const selectedRequest = getSelectedVisibleRequest({
    requests: visibleRequests,
    selectedRequestId,
  });
  const hasSelectedVisibleRequest = Boolean(selectedRequest);
  const requesterCurrentRequests =
    currentRole === "Requester"
      ? visibleRequests.filter((request) => !completedRequestStatuses.has(request.status))
      : [];
  const completedVisibleRequests = visibleRequests.filter((request) =>
    completedRequestStatuses.has(request.status),
  );
  const managerReviewRequests =
    currentRole === "Legal Manager"
      ? requests.filter(
          (request) =>
            request.assignedManagerId === currentUser.id &&
            request.status === "Sent for Internal Approval",
        )
      : [];
  const reviewerReviewRequests =
    currentRole === "Legal Reviewer"
      ? requests.filter(
          (request) =>
            (request.assignedReviewerIds || [request.assignedReviewerId].filter(Boolean)).includes(currentUser.id),
        )
      : [];
  const departmentReviewRequests =
    currentRole === "Department Approver"
      ? requests.filter(
          (request) =>
            request.assignedDepartmentApproverId === currentUser.id &&
            request.departmentDecision === "Pending Department Review",
        )
      : [];
  const requestRegisterSource =
    currentRole === "Requester"
      ? requesterCurrentRequests
      : currentRole === "Legal Reviewer" && reviewerRequestScope === "assigned"
        ? reviewerReviewRequests
        : visibleRequests;
  const requestRegisterRequests = requestRegisterSource.filter((request) =>
    matchesDashboardFilter(request, dashboardRequestFilter),
  );
  const overviewRequestTableEnabled = ["Legal Manager", "Owner"].includes(currentRole);
  const overviewRequests = visibleRequests.filter((request) =>
    matchesDashboardFilter(request, dashboardRequestFilter),
  );

  const navigationItemsForSidebar = accessibleNavigation.map((item) => {
    if (item.id !== "details") return item;

    return {
      ...item,
      disabled: !hasSelectedVisibleRequest,
      disabledReason: !hasSelectedVisibleRequest ? "Open a request first" : "",
    };
  });

  // useEffect runs after React updates the screen.
  // This effect applies the theme to the <html> tag and saves it across sessions.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("legal-affairs-theme", theme);
  }, [theme]);

  useEffect(() => {
    async function restoreSession() {
      if (new URLSearchParams(window.location.search).has("reset-token")) {
        setAuthMode("reset-password");
        setBackendMessage("Choose a new password to finish the recovery process.");
        return;
      }

      try {
        const sessionUser = await getExistingSessionUser();
        if (!sessionUser) {
          await checkBackendConnection();
          setBackendMessage("Shared PostgreSQL server ready. Please sign in.");
          return;
        }

        setCurrentUser(sessionUser);
        setCurrentRole(sessionUser.role);
        setCurrentDepartment(sessionUser.department);
        setReviewerRequestScope("all");
        setIsLoggedIn(true);
        setCurrentPage(
          navigationByRole[sessionUser.role]?.[0]?.id || "requests",
        );
        await recordCurrentUserActivity().catch(() => {});
        await loadBackendData(sessionUser);
      } catch (error) {
        setBackendMessage(
          `The shared application server is unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    restoreSession();
  }, []);

  // When the selected role changes, move the user to the first page allowed for that role.
  useEffect(() => {
    const isRequestDrillDown = currentPage === "details"
      && canOpenRequestDetails
      && hasSelectedVisibleRequest;
    if (!accessiblePageIds.includes(currentPage) && !isRequestDrillDown) {
      setCurrentPage(accessibleNavigation[0].id);
    }
  }, [currentRole, currentPage, accessibleNavigation, accessiblePageIds, canOpenRequestDetails, hasSelectedVisibleRequest]);

  // Changing role or department changes which requests are visible.
  // We clear the selected request so each role must intentionally open a row first.
  useEffect(() => {
    setSelectedRequestId(null);
    setRequestReturnPage(null);
  }, [currentRole, currentDepartment]);

  // If someone reaches Request Details without an opened request, send them back
  // to their request list. This supports the disabled sidebar and protects the route.
  useEffect(() => {
    if (currentPage === "details" && !hasSelectedVisibleRequest) {
      const fallbackPage = accessiblePageIds.includes("requests")
        ? "requests"
        : accessibleNavigation[0].id;

      setCurrentPage(fallbackPage);
    }
  }, [
    currentPage,
    hasSelectedVisibleRequest,
    accessiblePageIds,
    accessibleNavigation,
  ]);

  // Presence is recorded centrally so all connected users see the same activity state.
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.id) {
      setActiveUserIds([]);
      return undefined;
    }

    setActiveUserIds([currentUser.id]);

    async function heartbeat() {
      await recordCurrentUserActivity().catch(() => {});
      const [refreshedUsers, refreshedNotifications] = await Promise.all([
        fetchBackendUsers().catch(() => []),
        fetchNotifications().catch(() => null),
      ]);
      if (refreshedUsers.length > 0) {
        setUsers(refreshedUsers);
        setActiveUserIds(refreshedUsers.filter((user) => user.isActive).map((user) => user.id));
      }
      if (refreshedNotifications) setNotifications(refreshedNotifications);
    }

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 30_000);
    return () => window.clearInterval(intervalId);
  }, [isLoggedIn, currentUser?.id, currentUser?.role]);

  async function loadBackendData(userForAccess = currentUser) {
    const canReadEngineData = ["Admin User", "Owner"].includes(
      userForAccess.role,
    );

    const [
      backendRequests,
      backendUsers,
      backendAuditLogs,
      backendEngineState,
      backendEngineEvents,
      backendNotifications,
    ] = await Promise.all([
      fetchBackendRequests(),
      fetchBackendUsers(),
      fetchBackendAuditLogs().catch(() => []),
      canReadEngineData ? fetchLegalAffairEngineState().catch(() => null) : null,
      canReadEngineData ? fetchLegalAffairEngineEvents().catch(() => []) : [],
      fetchNotifications().catch(() => []),
    ]);

    setRequests(backendRequests);
    setUsers(backendUsers);
    setAuditLogs(backendAuditLogs);
    setEngineState(backendEngineState);
    setEngineEvents(backendEngineEvents);
    setNotifications(backendNotifications);
    setActiveUserIds([
      ...new Set([userForAccess.id, ...backendUsers.filter((user) => user.isActive).map((user) => user.id)]),
    ]);
    // A successful background load does not need a persistent banner in the UI.
    setBackendMessage("");
  }

  const hasActiveAiReview = requests.some((request) =>
    ["AI Review Pending", "AI Review Processing"].includes(request.status),
  );

  useEffect(() => {
    const shouldPollRequests =
      isLoggedIn &&
      (hasActiveAiReview || currentPage === "legal-engine" || currentPage === "details");

    if (!shouldPollRequests) return undefined;
    let isCancelled = false;
    let isRefreshing = false;

    const intervalId = window.setInterval(async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      const mutationVersion = requestMutationVersion.current;
      try {
        const [
          refreshedRequests,
          refreshedEngineState,
          refreshedEngineEvents,
        ] = await Promise.all([
          fetchBackendRequests(),
          currentPage === "legal-engine"
            ? fetchLegalAffairEngineState().catch(() => null)
            : Promise.resolve(engineState),
          currentPage === "legal-engine"
            ? fetchLegalAffairEngineEvents().catch(() => [])
            : Promise.resolve(engineEvents),
        ]);
        if (isCancelled) return;
        // A poll started before a saved action must not undo that action in the UI.
        if (mutationVersion === requestMutationVersion.current) setRequests(refreshedRequests);
        if (currentPage === "legal-engine") {
          setEngineState(refreshedEngineState);
          setEngineEvents(refreshedEngineEvents);
        }
      } catch (error) {
        if (isCancelled) return;
        setBackendMessage(
          `Could not refresh request status: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        isRefreshing = false;
      }
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isLoggedIn, currentUser?.id, hasActiveAiReview, currentPage]);

  async function applyAuthenticatedUser(user) {
    setCurrentUser(user);
    setCurrentRole(user.role);
    setCurrentDepartment(user.department);
    setSelectedRequestId(null);
    setRequestReturnPage(null);
    setReviewerRequestScope("all");
    setDashboardRequestFilter(null);
    setIsLoggedIn(true);
    setCurrentPage(navigationByRole[user.role]?.[0]?.id || "requests");
    await recordCurrentUserActivity().catch(() => {});
    await loadBackendData(user);
  }

  async function handleLogin(credentials) {
    const loggedInUser = await login(
      credentials.username,
      credentials.password,
    );

    await applyAuthenticatedUser(loggedInUser);
  }

  async function handleRegister(formData) {
    const registeredUser = await register(formData);
    await applyAuthenticatedUser(registeredUser);
  }


  async function handleRequestPasswordReset(email) {
    await requestPasswordReset(email);
  }

  async function handleResetPassword(newPassword) {
    await resetPassword(newPassword);
    window.history.replaceState({}, document.title, window.location.pathname);
    setIsLoggedIn(false);
    setAuthMode("login");
    setBackendMessage("Password updated. Sign in again with your new password.");
  }

  async function handleChangePassword({ currentPassword, newPassword }) {
    await changePassword({
      currentPassword,
      newPassword,
    });
    setIsLoggedIn(false);
    setAuthMode("login");
    setSelectedRequestId(null);
    setRequestReturnPage(null);
    setBackendMessage("Password changed. All sessions were signed out; sign in again.");
  }

  function handleToggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  async function handleLogout() {
    await logout();

    setIsLoggedIn(false);
    setAuthMode("login");
    setSelectedRequestId(null);
    setRequestReturnPage(null);
    setReviewerRequestScope("all");
    setDashboardRequestFilter(null);
    setNotifications([]);
  }

  async function handleMarkNotificationRead(notificationId) {
    try {
      await markNotificationRead(notificationId);
      setNotifications((current) => current.map((notification) =>
        notification.id === String(notificationId) ? { ...notification, isRead: true } : notification,
      ));
    } catch (error) {
      setBackendMessage(`Could not mark the notification as read: ${describeAppError(error)}`);
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    } catch (error) {
      setBackendMessage(`Could not update notifications: ${describeAppError(error)}`);
    }
  }

  async function addAuditLog(
    action,
    user = currentUser.name,
    requestId = "System",
    recordedByServer = false,
  ) {
    const newLog = {
      id: Date.now(),
      requestId,
      action,
      user,
      time: formatDateTimeForAudit(new Date()),
    };

    setAuditLogs((currentLogs) => [newLog, ...currentLogs]);

    try {
      if (!recordedByServer) await createBackendAuditLog(action, currentUser, requestId);
    } catch (error) {
      setBackendMessage(
        `The activity is visible in this session, but the central audit log could not be updated: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function handleCreateRequest(newRequest) {
    try {
      const savedRequest = await createBackendRequest(newRequest, currentUser);

      const requestForState = { ...savedRequest };
      delete requestForState.uploadFile;

      setRequests([requestForState, ...requests]);
      setSelectedRequestId(requestForState.id);
      setBackendMessage(`Request submitted successfully. Tracking number: ${requestForState.trackingNumber || requestForState.id}`);
      triggerAiReviewQueue()
          .then(async () => {
            const refreshedRequests = await fetchBackendRequests();
            setRequests(refreshedRequests);
          })
          .catch(async (error) => {
            const message = describeAppError(error);
            await createLegalAffairEngineEvent({
              eventType: "requester_queue_trigger_failed",
              level: "error",
              message: `Requester submitted ${requestForState.id}, but the browser could not start/observe AI queue processing: ${message}`,
              currentUser,
              requestId: requestForState.id,
            }).catch(() => {});
            setBackendMessage(
              `Request was saved, but AI queue processing did not start: ${message}`,
            );
          });

      // Requester users should return to My Requests so they can see the status.
      // Legal staff can go directly to the details screen.
      setCurrentPage(currentRole === "Requester" ? "requests" : "details");
    } catch (error) {
      const message = `Could not save the request to the shared server: ${
        error instanceof Error ? error.message : String(error)
      }`;
      setBackendMessage(message);
      // Let RequestForm keep the user's entered data and selected document on failure.
      throw new Error(message);
    }
  }

  async function refreshRequestsAndEngineState() {
    const [refreshedRequests, refreshedEngineState, refreshedEngineEvents] =
      await Promise.all([
        fetchBackendRequests(),
        fetchLegalAffairEngineState().catch(() => null),
        fetchLegalAffairEngineEvents().catch(() => []),
      ]);

    setRequests(refreshedRequests);
    setEngineState(refreshedEngineState);
    setEngineEvents(refreshedEngineEvents);
  }

  async function handleEngineRunningChange(isRunning) {
    const nextEngineState = await setLegalAffairEngineRunning(
      isRunning,
      currentUser,
    );
    setEngineState(nextEngineState);
    await createLegalAffairEngineEvent({
      eventType: isRunning ? "engine_started" : "engine_stopped",
      level: "status",
      message: `${currentUser.name} ${isRunning ? "started" : "stopped"} the Legal Affair Engine.`,
      currentUser,
    });
    await refreshRequestsAndEngineState();
    await addAuditLog(
      `${isRunning ? "Started" : "Stopped"} Legal Affair Engine`,
      currentUser.name,
      "System",
    );
  }

  async function handleProcessNextAiReviewJob() {
    try {
      await createLegalAffairEngineEvent({
        eventType: "manual_process_next_requested",
        level: "status",
        message: `${currentUser.name} requested processing for the next queued or stale AI review job. Jobs stuck in processing for 1+ minute can be reclaimed.`,
        currentUser,
      });
      const result = await triggerAiReviewQueue({ staleAfterMinutes: 1 });
      await createLegalAffairEngineEvent({
        eventType: "manual_process_next_finished",
        level: result?.processed ? "status" : "warning",
        message: result?.processed
          ? `Processed next queued request ${result.requestId || "unknown request"}.`
          : result?.message || "No queued AI review jobs were available.",
        currentUser,
        requestId: result?.requestId || null,
        jobId: result?.jobId || null,
        metadata: result || {},
      });
      await refreshRequestsAndEngineState();
      setBackendMessage("Legal Affair Engine processed the next queued request.");
    } catch (error) {
      const message = describeAppError(error);
      await createLegalAffairEngineEvent({
        eventType: "manual_process_next_failed",
        level: "error",
        message,
        currentUser,
      }).catch(() => {});
      await refreshRequestsAndEngineState();
      setBackendMessage(
        `Legal Affair Engine could not process the next request: ${message}`,
      );
    }
  }

  async function handleRebuildAiQueue() {
    try {
      const queuedCount = await rebuildAiReviewQueue();
      setBackendMessage(`Rebuilt the AI queue with ${queuedCount} request${queuedCount === 1 ? "" : "s"}.`);
      await refreshRequestsAndEngineState();
      if (queuedCount > 0) await handleProcessNextAiReviewJob();
    } catch (error) {
      setBackendMessage(`Could not rebuild the AI queue: ${describeAppError(error)}`);
    }
  }

  async function handleRequesterDocumentUpdate(requestId, update) {
    await updateRequesterDocuments({ requestId, ...update });
    await refreshRequestsAndEngineState();
    triggerAiReviewQueue().catch(() => {});
  }

  async function handleOwnerResetAiResults() {
    const count = await ownerResetAiResults();
    await refreshRequestsAndEngineState();
    return count;
  }

  async function handleOwnerDeleteClosedRequests() {
    const count = await ownerDeleteClosedRequests();
    await refreshRequestsAndEngineState();
    return count;
  }

  async function handleDeleteRequest(requestId) {
    await deleteRequestAsOwner(requestId);
    setRequests((currentRequests) => currentRequests.filter((request) => request.id !== requestId));
    setSelectedRequestId(null);
    setCurrentPage(requestReturnPage && accessiblePageIds.includes(requestReturnPage) ? requestReturnPage : accessibleNavigation[0].id);
    setRequestReturnPage(null);
  }

  async function handleQueuePositionChange(request, priorityRequests, nextPosition) {
    if (engineState?.isRunning) {
      setBackendMessage("Stop the Legal Affair Engine before changing queue position.");
      return;
    }

    const currentIndex = priorityRequests.findIndex((item) => item.id === request.id);
    const clampedPosition = Math.max(
      1,
      Math.min(Number(nextPosition) || 1, priorityRequests.length),
    );
    const nextIndex = clampedPosition - 1;
    const reorderedRequests = [...priorityRequests];
    const [movedRequest] = reorderedRequests.splice(currentIndex, 1);
    reorderedRequests.splice(nextIndex, 0, movedRequest);

    await Promise.all(
      reorderedRequests.map((item, index) =>
        updateAiReviewJobQueueOrder(item.aiReviewJob.id, index + 1),
      ),
    );

    await createLegalAffairEngineEvent({
      eventType: "queue_position_changed",
      level: "status",
      message: `${currentUser.name} moved ${request.id} to position #${clampedPosition} in the ${request.priority} priority queue.`,
      currentUser,
      requestId: request.id,
      jobId: request.aiReviewJob?.id || null,
      metadata: { priority: request.priority, position: clampedPosition },
    });

    await refreshRequestsAndEngineState();
    await addAuditLog("Changed Legal Affair Engine queue position", currentUser.name);
  }

  function confirmUnassignedReviewerAction(requestId, actionDescription) {
    if (currentRole !== "Legal Reviewer") return true;
    const request = requests.find((item) => item.id === requestId);
    if (!request) return false;
    const assignedReviewerIds = request.assignedReviewerIds?.length
      ? request.assignedReviewerIds
      : [request.assignedReviewerId].filter(Boolean);
    if (assignedReviewerIds.includes(currentUser.id)) return true;

    const reviewerNames = request.assignedReviewers?.length
      ? request.assignedReviewers.map((reviewer) => reviewer.name)
      : request.assignedReviewer && request.assignedReviewer.toLowerCase() !== "not assigned"
        ? request.assignedReviewer.split(",").map((name) => name.trim()).filter(Boolean)
        : [];
    const recipients = [
      request.assignedManager && request.assignedManager.toLowerCase() !== "not assigned"
        ? { name: request.assignedManager, role: "Legal Manager" }
        : null,
      ...reviewerNames.map((name) => ({ name, role: "Assigned Legal Reviewer" })),
    ].filter(Boolean);

    return new Promise((resolve) => {
      reviewerActionConfirmationResolver.current?.(false);
      reviewerActionConfirmationResolver.current = resolve;
      setReviewerActionConfirmation({
        requestId: request.trackingNumber || request.id,
        requestTitle: request.title,
        actionDescription,
        recipients: recipients.length ? recipients : [{ name: "Legal Affairs", role: "Assigned manager and reviewers" }],
      });
    });
  }

  function resolveReviewerActionConfirmation(shouldContinue) {
    const resolve = reviewerActionConfirmationResolver.current;
    reviewerActionConfirmationResolver.current = null;
    setReviewerActionConfirmation(null);
    resolve?.(shouldContinue);
  }

  async function handleAddRequestComment(requestId, commentText) {
    if (!await confirmUnassignedReviewerAction(requestId, "add this comment")) return false;
    await createBackendRequestComment({ requestId, currentUser, commentText });
    requestMutationVersion.current += 1;
    const actionAt = currentTrackerTimestamp();

    setRequests((currentRequests) =>
      currentRequests.map((request) => {
        if (request.id !== requestId) return request;

        return {
          ...request,
          reviewerComments: [
            ...(request.reviewerComments || []),
            {
              authorName: currentUser.name,
              authorRole: currentUser.role,
              text: commentText,
              createdAt: actionAt,
            },
          ],
          updatedAt: actionAt,
          lastAction: "Comment added",
          lastActionBy: currentUser.name,
          lastActionAt: actionAt,
        };
      }),
    );
    return true;
  }

  async function handleManagerDecision(requestId, decision) {
    const savedDecision = await createBackendManagerAction({
      requestId,
      currentUser,
      decision,
    });
    requestMutationVersion.current += 1;
    const actionAt = currentTrackerTimestamp();

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              managerDecision: savedDecision.managerDecision,
              workflowAction: savedDecision.workflowAction || decision,
              status: savedDecision.status,
              updatedAt: actionAt,
              lastAction: decision,
              lastActionBy: currentUser.name,
              lastActionAt: actionAt,
              legalDepartmentStatus: completedRequestStatuses.has(savedDecision.status) ? "C" : "O",
              endUserStatus: completedRequestStatuses.has(savedDecision.status) ? "C" : "O",
              completedAt: completedRequestStatuses.has(savedDecision.status) ? actionAt : request.completedAt,
            }
          : request,
      ),
    );

    await addAuditLog(decision, currentUser.name, requestId, true);
    return savedDecision;
  }


  async function handleManagerAssignReviewers(requestId, reviewerIds) {
    const assignment = await assignReviewersAsManager({ requestId, reviewerIds });
    requestMutationVersion.current += 1;
    const actionAt = currentTrackerTimestamp();
    const assignmentAction = `Assigned reviewers: ${assignment.assignedReviewers.map((reviewer) => reviewer.name).join(", ")}`;

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              assignedReviewers: assignment.assignedReviewers,
              assignedReviewerIds: assignment.assignedReviewerIds,
              assignedReviewer: assignment.assignedReviewer,
              assignedReviewerId: assignment.assignedReviewerId,
              managerDecision: assignment.managerDecision,
              status: assignment.status,
              updatedAt: actionAt,
              lastAction: assignmentAction,
              lastActionBy: currentUser.name,
              lastActionAt: actionAt,
            }
          : request,
      ),
    );

    await addAuditLog(
      assignmentAction,
      currentUser.name,
      requestId,
    );
  }

  async function handleReviewerRoute(requestId, destination, commentText) {
    const confirmationDestination = {
      requester: "return this request to the requester",
      legal_manager: "move this request to Legal Manager review",
      department_approver: "move this request to Department Approver review",
    }[destination] || "route this request";
    if (!await confirmUnassignedReviewerAction(requestId, confirmationDestination)) return false;
    const routedRequest = await routeRequestAsReviewer({
      requestId,
      destination,
      commentText,
    });
    requestMutationVersion.current += 1;
    const destinationLabel = {
      requester: "Requester",
      legal_manager: "Legal Manager",
      department_approver: "Department Approver",
    }[destination] || "workflow recipient";
    const actionAt = currentTrackerTimestamp();
    const routeAction = `Sent request to ${destinationLabel}: ${commentText}`;

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: routedRequest.status,
              workflowAction: routedRequest.workflowAction || routeAction,
              reviewerComments: [
                ...(request.reviewerComments || []),
                {
                  authorName: currentUser.name,
                  authorRole: currentUser.role,
                  text: commentText,
                  createdAt: actionAt,
                },
              ],
              updatedAt: actionAt,
              lastAction: routeAction,
              lastActionBy: currentUser.name,
              lastActionAt: actionAt,
              legalDepartmentStatus: "O",
              endUserStatus: "O",
            }
          : request,
      ),
    );

    await addAuditLog(
      routeAction,
      currentUser.name,
      requestId,
      true,
    );
    return true;
  }

  async function handleDepartmentApproval(requestId, decision, commentText) {
    const savedDecision = await createBackendDepartmentApproval({
      requestId,
      currentUser,
      decision,
      commentText,
    });
    requestMutationVersion.current += 1;
    const actionAt = currentTrackerTimestamp();

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              departmentDecision: savedDecision.departmentDecision,
              workflowAction: savedDecision.workflowAction || decision,
              status: savedDecision.status,
              updatedAt: actionAt,
              lastAction: `${decision}${commentText ? `: ${commentText}` : ""}`,
              lastActionBy: currentUser.name,
              lastActionAt: actionAt,
              legalDepartmentStatus: "O",
              endUserStatus: "O",
              completedAt: completedRequestStatuses.has(savedDecision.status) ? actionAt : request.completedAt,
            }
          : request,
      ),
    );

    await addAuditLog(savedDecision.workflowAction || decision, currentUser.name, requestId, true);
    return savedDecision;
  }

  async function handleChecklistItemToggle({
    requestId,
    documentId,
    checklistItemId,
    criteria,
    checked,
  }) {
    if (!await confirmUnassignedReviewerAction(requestId, `${checked ? "select" : "clear"} the checklist item “${criteria}”`)) return false;
    await updateBackendChecklistItem({ checklistItemId, checked });
    requestMutationVersion.current += 1;

    setRequests((currentRequests) =>
      currentRequests.map((request) => {
        if (request.id !== requestId) return request;

        return {
          ...request,
          documents: request.documents.map((document) => {
            if (document.id !== documentId) return document;

            return {
              ...document,
              checklist: document.checklist.map((item) =>
                item.id === checklistItemId ? { ...item, checked } : item,
              ),
            };
          }),
        };
      }),
    );

    await addAuditLog(
      `${checked ? "Checked" : "Unchecked"} checklist item: ${criteria}`,
      currentUser.name,
      requestId,
    );
    return true;
  }

  async function handleUpdateUserRole(userId, newRole) {
    await updateBackendUserRole({ userId, roleName: newRole });
  }

  async function handleUpdateUserDepartment(userId, newDepartment) {
    await updateBackendUserDepartment({
      userId,
      departmentName: newDepartment,
    });
  }

  function handleSelectRequest(requestId) {
    if (!canOpenRequestDetails) return;
    if (currentPage !== "details") setRequestReturnPage(currentPage);
    setSelectedRequestId(requestId);
    setCurrentPage("details");
  }

  function handleBackFromRequest() {
    const fallbackPage = accessiblePageIds.includes("requests")
      ? "requests"
      : accessibleNavigation[0].id;
    const destination = requestReturnPage && accessiblePageIds.includes(requestReturnPage)
      ? requestReturnPage
      : fallbackPage;
    setCurrentPage(destination);
    setSelectedRequestId(null);
    setRequestReturnPage(null);
  }

  // If the user is not logged in, show Login or Register before showing the dashboard.
  if (!isLoggedIn) {
    if (authMode === "reset-password") {
      return (
        <ResetPasswordPage
          onResetPassword={handleResetPassword}
          onShowLogin={() => setAuthMode("login")}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      );
    }

    if (authMode === "forgot-password") {
      return (
        <ForgotPasswordPage
          onRequestReset={handleRequestPasswordReset}
          onShowLogin={() => setAuthMode("login")}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      );
    }

    if (authMode === "register") {
      return (
        <RegisterPage
          onRegister={handleRegister}
          onShowLogin={() => setAuthMode("login")}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          backendMessage={backendMessage}
        />
      );
    }

    return (
      <LoginPage
        onLogin={handleLogin}
        onShowRegister={() => setAuthMode("register")}
        onShowForgotPassword={() => setAuthMode("forgot-password")}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        backendMessage={backendMessage}
      />
    );
  }

  function handleNavigationChange(pageId) {
    setDashboardRequestFilter(null);
    if (currentRole === "Legal Reviewer" && pageId === "requests") {
      setReviewerRequestScope("all");
    }
    setCurrentPage(pageId);
  }

  function renderCurrentPage() {
    if (currentPage === "dashboard") {
      const overviewFilterDescriptions = {
        all: "Showing all submitted legal requests.",
        "under-review": "Showing requests currently in progress.",
        "returned-to-requester": "Showing requests returned to the requester for a response.",
        due: "Showing open requests that are due within seven days or overdue.",
        completed: "Showing approved, closed, and archived requests.",
        unassigned: "Showing open requests that still need a reviewer assignment.",
      };
      return (
        <div className="overview-dashboard">
          <DashboardCards
            requests={
              currentRole === "Legal Reviewer" ? reviewerReviewRequests : visibleRequests
            }
            onSelectFilter={(filter) => {
              setDashboardRequestFilter(filter);
              if (!overviewRequestTableEnabled) {
                if (currentRole === "Legal Reviewer") {
                  setReviewerRequestScope("assigned");
                }
                setCurrentPage(currentRole === "Requester" && filter === "completed" ? "completed-requests" : "requests");
              }
            }}
            activeFilter={dashboardRequestFilter || "all"}
            currentUser={currentUser}
            allRequests={visibleRequests}
            onSelectRequest={handleSelectRequest}
            notifications={notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
          />
          {overviewRequestTableEnabled && (
            <div className="overview-request-register">
              <RequestTable
                requests={overviewRequests}
                onSelectRequest={handleSelectRequest}
                canOpenDetails={canOpenRequestDetails}
                currentUserId={currentUser.id}
                kicker="Executive request register"
                title="All Legal Requests"
                description={overviewFilterDescriptions[dashboardRequestFilter || "all"]}
                legalTrackerMode={legalTrackerMode}
              />
            </div>
          )}
        </div>
      );
    }

    if (currentPage === "requests") {
      return (
        <RequestTable
          requests={requestRegisterRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={canOpenRequestDetails}
          currentUserId={currentUser.id}
          title={
            currentRole === "Requester"
              ? "My Current Requests"
              : dashboardRequestFilter === "under-review"
                ? "Requests in Progress"
                : dashboardRequestFilter === "returned-to-requester"
                  ? "Returned to Requester"
                  : dashboardRequestFilter === "completed"
                    ? "Completed Requests"
              : currentRole === "Legal Reviewer"
                ? reviewerRequestScope === "assigned" ? "My Assigned Requests" : "All Legal Requests"
                : currentRole === "Department Approver"
                ? `Department Legal Requests for ${currentDepartment}`
                : "Legal Requests"
          }
          description={
            currentRole === "Requester"
              ? "View your active submitted requests. Completed requests are kept in Completed Requests."
              : currentRole === "Legal Reviewer"
                ? reviewerRequestScope === "assigned"
                  ? `Showing the ${reviewerReviewRequests.length} requests assigned to you out of ${visibleRequests.length} submitted requests.`
                  : "Search, open, and follow up on the complete Legal Affairs request portfolio, including requests assigned to other reviewers."
                : currentRole === "Department Approver"
                ? `Review legal requests for your current department: ${currentDepartment}.`
                : "Track request category, department, priority, reviewer, deadline, and status."
          }
          tabs={currentRole === "Legal Reviewer" ? [
            { id: "assigned", label: "My assigned requests only", count: reviewerReviewRequests.length },
            { id: "all", label: "All requests", count: visibleRequests.length },
          ] : []}
          activeTab={reviewerRequestScope}
          onTabChange={(scope) => {
            setReviewerRequestScope(scope);
            setDashboardRequestFilter(null);
          }}
          legalTrackerMode={legalTrackerMode}
        />
      );
    }

    if (currentPage === "completed-requests") {
      return (
        <RequestTable
          requests={completedVisibleRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          currentUserId={currentUser.id}
          kicker="Completed request archive"
          title={currentRole === "Requester" ? "My Completed Requests" : "Completed Legal Requests"}
          description={currentRole === "Requester"
            ? "Your approved, closed, and archived requests are retained here for reference."
            : "Approved, closed, and archived requests are available here for quick access."}
          legalTrackerMode={legalTrackerMode}
        />
      );
    }

    if (currentPage === "manager-review-queue") {
      return (
        <RequestTable
          requests={managerReviewRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          currentUserId={currentUser.id}
          title="My Manager Review Queue"
          description="Requests routed to you by Legal Reviewers and awaiting your Legal Manager decision."
          legalTrackerMode={legalTrackerMode}
        />
      );
    }

    if (currentPage === "department-review-queue") {
      return (
        <RequestTable
          requests={departmentReviewRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          currentUserId={currentUser.id}
          title="My Department Review Queue"
          description="Requests routed to you for a Department Approver decision."
          legalTrackerMode={legalTrackerMode}
        />
      );
    }

    if (currentPage === "new-request") {
      return (
        <RequestForm
          onCreateRequest={handleCreateRequest}
          currentUser={currentUser}
        />
      );
    }

    if (currentPage === "details") {
      return (
        <RequestDetails
          request={selectedRequest}
          onBack={handleBackFromRequest}
          currentUser={currentUser}
          canManageReview={canManageReview(currentRole)}
          canManageManagerActions={canManageManagerActions(currentRole)}
          canManageDepartmentApproval={canManageDepartmentApproval(currentRole)}
          canAssignReviewers={canManageReviewerAssignments(currentUser)}
          onAddComment={(commentText) =>
            handleAddRequestComment(selectedRequest.id, commentText)
          }
          onManagerDecisionChange={(decision) =>
            handleManagerDecision(selectedRequest.id, decision)
          }
          onDepartmentDecisionChange={(decision, commentText) =>
            handleDepartmentApproval(selectedRequest.id, decision, commentText)
          }
          onChecklistItemToggle={handleChecklistItemToggle}
          users={users}
          onAssignReviewers={(reviewerIds) =>
            handleManagerAssignReviewers(selectedRequest.id, reviewerIds)
          }
          onRouteRequest={(destination, commentText) =>
            handleReviewerRoute(selectedRequest.id, destination, commentText)
          }
          onDeleteRequest={currentRole === "Owner" ? () => handleDeleteRequest(selectedRequest.id) : null}
          onUpdateDocuments={(update) =>
            handleRequesterDocumentUpdate(selectedRequest.id, update)
          }
        />
      );
    }

    if (currentPage === "reviewers") {
      return (
        <LegalReviewers
          users={users}
          requests={requests}
          activeUserIds={activeUserIds}
          onSelectRequest={handleSelectRequest}
        />
      );
    }

    if (currentPage === "owner-controls") {
      return (
        <OwnerControls
          onResetAiResults={handleOwnerResetAiResults}
          onDeleteClosedRequests={handleOwnerDeleteClosedRequests}
        />
      );
    }

    if (currentPage === "admin") {
      return (
        <AdminUsers
          users={users}
          setUsers={setUsers}
          onAuditEvent={addAuditLog}
          currentUser={currentUser}
          activeUserIds={activeUserIds}
          onUpdateUserRole={handleUpdateUserRole}
          onUpdateUserDepartment={handleUpdateUserDepartment}
        />
      );
    }

    if (currentPage === "legal-engine") {
      return (
        <LegalAffairEngine
          requests={requests}
          engineEvents={engineEvents}
          engineState={engineState}
          onToggleRunning={handleEngineRunningChange}
          onProcessNext={handleProcessNextAiReviewJob}
          onQueuePositionChange={handleQueuePositionChange}
          onRebuildQueue={handleRebuildAiQueue}
        />
      );
    }

    if (currentPage === "audit") {
      return <AuditLog logs={auditLogs} />;
    }

    return (
      <RequestForm
        onCreateRequest={handleCreateRequest}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        currentPage={currentPage}
        onChangePage={handleNavigationChange}
        navigationItems={navigationItemsForSidebar}
        currentUser={currentUser}
      />

      <div className="app-workspace">
        <Header
          currentUser={currentUser}
          currentPage={currentPage}
          requests={visibleRequests}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onSelectRequest={handleSelectRequest}
          onLogout={handleLogout}
          onChangePassword={handleChangePassword}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        <main className="app-content">
          {backendMessage && (
            <div className="backend-notice">
              <span className="backend-notice-dot" />
              <div><strong>System message</strong><p>{backendMessage}</p></div>
            </div>
          )}
          {renderCurrentPage()}
        </main>
      </div>
      {reviewerActionConfirmation && (
        <ReviewerCoverageConfirmation
          confirmation={reviewerActionConfirmation}
          onCancel={() => resolveReviewerActionConfirmation(false)}
          onConfirm={() => resolveReviewerActionConfirmation(true)}
        />
      )}
    </div>
  );
}

export default App;

/*
BEGINNER DOCUMENTATION:

1. What is App.jsx?
App.jsx is the main React component. It controls the overall application flow.

2. What is state?
State is data that React remembers. When state changes, React updates the screen.
Examples in this file: isLoggedIn, currentPage, requests, selectedRequestId, currentRole, and theme.

3. What is conditional rendering?
Conditional rendering means showing different UI depending on state.
Example: if isLoggedIn is false, we show LoginPage or RegisterPage.

4. What is role-based navigation?
Role-based navigation means each role sees only the tabs it should use.
Requester sees Send Request and My Requests. Admin sees Admin. Legal users see Dashboard, Requests, and Details.

5. What is JSX?
JSX looks like HTML but is written inside JavaScript. React converts JSX into browser elements.

6. What are props?
Props pass data or functions from a parent component to a child component.
Example: <Header currentUser={currentUser} /> passes the logged-in user profile to Header.

7. Where is the backend now?
The app uses the KU API and PostgreSQL for login, requests, comments, checklist updates, approvals, profile changes, audit logs, and centrally stored PDFs.

8. What happens if the API or PostgreSQL is stopped?
The app shows a backend message and protected actions fail clearly instead of silently hiding the backend problem.

9. What is useEffect?
useEffect runs code after React renders. Here it updates the page theme and keeps the current page valid for the selected role.

10. What is localStorage?
localStorage is browser storage. It keeps small pieces of information even after the page is refreshed or reopened.

11. What does document.documentElement mean?
document.documentElement refers to the <html> tag. We add the "dark" class there so dark mode styles apply across the app.
*/
