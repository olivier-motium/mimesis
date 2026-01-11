import { createRootRoute, Outlet } from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { ErrorBoundary } from "../components/ErrorBoundary";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ErrorBoundary>
      <div className="dark min-h-screen bg-background text-foreground">
        <Outlet />
        {/* <TanStackRouterDevtools /> */}
      </div>
    </ErrorBoundary>
  );
}
