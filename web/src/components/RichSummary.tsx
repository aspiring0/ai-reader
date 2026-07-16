import React from 'react';

/**
 * Parse an LLM-generated Chinese summary into structured blocks for display.
 *
 * Handles these patterns:
 *  - Numbered items: "1. 核心功能：..." -> labeled section
 *  - Sub-bullets: "- 安装：..." -> indented list item
 *  - Unstructured paragraphs -> split by sentence for readability
 *  - Inline code (backtick-wrapped) -> monospace rendering
 */
interface SummaryBlock {
  type: 'intro' | 'section' | 'bullet' | 'paragraph';
  label?: string;
  text: string;
  subItems?: { label?: string; text: string }[];
}

const LABEL_MAP: Record<string, string> = {
  '\u6838\u5fc3\u529f\u80fd': '\u6838\u5fc3\u529f\u80fd',
  '\u4f7f\u7528\u573a\u666f': '\u4f7f\u7528\u573a\u666f',
  '\u5165\u95e8\u6307\u5357': '\u5165\u95e8\u6307\u5357',
  '\u4eae\u70b9': '\u4eae\u70b9',
  '\u7a81\u51fa\u7279\u6027': '\u4eae\u70b9',
  '\u4f7f\u7528\u65b9\u6cd5': '\u5165\u95e8\u6307\u5357',
  '\u5b89\u88c5\u65b9\u6cd5': '\u5165\u95e8\u6307\u5357',
};

function parseSummary(summary: string): SummaryBlock[] {
  const lines = summary.split('\n').map(l => l.trim()).filter(l => l);
  const blocks: SummaryBlock[] = [];
  let currentSection: SummaryBlock | null = null;
  let introText: string[] = [];

  for (const line of lines) {
    // Numbered item: "1. Label：text" or "1. text"
    const numMatch = line.match(/^(\d+)[\.\uff0e]\s*(.+)/);
    // Sub-bullet: "- text" or "- Label：text"
    const bulletMatch = line.match(/^[-\u2022]\s*(.+)/);

    if (numMatch) {
      if (introText.length > 0) {
        blocks.push({ type: 'intro', text: introText.join(' ') });
        introText = [];
      }
      if (currentSection) blocks.push(currentSection);

      const rest = numMatch[2];
      const kvMatch = rest.match(/^([\u4e00-\u9fa5\w]{2,8})[\uff1a:]\s*(.+)/);
      if (kvMatch) {
        const mapped = LABEL_MAP[kvMatch[1]] ?? kvMatch[1];
        currentSection = { type: 'section', label: mapped, text: kvMatch[2], subItems: [] };
      } else {
        currentSection = { type: 'section', text: rest, subItems: [] };
      }
    } else if (bulletMatch && currentSection) {
      const rest = bulletMatch[1];
      const kvMatch = rest.match(/^([\u4e00-\u9fa5\w]{2,8})[\uff1a:]\s*(.+)/);
      if (kvMatch) {
        currentSection.subItems!.push({ label: kvMatch[1], text: kvMatch[2] });
      } else {
        currentSection.subItems!.push({ text: rest });
      }
    } else {
      // Check for standalone key-value line (Label：text)
      const kvMatch = line.match(/^([\u4e00-\u9fa5]{2,6})[\uff1a:]\s*(.+)/);
      if (kvMatch && !currentSection && lines.length > 2) {
        if (introText.length > 0) {
          blocks.push({ type: 'intro', text: introText.join(' ') });
          introText = [];
        }
        const mapped = LABEL_MAP[kvMatch[1]] ?? kvMatch[1];
        currentSection = { type: 'section', label: mapped, text: kvMatch[2], subItems: [] };
      } else if (currentSection) {
        currentSection.text += ' ' + line;
      } else {
        introText.push(line);
      }
    }
  }

  if (introText.length > 0) {
    blocks.push({ type: 'intro', text: introText.join(' ') });
  }
  if (currentSection) blocks.push(currentSection);

  // Fallback: if no structure was detected, split by sentences for readability
  if (blocks.length === 1 && blocks[0].type === 'intro') {
    const text = blocks[0].text;
    const sentences = text.split(/(?<=\u3002)\s*/).filter(s => s.trim());
    if (sentences.length > 2) {
      return sentences.map(s => ({ type: 'paragraph' as const, text: s.trim() }));
    }
  }

  return blocks;
}

/** Render inline code (backtick-wrapped) with monospace styling. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="font-mono text-[11px] px-1 py-0.5 rounded bg-black/40 text-green border border-border">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const LABEL_COLORS = [
  { bg: 'rgba(122,162,247,.12)', fg: '#7aa2f7' },
  { bg: 'rgba(158,206,106,.12)', fg: '#9ece6a' },
  { bg: 'rgba(224,175,104,.12)', fg: '#e0af68' },
  { bg: 'rgba(187,154,247,.12)', fg: '#bb9af7' },
  { bg: 'rgba(125,207,255,.12)', fg: '#7dcfff' },
];

export function RichSummary({ summary }: { summary: string }) {
  const blocks = parseSummary(summary);
  let labelIdx = 0;

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        if (block.type === 'intro' || block.type === 'paragraph') {
          return (
            <p key={i} className="text-[13px] text-fg-dim leading-[1.8]">
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.type === 'section') {
          const color = LABEL_COLORS[labelIdx % LABEL_COLORS.length];
          labelIdx++;
          return (
            <div key={i} className="flex flex-col gap-1.5">
              {block.label && (
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold font-mono flex-shrink-0"
                    style={{ background: color.bg, color: color.fg }}
                  >
                    {block.label}
                  </span>
                </div>
              )}
              <p className="text-[12px] text-fg-dim leading-[1.7] pl-1">
                {renderInline(block.text)}
              </p>
              {block.subItems && block.subItems.length > 0 && (
                <div className="flex flex-col gap-1 pl-3 mt-0.5">
                  {block.subItems.map((sub, j) => (
                    <div key={j} className="flex items-start gap-1.5">
                      <span className="text-muted text-[10px] mt-[3px] flex-shrink-0">{'\u2014'}</span>
                      <span className="text-[12px] text-fg-dim leading-[1.6]">
                        {sub.label && <span className="text-fg font-medium">{sub.label + '\uff1a'}</span>}
                        {renderInline(sub.text)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
