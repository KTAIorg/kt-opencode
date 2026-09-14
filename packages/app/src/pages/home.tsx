import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Show } from "solid-js"
import { HomeComposer } from "./home/home-composer"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeUtilityNav } from "./home/home-projects-view"
import { HomeProjects } from "./home/home-projects"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { HomeSessions } from "./home/home-sessions"

export function Home() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home)
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)
  return (
    <div
      class={`
        m-2 flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="min-h-0 flex-1 [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack()}
        thumbHoverTarget={scroll.viewport.hoverTarget()}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        <div
          class={`
            mx-auto grid min-h-full w-full max-w-[1080px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-3
            lg:grid-cols-[280px_minmax(0,720px)] lg:grid-rows-1 lg:gap-8 lg:px-6
          `}
        >
          <HomeProjects projects={projects} scroll={scroll} />
          <HomeSessions
            sessions={sessions}
            search={search}
            scroll={scroll}
            onAddProject={
              projects.project.list().length === 0
                ? () => {
                    const conn = home.server.focused()
                    if (conn) projects.project.choose(conn)
                  }
                : undefined
            }
          />
          <HomeUtilityNav
            class="flex lg:hidden"
            onOpenSettings={projects.utility.settings}
            onOpenHelp={projects.utility.help}
            language={projects.copy.language}
          />
        </div>
      </ScrollView>
      <Show when={home.server.focused()} keyed>
        {(conn) => (
          <Show when={home.project.newSession()?.worktree} keyed>
            {(directory) => (
              <div
                class={`
                  mx-auto grid w-full max-w-[1080px] shrink-0 grid-cols-1 gap-4 px-3 pb-4
                  lg:grid-cols-[280px_minmax(0,720px)] lg:gap-8 lg:px-6 lg:pb-6
                `}
              >
                <div class="lg:col-start-2">
                  <HomeComposer conn={conn} directory={directory} />
                </div>
              </div>
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}
