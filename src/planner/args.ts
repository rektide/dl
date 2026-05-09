// pattern: Functional Core

import { OFF, type ActionSpec, type ActionToken, type Args, type SubcommandSelection } from "./types.ts";
import { createInvocationIntent } from "./intent.ts";

type CreateArgsOptions = Readonly<{
  specs: ReadonlyArray<ActionSpec>;
  values: Record<string, unknown>;
  explicit: Record<string, boolean | undefined>;
  tokens: ReadonlyArray<ActionToken>;
  subcommand?: SubcommandSelection;
}>;

export function createArgs(options: CreateArgsOptions): Args {
  const intent = createInvocationIntent({
    specs: options.specs,
    values: options.values,
    explicit: options.explicit,
    tokens: options.tokens,
    subcommand: options.subcommand,
  });

  return {
    intent,
    value: (name) => options.values[name],
    explicit: (name) => options.explicit[name] === true,
    inlineValue: (name) => {
      for (const token of options.tokens) {
        if (token.kind === "option" && token.name === name && token.inlineValue) {
          return token.value ?? null;
        }
      }
      return null;
    },
  };
}
