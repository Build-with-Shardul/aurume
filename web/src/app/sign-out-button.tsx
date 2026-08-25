"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/login");
        router.refresh();
      }}
      className="text-neutral-500 hover:text-neutral-900"
    >
      Sign out
    </button>
  );
}
