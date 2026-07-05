type ScrollRevealProps = {
  children: React.ReactNode
  as?: 'div' | 'section'
  className?: string
}

export default function ScrollReveal({ children, as: Tag = 'div', className }: ScrollRevealProps) {
  return <Tag className={`animate-on-scroll ${className ?? ''}`}>{children}</Tag>
}
