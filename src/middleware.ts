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

// The dashboard is replaced by the pages list (see ADMIN_HOME below).
const HIDDEN_DASHBOARD_LINK = `li:has(> a[href="/_emdash/admin/"])`;

const HIDE_ADMIN_LINKS_CSS = `${[
	...HIDDEN_ADMIN_PATHS.flatMap((path) => {
		const link = `a[href="/_emdash/admin/${path}"]`;
		return [link, `li:has(> ${link})`];
	}),
	HIDDEN_SIDEBAR_GROUP,
	...HIDDEN_EDITOR_PANELS,
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

export const onRequest = defineMiddleware(async (context, next) => {
	if (ADMIN_ROOTS.has(context.url.pathname)) {
		return context.redirect(ADMIN_HOME, 302);
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
			`<style>${HIDE_ADMIN_LINKS_CSS}</style><script>${REDIRECT_DASHBOARD_SCRIPT}</script></head>`,
		),
		{ status: response.status, statusText: response.statusText, headers },
	);
});
