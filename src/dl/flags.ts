export function resolveDlFlags(
	values: { archive: boolean; wiki: boolean; symlink: boolean },
	explicit: { archive: boolean; wiki: boolean; symlink: boolean },
) {
	const anyExplicit = explicit.archive || explicit.wiki || explicit.symlink
	return {
		anyExplicit,
		doArchive: anyExplicit ? values.archive : true,
		doWiki: anyExplicit ? values.wiki : true,
		doSymlink: anyExplicit ? values.symlink : true,
	}
}
