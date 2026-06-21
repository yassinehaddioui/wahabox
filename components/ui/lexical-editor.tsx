'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type EditorState,
} from 'lexical'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from '@lexical/markdown'
import {
  $isLinkNode,
  TOGGLE_LINK_COMMAND,
} from '@lexical/link'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list'
import {
  $isHeadingNode,
  $createHeadingNode,
  $createQuoteNode,
  HeadingNode,
  QuoteNode,
} from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { mergeRegister } from '@lexical/utils'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react'

const lexicalTheme = {
  ltr: 'text-left',
  rtl: 'text-right',
  placeholder: 'text-muted-foreground',
  paragraph: 'mb-2 last:mb-0',
  quote: 'border-l-2 border-primary/40 pl-4 italic text-muted-foreground my-2',
  heading: { h1: 'text-lg font-semibold tracking-tight mb-2', h2: 'text-base font-semibold tracking-tight mb-2' },
  list: { ul: 'list-disc pl-6 mb-2', ol: 'list-decimal pl-6 mb-2', listitem: 'mb-1' },
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    strikethrough: 'line-through',
    code: 'rounded bg-muted px-1 py-0.5 text-[13px] font-mono',
  },
  link: 'text-link underline underline-offset-2',
  code: 'rounded-lg bg-muted border border-border p-3 overflow-x-auto block font-mono text-[13px] my-2',
  codeHighlight: {},
}

function onError(error: Error) {
  console.error('Lexical error:', error)
}

function EditorRefPlugin({ editorRef }: { editorRef: { current: LexicalEditor | null } }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])
  return null
}

interface LexicalMarkdownEditorProps {
  id?: string
  value: string
  onChange: (markdown: string) => void
  maxLength?: number
  className?: string
}

export function LexicalMarkdownEditor({
  id,
  value,
  onChange,
  maxLength,
  className,
}: LexicalMarkdownEditorProps) {
  const editorRef = useRef<LexicalEditor | null>(null)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isLink, setIsLink] = useState(false)
  const [isH1, setIsH1] = useState(false)
  const [isH2, setIsH2] = useState(false)
  const [isOL, setIsOL] = useState(false)
  const [isUL, setIsUL] = useState(false)
  const [isQuote, setIsQuote] = useState(false)

  const initialConfig = {
    namespace: 'markdown-editor',
    theme: lexicalTheme,
    onError,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, CodeHighlightNode],
    editorState: (editor: LexicalEditor) => {
      editor.update(() => {
        const root = $getRoot()
        root.clear()
        if (value) {
          $convertFromMarkdownString(value, TRANSFORMERS, root)
        } else {
          root.append($createParagraphNode())
        }
      })
    },
  }

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const markdown = $convertToMarkdownString(TRANSFORMERS)
        if (maxLength && markdown.length > maxLength) return
        onChange(markdown)
      })
    },
    [onChange, maxLength],
  )

  const updateToolbar = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))
      setIsStrikethrough(selection.hasFormat('strikethrough'))
      setIsCode(selection.hasFormat('code'))
      setIsLink($isLinkNode(selection.anchor.getNode().getParent()))

      const anchorNode = selection.anchor.getNode()
      const parent = anchorNode.getParent()
      setIsH1($isHeadingNode(parent) && parent.getTag() === 'h1')
      setIsH2($isHeadingNode(parent) && parent.getTag() === 'h2')
      setIsQuote(parent?.getType() === 'quote')
    })
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {})
        updateToolbar()
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar()
          return false
        },
        1,
      ),
    )
  }, [updateToolbar])

  const toolbarButtons = [
    {
      icon: <Bold className="h-3.5 w-3.5" />,
      label: 'Bold',
      active: isBold,
      command: () => editorRef.current?.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
    },
    {
      icon: <Italic className="h-3.5 w-3.5" />,
      label: 'Italic',
      active: isItalic,
      command: () => editorRef.current?.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
    },
    {
      icon: <Strikethrough className="h-3.5 w-3.5" />,
      label: 'Strikethrough',
      active: isStrikethrough,
      command: () => editorRef.current?.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'),
    },
    {
      icon: <Code className="h-3.5 w-3.5" />,
      label: 'Code',
      active: isCode,
      command: () => editorRef.current?.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'),
    },
    {
      icon: <Link className="h-3.5 w-3.5" />,
      label: 'Link',
      active: isLink,
      command: () => {
        const url = prompt('Enter URL:')
        if (url) {
          editorRef.current?.dispatchCommand(TOGGLE_LINK_COMMAND, url)
        }
      },
    },
    null, // divider
    {
      icon: <Heading1 className="h-3.5 w-3.5" />,
      label: 'Heading 1',
      active: isH1,
      command: () => {
        editorRef.current?.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () =>
              isH1 ? $createParagraphNode() : $createHeadingNode('h1'),
            )
          }
        })
      },
    },
    {
      icon: <Heading2 className="h-3.5 w-3.5" />,
      label: 'Heading 2',
      active: isH2,
      command: () => {
        editorRef.current?.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () =>
              isH2 ? $createParagraphNode() : $createHeadingNode('h2'),
            )
          }
        })
      },
    },
    null, // divider
    {
      icon: <List className="h-3.5 w-3.5" />,
      label: 'Bullet list',
      active: isUL,
      command: () => {
        if (isUL) {
          editorRef.current?.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        } else {
          editorRef.current?.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      },
    },
    {
      icon: <ListOrdered className="h-3.5 w-3.5" />,
      label: 'Numbered list',
      active: isOL,
      command: () => {
        if (isOL) {
          editorRef.current?.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        } else {
          editorRef.current?.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      },
    },
    {
      icon: <Quote className="h-3.5 w-3.5" />,
      label: 'Quote',
      active: isQuote,
      command: () => {
        editorRef.current?.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () =>
              isQuote ? $createParagraphNode() : $createQuoteNode(),
            )
          }
        })
      },
    },
  ]

  return (
    <div className={cn('space-y-0', className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <EditorRefPlugin editorRef={editorRef} />
        <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-input bg-muted/40 px-1.5 py-1">
          {toolbarButtons.map((btn, i) => {
            if (btn === null) {
              return <div key={`div-${i}`} className="mx-0.5 h-4 w-px bg-border" />
            }
            return (
              <Button
                key={btn.label}
                variant={btn.active ? 'secondary' : 'ghost'}
                size="icon-xs"
                type="button"
                aria-label={btn.label}
                title={btn.label}
                onClick={btn.command}
              >
                {btn.icon}
              </Button>
            )
          })}
        </div>
        <div className="rounded-b-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                id={id}
                className="min-h-40 px-2.5 py-2 text-sm outline-none"
                aria-placeholder="Write your message…"
                placeholder={
                  <div className="pointer-events-none text-muted-foreground">
                    Write your message…
                  </div>
                }
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin
            onChange={handleChange}
            ignoreSelectionChange
          />
          <HistoryPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <LinkPlugin />
          <ListPlugin />
        </div>
      </LexicalComposer>
    </div>
  )
}
