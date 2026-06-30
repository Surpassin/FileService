'use client';

import { useState, useEffect } from 'react';
import { Agent } from '@/types';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import AgentCard from '@/components/agents/AgentCard';
import CreateAgentModal from '@/components/agents/CreateAgentModal';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchAgents = () => {
    setIsLoading(true);
    api
      .getAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCreateAgent = async (data: {
    name: string;
    description: string;
    system_prompt: string;
    model: string;
  }) => {
    const result = await api.createAgent(data);
    setAgents((prev) => [...prev, result.agent]);
  };

  const handleEditAgent = async (data: {
    name: string;
    description: string;
    system_prompt: string;
    model: string;
  }) => {
    if (!editAgent) return;
    const result = await api.updateAgent(editAgent.id, data);
    setAgents((prev) =>
      prev.map((a) => (a.id === editAgent.id ? result.agent : a))
    );
    setEditAgent(null);
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      await api.deleteAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  return (
    <AppShell>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Agents</h1>
            <p className="text-surface-500">Create, configure, and manage your AI agents</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Agent
          </button>
        </div>

        {/* Agent List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-omnii-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="card text-center py-16">
            <svg className="w-12 h-12 mx-auto text-surface-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h3 className="text-lg font-medium text-surface-300 mb-2">No agents yet</h3>
            <p className="text-surface-500 mb-4">Create your first AI agent to get started.</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              Create Agent
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => (
              <div key={agent.id} className="card flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <span
                      className={
                        agent.status === 'active'
                          ? 'badge-success'
                          : agent.status === 'error'
                          ? 'badge-error'
                          : 'badge-neutral'
                      }
                    >
                      {agent.status}
                    </span>
                    <span className="badge-info">{agent.model || 'claude-sonnet-4-6'}</span>
                  </div>
                  <p className="text-sm text-surface-500">
                    {agent.description || 'No description'}
                  </p>
                  <p className="text-xs text-surface-600 mt-1">
                    Last updated: {new Date(agent.updated_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/agents/${agent.id}`}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Open
                  </a>
                  <button
                    onClick={() => setEditAgent(agent)}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Edit
                  </button>
                  {deleteConfirm === agent.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteAgent(agent.id)}
                        className="btn-danger text-xs px-3 py-1.5"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(agent.id)}
                      className="btn-danger text-xs px-3 py-1.5"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateAgent}
      />

      {/* Edit Modal */}
      {editAgent && (
        <CreateAgentModal
          isOpen={true}
          onClose={() => setEditAgent(null)}
          onSubmit={handleEditAgent}
          initialData={editAgent}
          title="Edit Agent"
        />
      )}
    </AppShell>
  );
}
