// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import HomePage from '@/app/(public)/page'

describe('HomePage', () => {
  it('renders hero heading', () => {
    render(<HomePage />)
    expect(screen.getByText('Encrypted Virtual PO Box')).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<HomePage />)
    expect(screen.getByText(/Receive anonymous, encrypted messages/)).toBeInTheDocument()
  })

  it('renders Create Account link pointing to /signup', () => {
    render(<HomePage />)
    const link = screen.getByRole('link', { name: 'Create Account' })
    expect(link).toHaveAttribute('href', '/signup')
  })

  it('renders Sign In link pointing to /login', () => {
    render(<HomePage />)
    const link = screen.getByRole('link', { name: 'Sign In' })
    expect(link).toHaveAttribute('href', '/login')
  })
})
