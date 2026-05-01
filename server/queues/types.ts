export interface EmailQueueMessage {
  type: 'send_email'
  payload: {
    to: string
    subject: string
    html: string
  }
}

export type QueueMessage = EmailQueueMessage
