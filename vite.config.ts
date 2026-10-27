import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: the build is published as static files next to index.html.
export default defineConfig({ base: "./", plugins: [react()] });
