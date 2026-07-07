import { Mcp } from "@opencode-ai/schema/mcp"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { McpServerNotFoundError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const McpGroup = HttpApiGroup.make("server.mcp")
  .add(
    HttpApiEndpoint.get("mcp.list", "/api/mcp", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Mcp.Server)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.list",
          summary: "List MCP servers",
          description: "Retrieve configured MCP servers and their connection status.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("mcp.resource.catalog", "/api/mcp/resource", {
      query: LocationQuery,
      success: Location.response(Mcp.ResourceCatalog),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.resource.catalog",
          summary: "List MCP resources",
          description: "Retrieve resources and resource templates from connected MCP servers.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.resource.read", "/api/mcp/resource/read", {
      query: LocationQuery,
      payload: Schema.Struct({ server: Schema.String, uri: Schema.String }),
      success: Location.response(Schema.NullOr(Mcp.ResourceContent)),
      error: McpServerNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.resource.read",
          summary: "Read MCP resource",
          description: "Read the current content of one resource from a connected MCP server.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "mcp", description: "MCP server and resource routes." }))
