import { useState } from "react";
import { getPasswordValidationError } from "../../services/authService";
import AuthShell from "./AuthShell";
import Icon from "../common/Icon";

function ResetPasswordPage({ onResetPassword, onShowLogin, theme, onToggleTheme }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) return setErrorMessage(passwordError);
    if (newPassword !== confirmPassword) return setErrorMessage("New password and confirmation password must match.");

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await onResetPassword(newPassword);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not reset the password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account security"
      title="Create a new password"
      description="Choose a secure password for your KU Legal Affairs account. All other sessions will be signed out."
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-group"><span className="field-label">New password</span><span className="field-with-icon"><Icon name="lock" size={18} /><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Enter a new password" required /></span></label>
        <label className="field-group"><span className="field-label">Confirm new password</span><span className="field-with-icon"><Icon name="shield" size={18} /><input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your new password" required /></span></label>
        <p className="password-guidance"><Icon name="check" size={15} /> At least 8 characters; letters, numbers, spaces, and symbols are accepted.</p>
        {errorMessage && <div className="form-alert form-alert-error"><Icon name="warning" size={18} /><span>{errorMessage}</span></div>}
        <button className="button-primary auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Securing account…" : "Update password"}<Icon name="arrowRight" size={18} /></button>
      </form>
      <p className="auth-switch"><button type="button" onClick={onShowLogin}>← Back to secure sign in</button></p>
    </AuthShell>
  );
}

export default ResetPasswordPage;
