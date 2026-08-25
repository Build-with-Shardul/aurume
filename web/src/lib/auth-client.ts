import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient } from "better-auth/client/plugins";
import { ac, roles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), adminClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
