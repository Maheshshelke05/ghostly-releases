import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface SolutionCardProps {
  content: string;
  isStreaming?: boolean;
}

export const SolutionCard: React.FC<SolutionCardProps> = ({
  content,
  isStreaming,
}) => {
  const [copiedBlock, setCopiedBlock] = React.useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlock(id);
      setTimeout(() => setCopiedBlock(null), 2000);
    } catch {
      /* clipboard access may be denied */
    }
  };

  const components = useMemo(
    () => ({
      code({
        className,
        children,
        ...props
      }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
        const match = /language-(\w+)/.exec(className || "");
        const codeString = String(children).replace(/\n$/, "");
        const blockId = `code-${codeString.slice(0, 20)}`;

        if (match) {
          if (isStreaming) {
            return (
              <div className="relative group my-3 rounded-xl overflow-hidden border border-white/[0.08]">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]" style={{ background: "rgba(10,10,12,0.6)" }}>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                    {match[1]}
                  </span>
                </div>
                <div className="p-4 overflow-x-auto" style={{ background: "rgba(8,8,10,0.4)", fontSize: "13px", lineHeight: "1.7", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                  <pre className="m-0 text-white/80 whitespace-pre">{codeString}</pre>
                </div>
              </div>
            );
          }

          return (
            <div className="relative group my-3 rounded-xl overflow-hidden border border-white/[0.08]">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]" style={{ background: "rgba(10,10,12,0.6)" }}>
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                  {match[1]}
                </span>
                <button
                  onClick={() => copyToClipboard(codeString, blockId)}
                  className="text-[10px] font-medium text-white/30 hover:text-[#c8894a] transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.05]"
                >
                  {copiedBlock === blockId ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: 0,
                  background: "rgba(8,8,10,0.4)",
                  fontSize: "13px",
                  lineHeight: "1.7",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              >
                {codeString}
              </SyntaxHighlighter>
            </div>
          );
        }

        return (
          <code
            className="px-2 py-0.5 rounded-md text-[12px] font-medium"
            style={{ background: "rgba(200,137,74,0.15)", color: "#d9a877", fontFamily: "'JetBrains Mono', monospace", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
            {...props}
          >
            {children}
          </code>
        );
      },
      h1: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1
          className="text-[18px] font-bold text-white mt-5 mb-3 flex items-center gap-2"
          style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
          {...props}
        >
          {children}
        </h1>
      ),
      h2: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2
          className="text-[16px] font-bold text-white mt-4 mb-2.5 flex items-center gap-2"
          style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
          {...props}
        >
          {children}
        </h2>
      ),
      h3: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3
          className="text-[14px] font-semibold text-white/90 mt-3 mb-2"
          style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
          {...props}
        >
          {children}
        </h3>
      ),
      p: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p className="text-[13px] text-white/75 leading-relaxed mb-3" style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties} {...props}>
          {children}
        </p>
      ),
      blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <blockquote
          className="border-l-[3px] border-[#c8894a] bg-[#c8894a]/[0.08] px-4 py-3 rounded-r-xl my-4 [&>p]:text-white/85 [&>p]:font-normal [&>p]:mb-0 [&>p>strong]:text-[#c8894a] [&>p>strong]:font-bold"
          style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
          {...props}
        >
          {children}
        </blockquote>
      ),
      ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul
          className="list-none text-[13px] text-white/75 space-y-2 mb-3 ml-0"
          style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
          {...props}
        >
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
        <ol
          className="list-none text-[13px] text-white/75 space-y-2 mb-3 ml-0 counter-reset-[item]"
          style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
          {...props}
        >
          {children}
        </ol>
      ),
      li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
        <li className="text-[13px] text-white/75 flex items-start gap-2 before:content-['•'] before:text-[#c8894a] before:font-bold before:text-[16px] before:leading-[1.3]" style={{ fontFamily: "'Inter', -apple-system, sans-serif", userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties} {...props}>
          <span>{children}</span>
        </li>
      ),
      strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <strong className="font-semibold text-white" style={{ userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties} {...props}>
          {children}
        </strong>
      ),
    }),
    [copiedBlock, isStreaming],
  );

  if (!content) return null;

  return (
    <div
      className="relative px-5 py-4"
      style={{ userSelect: "text", WebkitUserSelect: "text", fontFamily: "'Inter', -apple-system, sans-serif" } as React.CSSProperties}
    >
      <div className="prose prose-invert prose-sm max-w-none" style={{ userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components as any}
        >
          {content + (isStreaming ? " <span class=\"text-[#c8894a] animate-pulse ml-1 inline-block\">▍</span>" : "")}
        </ReactMarkdown>
      </div>

      {!isStreaming && content && (
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-end">
          <button
            onClick={() => copyToClipboard(content, "full")}
            className="text-[11px] font-medium text-white/40 hover:text-[#c8894a] transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.05]"
          >
            {copiedBlock === "full" ? "✓ Copied All" : "📋 Copy All"}
          </button>
        </div>
      )}
    </div>
  );
};
