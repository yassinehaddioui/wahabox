// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

import HomePage from '@/app/(public)/page'

describe('HomePage', () => {
  describe('Hero section', () => {
    it('renders hero heading', () => {
      render(<HomePage />)
      expect(screen.getByText('Encrypted Virtual PO Box')).toBeInTheDocument()
    })

    it('renders description text', () => {
      render(<HomePage />)
      expect(screen.getByText(/Receive anonymous messages/)).toBeInTheDocument()
    })

    it('renders Create Account link pointing to /signup', () => {
      render(<HomePage />)
      const links = screen.getAllByRole('link', { name: 'Create Account' })
      expect(links.length).toBeGreaterThanOrEqual(1)
      expect(links[0]).toHaveAttribute('href', '/signup')
    })

    it('renders Sign In link pointing to /login', () => {
      render(<HomePage />)
      const link = screen.getByRole('link', { name: 'Sign In' })
      expect(link).toHaveAttribute('href', '/login')
    })
  })

  describe('How It Works', () => {
    it('renders section heading', () => {
      render(<HomePage />)
      expect(screen.getByText('How It Works')).toBeInTheDocument()
    })

    it('renders three steps', () => {
      render(<HomePage />)
      expect(screen.getByText('Create Your PO Box')).toBeInTheDocument()
      expect(screen.getByText('Share Your Link')).toBeInTheDocument()
      expect(screen.getByText('Decrypt & Manage')).toBeInTheDocument()
    })
  })

  describe('Features section', () => {
    it('renders section heading', () => {
      render(<HomePage />)
      expect(screen.getByText('Why Wahabox?')).toBeInTheDocument()
    })

    it('renders six feature cards', () => {
      render(<HomePage />)
      expect(screen.getByText('End-to-End Encryption')).toBeInTheDocument()
      expect(screen.getByText('Zero-Knowledge Architecture')).toBeInTheDocument()
      expect(screen.getByText('Anonymous Submissions')).toBeInTheDocument()
      expect(screen.getByText('Passkeys & Two-Factor Auth')).toBeInTheDocument()
      expect(screen.getByText('Smart Box Management')).toBeInTheDocument()
      expect(screen.getByText('Encrypted Vaults')).toBeInTheDocument()
    })

    it('does not render removed features', () => {
      render(<HomePage />)
      expect(screen.queryByText('Privacy by Design')).not.toBeInTheDocument()
      expect(screen.queryByText('Secure Messages')).not.toBeInTheDocument()
    })
  })

  describe('Social Proof', () => {
    it('renders trust badges', () => {
      render(<HomePage />)
      expect(screen.getByText('Open Source')).toBeInTheDocument()
      expect(screen.getByText('MIT Licensed')).toBeInTheDocument()
      expect(screen.getByText('Self-Hostable')).toBeInTheDocument()
      expect(screen.getByText('X25519 Encrypted')).toBeInTheDocument()
    })
  })

  describe('Comparison section', () => {
    it('renders section heading', () => {
      render(<HomePage />)
      expect(screen.getByText('Why Not Just Use…?')).toBeInTheDocument()
    })

    it('renders competitor columns', () => {
      render(<HomePage />)
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('Messaging Apps')).toBeInTheDocument()
      expect(screen.getByText('Google Forms')).toBeInTheDocument()
    })
  })

  describe('Bottom CTA', () => {
    it('renders call to action', () => {
      render(<HomePage />)
      expect(screen.getByText('Ready to protect your messages?')).toBeInTheDocument()
    })

    it('renders Get Started Free link', () => {
      render(<HomePage />)
      const link = screen.getByRole('link', { name: 'Get Started Free' })
      expect(link).toHaveAttribute('href', '/signup')
    })
  })
})
