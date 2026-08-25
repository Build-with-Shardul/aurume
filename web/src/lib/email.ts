import { Resend } from "resend";
import { getConnector } from "./connectors";

function baseUrl() {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

/**
 * Sends the invitation email. Resolution order for the sender:
 *   1. the org's connected Resend connector (Settings → Connectors)
 *   2. env RESEND_API_KEY / EMAIL_FROM
 *   3. neither → log the accept link to the server console (dev)
 */
export async function sendInvitationEmail(data: {
  id: string;
  email: string;
  role?: string;
  organization?: { id?: string; name?: string };
  inviter?: { user?: { name?: string; email?: string } };
}) {
  const acceptUrl = `${baseUrl()}/accept-invitation/${data.id}`;
  const orgName = data.organization?.name || "Aurume";
  const inviter = data.inviter?.user?.name || data.inviter?.user?.email || "your team";
  const subject = `You've been invited to ${orgName}`;

  let apiKey: string | null = process.env.RESEND_API_KEY || null;
  let from = process.env.EMAIL_FROM || "Aurume <noreply@aurume.dev>";

  if (data.organization?.id) {
    try {
      const c = await getConnector(data.organization.id, "resend");
      if (c?.secret) {
        apiKey = c.secret;
        if (c.config.fromEmail) from = c.config.fromEmail;
      }
    } catch {
      /* fall back below */
    }
  }

  if (!apiKey) {
    console.log(
      `\n[invite] ${data.email} as "${data.role ?? "member"}" → ${acceptUrl}\n(No Resend connected — link logged for dev.)\n`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f5f9;padding:24px;color:#17141d">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e3ee;border-radius:12px;padding:30px">
    <h2 style="margin:0 0 8px">You're invited to ${orgName}</h2>
    <p style="color:#555;line-height:1.6;margin:0 0 20px">${inviter} invited you to join <strong>${orgName}</strong> on Aurume as <strong>${data.role ?? "member"}</strong>.</p>
    <a href="${acceptUrl}" style="display:inline-block;background:#08060d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Accept invitation</a>
    <p style="color:#8f8a9c;font-size:12px;margin:22px 0 0">Or paste this link: ${acceptUrl}</p>
  </div></body></html>`;

  await resend.emails.send({ from, to: data.email, subject, html });
}
