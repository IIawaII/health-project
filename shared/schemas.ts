import { z } from 'zod'
import { t } from './i18n/server'

export const usernameSchema = z.string().regex(/^[a-zA-Z0-9_]{3,10}$/, t('auth.validation.usernameFormat', '用户名只能包含字母、数字和下划线，长度3-10位'))
export const emailSchema = z.string().email(t('auth.validation.emailInvalid', '请输入有效的邮箱地址'))

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const passwordSchema = z
  .string()
  .min(8, t('auth.validation.passwordMin', '密码长度至少8位'))
  .max(30, t('auth.validation.passwordMax', '密码长度不能超过30位'))
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, t('auth.validation.passwordFormat', '密码必须同时包含字母和数字'))
export const verificationCodeSchema = z.string().regex(/^\d{6}$/, t('auth.validation.codeFormat', '请输入6位数字验证码'))

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: z.string().min(1, t('auth.validation.turnstileRequired', '请完成人机验证')),
  verificationCode: verificationCodeSchema,
})

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, t('auth.validation.usernameOrEmailRequired', '请填写用户名或邮箱')).max(254, t('auth.validation.inputTooLong', '输入过长')),
  password: z.string().min(1, t('auth.validation.passwordRequired', '请填写密码')).max(30, t('auth.validation.passwordMax', '密码长度不能超过30位')),
  turnstileToken: z.string().min(1, t('auth.validation.turnstileRequired', '请完成人机验证')),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, t('auth.validation.currentPasswordRequired', '请填写当前密码')).max(30, t('auth.validation.passwordMax', '密码长度不能超过30位')),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: t('auth.validation.passwordSameAsOld', '新密码不能与当前密码相同'),
    path: ['newPassword'],
  })
