import { useState } from "react";
import { getPasswordValidationError } from "../../services/authService";
import Icon from "../common/Icon";

function getDisplayName(user) {
  return !user.prefix || user.prefix === "None" ? user.name : `${user.prefix} ${user.name}`;
}

function getInitials(name = "KU User") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function Header({ currentUser, currentPage, onLogout, onChangePassword, theme, onToggleTheme }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const displayName = getDisplayName(currentUser);
  const pageLabels = {
    dashboard: "Overview",
    "new-request": "Submit a Legal Request",
    requests: "Legal Requests",
    "closed-requests": "Closed Requests",
    details: "Request Details",
    reviewers: "Review Team",
    admin: "User Administration",
    "owner-controls": "Owner Controls",
    "legal-engine": "Legal AI Engine",
    audit: "Audit Log",
    "reviewer-review-queue": "My Review Queue",
    "manager-review-queue": "My Approval Queue",
    "department-review-queue": "My Approval Queue",
  };

  function openSettings() {
    setShowSettings(true);
    setShowProfileMenu(false);
  }

  function updatePasswordField(fieldName, value) {
    setPasswordForm((current) => ({ ...current, [fieldName]: value }));
  }

  function resetPasswordForm() {
    setShowPasswordForm(false);
    setPasswordError("");
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    const validationError = getPasswordValidationError(passwordForm.newPassword);
    if (validationError) return setPasswordError(validationError);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return setPasswordError("New password and confirmation password must match.");
    }

    setPasswordError("");
    setIsChangingPassword(true);
    try {
      await onChangePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Could not change the password.");
      setIsChangingPassword(false);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-title-block">
          <p><span>Khalifa University</span><Icon name="chevronRight" size={12} /> Legal Affairs</p>
          <h1>{pageLabels[currentPage] || "Legal Affairs Platform"}</h1>
        </div>

        <div className="header-actions">
          <div className="secure-session"><span /> Secure session</div>
          <button type="button" className="icon-button" onClick={onToggleTheme} aria-label="Toggle color theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
          </button>

          <div className="profile-control">
            <button
              type="button"
              className="profile-trigger"
              onClick={() => setShowProfileMenu((open) => !open)}
              aria-expanded={showProfileMenu}
            >
              <span className="profile-avatar">{getInitials(displayName)}</span>
              <span className="profile-copy">
                <strong>{displayName}</strong>
                <small>{currentUser.role}</small>
              </span>
              <Icon name="chevronDown" size={15} />
            </button>

            {showProfileMenu && (
              <div className="profile-menu">
                <div className="profile-menu-heading">
                  <strong>{displayName}</strong>
                  <span>{currentUser.email}</span>
                </div>
                <button type="button" onClick={openSettings}><Icon name="settings" size={17} /> Profile & security</button>
                <button type="button" className="danger-menu-item" onClick={onLogout}><Icon name="logout" size={17} /> Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-modal-header">
              <div>
                <p className="page-kicker">Account centre</p>
                <h2 id="settings-title">Profile & security</h2>
                <p>Manage your KU Legal Affairs account information.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button>
            </header>

            <div className="settings-identity">
              <span className="settings-avatar">{getInitials(displayName)}</span>
              <div><strong>{displayName}</strong><p>{currentUser.role} · {currentUser.department}</p></div>
            </div>

            <div className="settings-grid">
              <div><span>Username</span><strong>@{currentUser.username || currentUser.name}</strong></div>
              <div><span>Prefix</span><strong>{currentUser.prefix || "None"}</strong></div>
              <div className="settings-email"><span>Email address</span><strong>{showEmail ? currentUser.email || "No email saved" : "••••••••••••••••"}</strong><button type="button" onClick={() => setShowEmail((visible) => !visible)}>{showEmail ? "Hide" : "Reveal"}</button></div>
            </div>

            <div className="security-panel">
              <div className="security-panel-title"><span><Icon name="lock" size={18} /></span><div><strong>Password security</strong><p>Changing your password will sign out all active sessions.</p></div></div>
              {!showPasswordForm ? (
                <button type="button" className="button-secondary" onClick={() => setShowPasswordForm(true)}>Change password</button>
              ) : (
                <form className="password-form" onSubmit={submitPasswordChange}>
                  <input className="field-control" type="password" autoComplete="current-password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordField("currentPassword", event.target.value)} required />
                  <div className="two-column-fields">
                    <input className="field-control" type="password" autoComplete="new-password" placeholder="New password" value={passwordForm.newPassword} onChange={(event) => updatePasswordField("newPassword", event.target.value)} required />
                    <input className="field-control" type="password" autoComplete="new-password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordField("confirmPassword", event.target.value)} required />
                  </div>
                  {passwordError && <p className="form-error">{passwordError}</p>}
                  <div className="modal-actions">
                    <button type="submit" className="button-primary" disabled={isChangingPassword}>{isChangingPassword ? "Updating…" : "Update password"}</button>
                    <button type="button" className="button-quiet" onClick={resetPasswordForm} disabled={isChangingPassword}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default Header;
