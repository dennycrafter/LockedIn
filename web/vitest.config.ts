import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The repo uses the Next.js tsconfig path alias "@/*" -> "./src/*". Vitest
// does not read tsconfig paths on its own, so route handler tests (which
// import routes that in turn import "@/lib/...") need the same alias here.
export default defineConfig({
  // Next's tsconfig sets "jsx": "preserve", which leaves JSX untransformed in
  // tests; tell the (rolldown) transform to apply the automatic runtime.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
