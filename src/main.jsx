import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

import { registerSW } from "virtual:pwa-register";
import { startOfflineQueueWorker } from "./utils/offlineQueueWorker.js";

// Start the offline queue flusher (for Leave)
startOfflineQueueWorker({ intervalMs: 8000 });

// PWA service worker
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);