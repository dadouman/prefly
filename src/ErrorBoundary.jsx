import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          color: "#c9a227",
          background: "#0d0d0f",
          textAlign: "center",
        }}>
          <h1 style={{ fontSize: "1.6rem", marginBottom: "1rem" }}>
            Quelque chose s'est mal passé
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#8a8a8a", maxWidth: 420, lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Une erreur inattendue est survenue. Essayez de recharger la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.6rem 1.5rem",
              background: "transparent",
              border: "1px solid #c9a227",
              color: "#c9a227",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
