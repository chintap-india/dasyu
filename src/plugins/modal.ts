import path from 'node:path';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';
import type { DasyuPlugin } from './base';
import type { PageContext, UiFrameworkInfo, ModalFeature, ModalFormField, LinkMetadata, TechDetectionRule } from '../core/types';
import { getWebsiteNaming } from '../extractors/screenshot';
import { logger } from '../cli/logger';

export interface ModalExplorerOptions {
  /**
   * Maximum number of modal triggers to explore per page. Default is 5.
   */
  maxModalsPerPage?: number;

  /**
   * Milliseconds to wait after clicking a trigger for the modal animation / DOM mutation to settle. Default is 350ms.
   */
  waitAfterOpenMs?: number;

  /**
   * Custom CSS selectors to scan for modal triggers.
   */
  customTriggerSelectors?: string[];

  /**
   * Optional custom technology / framework detection rules to augment built-in Lighthouse & Wappalyzer rules.
   */
  customTechRules?: TechDetectionRule[];

  /**
   * Optional callback invoked whenever an interactive modal is discovered and explored.
   */
  onModalDiscovered?: (ctx: PageContext, modal: ModalFeature) => void;
}

/**
 * Standard built-in technology detection rules modeled after Lighthouse Stacks and Wappalyzer / HTTP Archive.
 */
export const DEFAULT_TECH_RULES: TechDetectionRule[] = [
  {
    id: 'angular',
    name: 'Angular',
    category: 'framework',
    website: 'https://angular.dev',
    globals: ['ng', 'getAllAngularRootElements'],
    dom: ['[ng-version]', '[_ngcontent-ng-c*]', '[_nghost-ng-c*]', '[ng-reflect-*]', '[_ngcontent-*]', '[_nghost-*]'],
  },
  {
    id: 'react',
    name: 'React',
    category: 'framework',
    website: 'https://react.dev',
    globals: ['React', '__REACT_DEVTOOLS_GLOBAL_HOOK__'],
    dom: ['[data-reactroot]', '[data-reactid]'],
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'framework',
    website: 'https://nextjs.org',
    globals: ['__NEXT_DATA__'],
    dom: ['#__next'],
  },
  {
    id: 'vue',
    name: 'Vue.js',
    category: 'framework',
    website: 'https://vuejs.org',
    globals: ['__VUE__', 'Vue'],
    dom: ['[data-v-]'],
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'framework',
    website: 'https://nuxt.com',
    globals: ['__NUXT__'],
    dom: ['#__nuxt'],
  },
  {
    id: 'svelte',
    name: 'Svelte',
    category: 'framework',
    website: 'https://svelte.dev',
    dom: ['[class*="svelte-"]'],
  },
  {
    id: 'angular-cdk',
    name: 'Angular CDK / Material',
    category: 'ui',
    dom: ['.cdk-overlay-container', '[cdk-overlay-origin]', 'mat-dialog-container', '.mat-mdc-dialog-container'],
  },
  {
    id: 'radix-ui',
    name: 'Radix UI / Shadcn',
    category: 'ui',
    dom: ['[data-radix-portal]', '[data-radix-focus-guard]', '[data-state]', '[data-radix-collection-item]'],
  },
  {
    id: 'bootstrap',
    name: 'Bootstrap',
    category: 'ui',
    dom: ['.modal', '[data-bs-toggle="modal"]', '[data-toggle="modal"]'],
  },
  {
    id: 'headless-ui',
    name: 'Headless UI',
    category: 'ui',
    dom: ['[id^="headlessui-dialog"]', '[data-headlessui-state]'],
  },
  {
    id: 'native-dialog',
    name: 'HTML5 Native Dialog',
    category: 'ui',
    dom: ['dialog', 'dialog[open]'],
  },
];

/**
 * Detects the underlying frontend framework, component libraries, and SPA architecture.
 * Pluggable and rule-based, supporting custom technology definitions.
 */
export async function detectUiFramework(page: Page, customRules: TechDetectionRule[] = []): Promise<UiFrameworkInfo> {
  try {
    const allRules = [...DEFAULT_TECH_RULES, ...customRules];

    return await page.evaluate((rules) => {
      const win = window as any;
      const doc = document;
      let framework = 'Static / Vanilla';
      let version: string | undefined;
      const componentLibraries: string[] = [];
      let isSpa = false;
      let routerType: string | undefined;

      // Evaluate rule-based detectors
      for (const rule of rules) {
        let matched = false;

        // Check globals
        if (rule.globals) {
          for (const g of rule.globals) {
            if (win[g] !== undefined) {
              matched = true;
              break;
            }
          }
        }

        // Check DOM selectors
        if (!matched && rule.dom) {
          for (const sel of rule.dom) {
            if (doc.querySelector(sel)) {
              matched = true;
              break;
            }
          }
        }

        // Check React Fiber heuristic
        if (!matched && rule.id === 'react') {
          const rootEl = doc.getElementById('root') || doc.getElementById('app') || doc.body;
          if (rootEl && Object.keys(rootEl).some((k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'))) {
            matched = true;
          }
        }

        if (matched) {
          if (rule.category === 'framework') {
            framework = rule.name;
            isSpa = true;
            if (rule.id === 'angular') {
              routerType = 'Angular Router';
              version = doc.querySelector('[ng-version]')?.getAttribute('ng-version') || undefined;
            } else if (rule.id === 'nextjs') {
              routerType = 'Next.js Router';
            } else if (rule.id === 'nuxt') {
              routerType = 'Nuxt Router';
            } else if (rule.id === 'react' && !routerType) {
              routerType = 'React Router / SPA';
            } else if (rule.id === 'vue' && !routerType) {
              routerType = 'Vue Router';
            }
          } else if (rule.category === 'ui') {
            if (!componentLibraries.includes(rule.name)) {
              componentLibraries.push(rule.name);
            }
          }
        }
      }

      // Detect SPA router mechanics if not already inferred
      if (!routerType) {
        if (location.hash.startsWith('#/')) {
          routerType = 'Hash Router';
          isSpa = true;
        } else if (isSpa) {
          routerType = 'HTML5 History API';
        }
      }

      return {
        framework,
        version,
        componentLibraries,
        isSpa,
        routerType,
      };
    }, allRules);
  } catch {
    return {
      framework: 'Unknown',
      componentLibraries: [],
      isSpa: false,
    };
  }
}

/**
 * Discovers candidate interactive triggers (buttons, cards, links) likely to open modals or drawers.
 */
export async function discoverModalTriggers(page: Page, customSelectors: string[] = []): Promise<Array<{ index: number; selector: string; text: string; hint: string }>> {
  try {
    return await page.evaluate((customs) => {
      const doc = document;
      const destructiveRegex = /delete|remove|destroy|logout|sign\s*out|drop|purge|disconnect|discard|clear\s*all/i;
      const modalHintRegex = /modal|dialog|detail|specs|status|edit|tour|quick\s*view|inspect|popup|drawer|sheet/i;

      const candidates: Array<{ index: number; selector: string; text: string; hint: string }> = [];

      const baseSelectors = [
        'button',
        'a[role="button"]',
        '[role="button"]',
        '[aria-haspopup="dialog"]',
        '[aria-haspopup="menu"]',
        '[aria-haspopup="true"]',
        '[data-bs-toggle="modal"]',
        '[data-modal-target]',
        '[data-modal-toggle]',
        '[mattooltip]',
        '[data-tooltip]',
        '[title*="modal" i]',
        '[aria-label*="modal" i]',
        '[title*="specs" i]',
        '[title*="details" i]',
        '[title*="status" i]',
        '[title*="edit" i]',
        ...customs,
      ];

      const elements = Array.from(doc.querySelectorAll(baseSelectors.join(', ')));
      let counter = 0;

      for (const el of elements) {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const title = el.getAttribute('title') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const matTooltip = el.getAttribute('mattooltip') || '';
        const dataTooltip = el.getAttribute('data-tooltip') || '';
        const combined = `${text} ${title} ${ariaLabel} ${matTooltip} ${dataTooltip}`.trim();

        // Skip invisible / offscreen elements
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || (el as HTMLElement).offsetParent === null) {
          continue;
        }

        // Never trigger destructive actions
        if (destructiveRegex.test(combined)) {
          continue;
        }

        const hasAriaPopup = el.getAttribute('aria-haspopup') === 'dialog' || el.getAttribute('aria-haspopup') === 'true';
        const hasDataToggle = el.hasAttribute('data-bs-toggle') || el.hasAttribute('data-modal-target');
        const matchesModalHint = modalHintRegex.test(combined);

        if (hasAriaPopup || hasDataToggle || matchesModalHint) {
          const triggerId = `dasyu-trigger-${counter++}`;
          el.setAttribute('data-dasyu-trigger', triggerId);
          candidates.push({
            index: counter - 1,
            selector: `[data-dasyu-trigger="${triggerId}"]`,
            text: matTooltip || text || title || ariaLabel || 'Interactive Trigger',
            hint: combined,
          });
        }
      }

      return candidates;
    }, customSelectors);
  } catch {
    return [];
  }
}

/**
 * Safely closes any open modal or dialog, restoring the page to its baseline view.
 */
export async function closeModal(page: Page): Promise<boolean> {
  try {
    // 1. Dispatch Escape keyboard event
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 2. Click close button or backdrop if still visible
    const closed = await page.evaluate(() => {
      const closeSelectors = [
        '[aria-label*="close" i]',
        'button[title*="close" i]',
        '.close-btn',
        '.btn-close',
        '.modal-close',
        '.mat-mdc-dialog-container button[aria-label*="close" i]',
        '.cdk-overlay-backdrop',
        '.modal-backdrop',
      ];

      for (const sel of closeSelectors) {
        try {
          const btn = document.querySelector(sel) as HTMLElement | null;
          if (btn && typeof btn.click === 'function' && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        } catch {
          // ignore invalid selectors
        }
      }

      // Check buttons containing close text or icon
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLElement[];
      for (const b of buttons) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (text === 'close' || text === '×' || text === 'cancel' || text === 'dismiss') {
          if (b.offsetParent !== null) {
            b.click();
            return true;
          }
        }
      }

      return false;
    });

    // Wait for backdrop removal if supported
    if (typeof page.waitForFunction === 'function') {
      await page
        .waitForFunction(() => !document.querySelector('.cdk-overlay-backdrop, .modal-backdrop'), { timeout: 1000 })
        .catch(() => {});
    }

    return closed;
  } catch {
    return false;
  }
}

/**
 * Inspects the current page DOM to detect if a modal, dialog, or drawer is currently open and visible.
 * Rejects pure tooltips (such as Angular Material .mat-mdc-tooltip-panel).
 */
export async function inspectOpenModal(page: Page): Promise<{
  modalTitle: string;
  modalType: 'details' | 'status-picker' | 'edit-form' | 'tour-dialog' | 'dialog';
  content: string;
  fields: ModalFormField[];
  actions: string[];
  links: Array<{ href: string; rawHref: string; text: string }>;
  currentUrl: string;
} | null> {
  try {
    return await page.evaluate(() => {
      const modalSelectors = [
        '.mat-mdc-dialog-container',
        'mat-dialog-container',
        'dialog[open]',
        '[role="dialog"]',
        '[role="alertdialog"]',
        '.modal.show',
        '.modal.is-active',
        '[data-state="open"][role="dialog"]',
        '.cdk-overlay-pane:has(mat-dialog-container)',
        '.cdk-overlay-pane:has([role="dialog"])',
        '.cdk-overlay-pane:has([role="menu"])',
        '.mat-mdc-menu-panel',
        '[role="menu"]',
        '.lightbox-modal.active',
      ];

      let container: Element | null = null;
      for (const sel of modalSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).offsetParent !== null) {
            // Explicitly filter out pure tooltip overlays
            if (
              el.classList.contains('mat-mdc-tooltip-panel') ||
              el.getAttribute('role') === 'tooltip' ||
              el.classList.contains('tooltip') ||
              el.querySelector('.mat-mdc-tooltip-panel')
            ) {
              continue;
            }
            const rect = el.getBoundingClientRect();
            // A dialog or drawer must have meaningful dimensions
            if (rect.width >= 120 && rect.height >= 50) {
              container = el;
              break;
            }
          }
        } catch {
          // Ignore invalid selector queries
        }
      }

      if (!container) return null;

      // Extract Title
      const titleEl = container.querySelector(
        'h1, h2, h3, h4, [role="heading"], .modal-title, .dialog-title, .mat-mdc-dialog-title'
      );
      const modalTitle = (titleEl?.textContent || '').trim().replace(/\s+/g, ' ') || 'Modal Dialog';

      // Extract Content
      const content = (container.textContent || '').trim().replace(/\s+/g, ' ');

      // Extract Form Fields & Status Selectors
      const fields: ModalFormField[] = [];
      const formInputs = Array.from(
        container.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"]')
      );
      for (const inp of formInputs) {
        const tag = inp.tagName.toLowerCase();
        const type = inp.getAttribute('type') || tag;
        const name = inp.getAttribute('name') || inp.getAttribute('id') || inp.getAttribute('aria-label') || type;
        let options: string[] | undefined;
        if (tag === 'select') {
          options = Array.from(inp.querySelectorAll('option')).map((o) => (o.textContent || '').trim());
        } else if (inp.getAttribute('role') === 'listbox') {
          options = Array.from(inp.querySelectorAll('[role="option"]')).map((o) => (o.textContent || '').trim());
        }
        fields.push({ name, type, options, value: (inp as HTMLInputElement).value || undefined });
      }

      // Extract Actions & Status Buttons
      const actionEls = Array.from(
        container.querySelectorAll('button, [role="button"], .status-option, .badge')
      );
      const actions = actionEls
        .map((b) => (b.textContent || '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .slice(0, 10);

      // Extract internal permalinks or navigation URLs discovered in modal
      const links = Array.from(container.querySelectorAll('a[href]'))
        .map((a) => {
          const el = a as HTMLAnchorElement;
          return {
            href: el.href,
            rawHref: el.getAttribute('href') || '',
            text: (el.textContent || '').trim().replace(/\s+/g, ' '),
          };
        })
        .filter((l) => Boolean(l.href) && !l.href.startsWith('javascript:'));

      // Categorize modal type
      let modalType: 'details' | 'status-picker' | 'edit-form' | 'tour-dialog' | 'dialog' = 'dialog';
      if (/status|priority/i.test(modalTitle) || fields.some((f) => /status|priority/i.test(f.name)) || container.getAttribute('role') === 'menu') {
        modalType = 'status-picker';
      } else if (/edit|create|update|form/i.test(modalTitle) || fields.length >= 2) {
        modalType = 'edit-form';
      } else if (/detail|spec|info|overview|view|#/i.test(modalTitle) || /specs|step \d+/i.test(content)) {
        modalType = 'details';
      } else if (/tour|guide|welcome/i.test(modalTitle) || /\b\d+\s*\/\s*\d+\b/.test(content)) {
        modalType = 'tour-dialog';
      }

      return {
        modalTitle,
        modalType,
        content: content.slice(0, 800),
        fields,
        actions,
        links,
        currentUrl: window.location.href,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Dasyu UI Framework & Interactive Modal Explorer Plugin.
 *
 * Automatically inspects the page's frontend framework (Angular, React, Vue, Svelte, etc.),
 * component libraries (CDK, Radix, Bootstrap), discovers interactive modal triggers,
 * explores modal states to extract features and deep-linkable routes, and captures snapshots.
 */
export class ModalExplorerPlugin implements DasyuPlugin {
  readonly name = 'modal-explorer';
  private options: ModalExplorerOptions;
  private frameworkInfo: UiFrameworkInfo | null = null;
  private exploredModals: ModalFeature[] = [];

  constructor(options: ModalExplorerOptions = {}) {
    this.options = {
      maxModalsPerPage: options.maxModalsPerPage ?? 5,
      waitAfterOpenMs: options.waitAfterOpenMs ?? 350,
      customTriggerSelectors: options.customTriggerSelectors ?? [],
      ...options,
    };
  }

  async onPageLoad(ctx: PageContext): Promise<void> {
    const page = ctx.page;
    this.exploredModals = [];

    // 1. Detect Frontend Framework & Component Libraries
    const customRules = [
      ...(this.options.customTechRules || []),
      ...(ctx.options.techRules || []),
    ];
    this.frameworkInfo = await detectUiFramework(page, customRules);
    ctx.data.uiFramework = this.frameworkInfo;
    ctx.data.metadata = {
      ...ctx.data.metadata,
      uiFramework: this.frameworkInfo,
    };

    if (this.frameworkInfo?.isSpa) {
      logger.debug(
        `[ModalExplorer] Detected ${this.frameworkInfo.framework}${this.frameworkInfo.version ? ` v${this.frameworkInfo.version}` : ''} (${this.frameworkInfo.componentLibraries.join(', ') || 'custom components'}) on ${ctx.url}`
      );
    }

    // 2. Explore interactive modals if enabled
    if (ctx.options.exploreModals) {
      const naming = getWebsiteNaming(ctx.url, ctx.options.outputDir || './output');
      await fs.mkdir(naming.screenshotsDir, { recursive: true });

      const discoveredLinks: LinkMetadata[] = [];

      // Check if a modal is ALREADY open on initial page load (e.g. Tour dialog or Welcome popup)
      const hasInitialOverlay = await page
        .evaluate(() => Boolean(document.querySelector('.cdk-overlay-backdrop, .modal-backdrop, dialog[open], .mdc-dialog--open')))
        .catch(() => false);

      if (hasInitialOverlay) {
        // Allow initial dialog entrance animations to fully settle
        await page.waitForTimeout(400);
        const initialModal = await inspectOpenModal(page);
        if (initialModal) {
          const slug = initialModal.modalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'initial-modal';
          const modalScreenshotName = `${naming.baseFilename}__modal_0_${slug}.png`;
          const modalScreenshotPath = path.join(naming.screenshotsDir, modalScreenshotName);
          await page.screenshot({ path: modalScreenshotPath }).catch(() => {});

          const initialRecord: ModalFeature = {
            id: 'modal-0',
            triggerSelector: 'body (initial)',
            triggerText: 'Initial Load Modal',
            modalTitle: initialModal.modalTitle,
            modalType: initialModal.modalType,
            content: initialModal.content,
            fields: initialModal.fields,
            actions: initialModal.actions,
            screenshotPath: modalScreenshotPath,
            discoveredUrls: initialModal.links.map((l) => l.href),
          };
          this.exploredModals.push(initialRecord);
          this.options.onModalDiscovered?.(ctx, initialRecord);

          // Dismiss the initial modal so triggers on the page can be clicked cleanly
          await closeModal(page);
          await page.waitForTimeout(300);
        }
      }

      // Discover interactive triggers
      const candidates = await discoverModalTriggers(page, this.options.customTriggerSelectors);
      const toExplore = candidates.slice(0, this.options.maxModalsPerPage);

      if (toExplore.length > 0) {
        logger.info(
          `[ModalExplorer] Found ${candidates.length} interactive modal trigger(s) on ${ctx.url} — exploring top ${toExplore.length}...`
        );
      }

      for (let i = 0; i < toExplore.length; i++) {
        const candidate = toExplore[i];
        try {
          const triggerEl = page.locator(candidate.selector);
          const isVisible = await triggerEl.isVisible().catch(() => false);
          if (!isVisible) continue;

          // Open the modal (normal click with force fallback)
          await triggerEl.click({ timeout: 2500 }).catch(async () => {
            await triggerEl.click({ force: true, timeout: 2500 }).catch(() => {});
          });

          // Wait for modal or menu to open
          if (typeof page.waitForFunction === 'function') {
            await page
              .waitForFunction(
                () => {
                  const d = document.querySelector(
                    '.mat-mdc-dialog-container, mat-dialog-container, dialog[open], [role="dialog"], [role="menu"], .modal.show'
                  );
                  if (d && (d as HTMLElement).offsetParent !== null) {
                    const r = d.getBoundingClientRect();
                    return r.width >= 120 && r.height >= 50;
                  }
                  return false;
                },
                { timeout: Math.max(1200, this.options.waitAfterOpenMs || 350) }
              )
              .catch(() => {});
          }

          // Allow animation and CSS transitions (e.g. Angular CDK fade-in) to fully settle
          await page.waitForTimeout(Math.max(350, this.options.waitAfterOpenMs || 350));

          // Inspect the DOM for open modal container
          const modalInspection = await inspectOpenModal(page);

          if (modalInspection) {
            // Capture a screenshot of the modal in action
            const slug = candidate.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'modal';
            const modalScreenshotName = `${naming.baseFilename}__modal_${i + 1}_${slug}.png`;
            const modalScreenshotPath = path.join(naming.screenshotsDir, modalScreenshotName);

            await page.screenshot({ path: modalScreenshotPath }).catch(() => {});

            // Collect any newly discovered URLs from the modal
            const modalUrls: string[] = [];
            for (const l of modalInspection.links) {
              modalUrls.push(l.href);
              discoveredLinks.push({
                url: l.href,
                rawHref: l.rawHref,
                text: l.text || modalInspection.modalTitle,
              });
            }

            // Check if opening the modal updated the browser URL (e.g. /tasks/:id)
            if (modalInspection.currentUrl && modalInspection.currentUrl !== ctx.url) {
              modalUrls.push(modalInspection.currentUrl);
              discoveredLinks.push({
                url: modalInspection.currentUrl,
                rawHref: modalInspection.currentUrl,
                text: `${modalInspection.modalTitle} (Permalink)`,
              });
            }

            const modalRecord: ModalFeature = {
              id: `modal-${i + 1}`,
              triggerSelector: candidate.selector,
              triggerText: candidate.text,
              modalTitle: modalInspection.modalTitle,
              modalType: modalInspection.modalType,
              content: modalInspection.content,
              fields: modalInspection.fields,
              actions: modalInspection.actions,
              screenshotPath: modalScreenshotPath,
              discoveredUrls: modalUrls,
            };

            this.exploredModals.push(modalRecord);
            this.options.onModalDiscovered?.(ctx, modalRecord);
          }

          // Cleanly dismiss modal before the next trigger
          await closeModal(page);
          await page.waitForTimeout(200);
        } catch (err: any) {
          logger.debug(`[ModalExplorer] Error exploring trigger "${candidate.text}": ${err?.message || err}`);
          await closeModal(page);
        }
      }

      // Clean up temporary data-dasyu-trigger attributes
      await page.evaluate(() => {
        document.querySelectorAll('[data-dasyu-trigger]').forEach((el) => el.removeAttribute('data-dasyu-trigger'));
      }).catch(() => {});

      // Merge discovered links and modals into ctx.data
      ctx.data.modals = this.exploredModals;
      ctx.data.metadata = {
        ...ctx.data.metadata,
        modals: this.exploredModals,
      };

      if (discoveredLinks.length > 0) {
        const existingLinks = new Set(ctx.data.links || []);
        const existingDetails = ctx.data.linkDetails || [];
        for (const dl of discoveredLinks) {
          if (!existingLinks.has(dl.url)) {
            existingLinks.add(dl.url);
            existingDetails.push(dl);
          }
        }
        ctx.data.links = Array.from(existingLinks);
        ctx.data.linkDetails = existingDetails;
      }
    }
  }

  async onAnalyze(ctx: PageContext): Promise<Record<string, any>> {
    return {
      uiFramework: this.frameworkInfo || ctx.data.uiFramework,
      modals: this.exploredModals.length > 0 ? this.exploredModals : ctx.data.modals || [],
    };
  }
}

/**
 * Convenience factory to create a ModalExplorerPlugin instance.
 */
export function createModalPlugin(options?: ModalExplorerOptions): ModalExplorerPlugin {
  return new ModalExplorerPlugin(options);
}
