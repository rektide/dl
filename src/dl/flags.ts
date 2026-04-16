export function resolveDlFlags(
	values: { archive: boolean; wiki: boolean; archlist: boolean; symlink: boolean },
	explicit: { archive: boolean; wiki: boolean; archlist: boolean; symlink: boolean },
) {
	const anyExplicit = explicit.archive || explicit.wiki || explicit.archlist || explicit.symlink
	return {
		doArchive: anyExplicit ? values.archive : true,
		doWiki: anyExplicit ? values.wiki : true,
		doArchlist: anyExplicit ? values.archlist : true,
		doSymlink: anyExplicit ? values.symlink : true,
	}
}
