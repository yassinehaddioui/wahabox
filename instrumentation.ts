let exiting = false

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env')
    validateEnv()

    const { reportError } = await import('@/lib/reporter')

    process.on('unhandledRejection', (reason) => {
      void reportError(reason, { source: 'process' })
    })

    process.on('uncaughtException', (err) => {
      void reportError(err, { source: 'process' })
      if (process.env.NODE_ENV === 'production') {
        if (exiting) return
        exiting = true
        setTimeout(() => process.exit(1), 1000)
      }
    })
  }
}
