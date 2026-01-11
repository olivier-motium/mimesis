/**
 * ProjectNavigator - Left Sidebar
 *
 * Shows projects grouped by repo, with agents as clickable entries.
 * Each agent entry acts as a "tab" - clicking it selects that agent.
 */

import { useMemo } from "react";
import { ProjectGroup } from "./ProjectGroup";
import type { ProjectNavigatorProps, ProjectWithSessions } from "./types";

export function ProjectNavigator({
  sessions,
  selectedSessionId,
  onSelectSession,
}: ProjectNavigatorProps) {
  // Group sessions by project (gitRepoId or cwd)
  const projects = useMemo(() => {
    const projectMap = new Map<string, ProjectWithSessions>();

    for (const session of sessions) {
      // Use gitRepoId if available, otherwise extract project name from cwd
      const projectPath = session.gitRepoId || session.cwd;
      const projectName = projectPath.split("/").pop() || projectPath;

      const existing = projectMap.get(projectPath);
      if (existing) {
        existing.sessions.push(session);
      } else {
        projectMap.set(projectPath, {
          projectName,
          projectPath,
          sessions: [session],
        });
      }
    }

    // Sort projects by name, then sort sessions within each project by activity
    const sortedProjects = Array.from(projectMap.values()).sort((a, b) =>
      a.projectName.localeCompare(b.projectName)
    );

    for (const project of sortedProjects) {
      project.sessions.sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime()
      );
    }

    return sortedProjects;
  }, [sessions]);

  return (
    <nav className="project-navigator">
      <div className="project-navigator__content">
        {projects.length === 0 ? (
          <div className="project-navigator__empty">
            No active agents
          </div>
        ) : (
          projects.map((project) => (
            <ProjectGroup
              key={project.projectPath}
              projectName={project.projectName}
              sessions={project.sessions}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              defaultExpanded={true}
            />
          ))
        )}
      </div>
    </nav>
  );
}
