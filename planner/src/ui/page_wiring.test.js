// Exercise the actual inline controllers with small DOM/callback doubles.
// Pure helper tests cannot catch missing listeners, stale render order, or
// async modal callers treating a new tab's ID as a synchronous return value.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const page = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
function controller(names, globals = {}) {
  const source = names.map((name) => {
    const match = page.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'));
    if (!match) throw new Error(`Missing page controller: ${name}`);
    return match[0];
  }).join('\n');
  const context = vm.createContext(globals);
  vm.runInContext(source, context);
  return context;
}

it('all classic page scripts compile', () => {
  for (const [, attrs, source] of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!attrs.includes('type="module"')) expect(() => new vm.Script(source)).not.toThrow();
  }
});

describe('filter page wiring', () => {
  it.each(['toggle', 'edit', 'delete'])('routes %s clicks using opaque filter IDs', (action) => {
    let onClick;
    const handlers = {
      toggle: vi.fn(), edit: vi.fn(), delete: vi.fn(),
    };
    const id = 'filter_test-123';
    const context = controller(['_initFilterForm'], {
      filters: [{ id }],
      toggleFilterVisible: handlers.toggle,
      openFilterForm: handlers.edit,
      deleteFilter: handlers.delete,
      document: {
        querySelectorAll: () => [],
        getElementById: (key) => ({ addEventListener: (_type, fn) => {
          if (key === 'filter-list') onClick = fn;
        } }),
      },
    });
    context._initFilterForm();
    expect(onClick).toBeTypeOf('function');
    onClick({ target: { closest: () => ({ dataset: { filterId: id, filterAction: action } }) } });
    expect(handlers[action]).toHaveBeenCalledOnce();
    expect(handlers[action]).toHaveBeenCalledWith(id);
  });

  it('refreshes the selected plan filters before drawing the calendar and list', () => {
    const seen = [];
    let filters = ['old plan'];
    const context = controller(['render'], {
      _syncFiltersFromPlan: () => { filters = ['selected plan']; },
      renderFilterList: () => seen.push([...filters]),
      buildTabs: vi.fn(), buildOptionDetail: vi.fn(), buildLegend: vi.fn(),
      buildGrid: () => seen.push([...filters]),
    });
    context.render();
    expect(seen).toEqual([['selected plan'], ['selected plan'], ['selected plan']]);
  });
});

describe('tab layout controllers', () => {
  it('returns the new tab ID after the name modal resolves', async () => {
    const context = controller(['addNewTab'], {
      userTabs: [],
      _hsPrompt: () => Promise.resolve('Planning'),
      ensureTabPane: vi.fn(), renderNav: vi.fn(), updateEmptyStates: vi.fn(), switchTab: vi.fn(),
    });
    const id = await context.addNewTab(false);
    expect(id).toBeTruthy();
    expect(context.userTabs[0]).toMatchObject({ id, label: 'Planning', moduleIds: [] });
    expect(context.switchTab).not.toHaveBeenCalled();
  });

  it('waits for a new tab before moving the selected module into it', async () => {
    let createClick;
    let resolveName;
    const pending = new Promise((resolve) => { resolveName = resolve; });
    const context = controller(['openModuleMenu'], {
      userTabs: [], MODULE_DEFS: { schedule: { label: 'Schedule' } },
      closeModuleMenus: vi.fn(), moveModule: vi.fn(), addNewTab: () => pending,
      window: { innerWidth: 1000 }, setTimeout: vi.fn(),
      document: {
        body: { appendChild: vi.fn() },
        createElement: () => ({
          style: {}, querySelectorAll: () => [],
          querySelector: () => ({ addEventListener: (_type, fn) => { createClick = fn; } }),
        }),
      },
    });
    context.openModuleMenu({ stopPropagation() {}, target: { getBoundingClientRect: () => ({ bottom: 0, right: 0 }) } }, 'schedule');
    createClick();
    expect(context.moveModule).not.toHaveBeenCalled();
    resolveName('tab_planning');
    await pending;
    expect(context.moveModule).toHaveBeenCalledOnce();
    expect(context.moveModule).toHaveBeenCalledWith('schedule', 'tab_planning');
  });

  it('restores every default module before removing custom tab containers', async () => {
    const events = [];
    const customPane = { dataset: { tabId: 'custom' }, remove: () => events.push('remove') };
    const context = controller(['defaultTabs', 'configResetDefault'], {
      userTabs: [], currentTab: 'custom',
      _hsConfirm: () => Promise.resolve(true),
      document: { querySelectorAll: () => [customPane] },
      applyAllTabOrders: () => events.push('move'),
      renderNav: vi.fn(), updateEmptyStates: vi.fn(), renderConfigBoard: vi.fn(),
      switchTab: vi.fn(), render: vi.fn(),
    });
    context.configResetDefault();
    await Promise.resolve();
    expect(events).toEqual(['move', 'remove']);
    expect(context.userTabs.map((tab) => tab.id)).toEqual(['main', 'catalog', 'edit', 'compare', 'export', 'manage']);
    expect(context.userTabs.flatMap((tab) => tab.moduleIds).sort())
      .toEqual([...page.matchAll(/<section[^>]*data-module-id="([^"]+)"/g)].map((match) => match[1]).sort());
    expect(context.switchTab).toHaveBeenCalledWith('main');
    expect(context.render).toHaveBeenCalledOnce();
  });

  it('switches away from a deleted active tab without short-circuiting navigation', () => {
    const context = controller(['_deleteTabConfirmed'], {
      userTabs: [], currentTab: 'custom',
      document: { querySelector: () => ({ remove: vi.fn() }) },
      renderNav: vi.fn(), updateEmptyStates: vi.fn(), renderConfigBoard: vi.fn(),
      switchTab: vi.fn(function () { expect(context.currentTab).toBe('custom'); }),
    });
    context._deleteTabConfirmed({ id: 'custom', moduleIds: [] }, [{ id: 'main', moduleIds: [] }]);
    expect(context.switchTab).toHaveBeenCalledOnce();
    expect(context.switchTab).toHaveBeenCalledWith('main');
  });
});
