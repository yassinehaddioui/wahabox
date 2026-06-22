'use client'

import { useRef, useCallback } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Heading,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function insertAtCursor(textarea: HTMLTextAreaElement, before: string, after: string = '') {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = textarea.value.substring(start, end)
  const replacement = before + selected + after

  textarea.focus()
  document.execCommand('insertText', false, replacement)

  textarea.selectionStart = start + before.length
  textarea.selectionEnd = start + before.length + selected.length
}

type Tool = {
  icon: React.ReactNode
  label: string
  before: string
  after: string
}

const tools: Tool[] = [
  { icon: <Bold className="h-3.5 w-3.5" />, label: 'Bold', before: '**', after: '**' },
  { icon: <Italic className="h-3.5 w-3.5" />, label: 'Italic', before: '_', after: '_' },
  {
    icon: <Strikethrough className="h-3.5 w-3.5" />,
    label: 'Strikethrough',
    before: '~~',
    after: '~~',
  },
  { icon: <Code className="h-3.5 w-3.5" />, label: 'Code', before: '`', after: '`' },
  { icon: <Link className="h-3.5 w-3.5" />, label: 'Link', before: '[', after: '](url)' },
  { icon: <Heading className="h-3.5 w-3.5" />, label: 'Heading', before: '## ', after: '' },
  { icon: <List className="h-3.5 w-3.5" />, label: 'Bullet list', before: '- ', after: '' },
  {
    icon: <ListOrdered className="h-3.5 w-3.5" />,
    label: 'Numbered list',
    before: '1. ',
    after: '',
  },
  { icon: <Quote className="h-3.5 w-3.5" />, label: 'Blockquote', before: '> ', after: '' },
]

interface MarkdownEditorProps {
  id?: string
  value: string
  onChange: (value: string) => void
  className?: string
  maxLength?: number
  required?: boolean
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  className,
  maxLength,
  required,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleToolAction = useCallback(
    (tool: Tool) => {
      const ta = textareaRef.current
      if (!ta) return
      insertAtCursor(ta, tool.before, tool.after)
      onChange(ta.value)
    },
    [onChange],
  )

  return (
    <div className={cn('space-y-0', className)}>
      <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-input bg-muted/40 px-1.5 py-1">
        {tools.map((tool) => (
          <Button
            key={tool.label}
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label={tool.label}
            title={tool.label}
            onClick={() => handleToolAction(tool)}
          >
            {tool.icon}
          </Button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex field-sizing-content min-h-40 w-full rounded-b-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          'font-mono',
        )}
        maxLength={maxLength}
        required={required}
      />
    </div>
  )
}
