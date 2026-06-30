'use client';

import Link from 'next/link';
import { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
}

export default function AgentCard({ agent }: AgentCardProps) {
  const statusClass =
    agent.status === 'active'
      ? 'badge-success'
      : agent.status === 'error'
      ? 'badge-error'
      : 'badge-neutral';

  return (
    <Link href={`/agents/${agent.id}`} className="block group">
      <div className="card hover:border-dark-5 group-hover:border-omnii-600/30 transition-colors duration-200">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-white group-hover:text-omnii-400 transition-colors">
            {agent.name}
          </h3>
          <span className={statusClass}>{agent.status}</span>
        </div>

        <p className="text-sm text-surface-500 mb-4 line-clamp-2">
          {agent.description || 'No description'}
        </p>

        <div className="flex items-center gap-3">
          <span className="badge-info">{agent.model || 'claude-sonnet-4-6'}</span>
          {agent.message_count !== undefined && (
            <span className="text-xs text-surface-600">
              {agent.message_count} messages
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
