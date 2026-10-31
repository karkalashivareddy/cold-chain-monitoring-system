import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "leaflet/dist/leaflet.css";
import "@/styles.css";
import App from "@/App";
import { queryClient } from "@/lib/query";
import { AuthProvider } from "@/lib/auth";

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error("FROSTGUARD UI error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-abyss p-6">
          <div className="panel max-w-md p-8 text-center">
            <p className="eyebrow">Runtime error</p>
            <h1 className="mt-2 text-lg font-semibold text-ice">The console hit an unexpected error</h1>
            <p className="mt-2 text-sm text-mist">
              Reload the page to recover. If the problem persists, quote request ID from your browser network tab.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-abyss"
            >
              Reload console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
            <Toaster theme="dark" position="top-right" richColors closeButton />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
