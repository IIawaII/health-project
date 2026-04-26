import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground dark:prose-headings:text-foreground-dark prose-p:text-foreground-muted dark:prose-p:text-foreground-dark-muted prose-strong:text-foreground dark:prose-strong:text-foreground-dark prose-li:text-foreground-muted dark:prose-li:text-foreground-dark-muted prose-table:text-foreground-muted dark:prose-table:text-foreground-dark-muted prose-th:text-foreground dark:prose-th:text-foreground-dark prose-code:text-foreground dark:prose-code:text-foreground-dark prose-pre:bg-gray-50 dark:prose-pre:bg-slate-700/50 ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
