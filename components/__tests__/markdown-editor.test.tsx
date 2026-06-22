// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

import { MarkdownEditor } from '@/components/ui/markdown-editor'

beforeAll(() => {
  document.execCommand = vi.fn()
})

describe('MarkdownEditor', () => {
  it('renders all toolbar buttons', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Bold')).toBeInTheDocument()
    expect(screen.getByLabelText('Italic')).toBeInTheDocument()
    expect(screen.getByLabelText('Strikethrough')).toBeInTheDocument()
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Link')).toBeInTheDocument()
    expect(screen.getByLabelText('Heading')).toBeInTheDocument()
    expect(screen.getByLabelText('Bullet list')).toBeInTheDocument()
    expect(screen.getByLabelText('Numbered list')).toBeInTheDocument()
    expect(screen.getByLabelText('Blockquote')).toBeInTheDocument()
  })

  it('renders the textarea with the provided value', () => {
    render(<MarkdownEditor value="hello world" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('hello world')
  })

  it('calls onChange when textarea value changes', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new text' } })
    expect(onChange).toHaveBeenCalledWith('new text')
  })

  it('forwards maxLength to the textarea', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} maxLength={500} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '500')
  })

  it('forwards required to the textarea', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} required />)
    expect(screen.getByRole('textbox')).toBeRequired()
  })

  it('applies custom className', () => {
    const { container } = render(<MarkdownEditor value="" onChange={vi.fn()} className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('inserts bold markers around selected text', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="hello world" onChange={onChange} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(6, 11)
    const execMock = vi.spyOn(document, 'execCommand').mockImplementation((_cmd, _showUI, value) => {
      const val = value as string
      textarea.value =
        textarea.value.substring(0, textarea.selectionStart) +
        val +
        textarea.value.substring(textarea.selectionEnd)
      return true
    })
    fireEvent.click(screen.getByLabelText('Bold'))
    expect(execMock).toHaveBeenCalledWith('insertText', false, '**world**')
    expect(onChange).toHaveBeenCalledWith('hello **world**')
    execMock.mockRestore()
  })

  it('inserts heading prefix with no selection', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="hello" onChange={onChange} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 0)
    const execMock = vi.spyOn(document, 'execCommand').mockImplementation((_cmd, _showUI, value) => {
      const val = value as string
      textarea.value =
        textarea.value.substring(0, textarea.selectionStart) +
        val +
        textarea.value.substring(textarea.selectionEnd)
      return true
    })
    fireEvent.click(screen.getByLabelText('Heading'))
    expect(execMock).toHaveBeenCalledWith('insertText', false, '## ')
    expect(onChange).toHaveBeenCalledWith('## hello')
    execMock.mockRestore()
  })

  it('inserts link syntax around selected text', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="click here" onChange={onChange} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 5)
    const execMock = vi.spyOn(document, 'execCommand').mockImplementation((_cmd, _showUI, value) => {
      const val = value as string
      textarea.value =
        textarea.value.substring(0, textarea.selectionStart) +
        val +
        textarea.value.substring(textarea.selectionEnd)
      return true
    })
    fireEvent.click(screen.getByLabelText('Link'))
    expect(execMock).toHaveBeenCalledWith('insertText', false, '[click](url)')
    execMock.mockRestore()
  })

  it('does nothing when textarea ref is null', () => {
    const onChange = vi.fn()
    const { container, unmount } = render(<MarkdownEditor value="hello" onChange={onChange} />)
    const boldButton = container.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
    unmount()
    expect(() => fireEvent.click(boldButton)).not.toThrow()
  })
})
