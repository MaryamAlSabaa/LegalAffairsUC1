import { useState } from "react";
import { getReadableErrorMessage } from "../../utils/errorMessage";
import { checkRegistrationAvailability } from "../../services/authService";
import InfoButton from "../common/InfoButton";
import AuthShell from "./AuthShell";

const prefixOptions = ["None", "Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

function RegisterPage({
  onRegister,
  onShowLogin,
  theme,
  onToggleTheme,
  backendMessage,
}) {
  // One object stores all registration form fields together.
  const [formData, setFormData] = useState({
    prefix: "None",
    fullName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "Requester",
    department: "Legal Affairs",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [availability, setAvailability] = useState({ username: "", email: "" });

  function inputClass(fieldName) {
    return `field-control ${fieldErrors[fieldName] ? "field-control-error" : ""}`;
  }

  function updateField(fieldName, value) {
    // The spread operator (...) copies the old object, then updates one field.
    setFormData({ ...formData, [fieldName]: value });
    setFieldErrors((current) => ({ ...current, [fieldName]: "" }));
    if (fieldName === "username" || fieldName === "email") {
      setAvailability((current) => ({ ...current, [fieldName]: "" }));
    }
  }

  async function checkAvailability(fieldName) {
    const username = formData.username.trim();
    const email = formData.email.trim().toLowerCase();

    if (fieldName === "username" && !USERNAME_PATTERN.test(username)) return;
    if (fieldName === "email" && !EMAIL_PATTERN.test(email)) return;

    try {
      const result = await checkRegistrationAvailability({ email, username });
      const available = fieldName === "username"
        ? result.usernameAvailable
        : result.emailAvailable;
      const message = available
        ? `${fieldName === "username" ? "Username" : "Email address"} is available.`
        : fieldName === "username"
          ? "This username is already taken."
          : "This email address is already registered.";

      setAvailability((current) => ({ ...current, [fieldName]: message }));
      if (!available) {
        setFieldErrors((current) => ({ ...current, [fieldName]: message }));
      }
    } catch (_error) {
      // Registration still performs the same server-side check when submitted.
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setFieldErrors({});

    if (!USERNAME_PATTERN.test(formData.username.trim())) {
      const message = "Username must use only letters, numbers, or underscores. Spaces, dots, and hyphens are not allowed.";
      setFieldErrors({ username: message });
      setErrorMessage(message);
      return;
    }

    if (!EMAIL_PATTERN.test(formData.email.trim())) {
      const message = "Enter an email in the format name@example.com.";
      setFieldErrors({ email: message });
      setErrorMessage(message);
      return;
    }

    if (formData.password.length < 8) {
      const message = "Password must contain at least 8 characters.";
      setFieldErrors({ password: message });
      setErrorMessage(message);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      const message = "Password and confirmation password must match.";
      setFieldErrors({ password: message, confirmPassword: message });
      setErrorMessage(message);
      return;
    }

    setIsLoading(true);

    try {
      await onRegister(formData);
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "";
      if (errorCode === "EMAIL_ALREADY_REGISTERED") {
        setFieldErrors({ email: "This email address is already registered." });
        setErrorMessage("Use a different email address.");
        return;
      }
      if (errorCode === "USERNAME_ALREADY_TAKEN") {
        setFieldErrors({ username: "This username is already taken." });
        setErrorMessage("Choose a different username.");
        return;
      }

      const readableError = getReadableErrorMessage(
        error,
        "Could not create the account. Please try again.",
      );
      const normalizedError = readableError.toLowerCase();
      const nextFieldErrors = {};

      if (normalizedError.includes("email")) {
        nextFieldErrors.email = "Check this email address or use a different one.";
      }
      if (normalizedError.includes("username")) {
        nextFieldErrors.username = "Choose a different username.";
      }
      if (normalizedError.includes("password")) {
        nextFieldErrors.password = "Check the password requirements.";
      }

      if (normalizedError.includes("email") && normalizedError.includes("invalid")) {
        setErrorMessage(
          "The server rejected this email address. Use a valid address such as reviewer@example.com.",
        );
      } else {
        setErrorMessage(readableError);
      }
      setFieldErrors(nextFieldErrors);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create requester account"
      description="Register your KU profile to submit and follow legal matters through the institutional review process."
      theme={theme}
      onToggleTheme={onToggleTheme}
      wide
    >
        <div className="hidden">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xl leading-none"
            onClick={onToggleTheme}
            aria-label="Toggle light and dark mode"
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        <div className="hidden">
          <p className="text-sm font-semibold text-blue-700">
            Legal Affairs Platform
          </p>
          <h1 className="text-3xl font-bold text-slate-900 mt-2">Register</h1>
          <p className="text-slate-500 mt-2">
            Create an account in the shared KU Legal Affairs system.
          </p>
        </div>

        {backendMessage && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            {backendMessage}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="register-grid"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Prefix
            </label>
            <select
              className="field-control"
              value={formData.prefix}
              onChange={(event) => updateField("prefix", event.target.value)}
            >
              {prefixOptions.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              className="field-control"
              value={formData.fullName}
              onChange={(event) => updateField("fullName", event.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="block text-sm font-medium text-slate-700">
                Username
              </label>
              <InfoButton
                label="Username requirements"
                description="Use 3 to 32 letters, numbers, or underscores only. Spaces, dots, and hyphens are not allowed. Example: legal_reviewer"
              />
            </div>
            <input
              className={inputClass("username")}
              value={formData.username}
              onChange={(event) => updateField("username", event.target.value)}
              onBlur={() => checkAvailability("username")}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]{3,32}"
              required
            />
            {fieldErrors.username && (
              <p className="mt-1 text-xs font-semibold text-red-700">
                {fieldErrors.username}
              </p>
            )}
            {!fieldErrors.username && availability.username && (
              <p className="mt-1 text-xs font-semibold text-green-700">
                {availability.username}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="mb-1 flex items-center gap-2">
              <label className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <InfoButton
                label="Accepted email format"
                description="Use a normal email format with text before @, a domain after @, and a domain ending such as .com, .edu, or .org. Example: reviewer@example.com"
              />
            </div>
            <input
              className={inputClass("email")}
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={formData.email}
              onChange={(event) => updateField("email", event.target.value)}
              onBlur={() => checkAvailability("email")}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs font-semibold text-red-700">
                {fieldErrors.email}
              </p>
            )}
            {!fieldErrors.email && availability.email && (
              <p className="mt-1 text-xs font-semibold text-green-700">
                {availability.email}
              </p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <InfoButton
                label="Password requirements"
                description="Use at least 8 characters. You may use letters, numbers, spaces, and special characters."
              />
            </div>
            <input
              className={inputClass("password")}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={formData.password}
              onChange={(event) => updateField("password", event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs font-semibold text-red-700">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="block text-sm font-medium text-slate-700">
                Confirm Password
              </label>
              <InfoButton
                label="Confirm password"
                description="Type the same password again. This helps catch a typing mistake before the account is created."
              />
            </div>
            <input
              className={inputClass("confirmPassword")}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={formData.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
            />
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs font-semibold text-red-700">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <div className="registration-assignment registration-assignment-primary">
            <p className="text-sm font-medium text-slate-700">Role</p>
            <p className="mt-1 font-semibold text-blue-800">Requester</p>
            <p className="mt-1 text-xs text-slate-600">
              Legal Affairs staff roles are assigned later by an administrator.
            </p>
          </div>

          <div className="registration-assignment">
            <p className="text-sm font-medium text-slate-700">Department</p>
            <p className="mt-1 font-semibold text-slate-900">Legal Affairs</p>
            <p className="mt-1 text-xs text-slate-600">
              Public requester accounts are created in Legal Affairs by default.
            </p>
          </div>

          {errorMessage && (
            <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 mt-2">
            <button
              className="button-primary flex-1"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Creating account..." : "Create Account"}
            </button>
            <button
              className="button-secondary flex-1"
              type="button"
              onClick={onShowLogin}
            >
              Back to Login
            </button>
          </div>
        </form>
    </AuthShell>
  );
}

export default RegisterPage;

/*
BEGINNER DOCUMENTATION:

1. Why store form data in an object?
A registration form has many fields. An object keeps related values together in one state variable.

2. What is the spread operator (...)?
It copies existing values. Example: { ...formData, fullName: 'New Name' } keeps old fields and changes fullName.

3. What is map?
map loops through an array and returns new JSX for every item. We use it to create dropdown options.

4. What is a select tag?
<select> creates a dropdown list. <option> creates each choice inside the dropdown.

5. Why is the role shown as Requester instead of a dropdown?
A public visitor should only be able to create a Requester account. Legal staff roles have more access to confidential records, so an Admin User assigns those roles after account verification.

6. Why are there info buttons beside some labels?
They provide a short explanation of accepted email, username, and password input without making the form visually crowded.

7. Why is the theme button on the registration page?
It lets the user switch between light mode and dark mode before creating an account.

8. Why is the theme button icon-only?
The icon keeps the UI compact. aria-label and title still explain the button for accessibility and hover help.
*/
