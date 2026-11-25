import React from "react";

/**
 * Strips raw Markdown formatting symbols (*, **, _, `) for clean TTS audio playback.
 */
export function stripMarkdownForTts(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .trim();
}

/**
 * Renders inline **bold**, *italic*, and `code` spans cleanly without raw asterisks.
 */
function renderInlineMarkdown(line: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`b-${key++}`} className="font-extrabold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`i-${key++}`} className="italic text-[#FF4F17] font-semibold">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-amber-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

/**
 * Renders tutor explanations and chat messages with proper bold/italic formatting,
 * line breaks, and bullet lists instead of raw `**markdown**`.
 */
export function FormattedTutorText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  // Normalize inline " - **word**" bullets onto their own lines for readability
  const normalized = text.replace(/:\s+-\s+/g, ":\n- ").replace(/\s+-\s+\*\*/g, "\n- **");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {lines.map((line, idx) => {
        const isBullet = /^([-*•]|\d+\.)\s+/.test(line);
        const cleanLine = isBullet
          ? line.replace(/^([-*•]|\d+\.)\s+/, "")
          : line;

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-[#FF4F17] font-bold leading-snug">•</span>
              <span className="flex-1 leading-relaxed">
                {renderInlineMarkdown(cleanLine)}
              </span>
            </div>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(cleanLine)}
          </p>
        );
      })}
    </div>
  );
}
