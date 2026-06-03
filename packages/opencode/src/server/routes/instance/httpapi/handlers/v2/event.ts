import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Effect, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { InstanceHttpApi } from "../../api"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

export const eventHandlers = HttpApiBuilder.group(InstanceHttpApi, "v2.event", (handlers) =>
  handlers.handleRaw("events", () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const location = yield* Location.Service
      const connected = {
        id: EventV2.ID.create(),
        type: "server.connected",
        location: new Location.Info({
          directory: location.directory,
          workspaceID: location.workspaceID,
          project: location.project,
        }),
        data: {},
      }
      return HttpServerResponse.stream(
        Stream.make(connected).pipe(
          Stream.concat(
            events.all().pipe(
              Stream.filter(
                (event) =>
                  event.location?.directory === location.directory &&
                  event.location.workspaceID === location.workspaceID,
              ),
            ),
          ),
          Stream.map(eventData),
          Stream.pipeThroughChannel(Sse.encode()),
          Stream.encodeText,
        ),
        {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          },
        },
      )
    }),
  ),
)
