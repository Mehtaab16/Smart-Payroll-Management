import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],

            manifest: {
                name: "AutoPay",
                short_name: "AutoPay",
                description: "Smart Payroll System",
                theme_color: "#0f172a",
                background_color: "#0f172a",
                display: "standalone",
                scope: "/",
                start_url: "/",
                icons: [
                    { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
                    { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
                    { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                ],
            },

            // caching rules
            workbox: {
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
                navigateFallback: "/index.html",
                globPatterns: ["**/*.{js,css,html,ico,png,svg}"],

                runtimeCaching: [
                    // Cache API GET responses (read-only)
                    {
                        urlPattern: ({ url, request }) =>
                            request.method === "GET" &&
                            (url.origin === "http://localhost:5000" || url.origin.startsWith("http://127.0.0.1:5000")),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "api-cache",
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },

                    // images
                    {
                        urlPattern: ({ request }) => request.destination === "image",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "image-cache",
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                ],
            },

            devOptions: { enabled: true },
        }),
    ],
});