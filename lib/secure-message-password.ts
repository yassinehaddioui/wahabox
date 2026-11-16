const SAFE_BCRYPT_HASH = /^\$2[aby]\$(?:0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/

/** Accept only complete bcrypt hashes whose work factor is bounded. */
export function isSafeMessagePasswordHash(hash: string): boolean {
  return SAFE_BCRYPT_HASH.test(hash)
}
