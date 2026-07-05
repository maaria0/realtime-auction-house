const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  const fromEmail = process.env.EMAIL_FROM;
  if (!fromEmail) {
    throw new Error(
      "EMAIL_FROM is required when BREVO_API_KEY is set (this is the verified Brevo sender address)."
    );
  }

  return {
    apiKey,
    fromEmail,
    fromName: process.env.EMAIL_FROM_NAME || "Realtime Auction House",
  };
}

async function sendEmail({ to, subject, text }) {
  if (!to) {
    throw new Error("Email recipient missing");
  }

  const brevo = getBrevoConfig();
  if (!brevo) {
    // eslint-disable-next-line no-console
    console.log(
      `[email] (stub) -> ${to} | ${subject}\n${text}\nSet BREVO_API_KEY and EMAIL_FROM to send real emails.`
    );
    return;
  }

  // Brevo's transactional email API is plain HTTPS, so it works from hosts
  // (like Render's free tier) that block outbound SMTP ports.
  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": brevo.apiKey,
    },
    body: JSON.stringify({
      sender: { email: brevo.fromEmail, name: brevo.fromName },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Brevo API request failed (${response.status}): ${
        body || response.statusText
      }`
    );
  }

  const data = await response.json().catch(() => ({}));
  console.log(`[email] sent to ${to}: ${data.messageId || "accepted"}`);
}

module.exports = { sendEmail };
