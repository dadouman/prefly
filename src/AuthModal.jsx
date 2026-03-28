import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function AuthModal({ onClose }) {
  const { signUp, signIn, signInWithGoogle, signInAnonymous, signInWithPseudo } = useAuth();
  const [tab, setTab] = useState("login"); // "login" | "signup" | "pseudo" | "anonymous"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (tab === "signup") {
        if (!pseudo.trim()) { setError("Un pseudo est requis"); setLoading(false); return; }
        if (password.length < 6) { setError("Mot de passe : 6 caractères minimum"); setLoading(false); return; }
        const { error: err } = await signUp(email, password, pseudo.trim());
        if (err) { setError(err.message); setLoading(false); return; }
        setSuccess("Compte créé ! Vérifiez votre email pour confirmer.");
      } else if (tab === "login") {
        const { error: err } = await signIn(email, password);
        if (err) { setError(err.message); setLoading(false); return; }
        onClose();
      } else if (tab === "pseudo") {
        if (!pseudo.trim()) { setError("Un pseudo est requis"); setLoading(false); return; }
        const { error: err } = await signInWithPseudo(pseudo.trim());
        if (err) { setError(err.message); setLoading(false); return; }
        onClose();
      } else if (tab === "anonymous") {
        if (!pseudo.trim()) { setError("Un pseudo est requis"); setLoading(false); return; }
        const { error: err } = await signInAnonymous(pseudo.trim());
        if (err) { setError(err.message); setLoading(false); return; }
        onClose();
      }
    } catch {
      setError("Une erreur est survenue");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(null);
    const { error: err } = await signInWithGoogle();
    if (err) setError(err.message);
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>✕</button>

        <div className="auth-header">
          <div className="ornament" style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>✦ ✦ ✦</div>
          <h2 className="auth-title">
            {tab === "login" ? "Connexion" : tab === "signup" ? "Créer un compte" : tab === "pseudo" ? "Pseudo seul" : "Mode invité"}
          </h2>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button className={`auth-tab${tab === "login" ? " active" : ""}`} onClick={() => { setTab("login"); setError(null); setSuccess(null); }}>
            Connexion
          </button>
          <button className={`auth-tab${tab === "signup" ? " active" : ""}`} onClick={() => { setTab("signup"); setError(null); setSuccess(null); }}>
            Inscription
          </button>
          <button className={`auth-tab${tab === "pseudo" ? " active" : ""}`} onClick={() => { setTab("pseudo"); setError(null); setSuccess(null); }}>
            Pseudo seul
          </button>
          <button className={`auth-tab${tab === "anonymous" ? " active" : ""}`} onClick={() => { setTab("anonymous"); setError(null); setSuccess(null); }}>
            Invité
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Pseudo field (signup + pseudo + anonymous) */}
          {(tab === "signup" || tab === "anonymous" || tab === "pseudo") && (
            <div className="auth-field">
              <label className="label">Pseudo</label>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Votre pseudo"
                maxLength={30}
                autoFocus={tab === "anonymous" || tab === "pseudo"}
              />
            </div>
          )}

          {/* Email + Password (login + signup) */}
          {tab !== "anonymous" && tab !== "pseudo" && (
            <>
              <div className="auth-field">
                <label className="label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  autoFocus={tab === "login"}
                  autoComplete="email"
                />
              </div>
              <div className="auth-field">
                <label className="label">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "signup" ? "6 caractères minimum" : "Mot de passe"}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                />
              </div>
            </>
          )}

          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}

          <button className="btn-gold" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Chargement…" : tab === "login" ? "Se connecter" : tab === "signup" ? "Créer mon compte" : tab === "pseudo" ? "Entrer avec ce pseudo" : "Continuer en invité"}
          </button>
        </form>

        {/* Google OAuth */}
        {tab !== "anonymous" && tab !== "pseudo" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1rem 0" }}>
              <div className="hr" style={{ flex: 1 }} />
              <span style={{ fontSize: "0.65rem", color: "var(--text-faint)", letterSpacing: "0.2em" }}>OU</span>
              <div className="hr" style={{ flex: 1 }} />
            </div>
            <button className="auth-google-btn" onClick={handleGoogle} type="button">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continuer avec Google
            </button>
          </>
        )}

        {tab === "pseudo" && (
          <p className="auth-hint">
            Entrez un pseudo pour créer un compte partagé sans mot de passe.
            Toute personne utilisant le même pseudo accèdera aux mêmes classements.
          </p>
        )}

        {tab === "anonymous" && (
          <p className="auth-hint">
            En mode invité, vos classements sont sauvegardés localement.
            Créez un compte plus tard pour les synchroniser.
          </p>
        )}
      </div>
    </div>
  );
}
