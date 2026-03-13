#!/usr/bin/env node
import { cli, define } from 'gunshi'
import combineCommand from './src/command/combine.ts'
import dlCommand from './src/command/dl.ts'
import installCommandsCommand from './src/command/install-commands.ts'
import interpolateCommand from './src/command/interpolate.ts'
import projectLinkCommand from './src/command/project-link.ts'
import projectFilesCommand from './src/command/project-files.ts'
import completion from '@gunshi/plugin-completion'
import { c12 } from 'gunshi-c12'
import { createGitPlugin } from './src/plugin/git.ts'
import { createRepoPlugin } from './src/plugin/repo.ts'
import { createRootsPlugin } from './src/plugin/roots.ts'

const mainCommand = define({
	name: 'rekon',
	description: 'Rekon CLI tool',
	run: () => {
		console.log('Available commands: combine, dl, install-commands, interpolate, project-files, project-link')
		console.log('Run "rekon --help" for more information')
	}
})

await cli(process.argv.slice(2), mainCommand, {
	name: 'rekon',
	version: '1.0.0',
	description: 'Rekon CLI tool',
	subCommands: {
		combine: combineCommand,
		dl: dlCommand,
		'install-commands': installCommandsCommand,
		interpolate: interpolateCommand,
		'project-link': projectLinkCommand,
		'project-files': projectFilesCommand
	},
	plugins: [
		completion(),
		c12({ name: 'rekon' }),
		createRootsPlugin(),
		createRepoPlugin(),
		createGitPlugin()
	]
})
