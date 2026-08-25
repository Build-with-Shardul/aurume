import { Resend } from "resend";

const from = process.env.EMAIL_FROM || "Aurume <noreply@aurume.dev>";
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

function baseUrl() {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

/**
 * Called by the organization plugin when someone is invited. `data.id` is the invitation id;
 * the invitee accepts (and sets a password if new) at /accept-invitation/[id].
 *
 * If RESEND_API_KEY isn't set (common in early dev), we log the accept link to the server
 * console instead of failing, so the invite flow is still testable.
 */
export async function sendInvitationEmail(data: {
  id: string;
  email: string;
  role?: string;
  organization?: { name?: string };
  inviter?: { user?: { name?: string; email?: string } };
}) {
  const acceptUrl = `${baseUrl()}/accept-invitation/${data.id}`;
  const orgName = data.organization?.name || "Aurume";
  const inviter = data.inviter?.user?.name || data.inviter?.user?.email || "your team";
  const subject = `You've been invited to ${orgName}`;

  if (!resend) {
    console.log(
      `\n[invite] ${data.email} as "${data.role ?? "member"}" → ${acceptUrl}\n(RESEND_API_KEY not set — link logged for dev.)\n`,
    );
    return;
  }

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f5f9;padding:24px;color:#17141d">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e3ee;border-radius:12px;padding:30px">
    <h2 style="margin:0 0 8px">You're invited to ${orgName}</h2>
    <p style="color:#555;line-height:1.6;margin:0 0 20px">${inviter} invited you to join <strong>${orgName}</strong> on Aurume as <strong>${data.role ?? "member"}</strong>.</p>
    <a href="${acceptUrl}" style="display:inline-block;background:#08060d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Accept invitation</a>
    <p style="color:#8f8a9c;font-size:12px;margin:22px 0 0">Or paste this link: ${acceptUrl}</p>
  </div></body></html>`;

  await resend.emails.send({ from, to: data.email, subject, html });
}
