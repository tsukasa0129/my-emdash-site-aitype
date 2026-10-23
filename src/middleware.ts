import { defineMiddleware } from "astro:middleware";

/**
 * Pages-only admin.
 *
 * Also hides the Ownership and Bylines panels in the entry editor, and makes
 * the pages list the admin's home in place of the dashboard.
 *
 * EmDash 1.3.1 has no setting for hiding built-in admin areas
 * (`admin.hiddenNavItems` is documented but not released yet), so this
 * hides their sidebar and dashboard links with CSS. Like that option, it only
 * removes the links: the routes and permission checks are unchanged.
 * Swap this for `admin.hiddenNavItems` in astro.config.mjs once it ships.
 */
const HIDDEN_ADMIN_PATHS = [
	"calendar",
	"media",
	"comments",
	"menus",
	"redirects",
	"widgets",
	"sections",
	"bylines",
	"byline-schema",
	"plugins-manager",
	"import/wordpress",
	"content-types",
	"users",
];

// Every link in the sidebar's "Manage" group is hidden, so drop the whole
// group (heading included) rather than leave an empty heading behind.
const HIDDEN_SIDEBAR_GROUP = `[data-sidebar="group"]:has(a[href="/_emdash/admin/menus"])`;

// Entry editor panels this site doesn't use. The panels carry no stable id in
// the DOM, so match each one by its drag handle's label, in English and in
// Japanese (the admin follows the user's language).
const HIDDEN_EDITOR_PANELS = [
	"Drag to reorder Ownership",
	"投稿者をドラッグして並べ替え",
	"Drag to reorder Bylines",
	"執筆者をドラッグして並べ替え",
].map((label) => `section:has(> button[data-sortable-handle][aria-label="${label}"])`);

// The "Content language" row in the URL & language panel (the site has one
// language). It's the row holding the "why English is used" help button.
const HIDDEN_CONTENT_LANGUAGE = ["Why English is used", "英語が使用される理由"].map(
	(label) => `div:has(> div > button[aria-label="${label}"])`,
);

// The page code fields are edited from the "CSS・JS" sidebar panel
// (src/plugins/page-code.ts), so drop their duplicate inputs from the main
// column. They stay in the form, so the panel's draft patches still save.
const HIDDEN_PAGE_CODE_FIELDS = ["custom_css", "head_code", "footer_code"].map(
	(slug) => `div:has(> textarea#field-${slug})`,
);

// The dashboard is replaced by the pages list (see ADMIN_HOME below).
const HIDDEN_DASHBOARD_LINK = `li:has(> a[href="/_emdash/admin/"])`;

// Landing pages are read in a phone-width column: 480px frame (theme.css)
// minus 2rem padding each side leaves 416px of text. Keep the page body
// editor at that width so its line breaks match the published page, and let
// its formatting toolbar wrap instead of clipping the last buttons.
const PHONE_WIDTH_EDITOR_CSS =
	`#field-content{max-width:416px;margin-inline:auto}` +
	`#field-content [role="toolbar"],#field-content [role="toolbar"] div{flex-wrap:wrap;height:auto;overflow:visible}`;

const HIDE_ADMIN_LINKS_CSS = `${[
	...HIDDEN_ADMIN_PATHS.flatMap((path) => {
		const link = `a[href="/_emdash/admin/${path}"]`;
		return [link, `li:has(> ${link})`];
	}),
	HIDDEN_SIDEBAR_GROUP,
	...HIDDEN_EDITOR_PANELS,
	...HIDDEN_CONTENT_LANGUAGE,
	...HIDDEN_PAGE_CODE_FIELDS,
	HIDDEN_DASHBOARD_LINK,
].join(",")}{display:none!important}`;

const ADMIN_ROOTS = new Set(["/_emdash/admin", "/_emdash/admin/"]);
const ADMIN_HOME = "/_emdash/admin/content/pages";

// The admin is a single-page app, so in-app links to the dashboard (the
// sidebar logo, for one) never reach the server. Send those to the pages list
// on the client as well.
const REDIRECT_DASHBOARD_SCRIPT = `(function(){
var roots=${JSON.stringify([...ADMIN_ROOTS])},home=${JSON.stringify(ADMIN_HOME)};
function check(){if(roots.indexOf(location.pathname)!==-1)location.replace(home);}
["pushState","replaceState"].forEach(function(m){var o=history[m];history[m]=function(){var r=o.apply(this,arguments);check();return r;};});
addEventListener("popstate",check);
})();`;

/**
 * MCP tools for features this site doesn't use. EmDash's MCP server can only
 * be switched on or off as a whole, so drop these from `tools/list` and refuse
 * calls to them. Mirrors the admin: bylines, taxonomies, menus, block types
 * and site import/export are gone; pages, media, revisions, search, settings
 * and the content model stay.
 */
const MCP_PATH = "/_emdash/api/mcp";
const HIDDEN_MCP_TOOL = /^(byline_|taxonomy_|menu_|site_|schema_.*block_type)/;

interface JsonRpcMessage {
	id?: string | number | null;
	method?: string;
	params?: { name?: unknown };
	result?: { tools?: { name: string }[] };
}

function isHiddenTool(name: unknown): boolean {
	return typeof name === "string" && HIDDEN_MCP_TOOL.test(name);
}

/** Removes hidden tools from a JSON-RPC payload; returns it unchanged otherwise. */
function filterToolList(json: string): string {
	let payload: JsonRpcMessage | JsonRpcMessage[];
	try {
		payload = JSON.parse(json);
	} catch {
		return json;
	}
	for (const message of Array.isArray(payload) ? payload : [payload]) {
		if (Array.isArray(message?.result?.tools)) {
			message.result.tools = message.result.tools.filter(
				(tool) => !isHiddenTool(tool.name),
			);
		}
	}
	return JSON.stringify(payload);
}

async function handleMcp(
	request: Request,
	next: () => Promise<Response>,
): Promise<Response> {
	let body: unknown;
	try {
		body = await request.clone().json();
	} catch {
		return next();
	}
	const messages = (Array.isArray(body) ? body : [body]) as JsonRpcMessage[];

	const blocked = messages.find(
		(m) => m?.method === "tools/call" && isHiddenTool(m.params?.name),
	);
	if (blocked) {
		return Response.json({
			jsonrpc: "2.0",
			id: blocked.id ?? null,
			error: { code: -32602, message: `Unknown tool: ${blocked.params?.name}` },
		});
	}

	const response = await next();
	if (!messages.some((m) => m?.method === "tools/list")) return response;

	// Streamable HTTP answers with plain JSON or a server-sent event stream.
	const text = await response.text();
	const filtered = response.headers.get("content-type")?.includes("text/event-stream")
		? text.replace(/^data: (.*)$/gm, (_, json: string) => `data: ${filterToolList(json)}`)
		: filterToolList(text);
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	return new Response(filtered, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export const onRequest = defineMiddleware(async (context, next) => {
	if (ADMIN_ROOTS.has(context.url.pathname)) {
		return context.redirect(ADMIN_HOME, 302);
	}

	if (context.url.pathname === MCP_PATH && context.request.method === "POST") {
		return handleMcp(context.request, next);
	}

	const response = await next();
	if (!context.url.pathname.startsWith("/_emdash/admin")) return response;
	if (!response.headers.get("content-type")?.includes("text/html")) {
		return response;
	}

	const html = await response.text();
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	return new Response(
		html.replace(
			"</head>",
			`<style>${HIDE_ADMIN_LINKS_CSS}${PHONE_WIDTH_EDITOR_CSS}</style><script>${REDIRECT_DASHBOARD_SCRIPT}</script></head>`,
		),
		{ status: response.status, statusText: response.statusText, headers },
	);
});
