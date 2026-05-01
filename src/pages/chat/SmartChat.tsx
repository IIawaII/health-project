import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { useAIStream } from '../../hooks/useAIStream'
import { useResult } from '@/hooks/useResult'
import ChatInterface from '../../components/chat/ChatInterface'
import { createChatMessage } from '../../../shared/types'

export interface ChatSkill {
  id: string
  name: string
  description: string
  systemPrompt: string
}

// 加载/保存用户自定义的 systemPrompt 覆盖（不保存 name/description，确保它们始终跟随当前语言翻译）
function loadUserSkillPrompts(userId: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(`health_chat_skill_prompts_${userId}`)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveUserSkillPrompts(userId: string, prompts: Record<string, string>) {
  try {
    localStorage.setItem(`health_chat_skill_prompts_${userId}`, JSON.stringify(prompts))
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

  // 用户自定义的 systemPrompt 覆盖
  const [userSkillPrompts, setUserSkillPrompts] = useState<Record<string, string> | null>(() =>
    loadUserSkillPrompts(userId)
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

  // 当前实际使用的技能列表：name/description/systemPrompt 默认跟随当前语言翻译，
  // 仅当用户自定义了 systemPrompt 时才用 localStorage 中的值覆盖
  const skills = useMemo(() => {
    return defaultSkills.map((defaultSkill) => {
      const userPrompt = userSkillPrompts?.[defaultSkill.id]
      if (userPrompt) {
        return {
          ...defaultSkill,
          systemPrompt: userPrompt,
        }
      }
      return defaultSkill
    })
  }, [userSkillPrompts, defaultSkills])

  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const hasCreatedRef = useRef(false)

  // 当用户自定义 systemPrompt 改变时同步到 localStorage
  useEffect(() => {
    if (userSkillPrompts) {
      saveUserSkillPrompts(userId, userSkillPrompts)
    }
  }, [userSkillPrompts, userId])

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
    setUserSkillPrompts((prev) => ({
      ...prev,
      [updated.id]: updated.systemPrompt,
    }))
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
