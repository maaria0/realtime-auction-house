function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT
    ? Number(process.env.SMTP_PORT)
    : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  return { host, port, user, pass };
}

async function sendEmail({ to, subject, text }) {
  if (!to) {
    throw new Error("Email recipient missing");
  }

  const smtp = getSmtpConfig();
  if (!smtp) {
    // eslint-disable-next-line no-console
    console.log(
      `[email] (stub) -> ${to} | ${subject}\n${text}\nSet SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to send real emails.`
    );
    return;
  }

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (err) {
    throw new Error(
      "nodemailer is not installed. Run `npm install nodemailer` in server/."
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || smtp.user,
    to,
    subject,
    text,
  });
}

module.exports = { sendEmail };
