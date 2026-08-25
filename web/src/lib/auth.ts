import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { db } from "./db";
import { ac, roles } from "./permissions";
import { sendInvitationEmail } from "./email";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  plugins: [
    // Multi-org tenancy: organizations, members, invitations, and our permission roles
    // (capability matrix in permissions.ts).
    organization({
      ac,
      roles,
      sendInvitationEmail,
    }),
    // Instance-level Super Admin: user management across the platform.
    admin(),
  ],
});

export type Auth = typeof auth;
