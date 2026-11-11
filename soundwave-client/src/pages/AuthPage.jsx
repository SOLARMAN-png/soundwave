import { useState } from "react";
import { ArrowLeft, ArrowRight, AudioLines } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { apiRequest, resendVerificationEmail } from "../api";

const emptyForm = { displayName: "", username: "", email: "", password: "" };
const validFields = new Set(["displayName", "username", "email", "password"]);

function passwordByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function validateField(field, value, isSignup) {
  const trimmed = value.trim();
  if (field === "displayName" && isSignup) {
    if (!trimmed) return "Enter your display name.";
    if (trimmed.length > 80) return "Display name must be 80 characters or fewer.";
  }
  if (field === "username" && isSignup && trimmed) {
    if (trimmed.length < 3 || trimmed.length > 30) return "Username must be 3 to 30 characters.";
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return "Use only letters, numbers, and underscores.";
  }
  if (field === "email") {
    if (!trimmed) return "Enter your email address.";
    if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address.";
  }
  if (field === "password") {
    if (!value) return "Enter your password.";
    if (passwordByteLength(value) > 72) return "Password must be no more than 72 UTF-8 bytes.";
    if (isSignup && value.length < 12) return "Password must be at least 12 characters.";
  }
  return "";
}

function getDestination(destination) {
  if (!destination?.pathname?.startsWith("/")) return "/home";
  return `${destination.pathname}${destination.search || ""}${destination.hash || ""}`;
}

export default function AuthPage({ mode }) {
  const isSignup = mode === "signup";
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({
      ...current,
      [name]: validateField(name, value, isSignup),
    }));
    setRequestError("");
    setVerificationNotice("");
    setVerificationEmail("");
  }

  function validateForm() {
    const fields = isSignup
      ? ["displayName", "username", "email", "password"]
      : ["email", "password"];
    const nextErrors = Object.fromEntries(fields.map((field) => [
      field,
      validateField(field, form[field], isSignup),
    ]));
    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((message) => !message);
  }

  async function submit(event) {
    event.preventDefault();
    setRequestError("");
    if (!validateForm()) return;

    setSubmitting(true);
    const body = isSignup
      ? {
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          password: form.password,
          ...(form.username.trim() ? { username: form.username.trim() } : {}),
        }
      : { email: form.email.trim(), password: form.password };

    try {
      const result = await apiRequest(`/api/auth/${isSignup ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (isSignup && result.verificationRequired) {
        setVerificationEmail(result.email);
        setVerificationNotice(`We sent a confirmation link to ${result.email}. Check your inbox and spam folder. You can request another link below.`);
        setForm(emptyForm);
        setFieldErrors({});
        return;
      }
      if (isSignup || result.onboardingCompleted === false) {
        navigate("/onboarding", { replace: true });
      } else {
        navigate(getDestination(location.state?.from), { replace: true });
      }
    } catch (error) {
      const nextErrors = {};
      for (const detail of error.details || []) {
        const field = detail.path?.[0];
        if (validFields.has(field)) nextErrors[field] = detail.message;
      }
      setFieldErrors((current) => ({ ...current, ...nextErrors }));
      setRequestError(Object.keys(nextErrors).length ? "Review the highlighted fields." : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendConfirmation() {
    const email = verificationEmail || form.email.trim();
    if (!email || validateField("email", email, isSignup)) {
      setRequestError("Enter a valid email address first.");
      return;
    }

    setRequestError("");
    setSubmitting(true);
    try {
      await resendVerificationEmail(email);
      setVerificationEmail(email);
      setVerificationNotice(`If ${email} is awaiting verification, a new confirmation link will be sent. Check your inbox and spam folder.`);
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const switchPath = isSignup ? "/login" : "/signup";
  const switchLabel = isSignup ? "Sign in" : "Create an account";
  const switchText = isSignup ? "Already have an account?" : "New to SoundWave?";

  return (
    <main className="auth-screen">
      <header className="auth-topbar">
        <Link className="auth-back" to="/welcome" aria-label="Back to welcome"><ArrowLeft size={19} /></Link>
        <span className="auth-wordmark"><AudioLines size={19} /> SoundWave</span>
      </header>
      <section className="auth-panel">
        <p className="auth-kicker">{isSignup ? "YOUR SOUND, YOUR WAY" : "WELCOME BACK"}</p>
        <h1>{isSignup ? "Find your frequency." : "Pick up where you left off."}</h1>
        <p className="auth-intro">{isSignup ? "Create an account to shape a mix around you." : "Sign in to get back to your music."}</p>
        {verificationNotice && <p className="auth-success" role="status">{verificationNotice}</p>}
        {isSignup && (verificationEmail || form.email.trim()) && (
          <button className="auth-resend" type="button" onClick={resendConfirmation} disabled={submitting}>
            {submitting ? "Sending..." : "Resend confirmation link"}
          </button>
        )}
        <form className="auth-form" onSubmit={submit} noValidate>
          {isSignup && (
            <label htmlFor="auth-displayName">
              Display name
              <input id="auth-displayName" name="displayName" autoComplete="name" value={form.displayName} onChange={updateField} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? "auth-displayName-error" : undefined} disabled={submitting} />
              {fieldErrors.displayName && <span className="auth-field-error" id="auth-displayName-error">{fieldErrors.displayName}</span>}
            </label>
          )}
          {isSignup && (
            <label htmlFor="auth-username">
              Username <span className="auth-optional">Optional</span>
              <input id="auth-username" name="username" autoComplete="username" value={form.username} onChange={updateField} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? "auth-username-error" : undefined} disabled={submitting} />
              {fieldErrors.username && <span className="auth-field-error" id="auth-username-error">{fieldErrors.username}</span>}
            </label>
          )}
          <label htmlFor="auth-email">
            Email
            <input id="auth-email" name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "auth-email-error" : undefined} disabled={submitting} />
            {fieldErrors.email && <span className="auth-field-error" id="auth-email-error">{fieldErrors.email}</span>}
          </label>
          <label htmlFor="auth-password">
            Password
            <input id="auth-password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={form.password} onChange={updateField} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "auth-password-error" : isSignup ? "auth-password-hint" : undefined} disabled={submitting} />
            {fieldErrors.password ? <span className="auth-field-error" id="auth-password-error">{fieldErrors.password}</span> : isSignup ? <span className="auth-field-hint" id="auth-password-hint">At least 12 characters</span> : null}
          </label>
          {requestError && <p className="auth-request-error" role="alert">{requestError}</p>}
          <Button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
            {!submitting && <ArrowRight size={17} />}
          </Button>
        </form>
        <p className="auth-switch">{switchText} <Link to={switchPath} state={location.state}>{switchLabel}</Link></p>
      </section>
    </main>
  );
}