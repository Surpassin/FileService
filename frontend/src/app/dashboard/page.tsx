'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Agent } from '@/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import AppShell from '@/components/layout/AppShell';
import AgentCard from '@/components/agents/AgentCard';
import CreateAgentModal from '@/components/agents/CreateAgentModal';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    api
      .getAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
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

  return (
    <AppShell>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back, {user?.name || 'User'}
          </h1>
          <p className="text-surface-500">
            Manage your AI agents and conversations
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-surface-200">Your Agents</h2>
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

        {/* Agent Grid */}
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
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateAgent}
      />
    </AppShell>
  );
}
