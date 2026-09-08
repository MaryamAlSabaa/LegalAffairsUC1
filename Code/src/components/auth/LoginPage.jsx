import { useState } from "react";
import { getReadableErrorMessage } from "../../utils/errorMessage";
import Icon from "../common/Icon";
import AuthShell from "./AuthShell";

const demoAccounts = ["requester", "reviewer", "manager", "approver", "admin"];

function LoginPage({ onLogin, onShowRegister, onShowForgotPassword, theme, onToggleTheme, backendMessage }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const showDemoAccounts = import.meta.env.DEV;

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setFieldErrors({});
    setIsLoading(true);

    try {
      await onLogin({ username, password });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "";
      if (errorCode === "USERNAME_NOT_FOUND") {
        setFieldErrors({ identifier: "No account was found for this username." });
        setErrorMessage("Check the highlighted username, or sign in with your email address.");
      } else {
        setFieldErrors({ password: "Check your password and try again." });
        setErrorMessage(getReadableErrorMessage(error, "Could not sign in. Check your credentials and try again."));
      }
    } finally {
      setIsLoading(false);
    }
  }

  function chooseDemoAccount(account) {
    setUsername(account);
    setPassword("password123");
    setErrorMessage("");
    setFieldErrors({});
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to manage legal requests, reviews, approvals, and institutional records."
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      {backendMessage && (
        <div className="system-notice">
          <span className="system-notice-icon"><Icon name="activity" size={17} /></span>
          <div><strong>Environment status</strong><p>{backendMessage}</p></div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="field-group">
          <span className="field-label">Username or email</span>
          <span className={`field-with-icon ${fieldErrors.identifier ? "has-error" : ""}`}>
            <Icon name="user" size={19} />
            <input
              type="text"
              placeholder="Enter your KU account"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setFieldErrors((current) => ({ ...current, identifier: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.identifier)}
              maxLength={254}
              autoComplete="username"
              required
            />
          </span>
          {fieldErrors.identifier && <span className="field-error">{fieldErrors.identifier}</span>}
        </label>

        <label className="field-group">
          <span className="field-label-row"><span className="field-label">Password</span><button type="button" onClick={onShowForgotPassword}>Forgot password?</button></span>
          <span className={`field-with-icon ${fieldErrors.password ? "has-error" : ""}`}>
            <Icon name="lock" size={18} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, password: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              autoComplete="current-password"
              maxLength={128}
              required
            />
            <button className="field-action" type="button" onClick={() => setShowPassword((visible) => !visible)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
        </label>

        {errorMessage && <div className="form-alert form-alert-error"><Icon name="warning" size={18} /><span>{errorMessage}</span></div>}

        <button className="button-primary auth-submit" type="submit" disabled={isLoading}>
          <span>{isLoading ? "Verifying account…" : "Sign in securely"}</span>
          {!isLoading && <Icon name="arrowRight" size={18} />}
        </button>
      </form>

      {showDemoAccounts && (
        <div className="demo-access">
          <div className="demo-divider"><span>Local demonstration access</span></div>
          <div className="demo-account-list">
            {demoAccounts.map((account) => (
              <button type="button" key={account} onClick={() => chooseDemoAccount(account)}>{account}</button>
            ))}
          </div>
          <p>Select a role to prefill its seeded local account.</p>
        </div>
      )}

      <p className="auth-switch">Need access? <button type="button" onClick={onShowRegister}>Create a requester account</button></p>
    </AuthShell>
  );
}

export default LoginPage;
