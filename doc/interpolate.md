# Interpolate Command

## Overview

The `interpolate` command provides variable interpolation functionality compatible with opencode's command prompt syntax. It allows you to substitute positional arguments (`$1`, `$2`, `$3`, etc.) and all arguments (`$ARGUMENTS`) into template strings.

## Usage

```bash
# Using --template flag
rekon interpolate -t <template> [args...]

# Using --file flag
rekon interpolate -f <template-file> [args...]

# Piping template via stdin
echo '<template>' | rekon interpolate [args...]
cat template.txt | rekon interpolate [args...]
```

## Arguments

- `-t, --template <template>`: Template string with placeholders
- `-f, --file <template-file>`: Read template from file

## Placeholders

### Positional Arguments

Placeholders `$1`, `$2`, `$3`, etc. are replaced with the corresponding positional arguments provided after the template:

```bash
rekon interpolate -t 'Hello $1, you are $2 years old' Alice 30
# Output: Hello Alice, you are 30 years old
```

### Last Placeholder Behavior

The highest-numbered placeholder will consume all remaining arguments from that position:

```bash
rekon interpolate -t 'Files: $1, $2, and others' file1.txt file2.txt file3.txt file4.txt
# Output: Files: file1.txt, file2.txt file3.txt file4.txt, and others
```

In this example, `$2` captures both "file2.txt", "file3.txt", and "file4.txt" joined together.

### All Arguments Placeholder

The `$ARGUMENTS` placeholder is replaced with all arguments as a single string:

```bash
rekon interpolate -t 'All arguments: $ARGUMENTS' one two three four
# Output: All arguments: one two three four
```

## File Template

You can read template from a file using the `--file` or `-f` option:

```bash
# Read template from file
rekon interpolate -f template.txt arg1 arg2

# Relative paths work
rekon interpolate -f ./templates/deploy.sh production

# Absolute paths work
rekon interpolate -f /path/to/template.txt value
```

## Piping Template via Stdin

You can pipe a template to the `interpolate` command instead of using the `--template` flag:

```bash
# Simple piped template
echo 'Hello $1, you are $2' | rekon interpolate world friend
# Output: Hello world, you are friend

# Multi-line template from file
cat my-template.txt | rekon interpolate arg1 arg2

# Using heredoc for complex templates
rekon interpolate args << 'EOF'
Edit file $1 with the following changes:
- Add $2
- Remove $3
EOF
```

When piping, `--template` flag is ignored (if specified, stdin takes precedence).

## Quoting

Use single quotes for the template string to prevent shell expansion of `$` placeholders:

```bash
# Correct - single quotes preserve $1
rekon interpolate -t 'Hello $1' world

# Incorrect - double quotes or no quotes may expand $1 in shell
rekon interpolate -t "Hello $1" world
```

## Argument Parsing

Arguments are parsed using the same rules as opencode:
- Quoted strings (`"arg with spaces"`, `'arg with spaces'`) are treated as single arguments
- Unquoted sequences of non-space characters are individual arguments
- Image references like `[Image N]` are treated as single tokens

## Examples

### File Template

```bash
# Simple file template
echo 'Hello $1, you are $2' > template.txt
rekon interpolate -f template.txt world friend
# Output: Hello world, you are friend

# Using $ARGUMENTS with file
echo 'Processing: $ARGUMENTS' > process.txt
rekon interpolate -f process.txt --verbose --debug
# Output: Processing: --verbose --debug
```

### Piping Template

```bash
# Pipe template from echo
echo 'Hello $1, you are $2' | rekon interpolate world friend
# Output: Hello world, you are friend

# Read template from file
echo 'Edit $1 with $2' > template.txt
cat template.txt | rekon interpolate main.ts --force
# Output: Edit main.ts with --force
```

### Simple Substitution

```bash
rekon interpolate -t 'Edit file $1 with mode $2' src/main.ts dry-run
# Output: Edit file src/main.ts with mode dry-run
```

### Multiple Placeholders

```bash
rekon interpolate -t 'Move $1 to $2' old-file.txt new-file.txt
# Output: Move old-file.txt to new-file.txt
```

### Mixed Placeholders

```bash
rekon interpolate -t 'Processing $1 with $ARGUMENTS' main --verbose --debug
# Output: Processing main with --verbose --debug
```

### Quoted Arguments

```bash
rekon interpolate -t 'Message: $1' 'Hello, world!'
# Output: Message: Hello, world!
```

## Implementation Details

The interpolation logic matches opencode's implementation in `/usr/local/src/opencode-git/packages/opencode/src/session/prompt.ts`:

1. Arguments are parsed using the regex: `/(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi`
2. Placeholders are found using: `/$(\d+)/g`
3. The highest-numbered placeholder consumes all remaining arguments from its position
4. `$ARGUMENTS` is replaced with the full arguments string

## Notes

- If there are more placeholders than arguments, extra placeholders are replaced with empty strings
- If there are fewer placeholders than arguments, extra arguments are ignored (except by the last placeholder)
- The interpolation is a simple string replacement with no shell command execution
