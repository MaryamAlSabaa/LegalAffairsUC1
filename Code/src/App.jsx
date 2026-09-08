import { useEffect, useState } from "react";
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
  assignReviewerAsManager,
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
  fetchRequestOverview,
  fetchLegalAffairEngineEvents,
  fetchLegalAffairEngineState,
  setLegalAffairEngineRunning,
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

function App() {
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
  const [reviewerOverviewRequests, setReviewerOverviewRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [engineState, setEngineState] = useState(null);
  const [engineEvents, setEngineEvents] = useState([]);
  const [activeUserIds, setActiveUserIds] = useState([]);

  // selectedRequestId controls which request appears on the Request Details page.
  // It starts as null so users must open a request from a table before seeing details.
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [dashboardRequestFilter, setDashboardRequestFilter] = useState(null);

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
  const dashboardFilteredRequests = visibleRequests.filter((request) => {
    if (!dashboardRequestFilter || dashboardRequestFilter === "all") return true;
    if (dashboardRequestFilter === "pending") {
      return !["Closed", "Archived", "Approved"].includes(request.status);
    }
    if (dashboardRequestFilter === "under-review") {
      return ![
        "Closed",
        "Archived",
        "Approved",
        "Waiting for More Information",
      ].includes(request.status);
    }
    if (dashboardRequestFilter === "high-risk") return request.riskLevel === "High";
    return true;
  });
  const requesterCurrentRequests =
    currentRole === "Requester"
      ? visibleRequests.filter((request) => request.status !== "Closed")
      : [];
  const requesterClosedRequests =
    currentRole === "Requester"
      ? visibleRequests.filter((request) => request.status === "Closed")
      : [];
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
            request.assignedReviewerId === currentUser.id &&
            request.status !== "Closed",
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
    if (!accessiblePageIds.includes(currentPage)) {
      setCurrentPage(accessibleNavigation[0].id);
    }
  }, [currentRole, currentPage, accessibleNavigation, accessiblePageIds]);

  // Changing role or department changes which requests are visible.
  // We clear the selected request so each role must intentionally open a row first.
  useEffect(() => {
    setSelectedRequestId(null);
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
      const refreshedUsers = await fetchBackendUsers().catch(() => []);
      if (refreshedUsers.length > 0) {
        setUsers(refreshedUsers);
        setActiveUserIds(refreshedUsers.filter((user) => user.isActive).map((user) => user.id));
      }
      if (currentUser.role === "Legal Reviewer") {
        const refreshedOverview = await fetchRequestOverview().catch(() => null);
        if (refreshedOverview) setReviewerOverviewRequests(refreshedOverview);
      }
    }

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 30_000);
    return () => window.clearInterval(intervalId);
  }, [isLoggedIn, currentUser?.id]);

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
      backendRequestOverview,
    ] = await Promise.all([
      fetchBackendRequests(),
      fetchBackendUsers(),
      fetchBackendAuditLogs().catch(() => []),
      canReadEngineData ? fetchLegalAffairEngineState().catch(() => null) : null,
      canReadEngineData ? fetchLegalAffairEngineEvents().catch(() => []) : [],
      userForAccess.role === "Legal Reviewer" ? fetchRequestOverview() : [],
    ]);

    setRequests(backendRequests);
    setUsers(backendUsers);
    setAuditLogs(backendAuditLogs);
    setEngineState(backendEngineState);
    setEngineEvents(backendEngineEvents);
    setReviewerOverviewRequests(backendRequestOverview);
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
    const shouldPollAiState =
      isLoggedIn &&
      (hasActiveAiReview || currentPage === "legal-engine");

    if (!shouldPollAiState) return undefined;

    const intervalId = window.setInterval(async () => {
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
        setRequests(refreshedRequests);
        setEngineState(refreshedEngineState);
        setEngineEvents(refreshedEngineEvents);
      } catch (error) {
        setBackendMessage(
          `Could not refresh AI review queue status: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isLoggedIn, hasActiveAiReview, currentPage]);

  async function applyAuthenticatedUser(user) {
    setCurrentUser(user);
    setCurrentRole(user.role);
    setCurrentDepartment(user.department);
    setSelectedRequestId(null);
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
  }

  async function addAuditLog(
    action,
    user = currentUser.name,
    requestId = "System",
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
      await createBackendAuditLog(action, currentUser, requestId);
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
    setCurrentPage("requests");
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

  async function handleAddRequestComment(requestId, commentText) {
    await createBackendRequestComment({ requestId, currentUser, commentText });

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
            },
          ],
        };
      }),
    );
  }

  async function handleManagerDecision(requestId, decision) {
    const savedDecision = await createBackendManagerAction({
      requestId,
      currentUser,
      decision,
    });

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              managerDecision: savedDecision.managerDecision,
              status: savedDecision.status,
            }
          : request,
      ),
    );

    await addAuditLog(decision, currentUser.name, requestId);
    return savedDecision;
  }


  async function handleManagerAssignReviewer(requestId, reviewerId) {
    const assignment = await assignReviewerAsManager({ requestId, reviewerId });

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              assignedReviewer: assignment.reviewerName,
              assignedReviewerId: assignment.reviewerId,
              managerDecision: "Reviewer assigned by Legal Manager",
              status: assignment.status,
            }
          : request,
      ),
    );

    await addAuditLog(
      `Assigned reviewer: ${assignment.reviewerName}`,
      currentUser.name,
      requestId,
    );
  }

  async function handleReviewerRoute(requestId, destination, commentText) {
    const routedRequest = await routeRequestAsReviewer({
      requestId,
      destination,
      commentText,
    });
    const destinationLabel = {
      requester: "Requester",
      legal_manager: "Legal Manager",
      department_approver: "Department Approver",
    }[destination] || "workflow recipient";

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: routedRequest.status,
              reviewerComments: [
                ...(request.reviewerComments || []),
                {
                  authorName: currentUser.name,
                  authorRole: currentUser.role,
                  text: commentText,
                },
              ],
            }
          : request,
      ),
    );

    await addAuditLog(
      `Sent request to ${destinationLabel}: ${commentText}`,
      currentUser.name,
      requestId,
    );
  }

  async function handleDepartmentApproval(requestId, decision, commentText) {
    const savedDecision = await createBackendDepartmentApproval({
      requestId,
      currentUser,
      decision,
      commentText,
    });

    setRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              departmentDecision: savedDecision.departmentDecision,
              status: savedDecision.status,
            }
          : request,
      ),
    );

    await addAuditLog(decision, currentUser.name, requestId);
    return savedDecision;
  }

  async function handleChecklistItemToggle({
    requestId,
    documentId,
    checklistItemId,
    criteria,
    checked,
  }) {
    await updateBackendChecklistItem({ checklistItemId, checked });

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
    setSelectedRequestId(requestId);

    if (accessiblePageIds.includes("details")) {
      setCurrentPage("details");
    }
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

  function renderCurrentPage() {
    if (currentPage === "dashboard") {
      return (
        <DashboardCards
          requests={
            currentRole === "Legal Reviewer" ? reviewerReviewRequests : visibleRequests
          }
          onSelectFilter={(filter) => {
            setDashboardRequestFilter(filter);
            setCurrentPage(
              currentRole === "Legal Reviewer"
                ? "reviewer-review-queue"
                : "requests",
            );
          }}
          currentUser={currentUser}
          allRequests={
            currentRole === "Legal Reviewer" ? reviewerOverviewRequests : visibleRequests
          }
          onSelectRequest={handleSelectRequest}
        />
      );
    }

    if (currentPage === "requests") {
      return (
        <RequestTable
          requests={
            currentRole === "Legal Reviewer"
              ? reviewerReviewRequests
              : dashboardRequestFilter
                ? dashboardFilteredRequests
                : currentRole === "Requester"
                  ? requesterCurrentRequests
                  : visibleRequests
          }
          onSelectRequest={handleSelectRequest}
          canOpenDetails={accessiblePageIds.includes("details")}
          title={
            currentRole === "Requester"
              ? "My Current Requests"
              : currentRole === "Legal Reviewer"
                ? "Requests Assigned to You"
                : dashboardRequestFilter === "all"
                ? "Global Requests"
                : dashboardRequestFilter === "pending"
                  ? "Pending Requests"
                  : dashboardRequestFilter === "under-review"
                    ? "Requests Under Review"
                    : dashboardRequestFilter === "high-risk"
                      ? "High Risk Requests"
              : currentRole === "Department Approver"
                ? `Department Legal Requests for ${currentDepartment}`
                : "Legal Requests"
          }
          description={
            currentRole === "Requester"
              ? "View your active submitted requests. Closed requests are kept in My Closed Requests."
              : currentRole === "Legal Reviewer"
                ? "Requests assigned to you for Legal Reviewer action. Closed requests are excluded."
                : currentRole === "Department Approver"
                ? `Review legal requests for your current department: ${currentDepartment}.`
                : "Track request category, department, priority, reviewer, deadline, and status."
          }
        />
      );
    }

    if (currentPage === "closed-requests") {
      return (
        <RequestTable
          requests={requesterClosedRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          title="My Closed Requests"
          description="Closed requests you submitted are retained here for reference."
        />
      );
    }

    if (currentPage === "reviewer-review-queue") {
      return (
        <RequestTable
          requests={reviewerReviewRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          title="Requests Assigned to You"
          description="Requests assigned to you for Legal Reviewer action. Closed requests are excluded."
        />
      );
    }

    if (currentPage === "manager-review-queue") {
      return (
        <RequestTable
          requests={managerReviewRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          title="My Manager Review Queue"
          description="Requests routed to you by Legal Reviewers and awaiting your Legal Manager decision."
        />
      );
    }

    if (currentPage === "department-review-queue") {
      return (
        <RequestTable
          requests={departmentReviewRequests}
          onSelectRequest={handleSelectRequest}
          canOpenDetails={true}
          title="My Department Review Queue"
          description="Requests routed to you for a Department Approver decision."
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
          currentUser={currentUser}
          canManageReview={canManageReview(currentRole)}
          canManageManagerActions={canManageManagerActions(currentRole)}
          canManageDepartmentApproval={canManageDepartmentApproval(currentRole)}
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
          onAssignReviewer={(reviewerId) =>
            handleManagerAssignReviewer(selectedRequest.id, reviewerId)
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
        onChangePage={setCurrentPage}
        navigationItems={navigationItemsForSidebar}
        currentUser={currentUser}
      />

      <div className="app-workspace">
        <Header
          currentUser={currentUser}
          currentPage={currentPage}
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
