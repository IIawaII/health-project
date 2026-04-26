import { Hono } from 'hono'
import * as authRegister from './auth/register'
import * as authLogin from './auth/login'
import * as authLogout from './auth/logout'
import * as authVerify from './auth/verify'
import * as authChangePassword from './auth/change_password'
import * as authUpdateProfile from './auth/update_profile'
import * as authCheck from './auth/check'
import * as authSendVerificationCode from './auth/send_verification_code'
import * as authRefresh from './auth/refresh'
import * as chatHandler from './ai/chat'
import * as analyzeHandler from './ai/analyze'
import * as planHandler from './ai/plan'
import * as quizHandler from './ai/quiz'
import * as adminStats from './admin/stats'
import * as adminUsers from './admin/users'
import * as adminLogs from './admin/logs'
import * as adminAudit from './admin/audit'
import * as adminConfig from './admin/config'
import type { Env } from '../utils/env'

type AppEnv = { Bindings: Env }

const api = new Hono<AppEnv>()

// Auth routes
api.post('/auth/register', authRegister.onRequestPost)
api.post('/auth/login', authLogin.onRequestPost)
api.post('/auth/logout', authLogout.onRequestPost)
api.get('/auth/verify', authVerify.onRequestGet)
api.post('/auth/change_password', authChangePassword.onRequestPost)
api.post('/auth/update_profile', authUpdateProfile.onRequestPost)
api.post('/auth/check', authCheck.onRequestPost)
api.post('/auth/send_verification_code', authSendVerificationCode.onRequestPost)
api.post('/auth/refresh', authRefresh.onRequestPost)

// AI feature routes
api.post('/chat', chatHandler.onRequestPost)
api.post('/analyze', analyzeHandler.onRequestPost)
api.post('/plan', planHandler.onRequestPost)
api.post('/quiz', quizHandler.onRequestPost)

// Admin routes
api.get('/admin/stats', adminStats.onRequestGet)
api.get('/admin/users', adminUsers.onRequestGet)
api.patch('/admin/users/:id', adminUsers.onRequestPatch)
api.delete('/admin/users/:id', adminUsers.onRequestDelete)
api.get('/admin/logs', adminLogs.onRequestGet)
api.get('/admin/audit', adminAudit.onRequestGet)
api.get('/admin/config', adminConfig.onRequestGet)
api.put('/admin/config', adminConfig.onRequestPut)

// Health check
api.get('/health', (context) => {
  return context.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export { api }
