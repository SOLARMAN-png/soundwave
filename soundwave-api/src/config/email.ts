import nodemailer from "nodemailer";

function requiredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set to send verification emails`);
  return value;
}

function smtpPort() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function smtpSecure(port: number) {
  const rawValue = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (!rawValue) return port === 465;
  if (rawValue !== "true" && rawValue !== "false") {
    throw new Error("SMTP_SECURE must be either true or false");
  }
  return rawValue === "true";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendVerificationEmail(to: string, displayName: string, token: string) {
  const port = smtpPort();
  const clientOrigin = new URL(process.env.CLIENT_ORIGIN ?? "http://localhost:5173").origin;
  const verificationUrl = new URL("/verify-email", clientOrigin);
  verificationUrl.searchParams.set("token", token);

  const transporter = nodemailer.createTransport({
    host: requiredValue("SMTP_HOST"),
    port,
    secure: smtpSecure(port),
    auth: {
      user: requiredValue("SMTP_USER"),
      pass: requiredValue("SMTP_PASSWORD"),
    },
  });
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(verificationUrl.toString());

  await transporter.sendMail({
    from: requiredValue("EMAIL_FROM"),
    to,
    subject: "Confirm your SoundWave account",
    text: `Hello ${displayName},\n\nConfirm your email and continue setting up your account: ${verificationUrl}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`,
    html: `<p>Hello ${safeName},</p><p>Confirm your email to continue setting up your SoundWave account.</p><p><a href="${safeUrl}">Confirm email and continue</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`,
  });
}