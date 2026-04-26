import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from 'react-i18next'
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

// 加载/保存用户自定义技能
function loadUserSkills(userId: string): ChatSkill[] | null {
  try {
    const raw = localStorage.getItem(`health_chat_skills_${userId}`)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveUserSkills(userId: string, skills: ChatSkill[]) {
  try {
    localStorage.setItem(`health_chat_skills_${userId}`, JSON.stringify(skills))
  } catch { /* ignore */ }
}

export default function SmartChat() {
  const { t } = useTranslation()
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

  // 用户自定义技能
  const [userSkills, setUserSkills] = useState<ChatSkill[] | null>(() =>
    loadUserSkills(userId)
  )

  // 根据当前语言动态生成默认技能
  const defaultSkills: ChatSkill[] = useMemo(() => [
    {
      id: 'health-advisor',
      name: t('chat.skillsList.health-advisor.name'),
      description: t('chat.skillsList.health-advisor.description'),
      systemPrompt: t('chat.skillsList.health-advisor.systemPrompt'),
    },
    {
      id: 'nutritionist',
      name: t('chat.skillsList.nutritionist.name'),
      description: t('chat.skillsList.nutritionist.description'),
      systemPrompt: t('chat.skillsList.nutritionist.systemPrompt'),
    },
    {
      id: 'fitness-coach',
      name: t('chat.skillsList.fitness-coach.name'),
      description: t('chat.skillsList.fitness-coach.description'),
      systemPrompt: t('chat.skillsList.fitness-coach.systemPrompt'),
    },
  ], [t])

  // 当前实际使用的技能列表：用户自定义优先，否则用默认
  const skills = userSkills && userSkills.length > 0 ? userSkills : defaultSkills

  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const hasCreatedRef = useRef(false)

  // 当用户自定义技能改变时同步到 localStorage
  useEffect(() => {
    if (userSkills) {
      saveUserSkills(userId, userSkills)
    }
  }, [userSkills, userId])

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
    setUserSkills((prev) => {
      // 若用户尚未自定义过技能，基线采用当前默认技能
      const base = prev && prev.length > 0 ? prev : defaultSkills
      return base.map((s) => (s.id === updated.id ? updated : s))
    })
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
