import { getEmDashCollection } from "emdash";

export interface QuestionOption {
	label: string;
	type: string;
}

/** Published love types in display order. Order also breaks score ties. */
export async function getLoveTypes() {
	const result = await getEmDashCollection("love_types", {
		orderBy: { sort_order: "asc" },
		limit: 50,
	});
	return result;
}

/** Published questions in display order, with malformed options dropped. */
export async function getQuestions() {
	const result = await getEmDashCollection("questions", {
		orderBy: { sort_order: "asc" },
		limit: 100,
	});
	const questions = result.entries.map((entry) => ({
		entry,
		options: ((entry.data.options ?? []) as Partial<QuestionOption>[]).filter(
			(option): option is QuestionOption =>
				typeof option?.label === "string" && typeof option?.type === "string",
		),
	}));
	return {
		questions: questions.filter((q) => q.options.length > 0),
		cacheHint: result.cacheHint,
	};
}

/**
 * Tallies the chosen options and returns the winning type slug.
 * `answers` maps a question's database id to the chosen option's index.
 * Ties go to whichever type comes first in `typeOrder`.
 */
export function scoreAnswers(
	questions: { entry: { data: { id: string } }; options: QuestionOption[] }[],
	answers: URLSearchParams,
	typeOrder: string[],
): { winner: string | null; answered: number } {
	const scores = new Map<string, number>();
	let answered = 0;
	for (const { entry, options } of questions) {
		const raw = answers.get(entry.data.id);
		if (raw === null) continue;
		const option = options[Number.parseInt(raw, 10)];
		if (!option) continue;
		answered++;
		scores.set(option.type, (scores.get(option.type) ?? 0) + 1);
	}

	let winner: string | null = null;
	let best = 0;
	for (const slug of typeOrder) {
		const score = scores.get(slug) ?? 0;
		if (score > best) {
			best = score;
			winner = slug;
		}
	}
	return { winner, answered };
}
