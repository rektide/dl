#!/usr/bin/env node
import { define } from 'gunshi'
import { createInterface } from 'node:readline';

const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi;
const placeholderRegex = /\$(\d+)/g;

async function readStdin(): Promise<string> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});

	const lines: string[] = [];
	for await (const line of rl) {
		lines.push(line);
	}
	rl.close();
	return lines.join('\n');
}

async function run(ctx: any) {
	const template = ctx.values.template || ctx.values.t;

	let templateContent = template;

	if (!templateContent && !process.stdin.isTTY) {
		templateContent = await readStdin();
	}

	if (!templateContent) {
		console.error('Error: --template/-t is required, or pipe template via stdin');
		process.exit(1);
	}

	const rawArgs = process.argv.slice(2);
	let argsToProcess = rawArgs.filter(a => a !== 'interpolate');

	const templateIndex = argsToProcess.findIndex((arg) => arg === '-t' || arg === '--template');

	if (templateIndex >= 0) {
		argsToProcess = argsToProcess.slice(templateIndex + 2);
	} else if (template) {
		argsToProcess = argsToProcess.slice(1);
	}

	const remainingArgs = argsToProcess.filter(a => !a.startsWith('-'));
	const argumentsString = remainingArgs.join(' ');

	const raw = argumentsString.match(argsRegex) ?? [];
	const parsedArgs = raw.map((arg) => arg.replace(/^["']|["']$/g, ''));

	const placeholders = templateContent.match(placeholderRegex) ?? [];
	let last = 0;
	for (const item of placeholders) {
		const value = Number(item.slice(1));
		if (value > last) last = value;
	}

	const withArgs = templateContent.replaceAll(placeholderRegex, (_: string, index: string) => {
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
			description: 'Template string with $1, $2, $3 placeholders (or pipe via stdin)',
		},
	},
	run,
});
