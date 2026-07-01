/**
 * Test fixture factories matching Prisma select shapes used across API routes.
 *
 * All Buffers use Buffer.alloc with fixed fill bytes — no real crypto.
 * All dates are fixed for deterministic test output.
 */

// --- Types ---------------------------------------------------------------

export type FixtureUser = {
  id: string
  username: string
  authVerifier: Buffer
  authSalt: Buffer
  publicKey: Buffer
  encPrivPw: Buffer
  pwKdfSalt: Buffer
  pwNonce: Buffer
  encPrivRec: Buffer
  recKdfSalt: Buffer
  recNonce: Buffer
  publicKeySign: Buffer | null
  encPrivSignPw: Buffer | null
  signNoncePw: Buffer | null
  keyVersion: number
  tokenVersion: number
  emailEncrypted: Buffer | null
  emailNonce: Buffer | null
  emailKeyVersion: number | null
  emailVerified: boolean
  notificationsEnabled: boolean
  mfaEmail: boolean
  mfaTotp: boolean
  mfaPasskey: boolean
  totpSecret: Buffer | null
  totpCreatedAt: Date | null
  mfaRecoveryCodes: Buffer | null
  mfaRecoveryCodesCreatedAt: Date | null
  recoveryCodeCreatedAt: Date | null
  createdAt: Date
}

export type FixturePoBox = {
  id: string
  ownerId: string
  slug: string
  label: string
  greeting: string | null
  isActive: boolean
  expiresAt: Date | null
  maxMessages: number | null
  notify: boolean
  passwordHash: string | null
  createdAt: Date
  owner: { publicKey: Buffer }
  _count: { messages: number }
}

export type FixtureMessage = {
  id: string
  poBoxId: string
  ciphertext: Buffer
  readAt: Date | null
  createdAt: Date
}

export type FixtureVault = {
  id: string
  ownerId: string
  label: string
  createdAt: Date
}

export type FixtureVaultItem = {
  id: string
  vaultId: string
  ciphertextTitle: Buffer
  ciphertextBody: Buffer
  updatedAt: Date
  createdAt: Date
}

export type FixturePasskeyCredential = {
  id: string
  userId: string
  credentialId: Buffer
  publicKey: Buffer
  counter: number
  transports: string | null
  deviceName: string | null
  createdAt: Date
  lastUsedAt: Date | null
}

// --- Fixed defaults ------------------------------------------------------

const FIXED_DATE = new Date('2025-01-01T00:00:00.000Z')
const USER_ID = '00000000-0000-0000-0000-000000000001'
const BOX_ID = '00000000-0000-0000-0000-000000000002'
const MESSAGE_ID = '00000000-0000-0000-0000-000000000003'
const PASSKEY_ID = '00000000-0000-0000-0000-000000000004'
const VAULT_ID = '00000000-0000-0000-0000-000000000005'
const VAULT_ITEM_ID = '00000000-0000-0000-0000-000000000006'

// --- Factories -----------------------------------------------------------

export function createUser(overrides: Partial<FixtureUser> = {}): FixtureUser {
  return {
    id: USER_ID,
    username: 'testuser',
    authVerifier: Buffer.alloc(32, 0xaa),
    authSalt: Buffer.alloc(16, 0xbb),
    publicKey: Buffer.alloc(32, 0xcc),
    encPrivPw: Buffer.alloc(48, 0x11),
    pwKdfSalt: Buffer.alloc(16, 0x22),
    pwNonce: Buffer.alloc(24, 0x33),
    encPrivRec: Buffer.alloc(48, 0x44),
    recKdfSalt: Buffer.alloc(16, 0x55),
    recNonce: Buffer.alloc(24, 0x66),
    publicKeySign: Buffer.alloc(32, 0x77),
    encPrivSignPw: Buffer.alloc(48, 0x88),
    signNoncePw: Buffer.alloc(24, 0x99),
    keyVersion: 1,
    tokenVersion: 0,
    emailEncrypted: null,
    emailNonce: null,
    emailKeyVersion: null,
    emailVerified: false,
    notificationsEnabled: true,
    mfaEmail: false,
    mfaTotp: false,
    mfaPasskey: false,
    totpSecret: null,
    totpCreatedAt: null,
    mfaRecoveryCodes: null,
    mfaRecoveryCodesCreatedAt: null,
    recoveryCodeCreatedAt: null,
    createdAt: FIXED_DATE,
    ...overrides,
  }
}

export function createPoBox(overrides: Partial<FixturePoBox> = {}): FixturePoBox {
  return {
    id: BOX_ID,
    ownerId: USER_ID,
    slug: 'test-slug',
    label: 'Test Box',
    greeting: null,
    isActive: true,
    expiresAt: null,
    maxMessages: null,
    notify: true,
    passwordHash: null,
    createdAt: FIXED_DATE,
    owner: { publicKey: Buffer.alloc(32, 0xcc) },
    _count: { messages: 0 },
    ...overrides,
  }
}

export function createVault(overrides: Partial<FixtureVault> = {}): FixtureVault {
  return {
    id: VAULT_ID,
    ownerId: USER_ID,
    label: 'Test Vault',
    createdAt: FIXED_DATE,
    ...overrides,
  }
}

export function createVaultItem(overrides: Partial<FixtureVaultItem> = {}): FixtureVaultItem {
  return {
    id: VAULT_ITEM_ID,
    vaultId: VAULT_ID,
    ciphertextTitle: Buffer.alloc(32, 0xaa),
    ciphertextBody: Buffer.alloc(256, 0xbb),
    updatedAt: FIXED_DATE,
    createdAt: FIXED_DATE,
    ...overrides,
  }
}

export function createMessage(overrides: Partial<FixtureMessage> = {}): FixtureMessage {
  return {
    id: MESSAGE_ID,
    poBoxId: BOX_ID,
    ciphertext: Buffer.alloc(64, 0x77),
    readAt: null,
    createdAt: FIXED_DATE,
    ...overrides,
  }
}

export function createPasskeyCredential(
  overrides: Partial<FixturePasskeyCredential> = {},
): FixturePasskeyCredential {
  return {
    id: PASSKEY_ID,
    userId: USER_ID,
    credentialId: Buffer.alloc(32, 0xdd),
    publicKey: Buffer.alloc(32, 0xee),
    counter: 0,
    transports: null,
    deviceName: 'Test Device',
    createdAt: FIXED_DATE,
    lastUsedAt: null,
    ...overrides,
  }
}
