import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// প্রিভিউ হোস্ট (https://{port}-{sandboxId}.e2b.app) সহ যেকোনো হোস্ট থেকে
// ডেভ সার্ভারে ঢোকা যাবে, আর বাইন্ডিং থাকবে 0.0.0.0 এ।
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
