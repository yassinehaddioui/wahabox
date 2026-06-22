import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn — class merging', () => {
  it('merges multiple class strings into one', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  it('joins classes from an array argument', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
  })

  it('preserves order of non-conflicting classes', () => {
    expect(cn('p-2', 'm-2', 'text-sm')).toBe('p-2 m-2 text-sm')
  })

  it('returns an empty string when given no inputs', () => {
    expect(cn()).toBe('')
  })
})

describe('cn — conditional and falsy values', () => {
  it('includes a class when the condition is true', () => {
    expect(cn('base', true && 'active')).toBe('base active')
  })

  it('excludes a class when the condition is false', () => {
    expect(cn('base', false && 'active')).toBe('base')
  })

  it('drops null values', () => {
    expect(cn('base', null, 'tail')).toBe('base tail')
  })

  it('drops undefined values', () => {
    expect(cn('base', undefined, 'tail')).toBe('base tail')
  })

  it('drops empty strings', () => {
    expect(cn('base', '', 'tail')).toBe('base tail')
  })

  it('handles a mix of truthy, falsy, and nullish values', () => {
    expect(cn('base', false && 'no', true && 'yes', null, undefined, '', 'end')).toBe(
      'base yes end',
    )
  })

  it('handles nested arrays with falsy entries', () => {
    expect(cn(['a', false, 'b'], [null, 'c', undefined])).toBe('a b c')
  })

  it('handles an object-style clsx map', () => {
    expect(cn({ hidden: false, visible: true, active: true })).toBe('visible active')
  })
})

describe('cn — Tailwind conflict resolution', () => {
  it('keeps the last value for duplicate padding-x', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('keeps the last value for duplicate padding-y', () => {
    expect(cn('py-1', 'py-3')).toBe('py-3')
  })

  it('keeps the last value for duplicate text color', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('keeps the last value for duplicate background color', () => {
    expect(cn('bg-white', 'bg-black')).toBe('bg-black')
  })

  it('resolves conflicts across multiple class strings', () => {
    expect(cn('px-2 py-1 text-sm', 'px-4 text-lg')).toBe('py-1 px-4 text-lg')
  })

  it('resolves conflicts when the later class is conditional', () => {
    expect(cn('px-2', true && 'px-8')).toBe('px-8')
  })

  it('resolves conflicts when the later class is in an array', () => {
    expect(cn('px-2', ['px-6'])).toBe('px-6')
  })

  it('does not collapse non-conflicting utilities', () => {
    expect(cn('px-2', 'py-2', 'm-4')).toBe('px-2 py-2 m-4')
  })

  it('keeps the last value for duplicate font weight', () => {
    expect(cn('font-normal', 'font-bold')).toBe('font-bold')
  })

  it('keeps non-conflicting classes alongside resolved conflicts', () => {
    expect(cn('flex items-center px-2', 'px-6 justify-between')).toBe(
      'flex items-center px-6 justify-between',
    )
  })
})
