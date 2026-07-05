export default function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Background shield shape */}
      <path
        d="M200 30 L330 70 L330 170 C330 255 200 295 200 295 C200 295 70 255 70 170 L70 70 Z"
        fill="currentColor"
        className="text-primary/10"
      />
      {/* Inner shield */}
      <path
        d="M200 55 L305 88 L305 170 C305 237 200 270 200 270 C200 270 95 237 95 170 L95 88 Z"
        fill="currentColor"
        className="text-primary/[0.15]"
      />
      {/* Envelope base */}
      <rect
        x="115"
        y="110"
        width="170"
        height="110"
        rx="8"
        fill="currentColor"
        className="text-card"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Envelope flap */}
      <path
        d="M115 110 L200 170 L285 110"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sealed line across flap */}
      <path
        d="M135 130 L200 172 L265 130"
        stroke="currentColor"
        className="text-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lock body */}
      <rect
        x="185"
        y="155"
        width="30"
        height="24"
        rx="4"
        fill="currentColor"
        className="text-primary"
      />
      {/* Lock shackle */}
      <path
        d="M192 155 L192 145 C192 140 200 138 200 138 C200 138 208 140 208 145 L208 155"
        stroke="currentColor"
        className="text-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lock keyhole */}
      <circle cx="200" cy="167" r="3" fill="currentColor" className="text-card" />
      <line x1="200" y1="170" x2="200" y2="175" stroke="currentColor" className="text-card" strokeWidth="1.5" />
      {/* Decorative dots: encryption / data flow */}
      <circle cx="90" cy="200" r="3" fill="currentColor" className="text-primary/30" />
      <circle cx="310" cy="140" r="3" fill="currentColor" className="text-primary/30" />
      <circle cx="310" cy="200" r="2.5" fill="currentColor" className="text-primary/20" />
      <circle cx="90" cy="140" r="2.5" fill="currentColor" className="text-primary/20" />
      {/* Left bracket */}
      <path
        d="M75 88 L75 100"
        stroke="currentColor"
        className="text-primary/40"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Right bracket */}
      <path
        d="M325 88 L325 100"
        stroke="currentColor"
        className="text-primary/40"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Bottom brackets */}
      <path d="M75 230 L75 242" stroke="currentColor" className="text-primary/40" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M325 230 L325 242"
        stroke="currentColor"
        className="text-primary/40"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Key decorative element bottom-right */}
      <circle cx="310" cy="250" r="4" fill="currentColor" className="text-primary/25" />
      <path
        d="M310 254 L310 265"
        stroke="currentColor"
        className="text-primary/25"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M306 262 L314 262" stroke="currentColor" className="text-primary/25" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
