/**
 * 前后端共享类型定义
 * 避免前后端各自维护导致不一致
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface QuizQuestion {
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
}

export interface QuizResult {
  score: number
  correctCount: number
  total: number
  comment: string
  results: Array<{
    question: string
    userAnswer: number
    correctAnswer: number
    isCorrect: boolean
    explanation: string
  }>
}

export interface ApiConfig {
  baseUrl: string
  apiKey: string
  model: string
}
