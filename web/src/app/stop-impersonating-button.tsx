"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function StopImpersonatingButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.admin.stopImpersonating();
        router.push("/superadmin");
        router.refresh();
      }}
      className="font-medium underline underline-offset-2"
    >
      Stop impersonating
    </button>
  );
}
