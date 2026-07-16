import React from 'react';

/**
 * Parse an LLM-generated Chinese summary into structured blocks for display.
 *
 * Handles these patterns:
 *  - Numbered items: "1. 核心功能：..." -> labeled section
 *  - Sub-bullets: "   - 安装：..." -> indented list item
 *  - Key-value: "核心功能：..." -> labeled section
 *  - Free text -> paragraph
 */
interface SummaryBlock {
  type: 'intro' | 'section' | 'bullet' | 'code' | 'paragraph';
  label?: string;
  text: string;
  subItems?: { label?: string; text: string }[];
}

function parseSummary(summary: string): SummaryBlock[] {
  const lines = summary.split('\n');
  const blocks: SummaryBlock[] = [];
  let currentSection: SummaryBlock | null = null;
  let introText: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Numbered item: "1. Label：text" or "1. text"
    const numMatch = trimmed.match(/^(\d+)[\.\uff0e]\s*(.+)/);
    // Sub-bullet: "- text" or "- Label：text"
    const bulletMatch = trimmed.match(/^[-\u2022]\s*(.+)/);

    if (numMatch) {
      // Flush intro
      if (introText.length > 0) {
        blocks.push({ type: 'intro', text: introText.join(' ') });
        introText = [];
      }
      // Flush previous section
      if (currentSection) blocks.push(currentSection);

      const rest = numMatch[2];
      // Check for "Label：text" pattern
      const kvMatch = rest.match(/^([\u4e00-\u9fa5\w]{2,8})[\uff1a:]\s*(.+)/);
      if (kvMatch) {
        currentSection = { type: 'section', label: kvMatch[1], text: kvMatch[2], subItems: [] };
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
      // Check if this is a standalone key-value line
      const kvMatch = trimmed.match(/^([\u4e00-\u9fa5]{2,6})[\uff1a:]\s*(.+)/);
      if (kvMatch && !currentSection) {
        if (introText.length > 0) {
          blocks.push({ type: 'intro', text: introText.join(' ') });
          introText = [];
        }
        currentSection = { type: 'section', label: kvMatch[1], text: kvMatch[2], subItems: [] };
      } else if (currentSection) {
        // Continuation of current section
        currentSection.text += ' ' + trimmed;
      } else {
        introText.push(trimmed);
      }
    }
  }

  if (introText.length > 0) {
    blocks.push({ type: 'intro', text: introText.join(' ') });
  }
  if (currentSection) blocks.push(currentSection);

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
