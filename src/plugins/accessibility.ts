import type { DasyuPlugin } from './base';
import type { PageContext } from '../core/types';
import { logger } from '../cli/logger';
import AxeBuilder from '@axe-core/playwright';

export interface AccessibilityViolation {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  helpUrl: string;
  nodesCount: number;
  targets: string[];
}

export interface AccessibilityAuditReport {
  score: number; // 0 - 100
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  violations: AccessibilityViolation[];
}

export interface AccessibilityPluginOptions {
  /**
   * Only audit with specific WCAG standard tags (e.g. ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).
   * Defaults to WCAG 2.1 Level A & AA.
   */
  tags?: string[];
  /**
   * Log warnings to console when violations are found. Default: true.
   */
  logWarnings?: boolean;
}

/**
 * Built-in Accessibility (WCAG) Audit Plugin for Dasyu powered by Axe-core.
 * Automatically evaluates crawled pages against WCAG 2.1 Level A & AA accessibility standards,
 * categorizing violations by impact (critical, serious, moderate, minor) and calculating
 * an overall compliance health score.
 */
export class AccessibilityPlugin implements DasyuPlugin {
  readonly name = 'accessibility-audit';
  private options: AccessibilityPluginOptions;

  constructor(options: AccessibilityPluginOptions = {}) {
    this.options = {
      tags: options.tags || ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      logWarnings: options.logWarnings ?? true,
    };
  }

  async onAnalyze(ctx: PageContext): Promise<Record<string, any>> {
    try {
      let builder = new AxeBuilder({ page: ctx.page });
      if (this.options.tags && this.options.tags.length > 0) {
        builder = builder.withTags(this.options.tags);
      }

      const results = await builder.analyze();

      const violations: AccessibilityViolation[] = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodesCount: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target))),
      }));

      let critical = 0;
      let serious = 0;
      let moderate = 0;
      let minor = 0;

      for (const v of violations) {
        if (v.impact === 'critical') critical += v.nodesCount;
        else if (v.impact === 'serious') serious += v.nodesCount;
        else if (v.impact === 'moderate') moderate += v.nodesCount;
        else minor += v.nodesCount;
      }

      const penalty = critical * 25 + serious * 10 + moderate * 5 + minor * 2;
      const score = Math.max(0, 100 - penalty);

      const report: AccessibilityAuditReport = {
        score,
        totalViolations: violations.length,
        critical,
        serious,
        moderate,
        minor,
        violations,
      };

      ctx.data.metadata = ctx.data.metadata || {};
      ctx.data.metadata.accessibility = report;

      if (this.options.logWarnings && violations.length > 0) {
        logger.warn(
          `[A11y] ${violations.length} violation(s) on ${ctx.url} (Score: ${score}/100, Critical: ${critical}, Serious: ${serious})`
        );
      }

      return {
        accessibilityAudit: report,
      };
    } catch (err: any) {
      return {
        accessibilityAudit: {
          error: `Audit failed: ${err?.message || String(err)}`,
        },
      };
    }
  }
}

export function createAccessibilityPlugin(options?: AccessibilityPluginOptions): AccessibilityPlugin {
  return new AccessibilityPlugin(options);
}
