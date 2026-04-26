import type { ChatMessage } from '@/types';

export function trimChatMessages(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  let total = 0;
  const trimmed: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    total += messages[i].content.length;
    if (total > maxChars && trimmed.length > 0) break;
    trimmed.unshift(messages[i]);
  }
  return trimmed;
}
