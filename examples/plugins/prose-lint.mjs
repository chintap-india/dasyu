/**
 * Dasyu Plugin: English Prose & Grammar Quality Linter
 *
 * Scans extracted Markdown documentation to identify passive voice,
 * weasel words, overly complex vocabulary, and runaway sentences,
 * modeled after writing tools like write-good and Vale.
 *
 * Usage:
 *   dasyu crawl https://example.com --content --plugin ./examples/plugins/prose-lint.mjs
 */

const WEASEL_WORDS = new Set([
  'very', 'extremely', 'remarkably', 'virtually', 'obviously',
  'clearly', 'basically', 'actually', 'fairly', 'quite', 'several',
  'arguably', 'substantially', 'relatively',
]);

const COMPLEX_WORDS = {
  utilize: 'use',
  utilization: 'use',
  facilitate: 'help',
  commence: 'start',
  terminate: 'end',
  'prior to': 'before',
  'subsequent to': 'after',
  inquire: 'ask',
  implement: 'carry out / build',
  endeavor: 'try',
  discontinue: 'stop',
  expedite: 'speed up',
};

const PASSIVE_VOICE_REGEX =
  /\b(am|is|are|was|were|be|been|being)\s+([a-z]+ed|built|done|seen|written|taken|found|chosen|given|made)\b/i;

/**
 * Analyzes English prose quality and generates actionable suggestions.
 * @param {string} text
 */
export function lintProse(text) {
  const clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`.*?`/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();

  if (!clean) {
    return {
      qualityScore: 100,
      suggestions: [],
      stats: { passiveVoiceCount: 0, weaselWordCount: 0, complexWordCount: 0, longSentencesCount: 0 },
    };
  }

  const sentences = clean.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const suggestions = [];
  let passiveVoiceCount = 0;
  let weaselWordCount = 0;
  let complexWordCount = 0;
  let longSentencesCount = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);

    // 1. Long Sentence Check (> 30 words)
    if (words.length > 30) {
      longSentencesCount++;
      suggestions.push({
        type: 'long-sentence',
        message: `Sentence is overly long (${words.length} words). Consider splitting for clarity.`,
        snippet: trimmed.slice(0, 80) + '...',
      });
    }

    // 2. Passive Voice Check
    const passiveMatch = trimmed.match(PASSIVE_VOICE_REGEX);
    if (passiveMatch) {
      passiveVoiceCount++;
      suggestions.push({
        type: 'passive-voice',
        message: `Passive voice detected ("${passiveMatch[0]}"). Prefer active voice for direct technical writing.`,
        snippet: trimmed.slice(0, 80) + '...',
      });
    }

    // 3. Weasel Words Check
    for (const word of words) {
      const lower = word.toLowerCase().replace(/[^a-z]/g, '');
      if (WEASEL_WORDS.has(lower)) {
        weaselWordCount++;
        suggestions.push({
          type: 'weasel-word',
          message: `Omit vague modifier "${lower}". Be specific or quantify with data.`,
          snippet: trimmed.slice(0, 80) + '...',
        });
      }
    }

    // 4. Complex Vocabulary Check
    for (const [complex, simpler] of Object.entries(COMPLEX_WORDS)) {
      const regex = new RegExp(`\\b${complex}\\b`, 'i');
      if (regex.test(trimmed)) {
        complexWordCount++;
        suggestions.push({
          type: 'complex-word',
          message: `Consider replacing "${complex}" with simpler alternative "${simpler}".`,
          snippet: trimmed.slice(0, 80) + '...',
        });
      }
    }
  }

  // Calculate quality score (0 to 100)
  const penalty =
    passiveVoiceCount * 4 +
    weaselWordCount * 2 +
    complexWordCount * 3 +
    longSentencesCount * 5;

  const qualityScore = Math.max(0, 100 - penalty);

  return {
    qualityScore,
    suggestions: suggestions.slice(0, 15), // Top 15 suggestions
    stats: {
      passiveVoiceCount,
      weaselWordCount,
      complexWordCount,
      longSentencesCount,
      totalSentences: sentences.length,
    },
  };
}

/**
 * Dasyu Plugin Object
 */
export default {
  name: 'prose-lint',

  async onExtract(ctx, contentPath) {
    if (!contentPath) return;

    const rawMarkdown = ctx.data.metadata?.markdown || '';
    if (!rawMarkdown) return;

    const lintResults = lintProse(rawMarkdown);

    ctx.data.metadata = {
      ...ctx.data.metadata,
      proseLint: lintResults,
    };
  },

  async onAnalyze(ctx) {
    if (ctx.data.metadata?.proseLint) {
      return {
        proseQualityScore: ctx.data.metadata.proseLint.qualityScore,
        proseIssues: ctx.data.metadata.proseLint.suggestions.length,
      };
    }
  },
};
