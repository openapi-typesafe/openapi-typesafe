import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// SvelteKit 3 reads its configuration here; `svelte.config.js` is no longer used.
// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto.
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter(), preprocess: vitePreprocess() })],
});
