// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('@uiw/react-md-editor', () => ({
  default: ({
    value,
    onChange,
    textareaProps,
  }: {
    value?: string
    onChange?: (val?: string) => void
    textareaProps?: Record<string, unknown>
  }) => (
    <textarea
      data-testid="md-editor-textarea"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      {...textareaProps}
    />
  ),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

import { MdEditor } from '@/components/ui/md-editor'

describe('MdEditor', () => {
  it('renders the textarea from MDEditor', () => {
    render(<MdEditor value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('md-editor-textarea')).toBeInTheDocument()
  })

  it('shows character counter when maxLength is set', () => {
    render(<MdEditor value="hello" onChange={vi.fn()} maxLength={100} />)
    expect(
      screen.getByText((content) => content.includes('5') && content.includes('100')),
    ).toBeInTheDocument()
  })

  it('updates character count as user types', () => {
    const onChange = vi.fn()
    render(<MdEditor value="" onChange={onChange} maxLength={100} />)
    fireEvent.change(screen.getByTestId('md-editor-textarea'), { target: { value: 'abc' } })
    expect(onChange).toHaveBeenCalledWith('abc')
  })

  it('prevents onChange when value exceeds maxLength', () => {
    const onChange = vi.fn()
    render(<MdEditor value="short" onChange={onChange} maxLength={5} />)
    fireEvent.change(screen.getByTestId('md-editor-textarea'), {
      target: { value: 'too long value' },
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows counter in destructive color when over limit', () => {
    render(<MdEditor value="exceeds limit" onChange={vi.fn()} maxLength={5} />)
    const counter = screen.getByText((content) => content.includes('13') && content.includes('5'))
    expect(counter.className).toContain('text-destructive')
  })

  it('shows counter in muted color when under limit', () => {
    render(<MdEditor value="short" onChange={vi.fn()} maxLength={100} />)
    const counter = screen.getByText((content) => content.includes('5') && content.includes('100'))
    expect(counter.className).toContain('text-muted-foreground')
  })

  it('does not render counter when maxLength is not set', () => {
    render(<MdEditor value="hello" onChange={vi.fn()} />)
    expect(screen.queryByText(/\d+.*\/.*\d+/)).not.toBeInTheDocument()
  })
})
