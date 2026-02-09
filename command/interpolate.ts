#!/usr/bin/env node
import { define } from 'gunshi'

const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi;
const placeholderRegex = /\$(\d+)/g;

async function run(ctx: any) {
	const template = ctx.values.template || ctx.values.t;

	if (!template) {
		console.error('Error: --template or -t is required');
		process.exit(1);
	}

	const rawArgs = process.argv.slice(2);
	const templateIndex = rawArgs.findIndex((arg) => arg === '-t' || arg === '--template');
	const argsStart = templateIndex >= 0 ? templateIndex + 2 : 0;
	const remainingArgs = rawArgs.slice(argsStart).filter(a => !a.startsWith('-'));
	const argumentsString = remainingArgs.join(' ');

	const raw = argumentsString.match(argsRegex) ?? [];
	const parsedArgs = raw.map((arg) => arg.replace(/^["']|["']$/g, ''));

	const placeholders = template.match(placeholderRegex) ?? [];
	let last = 0;
	for (const item of placeholders) {
		const value = Number(item.slice(1));
		if (value > last) last = value;
	}

	const withArgs = template.replaceAll(placeholderRegex, (_: string, index: string) => {
		const position = Number(index);
		const argIndex = position - 1;
		if (argIndex >= parsedArgs.length) return '';
		if (position === last) return parsedArgs.slice(argIndex).join(' ');
		return parsedArgs[argIndex];
	});

	const result = withArgs.replaceAll('$ARGUMENTS', argumentsString);
	console.log(result);
}

export default define({
	name: 'interpolate',
	description: 'Interpolate $1, $2, $3, etc. into a template string',
	args: {
		template: {
			type: 'string',
			short: 't',
			description: 'Template string with $1, $2, $3 placeholders',
		},
	},
	run,
});
