import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Theme } from "@radix-ui/themes";
import { getSessionsDb } from "../data/sessionsDb";

export const Route = createRootRoute({
  loader: async () => {
    // Initialize db and preload data before any route renders
    await getSessionsDb();
    return {};
  },
  component: RootLayout,
});

function RootLayout() {
  return (
    <Theme
      accentColor="yellow"
      grayColor="slate"
      radius="medium"
      scaling="100%"
      appearance="dark"
    >
      <Outlet />
      <TanStackRouterDevtools />
    </Theme>
  );
}
