import { describe, expect, test } from 'vitest'
import { parseInput } from '../dl/repository.ts'

describe('parseInput', () => {
  test.each([
    {
      input: 'huggingface/transformers',
      expected: {
        host: undefined,
        path: 'huggingface/transformers',
        segments: ['huggingface', 'transformers']
      }
    },
    {
      input: '/huggingface/transformers',
      expected: {
        host: undefined,
        path: 'huggingface/transformers',
        segments: ['huggingface', 'transformers']
      }
    },
    {
      input: 'github.com/huggingface/transformers',
      expected: {
        host: 'github.com',
        path: 'huggingface/transformers',
        segments: ['huggingface', 'transformers']
      }
    },
    {
      input: 'github.com/rektide/opencode/blob/dev/README.md',
      expected: {
        host: 'github.com',
        path: 'rektide/opencode/blob/dev/README.md',
        segments: ['rektide', 'opencode', 'blob', 'dev', 'README.md']
      }
    },
    {
      input: 'https://github.com/rektide/opencode/blob/dev/README.md',
      expected: {
        host: 'github.com',
        path: 'rektide/opencode/blob/dev/README.md',
        segments: ['rektide', 'opencode', 'blob', 'dev', 'README.md']
      }
    },
    {
      input: 'https://github.com/huggingface/transformers.git',
      expected: {
        host: 'github.com',
        path: 'huggingface/transformers',
        segments: ['huggingface', 'transformers']
      }
    },
    {
      input: 'ssh://github.com/huggingface/transformers',
      expected: {
        host: 'github.com',
        path: 'huggingface/transformers',
        segments: ['huggingface', 'transformers']
      }
    },
    {
      input: 'git@github.com:huggingface/transformers.git',
      expected: {
        host: 'github.com',
        path: 'huggingface/transformers',
        segments: ['huggingface', 'transformers']
      }
    },
    {
      input: 'gitlab.com/group/subgroup/project',
      expected: {
        host: 'gitlab.com',
        path: 'group/subgroup/project',
        segments: ['group', 'subgroup', 'project']
      }
    },
    {
      input: 'https://gitlab.com/group/subgroup/project/-/blob/main/README.md',
      expected: {
        host: 'gitlab.com',
        path: 'group/subgroup/project/-/blob/main/README.md',
        segments: ['group', 'subgroup', 'project', '-', 'blob', 'main', 'README.md']
      }
    },
    {
      input: 'localhost/team/repo',
      expected: {
        host: 'localhost',
        path: 'team/repo',
        segments: ['team', 'repo']
      }
    }
  ])('transforms $input', ({ input, expected }) => {
    expect(parseInput(input)).toEqual(expected)
  })
})
