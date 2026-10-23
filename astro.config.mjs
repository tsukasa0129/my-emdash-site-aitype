import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { fileURLToPath } from "node:url";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [pageCodePlugin()],
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});

/**
 * "CSS・JS" panel in the page editor sidebar (src/plugins/page-code.ts).
 * Runs in-process, so it needs no sandbox runner.
 */
function pageCodePlugin() {
	const fields = ["custom_css", "head_code", "footer_code"];
	return {
		id: "page-code",
		version: "1.0.0",
		format: "standard",
		entrypoint: fileURLToPath(new URL("./src/plugins/page-code.ts", import.meta.url)),
		capabilities: ["admin.editor-draft:read", "admin.editor-draft:patch"],
		editorPanels: [
			{
				id: "code",
				title: "CSS・JS",
				route: "editor/code",
				collections: ["pages"],
				draft: { read: { fields }, patch: { fields } },
			},
		],
	};
}
