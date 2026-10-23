import type { APIRoute } from "astro";

import { getLoveTypes, getQuestions, scoreAnswers } from "../../utils/love-types";

export const prerender = false;

/**
 * Scores the submitted quiz and redirects to the winning type's page.
 * Answers live only in this request's query string; nothing is stored.
 */
export const GET: APIRoute = async ({ url, redirect }) => {
	const [{ questions }, { entries: loveTypes }] = await Promise.all([
		getQuestions(),
		getLoveTypes(),
	]);

	const { winner } = scoreAnswers(
		questions,
		url.searchParams,
		loveTypes.map((t) => t.id),
	);

	if (!winner) return redirect("/shindan", 303);
	return redirect(`/types/${encodeURIComponent(winner)}?result=1`, 303);
};
