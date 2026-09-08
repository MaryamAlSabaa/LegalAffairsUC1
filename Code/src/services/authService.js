import { apiRequest } from "./apiClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

export function getEmailValidationError(email) {
  return !EMAIL_PATTERN.test(email) || email.length > 254 ? "Enter a valid email address, such as name@example.edu." : "";
}

export function getUsernameValidationError(username) {
  return !USERNAME_PATTERN.test(username) ? "Username must be 3–32 characters and use only letters, numbers, or underscores." : "";
}

export function getPasswordValidationError(password) {
  return password.length < 8 ? "Use at least 8 characters." : "";
}

export async function login(usernameOrEmail, password) {
  const result = await apiRequest("/auth/login", { method: "POST", body: { identifier: usernameOrEmail, password } });
  return result.user;
}

export async function checkRegistrationAvailability({ email, username }) {
  const params = new URLSearchParams({ email: email.trim().toLowerCase(), username: username.trim() });
  return apiRequest(`/auth/availability?${params}`);
}

export async function register(formData) {
  const email = formData.email?.trim().toLowerCase() || "";
  const username = formData.username?.trim() || "";
  const validationError = getEmailValidationError(email) || getUsernameValidationError(username) || getPasswordValidationError(formData.password || "");
  if (validationError) throw new Error(validationError);

  const availability = await checkRegistrationAvailability({ email, username });
  if (!availability.emailAvailable) throw new Error("EMAIL_ALREADY_REGISTERED");
  if (!availability.usernameAvailable) throw new Error("USERNAME_ALREADY_TAKEN");
  const result = await apiRequest("/auth/register", { method: "POST", body: { ...formData, email, username } });
  return result.user;
}

export async function logout() {
  await apiRequest("/auth/logout", { method: "POST" });
}

export async function requestPasswordReset(email) {
  await apiRequest("/auth/password-reset/request", { method: "POST", body: { email: email.trim().toLowerCase() } });
}

export async function resetPassword(newPassword) {
  const token = new URLSearchParams(window.location.search).get("reset-token");
  if (!token) throw new Error("The password-reset link is missing or invalid.");
  await apiRequest("/auth/password-reset/confirm", { method: "POST", body: { token, newPassword } });
}

export async function changePassword({ currentPassword, newPassword }) {
  const validationError = getPasswordValidationError(newPassword);
  if (validationError) throw new Error(validationError);
  await apiRequest("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
}

export async function getExistingSessionUser() {
  try {
    const result = await apiRequest("/auth/session");
    return result.user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}
