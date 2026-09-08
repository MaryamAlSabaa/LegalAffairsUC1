import { useMemo, useState } from "react";
import { departments, roles } from "../../data/mockData";
import Icon from "../common/Icon";

const DEPARTMENT_APPROVER_ROLE = "Department Approver";
const ADMIN_ROLE = "Admin User";
const OWNER_ROLE = "Owner";

function canManageRole(currentRole, targetRole, targetId, currentUserId) {
  if (targetId === currentUserId || targetRole === OWNER_ROLE) return false;
  if (currentRole === OWNER_ROLE) return true;
  return currentRole === ADMIN_ROLE && targetRole !== ADMIN_ROLE;
}

function availableRoles(currentRole) {
  if (currentRole === OWNER_ROLE) {
    return roles.filter((role) => role !== OWNER_ROLE);
  }

  return roles.filter((role) => ![ADMIN_ROLE, OWNER_ROLE].includes(role));
}

function AdminUsers({
  users,
  setUsers,
  onAuditEvent,
  currentUser,
  activeUserIds,
  onUpdateUserRole,
  onUpdateUserDepartment,
}) {
  const [savingUserId, setSavingUserId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const activity = activeUserIds.includes(user.id) ? "active online" : "inactive offline";
      return [user.name, user.username, user.email, user.id, user.role, user.department, user.status, activity]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [users, searchTerm, activeUserIds]);

  async function updateUserRole(userId, newRole) {
    const selectedUser = users.find((user) => user.id === userId);
    if (!selectedUser || selectedUser.role === newRole) return;

    if (!canManageRole(currentUser.role, selectedUser.role, userId, currentUser.id)) {
      setErrorMessage("You do not have permission to change this user's role.");
      return;
    }

    if (!availableRoles(currentUser.role).includes(newRole)) {
      setErrorMessage("You cannot assign that role.");
      return;
    }

    setSavingUserId(userId);
    setErrorMessage("");
    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              role: newRole,
              department:
                newRole === DEPARTMENT_APPROVER_ROLE
                  ? user.department
                  : "Legal Affairs",
            }
          : user,
      ),
    );

    try {
      await onUpdateUserRole(userId, newRole);
      await onAuditEvent(
        `Changed ${selectedUser.username}'s role from ${selectedUser.role} to ${newRole}`,
        currentUser.name,
        "Admin",
      );
    } catch (error) {
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? {
                ...user,
                role: selectedUser.role,
                department: selectedUser.department,
              }
            : user,
        ),
      );
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save user role.",
      );
    } finally {
      setSavingUserId("");
    }
  }

  async function updateUserDepartment(userId, newDepartment) {
    const selectedUser = users.find((user) => user.id === userId);
    if (!selectedUser || selectedUser.department === newDepartment) return;

    setSavingUserId(userId);
    setErrorMessage("");
    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId ? { ...user, department: newDepartment } : user,
      ),
    );

    try {
      await onUpdateUserDepartment(userId, newDepartment);
      await onAuditEvent(
        `Changed ${selectedUser.username}'s department from ${selectedUser.department} to ${newDepartment}`,
        currentUser.name,
        "Admin",
      );
    } catch (error) {
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId
            ? { ...user, department: selectedUser.department }
            : user,
        ),
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save user department.",
      );
    } finally {
      setSavingUserId("");
    }
  }

  return (
    <section>
      <div className="page-heading table-page-heading">
        <div>
          <p className="page-kicker">Identity administration</p>
          <h2>Manage users and roles</h2>
          <p>Search all accounts and maintain institutional roles, departments, and access assignments.</p>
        </div>
        <div className="record-count"><span>{filteredUsers.length}</span><div><strong>accounts</strong><small>of {users.length} total</small></div></div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="account-search-toolbar">
          <label className="table-search account-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, username, email, ID, role, department, or activity"
            />
            {searchTerm && <button type="button" onClick={() => setSearchTerm("")} aria-label="Clear account search">Clear</button>}
          </label>
          <span className="account-search-count">Showing {filteredUsers.length} of {users.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-4">User</th>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Role</th>
                <th className="text-left p-4">Department</th>
                <th className="text-left p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td className="table-empty" colSpan={5}><span><Icon name="search" size={23} /></span><strong>No matching accounts</strong><p>Try a name, username, email, role, department, or account ID.</p></td></tr>
              ) : filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="p-4">
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">
                      @{user.username} • {user.id}
                    </p>
                  </td>
                  <td className="p-4 text-slate-700">{user.email}</td>
                  <td className="p-4">
                    {user.role === OWNER_ROLE || user.id === currentUser.id ? (
                      <span className="font-medium text-slate-700">{user.role}</span>
                    ) : (
                      <select
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        value={user.role}
                        onChange={(event) =>
                          updateUserRole(user.id, event.target.value)
                        }
                        disabled={
                          savingUserId === user.id ||
                          !canManageRole(
                            currentUser.role,
                            user.role,
                            user.id,
                            currentUser.id,
                          )
                        }
                        title={
                          user.id === currentUser.id
                            ? "You cannot change your own role."
                            : currentUser.role === ADMIN_ROLE && user.role === ADMIN_ROLE
                              ? "Only an Owner can change another Admin User's role."
                              : undefined
                        }
                      >
                        {availableRoles(currentUser.role).map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-4">
                    {user.role === DEPARTMENT_APPROVER_ROLE ? (
                      <select
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        value={user.department}
                        onChange={(event) =>
                          updateUserDepartment(user.id, event.target.value)
                        }
                        disabled={savingUserId === user.id}
                      >
                        {departments.map((department) => (
                          <option key={department} value={department}>
                            {department}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium text-slate-700">
                        {user.department}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {activeUserIds.includes(user.id) ? (
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
                        Active
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-semibold">
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="mt-5 bg-blue-50 border border-blue-200 rounded-2xl p-5 text-slate-700">
        <p className="font-semibold text-blue-950">Security note</p>
        <p className="mt-2">
          The UI saves profile changes through the API, which independently
          enforces who is allowed to manage users.
        </p>
      </div>
    </section>
  );
}

export default AdminUsers;

/*
BEGINNER DOCUMENTATION:

1. What is an admin page?
An admin page is used by administrators to manage system settings, users, roles, and permissions.

2. What is stateful table data?
The users table is stored in App.jsx state, so changing a role immediately updates what appears on screen and stays visible when switching pages.

3. What does map do here?
map loops through every user and creates one table row for each user.

4. What is an audit event?
An audit event records an important action, such as changing a user's role or department.

5. Why is this not real security?
Frontend restrictions can be changed by a user in the browser. Real role security must also be checked by the backend.
*/
