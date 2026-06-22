'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import MDEditor from '@uiw/react-md-editor'
import type { TextEditorProps } from './text-editor-types'
import { cn } from '@/lib/utils'

export function MdEditor({
  id,
  value,
  onChange,
  maxLength,
  className,
}: TextEditorProps) {
  const { resolvedTheme } = useTheme()
  const [charCount, setCharCount] = useState(value.length)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = matchMedia('(max-width: 639px)')
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const handleChange = useCallback(
    (val?: string) => {
      const newValue = val ?? ''
      setCharCount(newValue.length)
      if (maxLength && newValue.length > maxLength) return
      onChange(newValue)
    },
    [onChange, maxLength],
  )

  return (
    <div
      className={cn('space-y-0', className)}
      data-color-mode={resolvedTheme === 'dark' ? 'dark' : 'light'}
    >
      <MDEditor
        value={value}
        onChange={handleChange}
        preview="edit"
        height={isMobile ? 300 : 400}
        visibleDragbar={false}
        textareaProps={{
          id,
          placeholder: 'Write your message…',
        }}
      />
      {maxLength && (
        <p
          className={cn(
            'mt-1 text-right text-xs',
            charCount > maxLength
              ? 'font-medium text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {charCount.toLocaleString()}&thinsp;/&thinsp;
          {maxLength.toLocaleString()}
        </p>
      )}
    </div>
  )
}
