import { defineMiddleware } from "astro:middleware";

/**
 * Pages-only admin.
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
];

// Every link in the sidebar's "Manage" group is hidden, so drop the whole
// group (heading included) rather than leave an empty heading behind.
const HIDDEN_SIDEBAR_GROUP = `[data-sidebar="group"]:has(a[href="/_emdash/admin/menus"])`;

const HIDE_ADMIN_LINKS_CSS = `${[
	...HIDDEN_ADMIN_PATHS.flatMap((path) => {
		const link = `a[href="/_emdash/admin/${path}"]`;
		return [link, `li:has(> ${link})`];
	}),
	HIDDEN_SIDEBAR_GROUP,
].join(",")}{display:none!important}`;

export const onRequest = defineMiddleware(async (context, next) => {
	const response = await next();
	if (!context.url.pathname.startsWith("/_emdash/admin")) return response;
	if (!response.headers.get("content-type")?.includes("text/html")) {
		return response;
	}

	const html = await response.text();
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	return new Response(
		html.replace("</head>", `<style>${HIDE_ADMIN_LINKS_CSS}</style></head>`),
		{ status: response.status, statusText: response.statusText, headers },
	);
});
