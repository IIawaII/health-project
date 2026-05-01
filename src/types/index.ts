export type {
  ChatMessage,
  QuizQuestion,
  QuizResult,
  ApiConfig,
} from '@shared/types'

import type { ChatMessage } from '@shared/types'

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface PlanFormData {
  name: string
  age: string
  gender: string
  height: string
  weight: string
  goal: string
  dietaryPreference: string
  exerciseHabit: string
  sleepQuality: string
  targetDate: string
  medicalConditions: string
  allergies: string
}
