import { createContext } from 'react'
import type { ChatMessage, ChatSession } from '../types'

export interface ResultContextType {
  analysisResult: string
  setAnalysisResult: (result: string) => void
  planResult: string
  setPlanResult: (result: string) => void
  chatMessages: ChatMessage[]
  setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  chatSessions: ChatSession[]
  activeSessionId: string | null
  createChatSession: () => string
  switchChatSession: (id: string) => void
  deleteChatSession: (id: string) => void
  renameChatSession: (id: string, title: string) => void
  clearResults: () => void
}

export const ResultContext = createContext<ResultContextType | undefined>(undefined)
