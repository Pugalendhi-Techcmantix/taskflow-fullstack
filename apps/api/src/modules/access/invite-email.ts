import type { EmailMessage } from '../../email/email-sender';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function inviteEmail(input: { to: string; inviterName: string; roleName: string; link: string; expiresAt: Date }): EmailMessage {
  const expires = input.expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const subject = `${input.inviterName} invited you to TaskFlow`;
  const text = [
    `Hi,`,
    ``,
    `${input.inviterName} invited you to join TaskFlow as ${input.roleName}.`,
    ``,
    `Accept the invite and set your password here:`,
    input.link,
    ``,
    `This link works once and expires on ${expires}.`,
    `If you weren't expecting this email, you can ignore it.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1b1f2a">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e6ef;border-radius:12px">
    <tr><td style="padding:28px">
      <div style="font-weight:700;font-size:17px;margin-bottom:20px"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px">TF</span>TaskFlow</div>
      <p style="margin:0 0 12px"><b>${escapeHtml(input.inviterName)}</b> invited you to join TaskFlow as <b>${escapeHtml(input.roleName)}</b>.</p>
      <p style="margin:24px 0"><a href="${escapeHtml(input.link)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">Accept invite</a></p>
      <p style="margin:0 0 6px;color:#6b7280;font-size:13px">This link works once and expires on ${escapeHtml(expires)}.</p>
      <p style="margin:0;color:#6b7280;font-size:13px">If you weren't expecting this email, you can ignore it.</p>
    </td></tr>
  </table></body></html>`;

  return { to: input.to, subject, text, html };
}
