import type { SandboxedPlugin } from "emdash/plugin";

/**
 * "CSS・JS" panel in the page editor's sidebar.
 *
 * Edits three page fields (see PAGE_CODE_FIELDS) through the editor draft:
 * "Edit" reads the current, possibly unsaved, values into a form, and "Apply"
 * proposes them as a draft patch. Nothing is saved until the editor saves or
 * publishes the page, so the code follows the page's drafts and revisions.
 * Registered in astro.config.mjs; the matching panel declaration lives there.
 */

export const PAGE_CODE_FIELDS = {
	custom_css: "CSS",
	head_code: "JS（ヘッダー：<head> 内）",
	footer_code: "JS（フッター：</body> 直前）",
} as const;

type FieldSlug = keyof typeof PAGE_CODE_FIELDS;
const FIELD_SLUGS = Object.keys(PAGE_CODE_FIELDS) as FieldSlug[];

const PLACEHOLDERS: Record<FieldSlug, string> = {
	custom_css: ".prose h2 { color: #be185d; }",
	head_code: "<script>…</script>",
	footer_code: "<script>…</script>",
};

interface PanelInteraction {
	type?: string;
	action_id?: string;
	values?: Record<string, unknown>;
	draft?: { fields?: Record<string, unknown> };
}

function asText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function editButton() {
	return {
		blocks: [
			{
				type: "context",
				text: "このページだけに入るCSSとJSです。編集を押すと現在の内容を読み込みます。",
			},
			{
				type: "actions",
				elements: [{ type: "button", label: "編集", action_id: "edit" }],
			},
		],
	};
}

function codeForm(values: Partial<Record<FieldSlug, string>>) {
	return {
		blocks: [
			{
				type: "form",
				block_id: "page-code",
				fields: FIELD_SLUGS.map((slug) => ({
					type: "text_input",
					action_id: slug,
					label: PAGE_CODE_FIELDS[slug],
					multiline: true,
					placeholder: PLACEHOLDERS[slug],
					initial_value: values[slug] ?? "",
				})),
				submit: { label: "反映", action_id: "apply" },
			},
			{
				type: "context",
				text: "反映したあと、ページを保存・公開すると反映されます。",
			},
		],
	};
}

const plugin: SandboxedPlugin = {
	routes: {
		"editor/code": {
			permission: "content:edit_own",
			handler: async (routeCtx) => {
				const interaction = (routeCtx.input ?? {}) as PanelInteraction;

				if (interaction.type === "block_action" && interaction.action_id === "edit") {
					const draft = interaction.draft?.fields ?? {};
					return codeForm(
						Object.fromEntries(FIELD_SLUGS.map((slug) => [slug, asText(draft[slug])])),
					);
				}

				if (interaction.type === "form_submit" && interaction.action_id === "apply") {
					const values = interaction.values ?? {};
					const next = Object.fromEntries(
						FIELD_SLUGS.map((slug) => [slug, asText(values[slug])]),
					) as Record<FieldSlug, string>;
					return {
						...codeForm(next),
						patch: {
							type: "editor-draft-patch",
							operations: FIELD_SLUGS.map((slug) =>
								next[slug] === ""
									? { op: "clear", field: slug }
									: { op: "set", field: slug, value: next[slug] },
							),
						},
					};
				}

				return editButton();
			},
		},
	},
};

export default plugin;
