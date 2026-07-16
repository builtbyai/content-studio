import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./lib/auth-context";
import { JobsProvider } from "./lib/use-jobs";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <JobsProvider>
        <App />
      </JobsProvider>
    </AuthProvider>
  </StrictMode>
);
