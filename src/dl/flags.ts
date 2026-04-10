export function resolveDlFlags(
	values: { archive: boolean; wiki: boolean; archlist: boolean; simplify: boolean },
	explicit: { archive: boolean; wiki: boolean; archlist: boolean; simplify: boolean },
) {
	const anyExplicit = explicit.archive || explicit.wiki || explicit.archlist || explicit.simplify
	return {
		doArchive: anyExplicit ? values.archive : true,
		doWiki: anyExplicit ? values.wiki : true,
		doArchlist: anyExplicit ? values.archlist : true,
		doSimplify: anyExplicit ? values.simplify : true,
	}
}
