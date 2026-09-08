import kuLogo from "../../../Assets/KULogo.png";
import Icon from "../common/Icon";

const trustPoints = [
  { icon: "shield", label: "Protected case management", text: "Role-based access for confidential legal matters" },
  { icon: "cpu", label: "AI-assisted review", text: "Structured insights with human legal oversight" },
  { icon: "activity", label: "End-to-end accountability", text: "Transparent routing, decisions, and audit history" },
];

function AuthShell({
  children,
  eyebrow = "Legal Affairs Digital Services",
  title,
  description,
  theme,
  onToggleTheme,
  wide = false,
}) {
  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-label="Khalifa University Legal Affairs">
        <div className="auth-brand-orb auth-brand-orb-one" />
        <div className="auth-brand-orb auth-brand-orb-two" />
        <div className="auth-brand-content">
          <div className="auth-logo-wrap">
            <img src={kuLogo} alt="Khalifa University" />
          </div>

          <div className="auth-brand-copy">
            <p className="auth-overline">Legal Affairs</p>
            <h2>Legal decisions,<br />managed with confidence.</h2>
            <p>
              A secure institutional workspace connecting university teams with
              Legal Affairs through a clear, accountable review process.
            </p>
          </div>

          <div className="auth-trust-list">
            {trustPoints.map((point) => (
              <div className="auth-trust-item" key={point.label}>
                <span><Icon name={point.icon} size={19} /></span>
                <div>
                  <strong>{point.label}</strong>
                  <p>{point.text}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="auth-confidentiality">
            <Icon name="lock" size={14} /> Confidential · Authorized use only
          </p>
        </div>
      </section>

      <section className="auth-form-panel">
        <button
          type="button"
          className="icon-button auth-theme-toggle"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
        </button>

        <div className={`auth-form-container ${wide ? "auth-form-container-wide" : ""}`}>
          <div className="auth-mobile-logo">
            <img src={kuLogo} alt="Khalifa University" />
          </div>
          <p className="page-kicker">{eyebrow}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
        <p className="auth-footer">© 2026 Khalifa University · Legal Affairs</p>
      </section>
    </main>
  );
}

export default AuthShell;
