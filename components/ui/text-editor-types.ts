export interface TextEditorProps {
  id?: string
  value: string
  onChange: (markdown: string) => void
  maxLength?: number
  className?: string
}
