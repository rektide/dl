// pattern: Functional Core

import { OFF, type ActionOverride, type ActionSpec, type ActionToken, type Args } from "./types.ts";

type CreateArgsOptions = Readonly<{
  specs: ReadonlyArray<ActionSpec>;
  values: Record<string, unknown>;
  explicit: Record<string, boolean | undefined>;
  tokens: ReadonlyArray<ActionToken>;
  actionOverride?: ActionOverride;
}>;

function stateOptionName(spec: ActionSpec): string {
  return `${spec.name}-state`;
}

function validState(spec: ActionSpec, value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!spec.states.includes(value)) return null;
  return value;
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

function hasExplicitAction(
  specs: ReadonlyArray<ActionSpec>,
  explicit: Record<string, boolean | undefined>,
  inlineStates: Readonly<Record<string, string>>,
): boolean {
  return specs.some((spec) => {
    return (
      explicit[spec.name] === true ||
      explicit[stateOptionName(spec)] === true ||
      inlineStates[spec.name] !== undefined
    );
  });
}

function resolveActionState(
  spec: ActionSpec,
  options: CreateArgsOptions,
  inlineStates: Readonly<Record<string, string>>,
  shouldRunDefaultActions: boolean,
  hasAnyExplicitAction: boolean,
): string {
  if (options.actionOverride) {
    return options.actionOverride.name === spec.name ? options.actionOverride.state : OFF;
  }

  if (!shouldRunDefaultActions && !hasAnyExplicitAction) return OFF;

  const inlineState = inlineStates[spec.name];
  const hasStateFlag =
    options.explicit[stateOptionName(spec)] === true || inlineState !== undefined;
  if (hasStateFlag)
    return (
      inlineState ?? validState(spec, options.values[stateOptionName(spec)]) ?? spec.defaultState
    );

  if (options.explicit[spec.name] === true) return spec.defaultState;
  if (hasAnyExplicitAction) return OFF;
  return spec.defaultState;
}

export function createArgs(options: CreateArgsOptions): Args {
  const inlineStates = extractInlineActionStates(options.specs, options.tokens);
  const hasAnyExplicitAction = hasExplicitAction(options.specs, options.explicit, inlineStates);
  const hasCandidateView = options.values.candidates === true;
  const hasVerifiedView = options.values.verified === true;
  const shouldRunDefaultActions = !hasCandidateView && !hasVerifiedView;
  const stateByAction = new Map<string, string>();

  for (const spec of options.specs) {
    stateByAction.set(
      spec.name,
      resolveActionState(
        spec,
        options,
        inlineStates,
        shouldRunDefaultActions,
        hasAnyExplicitAction,
      ),
    );
  }

  return {
    value: (name) => options.values[name],
    explicit: (name) => options.explicit[name] === true,
    inlineValue: (name) => inlineStates[name] ?? null,
    actionState: (spec) => stateByAction.get(spec.name) ?? OFF,
    hasActionIntent: () =>
      options.actionOverride !== undefined || hasAnyExplicitAction || shouldRunDefaultActions,
    hasViewIntent: () => hasCandidateView || hasVerifiedView,
  };
}
