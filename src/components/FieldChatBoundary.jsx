import React from "react";

export default class FieldChatBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Field chat render failure]", error, info.componentStack);
  }

  render() {
    const error = this.state.error;
    if (!error) return this.props.children;

    return (
      <main role="alert" style={{
        position: "fixed", inset: 0, zIndex: 10001,
        boxSizing: "border-box", overflowY: "auto",
        padding: "24px", background: "#020617", color: "#fff",
      }}>
        <h2>Field chat could not open</h2>
        <p>You can return to the Field while we resolve this.</p>
        <button type="button" className="primary-btn"
          onClick={this.props.onBack}>Return to Field</button>
        {import.meta.env.DEV && (
          <details style={{ marginTop: "20px" }} open>
            <summary>Testing error details</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {String(error.stack || error.message || error)}
            </pre>
          </details>
        )}
      </main>
    );
  }
}
