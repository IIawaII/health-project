import { useCallback, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAIStream } from '../../hooks/useAI'
import { useResult } from '@/hooks/useResult'
import ChatInterface from '../../components/chat/ChatInterface'
import { createChatMessage } from '../../../shared/types'

export interface ChatSkill {
  id: string
  name: string
  description: string
  systemPrompt: string
}

const DEFAULT_SKILLS: ChatSkill[] = [
  {
    id: 'health-advisor',
    name: '健康顾问',
    description: '全面的健康咨询和建议',
    systemPrompt: '你是一位专业的健康顾问，能够回答各种健康问题，提供科学的健康建议。请注意，你的建议仅供参考，不能替代专业医生的诊断。',
  },
  {
    id: 'nutritionist',
    name: '营养师',
    description: '专注于饮食和营养方面的咨询',
    systemPrompt: '你是一位资深营养师，擅长饮食搭配、营养补充、减肥增肌等方面的指导。请根据用户的具体情况提供个性化的饮食建议。',
  },
  {
    id: 'fitness-coach',
    name: '运动教练',
    description: '运动训练和健身计划指导',
    systemPrompt: '你是一位专业的运动教练，擅长制定训练计划、指导运动技巧、预防运动损伤。请根据用户的身体状况和目标提供合适的运动建议。',
  },
]

function loadSkills(userId: string): ChatSkill[] {
  try {
    const raw = localStorage.getItem(`health_chat_skills_${userId}`)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return DEFAULT_SKILLS
}

function saveSkills(userId: string, skills: ChatSkill[]) {
  try {
    localStorage.setItem(`health_chat_skills_${userId}`, JSON.stringify(skills))
  } catch {
    // ignore
  }
}

export default function SmartChat() {
  const { user } = useAuth()
  const userId = user?.id || 'anonymous'
  const {
    chatMessages,
    setChatMessages,
    chatSessions,
    activeSessionId,
    createChatSession,
    switchChatSession,
    deleteChatSession,
    renameChatSession,
  } = useResult()

  const [skills, setSkills] = useState<ChatSkill[]>(() => loadSkills(userId))
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const hasCreatedRef = useRef(false)

  useEffect(() => {
    saveSkills(userId, skills)
  }, [skills, userId])

  // 如果没有活跃会话，自动创建一个
  useEffect(() => {
    if (!activeSessionId && chatSessions.length === 0 && !hasCreatedRef.current) {
      hasCreatedRef.current = true
      createChatSession()
    }
  }, [activeSessionId, chatSessions.length, createChatSession])

  const handleChunk = useCallback((chunk: string) => {
    setChatMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
      }
      return [...prev, createChatMessage('assistant', chunk)]
    })
  }, [setChatMessages])

  const { loading, error, execute } = useAIStream({
    endpoint: '/api/chat',
    onChunk: handleChunk,
    onDone: () => {},
  })

  const handleSend = useCallback(
    (content: string) => {
      // 确保有活跃会话，如果没有则自动创建
      let currentSessionId = activeSessionId
      if (!currentSessionId) {
        currentSessionId = createChatSession()
      }

      const activeSkill = skills.find((s) => s.id === activeSkillId)
      const userMessage = createChatMessage('user', content)
      const sessionMessages = [...chatMessages, userMessage]

      // 构建发送给API的消息：包含system prompt但不保存到session
      let apiMessages = [...sessionMessages]
      if (activeSkill) {
        apiMessages = [
          createChatMessage('system', activeSkill.systemPrompt),
          ...apiMessages,
        ]
      }

      setChatMessages(sessionMessages)
      execute({ messages: apiMessages })
    },
    [chatMessages, execute, setChatMessages, activeSkillId, skills, activeSessionId, createChatSession]
  )

  const handleClear = () => {
    setChatMessages([])
  }

  const handleUpdateSkill = (updated: ChatSkill) => {
    setSkills((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  // 新建对话：如果已有空会话则跳转，否则创建新会话
  const handleCreateSession = useCallback(() => {
    const emptySession = chatSessions.find((s) => s.messages.length === 0)
    if (emptySession) {
      switchChatSession(emptySession.id)
    } else {
      createChatSession()
    }
  }, [chatSessions, createChatSession, switchChatSession])

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <ChatInterface
        messages={chatMessages}
        onSend={handleSend}
        loading={loading}
        error={error}
        onClear={handleClear}
        sessions={chatSessions}
        activeSessionId={activeSessionId}
        onCreateSession={handleCreateSession}
        onSwitchSession={switchChatSession}
        onDeleteSession={deleteChatSession}
        onRenameSession={renameChatSession}
        skills={skills}
        activeSkillId={activeSkillId}
        onSelectSkill={setActiveSkillId}
        onUpdateSkill={handleUpdateSkill}
      />
    </div>
  )
}
