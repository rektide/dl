#!/usr/bin/env node
import { define } from 'gunshi'
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

async function readFromFile(filePath: string): Promise<string> {
	try {
		const resolvedPath = resolve(filePath);
		return await readFile(resolvedPath, 'utf-8');
	} catch (error) {
		console.error(`Error reading file: ${filePath}`);
		if (error instanceof Error) {
			console.error(error.message);
		}
		process.exit(1);
	}
}

async function run(ctx: any) {
	const template = ctx.values.template || ctx.values.t;
	const file = ctx.values.file || ctx.values.f;

	let templateContent = template;

	if (!file && !process.stdin.isTTY) {
		templateContent = await readStdin();
	}

	if (file && !template) {
		templateContent = await readFromFile(file);
	}

	if (!templateContent) {
		console.error('Error: --template/-t is required, --file/-f, or pipe template via stdin');
		process.exit(1);
	}

	const rawArgs = process.argv.slice(2);
	let argsToProcess = rawArgs;

	if (template || file) {
		let skipTo = 0;
		for (let i = 0; i < argsToProcess.length; i++) {
			if (argsToProcess[i].startsWith('-')) {
				skipTo = i + 2;
			} else if (skipTo > 0) {
				break;
			}
		}
		argsToProcess = argsToProcess.slice(skipTo);
	}

	const argumentsString = argsToProcess.join(' ');

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
			description: 'Template string with $1, $2, $3 placeholders',
		},
		file: {
			type: 'string',
			short: 'f',
			description: 'Read template from file',
		},
	},
	run,
});
