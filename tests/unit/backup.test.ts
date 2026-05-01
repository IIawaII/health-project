import { describe, it, expect } from 'vitest'
import { calculateNextRunAt, getBackupTaskList, getAllBackupRecords, getBackupRecordsByTaskId, getBackupTaskById, getBackupRecordById } from '../../server/dao/backup.dao'
import { MockD1 } from '../integration/mocks/mock-d1'

describe('Backup DAO', () => {
  describe('calculateNextRunAt', () => {
    it('should return null for manual frequency', () => {
      expect(calculateNextRunAt('manual')).toBeNull()
    })

    it('should calculate daily next run time', () => {
      const from = 1000000
      const result = calculateNextRunAt('daily', from)
      expect(result).toBe(from + 86400)
    })

    it('should calculate weekly next run time', () => {
      const from = 1000000
      const result = calculateNextRunAt('weekly', from)
      expect(result).toBe(from + 7 * 86400)
    })

    it('should calculate monthly next run time', () => {
      const from = 1000000
      const result = calculateNextRunAt('monthly', from)
      expect(result).toBe(from + 30 * 86400)
    })

    it('should return null for unknown frequency', () => {
      expect(calculateNextRunAt('hourly')).toBeNull()
    })

    it('should use current time when from is not provided', () => {
      const before = Math.floor(Date.now() / 1000)
      const result = calculateNextRunAt('daily')
      const after = Math.floor(Date.now() / 1000)
      expect(result).toBeGreaterThanOrEqual(before + 86400)
      expect(result).toBeLessThanOrEqual(after + 86400)
    })
  })
})

describe('Backup API validation', () => {
  it('should validate create task schema with valid data', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      name: z.string().min(1).max(100),
      scope: z.array(z.enum(['database', 'config'])).min(1),
      frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
      retention_days: z.number().int().min(1).max(365),
    })

    const validData = {
      name: 'Daily DB Backup',
      scope: ['database'],
      frequency: 'daily',
      retention_days: 30,
    }
    expect(schema.safeParse(validData).success).toBe(true)
  })

  it('should reject empty name', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      name: z.string().min(1).max(100),
      scope: z.array(z.enum(['database', 'config'])).min(1),
      frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
      retention_days: z.number().int().min(1).max(365),
    })

    const invalidData = {
      name: '',
      scope: ['database'],
      frequency: 'daily',
      retention_days: 30,
    }
    expect(schema.safeParse(invalidData).success).toBe(false)
  })

  it('should reject empty scope', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      name: z.string().min(1).max(100),
      scope: z.array(z.enum(['database', 'config'])).min(1),
      frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
      retention_days: z.number().int().min(1).max(365),
    })

    const invalidData = {
      name: 'Test',
      scope: [],
      frequency: 'daily',
      retention_days: 30,
    }
    expect(schema.safeParse(invalidData).success).toBe(false)
  })

  it('should reject invalid frequency', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      name: z.string().min(1).max(100),
      scope: z.array(z.enum(['database', 'config'])).min(1),
      frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
      retention_days: z.number().int().min(1).max(365),
    })

    const invalidData = {
      name: 'Test',
      scope: ['database'],
      frequency: 'hourly',
      retention_days: 30,
    }
    expect(schema.safeParse(invalidData).success).toBe(false)
  })

  it('should reject retention days out of range', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      name: z.string().min(1).max(100),
      scope: z.array(z.enum(['database', 'config'])).min(1),
      frequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
      retention_days: z.number().int().min(1).max(365),
    })

    const tooLow = {
      name: 'Test',
      scope: ['database'],
      frequency: 'daily',
      retention_days: 0,
    }
    expect(schema.safeParse(tooLow).success).toBe(false)

    const tooHigh = {
      name: 'Test',
      scope: ['database'],
      frequency: 'daily',
      retention_days: 366,
    }
    expect(schema.safeParse(tooHigh).success).toBe(false)
  })
})

describe('Backup DAO graceful degradation', () => {
  it('getBackupTaskList should return empty array on error', async () => {
    const brokenD1 = {
      prepare: () => { throw new Error('no such table: backup_tasks') },
    } as unknown as D1Database
    const result = await getBackupTaskList(brokenD1)
    expect(result).toEqual([])
  })

  it('getAllBackupRecords should return empty array on error', async () => {
    const brokenD1 = {
      prepare: () => { throw new Error('no such table: backup_records') },
    } as unknown as D1Database
    const result = await getAllBackupRecords(brokenD1)
    expect(result).toEqual([])
  })

  it('getBackupRecordsByTaskId should return empty array on error', async () => {
    const brokenD1 = {
      prepare: () => { throw new Error('no such table: backup_records') },
    } as unknown as D1Database
    const result = await getBackupRecordsByTaskId(brokenD1, 'task-1')
    expect(result).toEqual([])
  })

  it('getBackupTaskById should return undefined on error', async () => {
    const brokenD1 = {
      prepare: () => { throw new Error('no such table: backup_tasks') },
    } as unknown as D1Database
    const result = await getBackupTaskById(brokenD1, 'task-1')
    expect(result).toBeUndefined()
  })

  it('getBackupRecordById should return undefined on error', async () => {
    const brokenD1 = {
      prepare: () => { throw new Error('no such table: backup_records') },
    } as unknown as D1Database
    const result = await getBackupRecordById(brokenD1, 'record-1')
    expect(result).toBeUndefined()
  })

  it('getBackupTaskList should return data with valid D1', async () => {
    const db = new MockD1()
    const now = Math.floor(Date.now() / 1000)
    db.getTable('backup_tasks').set('task-1', {
      id: 'task-1',
      name: 'Daily Backup',
      scope: '["database"]',
      frequency: 'daily',
      retention_days: 30,
      is_paused: 0,
      last_run_at: null,
      next_run_at: now + 86400,
      created_at: now,
      updated_at: now,
    })
    const result = await getBackupTaskList(db)
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('Daily Backup')
  })

  it('getAllBackupRecords should return data with valid D1', async () => {
    const db = new MockD1()
    const now = Math.floor(Date.now() / 1000)
    db.getTable('backup_records').set('record-1', {
      id: 'record-1',
      task_id: 'task-1',
      status: 'completed',
      scope: '["database"]',
      size_bytes: 1024,
      started_at: now - 100,
      completed_at: now,
      error_message: null,
      created_at: now,
    })
    const result = await getAllBackupRecords(db)
    expect(result.length).toBe(1)
    expect(result[0].status).toBe('completed')
  })
})
