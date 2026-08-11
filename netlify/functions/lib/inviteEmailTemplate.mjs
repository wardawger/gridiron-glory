// netlify/functions/lib/inviteEmailTemplate.mjs
//
// Generic, parameterized email templates for this app's transactional
// emails. Kept separate from any one function so a future email (e.g. a
// waiver-won notification) can reuse the same shell/colors without
// duplicating markup. Inline styles throughout — email clients don't
// support external stylesheets or most CSS features, so this deliberately
// doesn't reach for Tailwind classes despite matching the app's palette.

const COLOR = {
  bg:      '#0d1117', // turf-950
  card:    '#212529', // turf-900
  border:  '#343a40', // turf-800
  text:    '#f8f9fa', // turf-50
  muted:   '#adb5bd', // turf-500
  field:   '#22c55e', // field-500
  fieldDk: '#052e16', // field-950
};

// Wraps arbitrary inner HTML in the shared shell: dark card, logomark,
// centered layout, footer. Every email in this app should render through
// this so a new one automatically looks like it belongs to the product.
function emailShell({ preheader, bodyHtml }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gridiron Glory</title>
  </head>
  <body style="margin:0; padding:0; background:${COLOR.bg}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <span style="display:none; font-size:1px; color:${COLOR.bg}; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bg};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:44px; height:44px; border-radius:12px; background:${COLOR.field}; text-align:center; vertical-align:middle;">
                      <span style="font-family:Georgia,serif; font-weight:700; font-size:24px; color:${COLOR.fieldDk}; line-height:44px;">G</span>
                    </td>
                    <td style="padding-left:12px; vertical-align:middle;">
                      <span style="font-size:20px; font-weight:700; letter-spacing:0.04em; color:${COLOR.text};">GRIDIRON GLORY</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:${COLOR.card}; border:1px solid ${COLOR.border}; border-radius:16px; padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <span style="font-size:12px; color:${COLOR.muted};">Gridiron Glory &mdash; College Football Fantasy League</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Generic invite email — used for every league invite, regardless of
// whether the recipient already has an account.
export function buildInviteEmailHtml({ leagueName, inviterName, joinUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:13px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.field};">You're invited</p>
    <h1 style="margin:0 0 16px; font-size:26px; line-height:1.3; color:${COLOR.text};">${escapeHtml(inviterName)} invited you to join<br/>${escapeHtml(leagueName)}</h1>
    <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:${COLOR.muted};">
      Gridiron Glory is a private college football fantasy league. Draft real FBS teams with your league,
      then score points every week based on how they actually perform &mdash; all the way through the
      National Championship.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:10px; background:${COLOR.field};">
          <a href="${joinUrl}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:${COLOR.fieldDk}; text-decoration:none;">
            Join ${escapeHtml(leagueName)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0; font-size:12px; line-height:1.5; color:${COLOR.muted};">
      Or paste this link into your browser:<br/>
      <a href="${joinUrl}" style="color:${COLOR.field}; word-break:break-all;">${joinUrl}</a>
    </p>
  `;
  return emailShell({ preheader: `${inviterName} invited you to join ${leagueName} on Gridiron Glory`, bodyHtml });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
