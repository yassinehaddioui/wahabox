import { describe, it, expect } from 'vitest'
import { createVault, createVaultItem } from '@/test/helpers/fixtures'

describe('Vault schema', () => {
  it('createVault returns typed Vault with all fields', () => {
    const vault = createVault()
    expect(vault.id).toBeTypeOf('string')
    expect(vault.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(vault.ownerId).toBeTypeOf('string')
    expect(vault.label).toBe('Test Vault')
    expect(vault.createdAt).toBeInstanceOf(Date)
  })

  it('createVault accepts overrides', () => {
    const customDate = new Date('2026-07-01T00:00:00.000Z')
    const vault = createVault({
      id: '11111111-1111-1111-1111-111111111111',
      label: 'My Secrets',
      ownerId: '22222222-2222-2222-2222-222222222222',
      createdAt: customDate,
    })
    expect(vault.id).toBe('11111111-1111-1111-1111-111111111111')
    expect(vault.label).toBe('My Secrets')
    expect(vault.ownerId).toBe('22222222-2222-2222-2222-222222222222')
    expect(vault.createdAt).toBe(customDate)
  })

  it('createVaultItem returns typed VaultItem with all fields', () => {
    const item = createVaultItem()
    expect(item.id).toBeTypeOf('string')
    expect(item.vaultId).toBeTypeOf('string')
    expect(Buffer.isBuffer(item.ciphertextTitle)).toBe(true)
    expect(Buffer.isBuffer(item.ciphertextBody)).toBe(true)
    expect(item.ciphertextTitle.length).toBe(32)
    expect(item.ciphertextBody.length).toBe(256)
    expect(item.updatedAt).toBeInstanceOf(Date)
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('createVaultItem accepts overrides', () => {
    const customDate = new Date('2026-07-01T00:00:00.000Z')
    const item = createVaultItem({
      id: '33333333-3333-3333-3333-333333333333',
      vaultId: '44444444-4444-4444-4444-444444444444',
      ciphertextTitle: Buffer.alloc(64, 0xcc),
      ciphertextBody: Buffer.alloc(128, 0xdd),
      updatedAt: customDate,
      createdAt: customDate,
    })
    expect(item.id).toBe('33333333-3333-3333-3333-333333333333')
    expect(item.vaultId).toBe('44444444-4444-4444-4444-444444444444')
    expect(item.ciphertextTitle.length).toBe(64)
    expect(item.ciphertextBody.length).toBe(128)
    expect(item.updatedAt).toBe(customDate)
    expect(item.createdAt).toBe(customDate)
  })

  it('each createVault call produces independent objects', () => {
    const a = createVault()
    const b = createVault()
    expect(a).not.toBe(b)
    expect(a.id).toBe(b.id) // same default
  })
})
