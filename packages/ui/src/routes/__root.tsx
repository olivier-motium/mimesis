import { createRootRoute, Outlet, useLoaderData } from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { getSessionsDb, resetDbSingleton } from "../data/sessionsDb";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useState } from "react";

interface LoaderData {
  streamError?: string;
}

export const Route = createRootRoute({
  loader: async (): Promise<LoaderData> => {
    try {
      // Initialize db and preload data before any route renders
      await getSessionsDb();
      return {};
    } catch (error) {
      // StreamDB failed to initialize after retries
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ROOT] StreamDB initialization failed:", message);
      return { streamError: message };
    }
  },
  component: RootLayout,
});

function RootLayout() {
  const { streamError } = useLoaderData({ from: "__root__" }) as LoaderData;

  // If StreamDB failed, show error fallback
  if (streamError) {
    return <StreamErrorFallback error={streamError} />;
  }

  return (
    <ErrorBoundary>
      <div className="dark min-h-screen bg-background text-foreground">
        <Outlet />
        {/* <TanStackRouterDevtools /> */}
      </div>
    </ErrorBoundary>
  );
}

/**
 * Fallback UI shown when StreamDB fails to initialize.
 */
function StreamErrorFallback({ error }: { error: string }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // Reset the singleton so it tries fresh
      resetDbSingleton();
      // Reload the page to re-run the loader
      window.location.reload();
    } catch {
      setRetrying(false);
    }
  };

  const isCorruptionError =
    error.toLowerCase().includes("symbol") ||
    error.toLowerCase().includes("utils is undefined") ||
    error.toLowerCase().includes("livequeryinternal");

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="max-w-lg text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-4">
            Stream Connection Error
          </h1>

          <p className="text-muted-foreground mb-4">
            Unable to connect to the session stream.
          </p>

          {isCorruptionError && (
            <p className="text-sm text-muted-foreground mb-6 p-3 bg-muted rounded-md">
              This looks like stream data corruption. The system attempted
              automatic recovery. Click retry to reconnect.
            </p>
          )}

          <p className="text-sm font-mono text-destructive/80 mb-6 p-3 bg-destructive/10 rounded-md break-all">
            {error}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? "Retrying..." : "Retry Connection"}
            </button>

            <p className="text-xs text-muted-foreground">
              Make sure the daemon is running:{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">pnpm serve</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
