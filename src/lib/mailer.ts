import "server-only";
import nodemailer from "nodemailer";

// Invio email tramite SMTP (Gmail, Brevo, Resend, ecc.): basta cambiare le variabili
// SMTP_* senza toccare il codice. Senza configurazione l'invio viene saltato.
function createTransport() {
  // trim(): spazi o "a capo" incollati per sbaglio nelle variabili
  const [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS] = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].map(
    (k) => process.env[k]?.trim() || undefined,
  );
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const SENDER_NAME = "Westeros GDR";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Email di benvenuto con il riepilogo dei dati di accesso.
// La password NON viene inclusa: e' salvata solo come hash e un'email resta per sempre
// nella casella di posta (e in chiaro sui server intermedi).
export async function sendWelcomeEmail(params: {
  to: string;
  characterName: string;
  siteUrl: string;
}) {
  const transport = createTransport();
  if (!transport) {
    console.warn("SMTP non configurato: email di benvenuto non inviata");
    return;
  }

  const { to, characterName, siteUrl } = params;
  const name = escapeHtml(characterName);
  const from = `"${SENDER_NAME}" <${(process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "").trim()}>`;

  const text = `Benvenuto su Westeros GDR!

Grazie per aver scelto di giocare con noi. Questi sono i tuoi dati di accesso:

Nome del personaggio: ${characterName}
Password: quella che hai scelto al momento della registrazione

Accedi da: ${siteUrl}

Se dimentichi la password puoi reimpostarla con "Password dimenticata?" nella finestra di accesso.`;

  const html = `<!doctype html>
<html lang="it">
<body style="margin:0;background:#0b0a0a;font-family:Georgia,serif;color:#e4dfdb">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a0a;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#161313;border:1px solid #3a2c2a;border-top:3px solid #a3201b;border-radius:8px">
        <tr><td style="padding:28px 32px">
          <h1 style="margin:0 0 20px;font-size:24px;color:#c9a45c;letter-spacing:1px">Westeros GDR</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Grazie per aver scelto di giocare con noi. Questi sono i tuoi dati di accesso:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;background:#0b0a0a;border:1px solid #3a2c2a;border-radius:6px">
            <tr><td style="padding:12px 16px;color:#968d89;font-size:13px">Nome del personaggio</td>
                <td style="padding:12px 16px;font-size:16px;font-weight:bold">${name}</td></tr>
            <tr><td style="padding:12px 16px;color:#968d89;font-size:13px;border-top:1px solid #3a2c2a">Password</td>
                <td style="padding:12px 16px;font-size:14px;border-top:1px solid #3a2c2a">quella che hai scelto al momento della registrazione</td></tr>
          </table>
          <p style="margin:0 0 24px;text-align:center">
            <a href="${escapeHtml(siteUrl)}" style="display:inline-block;background:#a3201b;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;letter-spacing:1px">ENTRA NEL GIOCO</a>
          </p>
          <p style="margin:0;font-size:13px;color:#968d89;line-height:1.5">Se dimentichi la password puoi reimpostarla con "Password dimenticata?" nella finestra di accesso.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transport.sendMail({
      from,
      to,
      subject: "Benvenuto su Westeros GDR - i tuoi dati di accesso",
      text,
      html,
    });
  } catch (e) {
    console.error("Invio email di benvenuto fallito:", e);
  }
}
