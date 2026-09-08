import { useState } from "react";
import AuthShell from "./AuthShell";
import Icon from "../common/Icon";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPasswordPage({ onRequestReset, onShowLogin, theme, onToggleTheme }) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) return setErrorMessage("Enter a valid email address, such as name@example.edu.");

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);
    try {
      await onRequestReset(trimmedEmail);
      setSuccessMessage("If an account exists for this email, a password-reset link has been sent.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not request a password reset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your registered email and we will send instructions to restore secure access."
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-group">
          <span className="field-label">Email address</span>
          <span className="field-with-icon">
            <Icon name="mail" size={18} />
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@ku.ac.ae" required />
          </span>
        </label>
        {errorMessage && <div className="form-alert form-alert-error"><Icon name="warning" size={18} /><span>{errorMessage}</span></div>}
        {successMessage && <div className="form-alert form-alert-success"><Icon name="check" size={18} /><span>{successMessage}</span></div>}
        <button className="button-primary auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Sending secure link…" : "Send reset link"}<Icon name="arrowRight" size={18} /></button>
      </form>
      <p className="auth-switch"><button type="button" onClick={onShowLogin}>← Back to secure sign in</button></p>
    </AuthShell>
  );
}

export default ForgotPasswordPage;
