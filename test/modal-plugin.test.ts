import { describe, it, expect, vi } from 'vitest';
import {
  ModalExplorerPlugin,
  detectUiFramework,
  discoverModalTriggers,
  closeModal,
  createModalPlugin,
} from '../src/plugins/modal';
import type { PageContext } from '../src/core/types';

describe('UiFramework & ModalExplorerPlugin', () => {
  it('should detect Angular and CDK Material correctly from DOM signatures', async () => {
    const mockPage: any = {
      evaluate: vi.fn().mockImplementation(async (fn: any) => {
        // Simulate evaluate return
        return {
          framework: 'Angular',
          version: '18.2.0',
          componentLibraries: ['Angular CDK / Material'],
          isSpa: true,
          routerType: 'Angular Router',
        };
      }),
    };

    const frameworkInfo = await detectUiFramework(mockPage);
    expect(frameworkInfo.framework).toBe('Angular');
    expect(frameworkInfo.version).toBe('18.2.0');
    expect(frameworkInfo.componentLibraries).toContain('Angular CDK / Material');
    expect(frameworkInfo.isSpa).toBe(true);
    expect(frameworkInfo.routerType).toBe('Angular Router');
  });

  it('should detect React, Next.js, and Radix UI correctly', async () => {
    const mockPage: any = {
      evaluate: vi.fn().mockResolvedValue({
        framework: 'Next.js (React)',
        componentLibraries: ['Radix UI / Shadcn'],
        isSpa: true,
        routerType: 'Next.js Router',
      }),
    };

    const frameworkInfo = await detectUiFramework(mockPage);
    expect(frameworkInfo.framework).toBe('Next.js (React)');
    expect(frameworkInfo.componentLibraries).toContain('Radix UI / Shadcn');
    expect(frameworkInfo.isSpa).toBe(true);
  });

  it('should safely identify modal triggers while filtering out destructive actions', async () => {
    const mockPage: any = {
      evaluate: vi.fn().mockImplementation((fn: any, customs: any) => {
        // Return simulated candidates that passed filtering
        return [
          {
            index: 0,
            selector: '[data-dasyu-trigger="dasyu-trigger-0"]',
            text: 'View Details (Modal)',
            hint: 'View Details (Modal) Click to view full specs & details (Modal)',
          },
          {
            index: 1,
            selector: '[data-dasyu-trigger="dasyu-trigger-1"]',
            text: 'Click to change status',
            hint: 'Click to change status',
          },
          {
            index: 2,
            selector: '[data-dasyu-trigger="dasyu-trigger-2"]',
            text: 'Edit Task (Modal)',
            hint: 'Edit Task (Modal)',
          },
        ];
      }),
    };

    const triggers = await discoverModalTriggers(mockPage);
    expect(triggers).toHaveLength(3);
    expect(triggers[0].text).toBe('View Details (Modal)');
    expect(triggers[1].text).toBe('Click to change status');
    expect(triggers[2].text).toBe('Edit Task (Modal)');
  });

  it('should close open modals gracefully via Escape or close button', async () => {
    const mockPage: any = {
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(true),
    };

    const closed = await closeModal(mockPage);
    expect(mockPage.keyboard.press).toHaveBeenCalledWith('Escape');
    expect(closed).toBe(true);
  });

  it('should explore modal triggers, extract features (status, fields), and discover deep links', async () => {
    const plugin = createModalPlugin({ maxModalsPerPage: 2, waitAfterOpenMs: 10 });
    expect(plugin.name).toBe('modal-explorer');

    const clickedSelectors: string[] = [];

    const mockPage: any = {
      evaluate: vi.fn().mockImplementation(async (fn: any, args: any) => {
        const fnStr = fn.toString();
        // Framework detection
        if (fnStr.includes('rules') || fnStr.includes('Angular Detection') || fnStr.includes('ngVersionEl')) {
          return {
            framework: 'Angular',
            version: '18.1.0',
            componentLibraries: ['Angular CDK / Material'],
            isSpa: true,
            routerType: 'Angular Router',
          };
        }
        // Candidate triggers
        if (fnStr.includes('destructiveRegex') || fnStr.includes('modalHintRegex')) {
          return [
            {
              index: 0,
              selector: '[data-dasyu-trigger="dasyu-trigger-0"]',
              text: 'View Details (Modal)',
              hint: 'View Details (Modal) Task #4 Specs',
            },
            {
              index: 1,
              selector: '[data-dasyu-trigger="dasyu-trigger-1"]',
              text: 'Click to change status',
              hint: 'Click to change status',
            },
          ];
        }
        // Modal inspection
        if (fnStr.includes('modalSelectors') || fnStr.includes('modalTitle')) {
          if (clickedSelectors[clickedSelectors.length - 1] === '[data-dasyu-trigger="dasyu-trigger-0"]') {
            return {
              modalTitle: 'Task #4: Schema.org Verification',
              modalType: 'details',
              content: 'Run production build and test rich snippets. Permalinks: /tasks/4',
              fields: [],
              actions: ['Close', 'Edit'],
              links: [{ href: 'https://today.chintap.com/tasks/4', rawHref: '/tasks/4', text: 'Permalink' }],
              currentUrl: 'https://today.chintap.com/demo',
            };
          } else {
            return {
              modalTitle: 'Update Task Status',
              modalType: 'status-picker',
              content: 'Select new status: To Do, In Progress, Done',
              fields: [
                {
                  name: 'status',
                  type: 'select',
                  options: ['To Do', 'In Progress', 'Done'],
                  value: 'To Do',
                },
              ],
              actions: ['To Do', 'In Progress', 'Done', 'Cancel'],
              links: [],
              currentUrl: 'https://today.chintap.com/demo',
            };
          }
        }
        return null;
      }),
      locator: (sel: string) => ({
        isVisible: vi.fn().mockResolvedValue(true),
        click: vi.fn().mockImplementation(async () => {
          clickedSelectors.push(sel);
        }),
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
    };

    const ctx: PageContext = {
      page: mockPage,
      url: 'https://today.chintap.com/demo',
      depth: 0,
      options: {
        startUrl: 'https://today.chintap.com',
        exploreModals: true,
        outputDir: './test-output',
      },
      data: {
        url: 'https://today.chintap.com/demo',
        depth: 0,
        title: 'Today Demo',
        status: 200,
        links: [],
        metadata: {},
      },
    };

    await plugin.onPageLoad(ctx);

    // Assert framework detection
    expect(ctx.data.uiFramework?.framework).toBe('Angular');
    expect(ctx.data.uiFramework?.isSpa).toBe(true);

    // Assert modals discovered & explored
    expect(ctx.data.modals).toHaveLength(2);
    expect(ctx.data.modals![0].modalTitle).toBe('Task #4: Schema.org Verification');
    expect(ctx.data.modals![0].modalType).toBe('details');

    expect(ctx.data.modals![1].modalTitle).toBe('Update Task Status');
    expect(ctx.data.modals![1].modalType).toBe('status-picker');
    expect(ctx.data.modals![1].fields?.[0].options).toEqual(['To Do', 'In Progress', 'Done']);

    // Assert deep link / permalink discovery: /tasks/4 was injected into links
    expect(ctx.data.links).toContain('https://today.chintap.com/tasks/4');

    // Assert analysis report
    const analysis = await plugin.onAnalyze(ctx);
    expect(analysis.uiFramework.framework).toBe('Angular');
    expect(analysis.modals).toHaveLength(2);
  });
});
