import type { SessionizerConfig, PaneConfig, TabConfig } from "../config.ts";
import type { Pane, Tab, Workspace } from "../client/types.ts";
import type { SplitOptions } from "../ops/panes.ts";
import type { TabCreateOptions } from "../ops/tabs.ts";
import {
  buildPaneCommand,
  type LayoutCommandOptions,
} from "./command-builder.ts";
import {
  createLenientLayoutErrorPolicy,
  type LayoutErrorPolicy,
} from "./error-policy.ts";

interface TabRuntime {
  tabId: string;
  firstPaneId: string;
  nextPaneIndex: number;
}

export interface LayoutTabs {
  create(options: TabCreateOptions): Promise<Tab>;
  rename(tabId: string, label: string): Promise<void>;
  focus(tabId: string): Promise<void>;
}

export interface LayoutPanes {
  split(paneId: string, options: SplitOptions): Promise<Pane>;
  run(paneId: string, command: string): Promise<void>;
  rename(paneId: string, label: string): Promise<void>;
}

export async function createProjectLayout(
  workspace: Workspace,
  cwd: string,
  config: SessionizerConfig,
  tabs: LayoutTabs,
  panes: LayoutPanes,
  options?: LayoutCommandOptions,
  errorPolicy: LayoutErrorPolicy = createLenientLayoutErrorPolicy()
): Promise<Workspace> {
  const id = workspace.workspace_id;
  const tabsToCreate = config.tabs;
  validateCommandOverrideTargets(tabsToCreate, options);
  if (tabsToCreate.length === 0) return workspace;

  let nextPaneIndex = 1;
  let focusedTabId = `${id}:1`;

  const [firstTab, ...remainingTabs] = tabsToCreate;
  const initial = await configureExistingTab(
    `${id}:1`,
    `${id}-${nextPaneIndex}`,
    firstTab!,
    cwd,
    tabs,
    panes,
    config.layout.focus,
    options,
    errorPolicy
  );
  nextPaneIndex = initial.nextPaneIndex;
  if (matchesFocus(config.layout.focus, firstTab!, initial.firstPaneId)) {
    focusedTabId = initial.tabId;
  }

  for (const tab of remainingTabs) {
    const created = await createAndConfigureTab(
      id,
      nextPaneIndex,
      tab,
      cwd,
      tabs,
      panes,
      config.layout.focus,
      options,
      errorPolicy
    );
    nextPaneIndex = created.nextPaneIndex;
    if (matchesFocus(config.layout.focus, tab, created.firstPaneId)) {
      focusedTabId = created.tabId;
    }
  }

  await errorPolicy.ignore(`focus tab '${focusedTabId}'`, () =>
    tabs.focus(focusedTabId)
  );
  return workspace;
}

async function configureExistingTab(
  tabId: string,
  firstPaneId: string,
  tab: TabConfig,
  cwd: string,
  tabs: LayoutTabs,
  panes: LayoutPanes,
  focusTarget: string,
  options?: LayoutCommandOptions,
  errorPolicy?: LayoutErrorPolicy
): Promise<TabRuntime> {
  await errorPolicy!.ignore(`rename tab '${tab.label}'`, () =>
    tabs.rename(tabId, tab.label)
  );
  return configureTabPanes(
    tabId,
    firstPaneId,
    2,
    tab,
    cwd,
    panes,
    focusTarget,
    options,
    errorPolicy!
  );
}

async function createAndConfigureTab(
  workspaceId: string,
  nextPaneIndex: number,
  tab: TabConfig,
  cwd: string,
  tabs: LayoutTabs,
  panes: LayoutPanes,
  focusTarget: string,
  options?: LayoutCommandOptions,
  errorPolicy?: LayoutErrorPolicy
): Promise<TabRuntime> {
  const tabResult = await errorPolicy!.optional(
    `create tab '${tab.label}'`,
    () =>
      tabs.create({
        workspace_id: workspaceId,
        cwd,
        label: tab.label,
        focus: matchesFocus(
          focusTarget,
          tab,
          `${workspaceId}-${nextPaneIndex}`
        ),
      })
  );

  const tabId = tabResult?.tab_id ?? `${workspaceId}:unknown`;
  return configureTabPanes(
    tabId,
    `${workspaceId}-${nextPaneIndex}`,
    nextPaneIndex + 1,
    tab,
    cwd,
    panes,
    focusTarget,
    options,
    errorPolicy!
  );
}

async function configureTabPanes(
  tabId: string,
  firstPaneId: string,
  nextPaneIndex: number,
  tab: TabConfig,
  cwd: string,
  panes: LayoutPanes,
  focusTarget: string,
  options?: LayoutCommandOptions,
  errorPolicy?: LayoutErrorPolicy
): Promise<TabRuntime> {
  const specs =
    tab.panes.length > 0 ? tab.panes : [{ id: "root", title: "", command: "" }];
  validatePaneSpecs(tab, specs);

  const paneIds = new Map<string, string>();
  let currentPaneId = firstPaneId;

  const rootSpec = specs[0]!;
  if (rootSpec.id) {
    paneIds.set(rootSpec.id, currentPaneId);
  }
  await errorPolicy!.ignore(
    `configure root pane '${rootSpec.title || currentPaneId}'`,
    () => configurePane(currentPaneId, rootSpec, cwd, panes, options)
  );

  for (let index = 1; index < specs.length; index += 1) {
    const spec = specs[index]!;
    const anchorPaneId = spec.from ? paneIds.get(spec.from) : currentPaneId;
    if (!anchorPaneId) {
      throw new Error(
        `Tab '${tab.label}' references unknown pane '${spec.from ?? ""}'.`
      );
    }
    const splitPane = await errorPolicy!.optional(
      `split pane from '${anchorPaneId}'`,
      () =>
        panes.split(anchorPaneId, {
          direction: spec.split ?? "right",
          ratio: spec.ratio,
          cwd,
          focus: matchesFocusTarget(focusTarget, spec),
        })
    );
    const paneId =
      splitPane?.pane_id ?? workspacePaneId(firstPaneId, nextPaneIndex);
    nextPaneIndex += 1;
    if (spec.id) {
      paneIds.set(spec.id, paneId);
    }
    await errorPolicy!.ignore(`configure pane '${spec.title || paneId}'`, () =>
      configurePane(paneId, spec, cwd, panes, options)
    );
    currentPaneId = paneId;
  }

  return { tabId, firstPaneId, nextPaneIndex };
}

async function configurePane(
  paneId: string,
  spec: PaneConfig,
  cwd: string,
  panes: LayoutPanes,
  options?: LayoutCommandOptions
): Promise<void> {
  if (spec.title) {
    await panes.rename(paneId, spec.title);
  }

  const command = buildPaneCommand(spec, cwd, options);
  if (command) {
    await panes.run(paneId, command);
  }
}

function matchesFocus(
  focusTarget: string,
  tab: TabConfig,
  firstPaneId: string
): boolean {
  if (focusTarget === tab.label) return true;
  return tab.panes.some((pane) => matchesFocusTarget(focusTarget, pane));
}

function workspacePaneId(firstPaneId: string, index: number): string {
  return firstPaneId.replace(/-\d+$/, `-${index}`);
}

function validatePaneSpecs(tab: TabConfig, specs: readonly PaneConfig[]): void {
  const seenIds = new Set<string>();
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!;
    if (index === 0) {
      if (spec.from) {
        throw new Error(
          `Tab '${tab.label}' cannot set 'from' on its first pane.`
        );
      }
    } else if (spec.from && !seenIds.has(spec.from)) {
      throw new Error(
        `Tab '${tab.label}' references pane '${spec.from}' before it is defined. List target panes earlier in the same tab.`
      );
    }
    if (spec.id) {
      if (seenIds.has(spec.id)) {
        throw new Error(
          `Tab '${tab.label}' has duplicate pane id '${spec.id}'.`
        );
      }
      seenIds.add(spec.id);
    }
  }
}

function validateCommandOverrideTargets(
  tabs: readonly TabConfig[],
  options?: LayoutCommandOptions
): void {
  if (!options?.commandOverride) {
    return;
  }

  const targets = tabs.flatMap((tab) =>
    tab.panes
      .filter((pane) => pane.accept_command_override)
      .map((pane) => `${tab.label}/${pane.id ?? (pane.title || "unnamed")}`)
  );

  if (targets.length === 0) {
    throw new Error(
      "Worktree command override was provided, but no pane declares 'accept_command_override = true'."
    );
  }

  if (targets.length > 1) {
    throw new Error(
      `Worktree command override requires exactly one pane target, but found ${targets.length}: ${targets.join(", ")}`
    );
  }
}

function matchesFocusTarget(focusTarget: string, pane: PaneConfig): boolean {
  return pane.title === focusTarget || pane.id === focusTarget;
}
