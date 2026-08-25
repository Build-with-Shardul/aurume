import { redirect } from "next/navigation";
import { hasUsers } from "@/lib/auth-server";
import SetupForm from "./setup-form";

// First-run only: once any user exists, setup is closed.
export default async function SetupPage() {
  if (await hasUsers()) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-neutral-900">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Set up Aurume</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          Create the owner account and your first workspace. You&apos;ll be able to invite your team next.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
