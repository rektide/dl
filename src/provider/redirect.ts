// pattern: Imperative Shell

import { cleanRepoUrl, type CleanUrlOptions, ALL_CLEAN } from "../repo/clean-url.ts";
import { FLOW_INPUT_ORIGIN, type Repo } from "../flow/types.ts";
import type { Provider, ProviderRuntime } from "./types.ts";

export abstract class RedirectProvider implements Provider {
  abstract name: string;
  abstract hosts: ReadonlyArray<string>;

  abstract extractIdentifier(input: string): string | undefined;
  abstract fetchRepoUrl(identifier: string, signal: AbortSignal): Promise<string | undefined>;

  protected cleanRawUrl(raw: string, _options: CleanUrlOptions = ALL_CLEAN): string {
    return raw;
  }

  async *candidates(input: string, runtime: ProviderRuntime): AsyncGenerator<Repo> {
    const identifier = this.extractIdentifier(input);
    if (!identifier) return;

    const signal = AbortSignal.timeout(8_000);
    const raw = await this.fetchRepoUrl(identifier, signal).catch(() => undefined);
    if (!raw) return;

    const cleaned = this.cleanRawUrl(raw);
    const parsed = cleanRepoUrl(cleaned);
    if (!parsed) return;

    runtime.push(parsed.toString(), {
      origin: FLOW_INPUT_ORIGIN.redirect,
      fromProvider: this.name,
      fromInput: input,
      fromUrl: parsed.toString(),
    });
    yield* [];
  }

  async verify(_repo: Repo, _signal: AbortSignal): Promise<Repo | null> {
    return null;
  }
}
