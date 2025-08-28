import React from "react";
import ReactDOM from "react-dom/client";
import { AutumnProvider } from "autumn-js/react";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AutumnProvider backendUrl="http://localhost:4000">
      <App />
    </AutumnProvider>
  </React.StrictMode>
);
