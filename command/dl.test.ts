import { describe, expect, test } from 'vitest'
import { parseRepositoryInput } from './dl.ts'

describe('parseRepositoryInput', () => {
  test.each([
    {
      input: 'huggingface/transformers',
      expected: { host: undefined, org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: false }
    },
    {
      input: '/huggingface/transformers',
      expected: { host: undefined, org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: false }
    },
    {
      input: 'github.com/huggingface/transformers',
      expected: { host: 'github.com', org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: false }
    },
    {
      input: 'https://github.com/huggingface/transformers',
      expected: { host: 'github.com', org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: true }
    },
    {
      input: 'https://github.com/huggingface/transformers.git',
      expected: { host: 'github.com', org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: true }
    },
    {
      input: 'ssh://github.com/huggingface/transformers',
      expected: { host: 'github.com', org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: true }
    },
    {
      input: 'git@github.com:huggingface/transformers.git',
      expected: { host: 'github.com', org: 'huggingface', repo: 'transformers', hasExplicitCloneUrl: true }
    },
    {
      input: 'gitlab.com/group/subgroup/project',
      expected: { host: 'gitlab.com', org: 'group', repo: 'project', hasExplicitCloneUrl: false }
    },
    {
      input: 'localhost/team/repo',
      expected: { host: 'localhost', org: 'team', repo: 'repo', hasExplicitCloneUrl: false }
    }
  ])('transforms $input', ({ input, expected }) => {
    expect(parseRepositoryInput(input)).toEqual(expected)
  })

  test.each([
    '',
    '/',
    'foo',
    'https://github.com',
    'git@github.com:'
  ])('rejects unsupported input: %s', (input) => {
    expect(() => parseRepositoryInput(input)).toThrow('dl: unsupported repository input')
  })
})
