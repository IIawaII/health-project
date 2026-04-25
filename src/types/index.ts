export type {
  ChatMessage,
  QuizQuestion,
  QuizResult,
  ApiConfig,
} from '../../shared/types'

export interface HealthPlanFormData {
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
