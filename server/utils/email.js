/**
 * Lightweight email helper used by the background job.
 * In production, plug this into an actual provider (SendGrid, SES, etc.).
 */
async function sendEmail({ to, subject, text }) {
  if (!to) {
    throw new Error("Email recipient missing");
  }

  // eslint-disable-next-line no-console
  console.log(`[email] -> ${to} | ${subject}\n${text}`);
}

module.exports = { sendEmail };
