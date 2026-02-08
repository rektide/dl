#!/usr/bin/env node
import { readlink, symlink, mkdir, rm, readFile } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { define } from 'gunshi'
import { glob } from "glob";
import { xdgConfig } from 'xdg-basedir';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function findMarkdownFiles(dir: string, subdirs: boolean = false): Promise<string[]> {
  const pattern = subdirs ? '**/*.{md,mdx}' : '*.{md,mdx}';
  const files = await glob(pattern, { cwd: dir, absolute: true });
  return files.sort();
}

type TargetStatus = 'does-not-exist' | 'already-symlinked' | 'different-symlink' | 'regular-file';

async function precheckTarget(destFile: string, absoluteSource: string): Promise<TargetStatus> {
  try {
    const linkTarget = await readlink(destFile);
    if (linkTarget === absoluteSource) {
      return 'already-symlinked';
    }
    return 'different-symlink';
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'does-not-exist';
    }
    return 'regular-file';
  }
}

interface TableRow {
  file: string
  status: string
  flags: string[]
}

async function run(ctx: any) {
  const force = ctx.values.f || false;
  const dryRun = ctx.values.n || false;
  const quiet = ctx.values.q || false;
  const subdirs = ctx.values.s || false;
  const useJson = ctx.values.json === true;
  const projectRoot = resolve(__dirname, '..');
  const promptDir = join(projectRoot, 'prompt');
  const configDir = xdgConfig;
  const opencodeCommandDir = join(configDir || join(process.env.HOME || process.env.USERPROFILE || '.', '.config'), 'opencode', 'command');

  const markdownFiles = await findMarkdownFiles(promptDir, subdirs);

  if (!dryRun) {
    await mkdir(opencodeCommandDir, { recursive: true });
  }

  const tableRow = (row: TableRow) => {
    if (useJson) {
      console.log(JSON.stringify(row));
    } else {
      console.log(`${row.file}\t${row.status}\t${row.flags.join('\t')}`);
    }
  };

  for (const sourceFile of markdownFiles) {
    const relativePath = sourceFile.slice(promptDir.length + 1);
    const destFile = join(opencodeCommandDir, basename(sourceFile));
    const absoluteSource = resolve(sourceFile);

    const flags: string[] = [];
    let status: string = 'done';

    const content = await readFile(sourceFile, 'utf-8');
    const { data } = matter(content);
    if (!data.description) {
      flags.push('[missing-frontmatter]');
      if (!quiet) {
        console.warn(`Warning: ${relativePath} missing description in front-matter`);
      }
    }

    const targetStatus = await precheckTarget(destFile, absoluteSource);

    if (targetStatus === 'already-symlinked') {
      status = 'already-done';
    } else if (targetStatus === 'different-symlink') {
      flags.push('[different-symlink]');
      if (!force) {
        status = 'error-existing-file';
      } else {
        flags.push('[force-overwrite]');
      }
    } else if (targetStatus === 'regular-file') {
      flags.push('[regular-file]');
      if (!force) {
        status = 'error-existing-file';
      } else {
        flags.push('[force-overwrite]');
      }
    }

    if (status === 'already-done') {
      tableRow({ file: relativePath, status, flags });
      continue;
    }

    if (status === 'error-existing-file') {
      tableRow({ file: relativePath, status, flags });
      continue;
    }

    if (!dryRun) {
      try {
        if (force && (targetStatus === 'different-symlink' || targetStatus === 'regular-file')) {
          await rm(destFile, { force: true });
        }
        await symlink(absoluteSource, destFile, 'file');
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.error(`${relativePath}: error - ${err.message}`);
        }
        status = 'error-symlink';
        tableRow({ file: relativePath, status, flags });
        process.exit(1);
      }
    } else {
      status = 'dry-run';
    }
    tableRow({ file: relativePath, status, flags });
  }
}

export default define({
  name: 'install-commands',
  description: 'Install prompt/ markdown files as opencode commands',
  args: {
    f: {
      type: 'boolean',
      short: 'f',
      default: false,
      description: 'Force overwrite existing files',
    },
    n: {
      type: 'boolean',
      short: 'n',
      default: false,
      description: 'Dry run - show what would happen without making changes',
    },
    q: {
      type: 'boolean',
      short: 'q',
      default: false,
      description: 'Quiet - suppress warnings',
    },
    s: {
      type: 'boolean',
      short: 's',
      default: false,
      description: 'Include subdirectories',
    },
    json: {
      type: 'boolean',
      short: 'j',
      default: false,
      description: 'Output in JSON format (NDJSON)',
    },
  },
  run,
});
