// src/main.js

import React from "react";
import ReactDOM from "react-dom/client";
import { FirebaseEnvironmentGate } from "./components/FirebaseEnvironmentControl.jsx";
const PublicTerms = React.lazy(() => import("./legal/PublicTerms.jsx"));
const App = React.lazy(() => import("./App.jsx"));
import "./styles/global.css";
import "./styles/ResponsiveLayout.css";
import "./styles/PageWidth.css";
import { AuthProvider } from "./auth/AuthContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {["/terms", "/terms.html"].includes(window.location.pathname.replace(/\/$/, ""))
      ? <React.Suspense fallback={<p>Loading terms…</p>}><PublicTerms /></React.Suspense>
      : (
    <FirebaseEnvironmentGate>
      <React.Suspense fallback={
        <div role="status" style={{ padding: "24px" }}>Loading football…</div>
      }>
        <AuthProvider>
          <App />
        </AuthProvider>
      </React.Suspense>
    </FirebaseEnvironmentGate>
      )}
  </React.StrictMode>
);
