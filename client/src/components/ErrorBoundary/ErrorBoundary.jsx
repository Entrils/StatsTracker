import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep console output in dev for debugging local crashes.
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, maxWidth: 720, margin: "40px auto", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ opacity: 0.8 }}>
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            type="button"
            style={{ marginTop: 16, padding: "10px 14px", cursor: "pointer" }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
