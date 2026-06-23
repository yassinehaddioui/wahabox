// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SessionProvider, useSession } from '@/lib/session-provider'

describe('SessionProvider', () => {
  it('renders children', () => {
    render(
      // eslint-disable-next-line react/no-children-prop
      React.createElement(SessionProvider, {
        value: null,
        children: React.createElement('div', { 'data-testid': 'child' }, 'hello'),
      }),
    )
    expect(screen.getByTestId('child')).toHaveTextContent('hello')
  })

  it('provides session through useSession', () => {
    function Consumer() {
      const session = useSession()
      return React.createElement('div', { 'data-testid': 'session' }, session?.username ?? 'none')
    }
    render(
      // eslint-disable-next-line react/no-children-prop
      React.createElement(SessionProvider, {
        value: { username: 'alice' },
        children: React.createElement(Consumer),
      }),
    )
    expect(screen.getByTestId('session')).toHaveTextContent('alice')
  })

  it('returns null when used outside provider', () => {
    function Consumer() {
      const session = useSession()
      return React.createElement(
        'div',
        { 'data-testid': 'session' },
        session === null ? 'null' : session.username,
      )
    }
    render(React.createElement(Consumer))
    expect(screen.getByTestId('session')).toHaveTextContent('null')
  })
})
