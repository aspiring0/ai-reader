/**
 * Clean LLM-generated summary text for display.
 * Handles: raw JSON code blocks, template placeholders, angle bracket wrapping.
 */
export function cleanSummary(raw: string): string {
  let s = raw.trim();

  // 1. Strip ALL code fence markers (handles ```json, ```, preamble, etc.)
  s = s.replace(/```/g, '');

  // 2. If it contains a JSON object, try to extract summary or description field
  const jsonMatch = s.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (typeof obj.summary === 'string' && obj.summary.trim()) return cleanSummary(obj.summary);
      if (typeof obj.description === 'string' && obj.description.trim()) return cleanSummary(obj.description);
    } catch { /* not valid JSON, continue */ }
    // Regex fallback for malformed JSON
    const sm = jsonMatch[0].match(/"summary"\s*:\s*"([\s\S]*?)"\s*[},]/);
    if (sm) return sm[1];
    const dm = jsonMatch[0].match(/"description"\s*:\s*"([\s\S]*?)"\s*[},]/);
    if (dm) return dm[1];
  }

  // 3. Remove template placeholder lines: <1-2...> at line start
  s = s.replace(/^[\t ]*<1-2[^>]*>/gm, '');
  s = s.replace(/^[\t ]*<1-2.*sentence overview[^>]*>/gim, '');

  // 4. Remove angle brackets wrapping numbered sections: <1. ...> -> 1. ...
  s = s.replace(/^[\t ]*<(\d+\.\s)/gm, '$1');
  // Remove stray trailing > at end of lines
  s = s.replace(/>\s*$/gm, '');

  // 5. Remove stray angle bracket lines
  s = s.replace(/^[\t ]*>\s+/gm, '');

  // 6. Clean up multiple blank lines and whitespace
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  return s;
}
