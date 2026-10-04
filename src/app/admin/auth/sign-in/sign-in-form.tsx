"use client";

import { useActionState } from "react";
import {
  INITIAL_SIGN_IN_STATE,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  SIGN_IN_ERROR_MESSAGES,
  type SignInState,
} from "@/lib/auth/sign-in-state";

const inputClass =
  "mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-foreground focus:border-focus focus:outline-2 focus:outline-focus";

/**
 * Email and password sign-in. The password goes straight to the server action; the
 * browser never receives a token (the session lives in httpOnly cookies). The server
 * action is passed in by the page, so this Client Component imports no server module.
 */
export function SignInForm({
  action,
  next,
}: {
  action: (previous: SignInState, formData: FormData) => Promise<SignInState>;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_SIGN_IN_STATE);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="admin-email" className="block text-sm font-medium text-foreground">
          Email address
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={MAX_EMAIL_LENGTH}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="admin-password" className="block text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={MAX_PASSWORD_LENGTH}
          className={inputClass}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-notice-foreground">
          {SIGN_IN_ERROR_MESSAGES[state.error]}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
