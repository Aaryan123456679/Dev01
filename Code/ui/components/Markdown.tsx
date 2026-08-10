'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat min-w-0 break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = (className ?? '').includes('language-')
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-lg border border-gray-700 bg-gray-950 p-3">
                  <code className="font-mono text-xs text-gray-200" {...props}>
                    {children}
                  </code>
                </pre>
              )
            }
            return (
              <code className="rounded bg-gray-800 px-1 py-0.5 font-mono text-xs text-blue-300" {...props}>
                {children}
              </code>
            )
          },
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          ul: ({ children }) => <ul className="my-1.5 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-gray-700 bg-gray-800 px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-gray-700 px-2 py-1">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-gray-600 pl-3 text-gray-400">{children}</blockquote>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
