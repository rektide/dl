#!/usr/bin/env node
import { cli, define } from 'gunshi'
import combineCommand from './src/command/combine.ts'
import dlCommand from './src/command/dl.ts'
import installCommandsCommand from './src/command/install-commands.ts'
import interpolateCommand from './src/command/interpolate.ts'
import projectFilesCommand from './src/command/project-files.ts'
import completion from '@gunshi/plugin-completion'

const mainCommand = define({
	name: 'rekon',
	description: 'Rekon CLI tool',
	run: () => {
		console.log('Available commands: combine, dl, install-commands, interpolate, project-files')
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
		'project-files': projectFilesCommand
	},
	plugins: [
		completion()
	]
})
