import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  FiSend, FiLoader, FiAlertCircle, FiHelpCircle, FiTrash2, FiX,
  FiMessageSquare, FiRotateCcw, FiInfo, FiPlus, FiChevronDown, FiZap,
  FiEdit2, FiCheck
} from 'react-icons/fi'
import { useAuth } from '@/contexts/AuthContext'
import { getAvatarDisplayUrl } from '@/utils/avatar'
import type { ChatMessage } from '@/types'
import type { ChatSkill } from '@/pages/chat/SmartChat'
import type { ChatSession } from '@/types'
import MarkdownRenderer from './MarkdownRenderer'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  loading: boolean
  error: string | null
  onClear?: () => void
  sessions: ChatSession[]
  activeSessionId: string | null
  onCreateSession: () => void
  onSwitchSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession?: (id: string, title: string) => void
  skills: ChatSkill[]
  activeSkillId: string | null
  onSelectSkill: (id: string | null) => void
  onUpdateSkill: (skill: ChatSkill) => void
}

export default function ChatInterface({
  messages,
  onSend,
  loading,
  error,
  onClear,
  sessions,
  activeSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
  skills,
  activeSkillId,
  onSelectSkill,
}: ChatInterfaceProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [input, setInput] = useState('')

  const [showHelp, setShowHelp] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = () => {
    if (!input.trim() || loading) return
    onSend(input.trim())
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 160)}px`
  }

  const handleClear = () => {
    setShowConfirm(true)
  }

  const confirmClear = () => {
    setShowConfirm(false)
    onClear?.()
  }

  const startRename = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditTitle(session.title)
  }

  const confirmRename = () => {
    if (editingSessionId && editTitle.trim()) {
      onRenameSession?.(editingSessionId, editTitle.trim())
    }
    setEditingSessionId(null)
    setEditTitle('')
  }

  const activeSkill = skills.find((s) => s.id === activeSkillId)

  const helpItems = [
    { icon: FiSend, text: t('chat.help.send') },
    { icon: FiMessageSquare, text: t('chat.help.context') },
    { icon: FiRotateCcw, text: t('chat.help.clear') },
    { icon: FiInfo, text: t('chat.help.disclaimer') },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[800px] bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-card dark:shadow-card-dark overflow-hidden relative transition-colors">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-700/50">
        <div className="flex items-center gap-2">
          {/* History Dropdown */}
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
            >
              <FiMessageSquare className="w-3.5 h-3.5" />
              <span>{t('chat.history')}</span>
              <FiChevronDown className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>
            {showHistory && (
              <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-1 z-50 animate-fade-in">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-xs font-medium text-foreground-muted dark:text-foreground-dark-muted">{t('chat.history')}</span>
                  <button
                    onClick={() => { onCreateSession(); setShowHistory(false) }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <FiPlus className="w-3 h-3" />
                    {t('chat.newChat')}
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {sessions.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-foreground-subtle dark:text-foreground-dark-subtle">
                      {t('chat.noHistory')}
                    </div>
                  )}
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                        activeSessionId === session.id
                          ? 'bg-primary-50 dark:bg-primary-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {editingSessionId === session.id ? (
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmRename() }}
                            className="flex-1 px-2 py-1 rounded text-xs border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-foreground dark:text-foreground-dark outline-none"
                            autoFocus
                          />
                          <button onClick={confirmRename} className="p-1 rounded text-success hover:bg-success/10">
                            <FiCheck className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => { onSwitchSession(session.id); setShowHistory(false) }}
                            className="flex-1 text-left text-xs text-foreground dark:text-foreground-dark truncate"
                          >
                            {session.title}
                          </button>
                          <button
                            onClick={() => startRename(session)}
                            className="p-1 rounded text-foreground-subtle dark:text-foreground-dark-subtle hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-600"
                          >
                            <FiEdit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => onDeleteSession(session.id)}
                            className="p-1 rounded text-foreground-subtle dark:text-foreground-dark-subtle hover:text-danger hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <FiTrash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* New Chat */}
          <button
            onClick={onCreateSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-foreground dark:hover:text-foreground-dark hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
          >
            <FiPlus className="w-3.5 h-3.5" />
            {t('chat.newChat')}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Active Skill Badge */}
          {activeSkill && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary border border-primary/20">
              <FiZap className="w-3 h-3" />
              {activeSkill.name}
            </span>
          )}
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={() => setShowHelp(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-modal-pop border border-gray-100 dark:border-slate-700 transition-colors">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-primary-50 to-white dark:from-slate-800 dark:to-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm">
                  <FiHelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground dark:text-foreground-dark leading-tight">{t('chat.help.title')}</h2>
                  <p className="text-xs text-foreground-subtle dark:text-foreground-dark-subtle mt-0.5">{t('chat.help.subtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 rounded-xl text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-foreground-dark transition-all"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {helpItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-background-secondary dark:bg-slate-700/50 border border-gray-50 dark:border-slate-700 hover:border-primary/20 hover:bg-primary-50/30 dark:hover:bg-primary-900/20 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 text-primary flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                    <item.icon className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-700 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.97] transition-all"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Skills Modal */}
      {showSkills && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={() => setShowSkills(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-modal-pop border border-gray-100 dark:border-slate-700 transition-colors flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-primary-50 to-white dark:from-slate-800 dark:to-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm">
                  <FiZap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground dark:text-foreground-dark leading-tight">{t('chat.skills')}</h2>
                  <p className="text-xs text-foreground-subtle dark:text-foreground-dark-subtle mt-0.5">{t('chat.skillsSubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowSkills(false)}
                className="p-2 rounded-xl text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-foreground-dark transition-all"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {skills.map((skill) => {
                const isActive = activeSkillId === skill.id
                return (
                  <div key={skill.id} className={`rounded-xl border p-4 transition-colors ${isActive ? 'border-primary/30 bg-primary-50/30 dark:bg-primary-900/10' : 'border-gray-100 dark:border-slate-700'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground dark:text-foreground-dark">{skill.name}</h3>
                        <p className="text-xs text-foreground-subtle dark:text-foreground-dark-subtle mt-0.5">{skill.description}</p>
                      </div>
                      <button
                        onClick={() => onSelectSkill(isActive ? null : skill.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-primary text-white hover:bg-primary-700'
                            : 'bg-gray-100 dark:bg-slate-700 text-foreground-muted dark:text-foreground-dark-muted hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {isActive ? t('chat.skillEnabled') : t('chat.skillEnable')}
                      </button>
                    </div>
                    <div className="mt-3">
                      <label className="text-xs font-medium text-foreground-subtle dark:text-foreground-dark-subtle">{t('chat.systemPrompt')}</label>
                      <div className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-sm text-foreground dark:text-foreground-dark leading-relaxed whitespace-pre-wrap">
                        {skill.systemPrompt}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Clear Modal */}
      {showConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-modal-pop border border-gray-100 dark:border-slate-700 transition-colors">
            <div className="pt-8 pb-4 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 text-danger flex items-center justify-center mx-auto mb-4 shadow-sm border border-red-100 dark:border-red-800">
                <FiTrash2 className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-semibold text-foreground dark:text-foreground-dark">{t('chat.clearConfirm.title')}</h2>
            </div>
            <div className="px-6 pb-2 text-center">
              <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted leading-relaxed">
                {t('chat.clearConfirm.desc')}
              </p>
            </div>
            <div className="px-6 py-6 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted dark:text-foreground-dark-muted bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 active:scale-[0.97] transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmClear}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-danger hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/20 active:scale-[0.97] transition-all"
              >
                {t('chat.clearConfirm.confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-4 overflow-hidden">
              <img src="/Doctor.svg" alt="AI" className="w-full h-full" />
            </div>
            <h3 className="text-base font-semibold text-foreground dark:text-foreground-dark mb-2">{t('chat.welcomeTitle')}</h3>
            <p className="text-sm text-foreground-muted dark:text-foreground-dark-muted max-w-sm">
              {t('chat.welcomeDesc')}
            </p>
            {activeSkill && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary text-xs font-medium border border-primary/20">
                <FiZap className="w-3 h-3" />
                {t('chat.activeSkill')}：{activeSkill.name}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg.id ?? idx}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                msg.role === 'user'
                  ? 'bg-gray-100 dark:bg-slate-700'
                  : 'bg-gray-100 dark:bg-slate-700 text-foreground-muted dark:text-foreground-dark-muted'
              }`}
            >
              {msg.role === 'user' ? (
                <img
                  src={getAvatarDisplayUrl(user?.avatar || localStorage.getItem('user_avatar') || undefined)}
                  alt="avatar"
                  className="w-full h-full"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.onerror = null;
                    target.src = '/User/default.svg';
                  }}
                />
              ) : (
                <img
                  src="/Doctor.svg"
                  alt="AI"
                  className="w-full h-full"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.onerror = null;
                    target.style.display = 'none';
                  }}
                />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-tr-sm'
                  : 'bg-gray-50 dark:bg-slate-700/50 text-foreground dark:text-foreground-dark rounded-tl-sm border border-gray-100 dark:border-slate-700 prose prose-sm !max-w-[80%] dark:prose-invert'
              }`}
            >
              {msg.role === 'user' ? (
                msg.content.split('\n').map((line, i) => (
                  <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
                    {line}
                  </p>
                ))
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {loading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/Doctor.svg" alt="AI" className="w-full h-full" />
            </div>
            <div className="bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" />
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 text-danger text-sm mx-4">
            <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 dark:border-slate-700 p-4 bg-white dark:bg-slate-800 transition-colors">
        {/* Action Toolbar */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSkills(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
              title={t('chat.skills')}
            >
              <FiZap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('chat.skills')}</span>
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
              title={t('chat.help.title')}
            >
              <FiHelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('chat.help.title')}</span>
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-foreground-muted dark:text-foreground-dark-muted hover:text-red-600 hover:bg-red-50 transition-all"
              title={t('chat.clear')}
            >
              <FiTrash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('chat.clear')}</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {/* 右侧留白，可扩展其他操作 */}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={t('chat.placeholder')}
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-background dark:bg-slate-700 text-sm text-foreground dark:text-foreground-dark placeholder:text-foreground-subtle dark:placeholder:text-foreground-dark-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none min-h-[44px] max-h-[160px] transition-all scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
              !input.trim() || loading
                ? 'bg-gray-100 dark:bg-slate-700 text-gray-300 dark:text-slate-500 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary-700 shadow-md active:scale-95'
            }`}
          >
            {loading ? <FiLoader className="w-5 h-5 animate-spin" /> : <FiSend className="w-5 h-5" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-center text-foreground-subtle dark:text-foreground-dark-subtle">
          {t('chat.disclaimer')}
        </p>
      </div>
    </div>
  )
}
