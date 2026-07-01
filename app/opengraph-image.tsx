import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Wahabox — Encrypted Virtual PO Box'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily: 'Inter',
        }}
      >
        {/* Lock icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 120,
            height: 120,
            borderRadius: 28,
            background: 'rgba(99, 102, 241, 0.15)',
            border: '2px solid rgba(99, 102, 241, 0.3)',
            marginBottom: 32,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#818cf8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            width={56}
            height={56}
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="16" r="1" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          Wahabox
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: 700,
          }}
        >
          Encrypted Virtual PO Box
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            fontSize: 20,
            color: '#475569',
          }}
        >
          Anonymous, zero-knowledge messaging
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
