-- 用户 AI 配置表（加密存储）
-- 将用户自定义的 AI API 配置加密后存储在服务端 D1 数据库中
-- 前端仅持有会话级解密密钥，提升安全性

CREATE TABLE IF NOT EXISTS user_ai_configs (
  user_id TEXT NOT NULL PRIMARY KEY,
  encrypted_config TEXT NOT NULL,
  config_iv TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_ai_configs_user_id ON user_ai_configs(user_id);
