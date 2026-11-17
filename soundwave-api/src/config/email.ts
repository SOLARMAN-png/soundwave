import { Resend } from "resend";
import { getPrimaryClientOrigin } from "./client-origin.js";

function requiredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set to send verification emails`);
  return value;
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
  const configuredOrigins = process.env.CLIENT_ORIGINS ?? process.env.CLIENT_ORIGIN;
  if (process.env.NODE_ENV === "production" && !configuredOrigins?.trim()) {
    throw new Error("CLIENT_ORIGIN or CLIENT_ORIGINS must be set in production");
  }
  const clientOrigin = getPrimaryClientOrigin(
    configuredOrigins,
  );
  const clientHostname = new URL(clientOrigin).hostname;
  if (
    process.env.NODE_ENV === "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(clientHostname)
  ) {
    throw new Error("CLIENT_ORIGIN must use the deployed frontend origin in production");
  }
  const verificationUrl = new URL("/verify-email", clientOrigin);
  verificationUrl.searchParams.set("token", token);

  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(verificationUrl.toString());
  const resend = new Resend(requiredValue("RESEND_API_KEY"));

  let result;
  try {
    result = await resend.emails.send({
      from: requiredValue("EMAIL_FROM"),
      to,
      subject: "Confirm your SoundWave account",
      text: `Hello ${displayName},\n\nConfirm your email and continue setting up your account: ${verificationUrl}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`,
      html: `<p>Hello ${safeName},</p><p>Confirm your email to continue setting up your SoundWave account.</p><p><a href="${safeUrl}">Confirm email and continue</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`,
    });
  } catch (error: unknown) {
    console.error("Resend request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new Error("Verification email delivery failed");
  }

  if (result.error) {
    console.error("Resend rejected verification email", {
      name: result.error.name,
      statusCode: result.error.statusCode,
    });
    throw new Error("Verification email delivery failed");
  }
}