import { describe, expect, test } from 'vitest'
import { parseRepositoryInput } from './dl.ts'

describe('parseRepositoryInput', () => {
  test.each([
    {
      input: 'huggingface/transformers',
      expected: {
        host: undefined,
        repoPathCandidates: ['huggingface/transformers'],
        preferGitHub: false
      }
    },
    {
      input: '/huggingface/transformers',
      expected: {
        host: undefined,
        repoPathCandidates: ['huggingface/transformers'],
        preferGitHub: false
      }
    },
    {
      input: 'github.com/huggingface/transformers',
      expected: {
        host: 'github.com',
        repoPathCandidates: ['huggingface/transformers'],
        preferGitHub: false
      }
    },
    {
      input: 'https://github.com/rektide/opencode/blob/dev/README.md',
      expected: {
        host: 'github.com',
        repoPathCandidates: ['rektide/opencode'],
        preferGitHub: true
      }
    },
    {
      input: 'https://github.com/huggingface/transformers.git',
      expected: {
        host: 'github.com',
        repoPathCandidates: ['huggingface/transformers'],
        preferGitHub: false
      }
    },
    {
      input: 'ssh://github.com/huggingface/transformers',
      expected: {
        host: 'github.com',
        repoPathCandidates: ['huggingface/transformers'],
        preferGitHub: false
      }
    },
    {
      input: 'git@github.com:huggingface/transformers.git',
      expected: {
        host: 'github.com',
        repoPathCandidates: ['huggingface/transformers'],
        preferGitHub: false
      }
    },
    {
      input: 'gitlab.com/group/subgroup/project',
      expected: {
        host: 'gitlab.com',
        repoPathCandidates: ['group/subgroup/project', 'group/subgroup'],
        preferGitHub: false
      }
    },
    {
      input: 'https://gitlab.com/group/subgroup/project/-/blob/main/README.md',
      expected: {
        host: 'gitlab.com',
        repoPathCandidates: [
          'group/subgroup/project',
          'group/subgroup',
          'group/subgroup/project/-/blob/main/README.md',
          'group/subgroup/project/-/blob/main',
          'group/subgroup/project/-/blob',
          'group/subgroup/project/-'
        ],
        preferGitHub: true
      }
    },
    {
      input: 'localhost/team/repo',
      expected: {
        host: 'localhost',
        repoPathCandidates: ['team/repo'],
        preferGitHub: false
      }
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
