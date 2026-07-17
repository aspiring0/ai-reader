import { useRef, useEffect } from 'react';

export interface LogLine {
  phase: string; // 'clone' | 'build' | 'done' | 'error' | 'diagnose'
  message: string;
}

export interface InstallLogProps {
  lines: LogLine[];
  isStreaming: boolean;
}

export function InstallLog({ lines, isStreaming }: InstallLogProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const phaseColor: Record<string, string> = {
    clone: '#7aa2f7',
    build: '#e0af68',
    done: '#9ece6a',
    error: '#f7768e',
    diagnose: '#bb9af7',
  };

  return (
    <div className="bg-black/60 border border-border rounded-md p-3 max-h-[300px] overflow-y-auto font-mono text-[11px] leading-relaxed">
      {lines.length === 0 && !isStreaming && (
        <span className="text-muted">{'\u7b49\u5f85\u5b89\u88c5...'}</span>
      )}
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <span style={{ color: phaseColor[line.phase] || '#7d8aa8' }} className="flex-shrink-0">
            [{line.phase}]
          </span>
          <span className="text-fg-dim whitespace-pre-wrap break-all">{line.message}</span>
        </div>
      ))}
      {isStreaming && (
        <span className="text-amber animate-pulse">{'\u2588'}</span>
      )}
      <div ref={endRef} />
    </div>
  );
}
