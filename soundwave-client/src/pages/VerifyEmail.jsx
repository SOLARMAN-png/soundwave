import { useState } from "react";
import { ArrowLeft, ArrowRight, AudioLines, MailCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { apiRequest } from "../api";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(token ? "" : "This confirmation link is missing its token.");

  async function submit(event) {
    event.preventDefault();
    if (!token || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const user = await apiRequest("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      navigate(user.onboardingCompleted === false ? "/onboarding" : "/home", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "This confirmation link is invalid or expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <header className="auth-topbar">
        <Link className="auth-back" to="/signup" aria-label="Back to sign up"><ArrowLeft size={19} /></Link>
        <span className="auth-wordmark"><AudioLines size={19} /> SoundWave</span>
      </header>
      <section className="auth-panel verify-panel">
        <span className="verify-icon"><MailCheck size={25} /></span>
        <p className="auth-kicker">ONE LAST THING</p>
        <h1>Confirm your email.</h1>
        <p className="auth-intro">Confirm this address to open your account and choose the music you love.</p>
        {error && <p className="auth-request-error" role="alert">{error}</p>}
        <form className="verify-form" onSubmit={submit}>
          <Button type="submit" className="auth-submit" disabled={!token || submitting}>
            {submitting ? "Confirming..." : "Confirm email and continue"}
            {!submitting && <ArrowRight size={17} />}
          </Button>
        </form>
        <p className="auth-switch">Already confirmed? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}