/**
 * Sign-in form state shared by the server action and the form. Error codes are
 * deliberately coarse: they never reveal whether an email address has an account.
 */
export type SignInError =
  "invalid_input" | "invalid_credentials" | "not_authorized" | "rate_limited" | "unavailable";

export type SignInState = { readonly error: SignInError | null };

export const INITIAL_SIGN_IN_STATE: SignInState = { error: null };

export const SIGN_IN_ERROR_MESSAGES: Record<SignInError, string> = {
  invalid_input: "Enter your email address and password.",
  invalid_credentials: "The email address or password is incorrect.",
  not_authorized: "This account does not have access to the NFAI Labs admin.",
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
  unavailable: "Sign-in is unavailable right now. Try again later.",
};

export const MAX_EMAIL_LENGTH = 320;
export const MAX_PASSWORD_LENGTH = 1024;

/** Validates raw form values without trusting their types. */
export function parseSignInForm(
  formData: FormData,
): { email: string; password: string; next: string | null } | null {
  const email = formData.get("email");
  const password = formData.get("password");
  const next = formData.get("next");
  if (typeof email !== "string" || typeof password !== "string") return null;
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > MAX_EMAIL_LENGTH || !trimmed.includes("@")) {
    return null;
  }
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return null;
  return { email: trimmed, password, next: typeof next === "string" ? next : null };
}
