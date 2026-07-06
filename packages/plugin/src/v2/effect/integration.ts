import type {
  ConnectionInfo,
  CredentialOAuth,
  CredentialValue,
  IntegrationEnvMethod,
  IntegrationInputs,
  IntegrationKeyMethod,
  IntegrationMethod,
  IntegrationOAuthMethod,
  IntegrationRef,
} from "@opencode-ai/sdk/v2/types"
import type { IntegrationApi } from "@opencode-ai/client/effect/api"
import type { Search } from "@opencode-ai/schema/search"
import type { Effect, Scope } from "effect"
import type { TransformHook } from "./registration.js"

export type IntegrationOAuthAuthorization = {
  readonly url: string
  readonly instructions: string
} & (
  | {
      readonly mode: "auto"
      readonly callback: Effect.Effect<CredentialOAuth, unknown>
    }
  | {
      readonly mode: "code"
      readonly callback: (code: string) => Effect.Effect<CredentialOAuth, unknown>
    }
)
export type IntegrationOAuthMethodRegistration = {
  readonly integrationID: string
  readonly method: IntegrationOAuthMethod
  readonly authorize: (inputs: IntegrationInputs) => Effect.Effect<IntegrationOAuthAuthorization, unknown, Scope.Scope>
  readonly refresh?: (credential: CredentialOAuth) => Effect.Effect<CredentialOAuth, unknown>
  readonly label?: (credential: CredentialOAuth) => string | undefined
}
export type IntegrationMethodRegistration =
  | IntegrationOAuthMethodRegistration
  | {
      readonly integrationID: string
      readonly method: IntegrationKeyMethod
    }
  | {
      readonly integrationID: string
      readonly method: IntegrationEnvMethod
    }

export interface IntegrationSearchCapabilityRegistration {
  readonly integrationID: string
  readonly capability: {
    readonly type: "search"
    readonly connection: "optional" | "required"
  }
  readonly execute: (
    input: Search.Input,
    context: { readonly credential?: CredentialValue; readonly sessionID?: string },
  ) => Effect.Effect<Search.ProviderOutput, unknown>
}

export interface IntegrationDraft {
  list(): readonly IntegrationRef[]
  get(id: string): IntegrationRef | undefined
  update(id: string, update: (integration: IntegrationRef) => void): void
  remove(id: string): void
  readonly method: {
    list(integrationID: string): readonly IntegrationMethod[]
    update(input: IntegrationMethodRegistration): void
    remove(integrationID: string, method: IntegrationMethod): void
  }
  readonly capability: {
    readonly search: {
      list(): readonly IntegrationSearchCapabilityRegistration[]
      update(input: IntegrationSearchCapabilityRegistration): void
      remove(integrationID: string): void
    }
  }
}

export interface IntegrationHooks extends IntegrationApi<unknown> {
  readonly transform: TransformHook<IntegrationDraft>
  readonly reload: () => Effect.Effect<void>
  readonly connection: {
    readonly active: (integrationID: string) => Effect.Effect<ConnectionInfo | undefined>
    readonly resolve: (connection: ConnectionInfo) => Effect.Effect<CredentialValue | undefined, unknown>
  }
}
