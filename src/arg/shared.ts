export const sharedArgs = {
	org: {
		type: "string",
		description: "Default org prefix; positional args are treated as repo names and org is prepended",
	},
} as const
