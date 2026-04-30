import type { FlowInput, FlowInputMetadata, Repo } from "../flow/types.ts";

export type ProviderRuntimeShape = {
  push(input: FlowInput, metadata?: FlowInputMetadata): void;
};

export type ProviderRuntime = Readonly<ProviderRuntimeShape>;

export type ProviderCandidates = (input: string, runtime: ProviderRuntime) => AsyncGenerator<Repo>;

export type ProviderVerify = (repo: Repo, signal: AbortSignal) => Promise<Repo | null>;

export type ProviderShape = {
  name: string;
  hosts: ReadonlyArray<string>;
  candidates: ProviderCandidates;
  verify: ProviderVerify;
};

export type Provider = Readonly<ProviderShape>;

export const PROVIDER_LOOKUP_MODE = {
  candidate: "candidate",
  verify: "verify",
} as const;

export type ProviderLookupMode = (typeof PROVIDER_LOOKUP_MODE)[keyof typeof PROVIDER_LOOKUP_MODE];

export type ProviderLookupOptionsShape = {
  mode: ProviderLookupMode;
  repo: Repo | null;
};

export type ProviderLookupOptions = Readonly<ProviderLookupOptionsShape>;

export type ProviderLookup = (
  input: string,
  options?: ProviderLookupOptions,
) => ReadonlyArray<Provider>;

export type ProviderRegistryShape = {
  providers: ReadonlyArray<Provider>;
  byName: ReadonlyMap<string, Provider>;
  register(provider: Provider): void;
  lookup: ProviderLookup;
};

export type ProviderRegistry = Readonly<ProviderRegistryShape>;
