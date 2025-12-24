'use client';

import { useEffect, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingSpinner, ErrorMessage } from '@/components/ApiStatus';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';

export default function SemanticLedgerPage() {
  const router = useRouter();
  const resetCanvas = useCanvasStore((state) => state.resetToSingleConversation);
  const { projects, loading, error, initialized, fetchProjects, addProject, deleteProject } =
    useProjectStore();

  // Fetch projects on mount
  useEffect(() => {
    if (!initialized) {
      fetchProjects();
    }
  }, [initialized, fetchProjects]);

  const handleCreateProject = async () => {
    const name = window.prompt('Name this project', `Project ${projects.length + 1}`);
    if (name === null) {
      return;
    }
    const project = await addProject(name);
    resetCanvas();
    router.push(`/project/${project.id}`);
  };

  const handleDeleteProject = async (event: MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();

    const project = projects.find((p) => p.id === id);
    const projectName = project?.name || 'this project';

    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete "${projectName}"?\n\nThis will permanently delete all associated conversations, turns, commits, and other data.`
    );

    if (!confirmed) {
      return;
    }

    await deleteProject(id);
  };

  if (loading && !initialized) {
    return (
      <div className="projects-page">
        <LoadingSpinner message="Loading projects..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="projects-page">
        <ErrorMessage error={error} onRetry={fetchProjects} />
      </div>
    );
  }

  return (
    <div className="projects-page">
      <header className="projects-page__header">
        <h1>Projects</h1>
        <button className="primary-btn" onClick={handleCreateProject}>
          + New Project
        </button>
      </header>

      <div className="projects-list">
        {projects.length === 0 && (
          <div className="projects-list__empty">
            <p>No projects yet.</p>
            <p>Create one to start mapping conversations and drafts.</p>
          </div>
        )}
        {projects.map((project) => (
          <Link key={project.id} href={`/project/${project.id}`} className="project-row">
            <div className="project-row__main">
              <strong className="project-row__name">{project.name}</strong>
              <p className="project-row__desc">{project.description}</p>
            </div>
            <div className="project-row__meta">
              <span className="project-row__stats">
                {project.nodes} turns · {project.drafts} conversations
              </span>
              <span className={`project-row__status project-row__status--${project.status}`}>
                {project.status}
              </span>
              <span className="project-row__time">{project.updatedAt}</span>
            </div>
            <button
              className="project-row__delete"
              onClick={(event) => handleDeleteProject(event, project.id)}
              aria-label={`Delete ${project.name}`}
            >
              ×
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
