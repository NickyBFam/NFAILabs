import { buttonClass } from "@/components/admin/styles";

type SignOutButtonProps = {
  /** The auth layer's sign-out server action (POST; clears the session). */
  action: () => Promise<void>;
};

export function SignOutButton({ action }: SignOutButtonProps) {
  return (
    <form action={action}>
      <button type="submit" className={buttonClass("secondary")}>
        Sign out
      </button>
    </form>
  );
}
