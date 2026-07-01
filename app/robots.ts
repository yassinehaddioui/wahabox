import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/',
          '/send/',
          '/verify-email/',
        ],
      },
    ],
    sitemap: 'https://wahabox.org/sitemap.xml',
  }
}
