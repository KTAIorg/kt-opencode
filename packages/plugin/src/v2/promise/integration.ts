import type { IntegrationApi } from "@opencode-ai/client/promise/api"
import type { IntegrationMethodRegistration } from "../effect/integration.js"
import type { CredentialValue } from "@opencode-ai/sdk/v2/types"
import type { Search } from "@opencode-ai/schema/search"
import type { TransformHook } from "./registration.js"

export type { IntegrationMethodRegistration }

export interface IntegrationSearchCapabilityRegistration {
  readonly integrationID: string
  readonly capability: {
    readonly type: "search"
    readonly connection: "optional" | "required"
  }
  readonly execute: (
    input: Search.Input,
    context: { readonly credential?: CredentialValue; readonly sessionID?: string; readonly signal: AbortSignal },
  ) => Promise<Search.ProviderOutput>
}

export interface IntegrationDraft extends Omit<import("../effect/integration.js").IntegrationDraft, "capability"> {
  readonly capability: {
    readonly search: {
      list(): readonly IntegrationSearchCapabilityRegistration[]
      update(input: IntegrationSearchCapabilityRegistration): void
      remove(integrationID: string): void
    }
  }
}

export interface IntegrationHooks extends IntegrationApi {
  readonly transform: TransformHook<IntegrationDraft>
  readonly reload: () => Promise<void>
  readonly connection: {
    readonly active: (integrationID: string) => Promise<import("@opencode-ai/sdk/v2/types").ConnectionInfo | undefined>
    readonly resolve: (
      connection: import("@opencode-ai/sdk/v2/types").ConnectionInfo,
    ) => Promise<CredentialValue | undefined>
  }
}
