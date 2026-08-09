import React, { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// BLACK-SCREEN SAFETY NET: koi bhi render error aaye to black screen ki jagah
// friendly retry screen — app kabhi blank na rahe.
class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: any) { console.error("VENOM render error:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#02080b", color: "#7dd3fc", fontFamily: "monospace", gap: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🕷️</div>
          <div>Kuch gadbad ho gayi. Screen refresh karo ya app dobara kholo.</div>
          <button
            onClick={() => { this.setState({ hasError: false }); try { window.location.reload(); } catch (e) {} }}
            style={{ padding: "10px 24px", borderRadius: 12, background: "linear-gradient(90deg,#06b6d4,#8b5cf6)", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}
          >
            🔄 Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
