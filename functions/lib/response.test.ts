import { describe, it, expect } from 'vitest'
import { parseLLMResult, jsonResponse, errorResponse } from './response'

describe('response', () => {
  it('should parse LLM result correctly', () => {
    const data = {
      choices: [{ message: { content: 'hello' } }],
    }
    expect(parseLLMResult(data)).toBe('hello')
  })

  it('should return empty string for invalid LLM data', () => {
    expect(parseLLMResult(null)).toBe('')
    expect(parseLLMResult({})).toBe('')
    expect(parseLLMResult({ choices: [] })).toBe('')
    expect(parseLLMResult({ choices: [{}] })).toBe('')
  })

  it('errorResponse should include extra headers', () => {
    const res = errorResponse('too many', 429, { 'Retry-After': '60' })
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.status).toBe(429)
  })

  it('jsonResponse should return JSON body', async () => {
    const res = jsonResponse({ ok: true }, 200)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })
})
