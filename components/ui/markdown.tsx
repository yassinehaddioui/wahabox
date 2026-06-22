import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  children: string
  className?: string
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm text-foreground break-words space-y-2',
        '[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight',
        '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight',
        '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:tracking-tight',
        '[&_p]:leading-relaxed',
        '[&_a]:text-link [&_a]:underline [&_a]:underline-offset-2',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:font-mono',
        '[&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:p-3 [&_pre]:overflow-x-auto',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_pre_code]:text-[13px]',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        '[&_ul]:list-disc [&_ul]:pl-6',
        '[&_ol]:list-decimal [&_ol]:pl-6',
        '[&_li]:mt-1',
        '[&_hr]:border-border',
        '[&_table]:border-collapse [&_table]:w-full [&_table]:text-sm',
        '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-mono [&_th]:font-medium',
        '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
        '[&_img]:rounded-lg [&_img]:max-w-full',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
