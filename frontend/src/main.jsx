import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

// ErrorBoundary sits outermost, above routing/auth/socket - a bug in any
// provider (not just a page) should still land on the recovery screen
// instead of a blank tab.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <SocketProvider>
              <NotificationProvider>
                <App />
              </NotificationProvider>
            </SocketProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
