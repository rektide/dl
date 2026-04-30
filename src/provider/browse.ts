export type OrgRepo = {
	name: string
	fullName: string
	description?: string
	updatedAt: Date
	stars?: number
	isFork?: boolean
	url: URL
}

export type BrowseProvider = {
	browseOrg(org: string, signal: AbortSignal): AsyncIterable<OrgRepo>
}

export function formatRelativeTime(date: Date, now: Date): string {
	const ms = now.getTime() - date.getTime()
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return "just now"
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d ago`
	const months = Math.floor(days / 30)
	if (months < 12) return `${months}mo ago`
	const years = Math.floor(months / 12)
	return `${years}y ago`
}

export function formatRepoLabel(repo: OrgRepo, now: Date): string {
	const parts: string[] = [repo.name]
	if (repo.isFork) parts.push("⑂")
	if (repo.stars !== undefined && repo.stars > 0) parts.push(`★${repo.stars}`)
	parts.push(`· ${formatRelativeTime(repo.updatedAt, now)}`)
	return parts.join(" ")
}
