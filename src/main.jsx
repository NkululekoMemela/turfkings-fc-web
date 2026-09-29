// src/main.js

import React from "react";
import ReactDOM from "react-dom/client";
import { FirebaseEnvironmentGate } from "./components/FirebaseEnvironmentControl.jsx";
const App = React.lazy(() => import("./App.jsx"));
import "./styles/global.css";
import { AuthProvider } from "./auth/AuthContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FirebaseEnvironmentGate>
      <React.Suspense fallback={
        <div role="status" style={{ padding: "24px" }}>Loading football…</div>
      }>
        <AuthProvider>
          <App />
        </AuthProvider>
      </React.Suspense>
    </FirebaseEnvironmentGate>
  </React.StrictMode>
);
