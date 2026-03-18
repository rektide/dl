export const RESOLVE_TIMEOUT = 8000

export async function urlExists(url: string, signal: AbortSignal): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			signal,
		})
		return response.status >= 200 && response.status < 400
	} catch {
		return false
	}
}
