#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "glob";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { define } from 'gunshi'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function* prompts(patterns: string[], baseDir = "prompt/") {
  for (const pattern of patterns) {
    const searchPattern = pattern.startsWith("prompt/") ? pattern : join(baseDir, pattern);
    const files = await glob(searchPattern, { cwd: join(__dirname, "..") });
    yield* files;
  }
}

async function* planFiles(patterns: string[], baseDir = "prompt/") {
  for await (const file of prompts(patterns, baseDir)) {
    const fullPath = join(__dirname, "..", file);
    try {
      const content = await readFile(fullPath, "utf-8");
      yield { name: file, content };
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function ensureHeader(name: string, content: string) {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("#")) {
    return content;
  }
  const baseName = basename(name, ".md");
  return `# ${baseName}\n\nThis is prompt called ${name}\n\n${content}`;
}

async function writeCombined(patterns: string[], outputFile = "COMBINED.md", filterPattern?: string) {
  const combinedContent = [];
  let matchCount = 0;
  const regex = filterPattern ? new RegExp(filterPattern) : null;

  for await (const { name, content } of planFiles(patterns)) {
    if (regex && !regex.test(content)) {
      continue;
    }
    const contentWithHeader = ensureHeader(name, content);
    combinedContent.push(contentWithHeader);
    combinedContent.push("\n\n---\n\n");
    matchCount++;
  }
  const finalContent = combinedContent.join("");
  const outputPath = outputFile.startsWith("/") ? outputFile : join(__dirname, "..", outputFile);
  await writeFile(outputPath, finalContent, "utf-8");
  return { outputFile, matchCount };
}

export default define({
  name: 'combine',
  description: 'Combine markdown plans from prompt/ directory',
  args: {
    output: {
      type: 'string',
      short: 'o',
      default: 'COMBINED.md',
      description: 'Output file path',
    },
    pattern: {
      type: 'string',
      short: 'e',
      description: 'Filter files by regular expression pattern',
    },
  },
  run: async (ctx) => {
    const rawArgs = process.argv.slice(2);
    const outputFlagIndex = rawArgs.findIndex((arg) => arg === "-o" || arg === "--output");
    const patternFlagIndex = rawArgs.findIndex((arg) => arg === "-e" || arg === "--pattern");
    let outputFile = ctx.values.output;
    let pattern = ctx.values.pattern;
    let patterns = rawArgs;

    if (outputFlagIndex >= 0) {
      outputFile = rawArgs[outputFlagIndex + 1] || outputFile;
      patterns = rawArgs.slice(0, outputFlagIndex).concat(rawArgs.slice(outputFlagIndex + 2));
    }

    if (patternFlagIndex >= 0) {
      const adjustedIndex = outputFlagIndex >= 0 && patternFlagIndex > outputFlagIndex
        ? patternFlagIndex - 2
        : patternFlagIndex;
      pattern = rawArgs[adjustedIndex + 1] || pattern;
      patterns = rawArgs.slice(0, adjustedIndex).concat(rawArgs.slice(adjustedIndex + 2));
    }

    patterns = patterns.filter(arg => !arg.startsWith("-"));

    if (patterns.length === 0) {
      console.error("Error: at least one pattern is required");
      process.exit(1);
    }

    const result = await writeCombined(patterns, outputFile, pattern);
    const message = pattern
      ? `Combined ${result.matchCount} matching file(s) into ${result.outputFile}`
      : `Combined ${patterns.length} file(s) into ${result.outputFile}`;
    console.log(message);
  },
});
