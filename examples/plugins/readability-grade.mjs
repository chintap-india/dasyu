/**
 * Dasyu Plugin: Readability & Reading Level Analyzer
 *
 * Computes Flesch-Kincaid Grade Level and Flesch Reading Ease scores
 * on the extracted Markdown content of each crawled page, mapping the score
 * to an estimated target audience age (e.g., 5th Grade, Middle School, College).
 *
 * Usage:
 *   dasyu crawl https://example.com --content --plugin ./examples/plugins/readability-grade.mjs
 */

/**
 * Counts syllables in an English word using standard linguistic heuristics.
 * @param {string} word
 * @returns {number}
 */
function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  // Replace common endings
  const normalized = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');

  const matches = normalized.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length) : 1;
}

/**
 * Computes readability metrics from prose text.
 * @param {string} text
 */
export function analyzeReadability(text) {
  // Strip Markdown links, images, code fences, and headers for pure prose analysis
  const prose = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`.*?`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();

  if (!prose) {
    return {
      fleschReadingEase: 100,
      fleschKincaidGrade: 0,
      readingLevel: 'N/A',
      targetAge: 'All ages',
      wordCount: 0,
      sentenceCount: 0,
    };
  }

  const sentences = prose.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = prose.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));

  const totalSentences = Math.max(1, sentences.length);
  const totalWords = Math.max(1, words.length);
  const totalSyllables = words.reduce((acc, word) => acc + countSyllables(word), 0);

  // Standard Flesch Reading Ease Formula:
  // 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
  const readingEase = Math.round(
    206.835 - 1.015 * (totalWords / totalSentences) - 84.6 * (totalSyllables / totalWords)
  );

  // Flesch-Kincaid Grade Level Formula:
  // 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
  const gradeLevel = Math.max(
    0,
    Math.round((0.39 * (totalWords / totalSentences) + 11.8 * (totalSyllables / totalWords) - 15.59) * 10) / 10
  );

  // Map grade level to age and plain-English reading level
  let readingLevel = 'Standard (Plain English)';
  let targetAge = '13–15 years';

  if (readingEase >= 90) {
    readingLevel = 'Very Easy (5th Grade)';
    targetAge = '10–11 years';
  } else if (readingEase >= 80) {
    readingLevel = 'Easy (6th Grade)';
    targetAge = '11–12 years';
  } else if (readingEase >= 70) {
    readingLevel = 'Fairly Easy (7th Grade)';
    targetAge = '12–13 years';
  } else if (readingEase >= 60) {
    readingLevel = 'Standard (8th–9th Grade)';
    targetAge = '13–15 years';
  } else if (readingEase >= 50) {
    readingLevel = 'Fairly Difficult (10th–12th Grade)';
    targetAge = '16–18 years (High School)';
  } else if (readingEase >= 30) {
    readingLevel = 'Difficult (College Level)';
    targetAge = '18–22 years';
  } else {
    readingLevel = 'Very Confusing / Technical (Graduate Level)';
    targetAge = '22+ years';
  }

  return {
    fleschReadingEase: Math.min(100, Math.max(0, readingEase)),
    fleschKincaidGrade: gradeLevel,
    readingLevel,
    targetAge,
    wordCount: totalWords,
    sentenceCount: totalSentences,
  };
}

/**
 * Dasyu Plugin Object
 */
export default {
  name: 'readability-grade',

  /**
   * Hook called after page Markdown extraction completes
   */
  async onExtract(ctx, contentPath) {
    if (!contentPath) return;

    // Use extracted markdown text if available in memory or file
    const rawMarkdown = ctx.data.metadata?.markdown || '';
    if (!rawMarkdown) return;

    const metrics = analyzeReadability(rawMarkdown);

    // Merge metrics into page metadata for report dashboard and JSON output
    ctx.data.metadata = {
      ...ctx.data.metadata,
      readability: metrics,
    };
  },

  /**
   * Hook called during page analysis
   */
  async onAnalyze(ctx) {
    if (ctx.data.metadata?.readability) {
      return {
        readabilityScore: ctx.data.metadata.readability.fleschReadingEase,
        readingGrade: ctx.data.metadata.readability.fleschKincaidGrade,
        targetAudience: ctx.data.metadata.readability.targetAge,
      };
    }
  },
};
