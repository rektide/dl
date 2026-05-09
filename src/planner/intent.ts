// pattern: Functional Core

import { OFF, type ActionSpec, type ActionToken, type InvocationIntent, type SubcommandSelection } from "./types.ts";

type CreateInvocationIntentOptions = Readonly<{
  specs: ReadonlyArray<ActionSpec>;
  values: Record<string, unknown>;
  explicit: Record<string, boolean | undefined>;
  tokens: ReadonlyArray<ActionToken>;
  subcommand?: SubcommandSelection;
}>;

function stateOptionName(spec: ActionSpec): string {
  return `${spec.name}-state`;
}

function validState(spec: ActionSpec, value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!spec.states.includes(value)) return null;
  return value;
}

function defaultParticipation(spec: ActionSpec): "default" | "explicit-only" {
  return spec.defaultParticipation ?? "default";
}

function suppressesDefaultsWhenExplicit(spec: ActionSpec): boolean {
  return spec.suppressesDefaultsWhenExplicit ?? true;
}

function extractInlineActionStates(
  specs: ReadonlyArray<ActionSpec>,
  tokens: ReadonlyArray<ActionToken>,
): Record<string, string> {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const resolved: Record<string, string> = {};

  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (!token.inlineValue || !token.name) continue;
    const spec = byName.get(token.name);
    if (!spec) continue;

    const inlineState = validState(spec, token.value);
    if (!inlineState) {
      throw new Error(
        `invalid --${spec.name} state '${token.value}' (valid: ${spec.states.join("|")})`,
      );
    }
    resolved[spec.name] = inlineState;
  }

  return resolved;
}

function isExplicit(
  spec: ActionSpec,
  explicit: Readonly<Record<string, boolean | undefined>>,
  inlineStates: Readonly<Record<string, string>>,
): boolean {
  return (
    explicit[spec.name] === true ||
    explicit[stateOptionName(spec)] === true ||
    inlineStates[spec.name] !== undefined
  );
}

function resolveSelected(options: {
  readonly specs: ReadonlyArray<ActionSpec>;
  readonly explicitNames: ReadonlySet<string>;
  readonly suppressedDefaults: boolean;
  readonly subcommand: SubcommandSelection | null;
}): ReadonlySet<string> {
  const selected = new Set<string>();

  for (const spec of options.specs) {
    const isSubcommandSelection = options.subcommand?.name === spec.name;
    if (isSubcommandSelection || options.explicitNames.has(spec.name)) {
      selected.add(spec.name);
      continue;
    }
    if (!options.suppressedDefaults && defaultParticipation(spec) === "default") {
      selected.add(spec.name);
    }
  }

  return selected;
}

function resolveState(options: {
  readonly spec: ActionSpec;
  readonly values: Readonly<Record<string, unknown>>;
  readonly explicit: Readonly<Record<string, boolean | undefined>>;
  readonly inlineStates: Readonly<Record<string, string>>;
  readonly selected: ReadonlySet<string>;
  readonly subcommand: SubcommandSelection | null;
}): string {
  if (options.subcommand?.name === options.spec.name) return options.subcommand.state;
  if (!options.selected.has(options.spec.name)) return OFF;

  const inlineState = options.inlineStates[options.spec.name];
  const hasStateFlag =
    options.explicit[stateOptionName(options.spec)] === true || inlineState !== undefined;
  if (hasStateFlag) {
    return (
      inlineState ??
      validState(options.spec, options.values[stateOptionName(options.spec)]) ??
      options.spec.defaultState
    );
  }

  return options.spec.defaultState;
}

export function createInvocationIntent(options: CreateInvocationIntentOptions): InvocationIntent {
  const inlineStates = extractInlineActionStates(options.specs, options.tokens);
  const explicitNames = new Set(
    options.specs
      .filter((spec) => isExplicit(spec, options.explicit, inlineStates))
      .map((spec) => spec.name),
  );
  const subcommand = options.subcommand ?? null;
  const suppressedDefaults =
    subcommand !== null ||
    options.specs.some(
      (spec) => explicitNames.has(spec.name) && suppressesDefaultsWhenExplicit(spec),
    );
  const selected = resolveSelected({
    specs: options.specs,
    explicitNames,
    suppressedDefaults,
    subcommand,
  });
  const stateByName = new Map<string, string>();

  for (const spec of options.specs) {
    stateByName.set(
      spec.name,
      resolveState({
        spec,
        values: options.values,
        explicit: options.explicit,
        inlineStates,
        selected,
        subcommand,
      }),
    );
  }

  return {
    selected,
    explicit: explicitNames,
    suppressedDefaults,
    subcommand,
    state: (name) => stateByName.get(name) ?? OFF,
    enabled: (name) => (stateByName.get(name) ?? OFF) !== OFF,
  };
}

export function extractInlineValues(
  specs: ReadonlyArray<ActionSpec>,
  tokens: ReadonlyArray<ActionToken>,
): Record<string, string> {
  return extractInlineActionStates(specs, tokens);
}
