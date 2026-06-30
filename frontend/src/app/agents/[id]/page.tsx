'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Agent, Conversation } from '@/types';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import ChatInterface from '@/components/chat/ChatInterface';

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agentData, convData] = await Promise.all([
          api.getAgent(agentId),
          api.getConversations(agentId),
        ]);
        setAgent(agentData.agent);
        setName(agentData.agent.name);
        setDescription(agentData.agent.description || '');
        setSystemPrompt(agentData.agent.system_prompt || '');

        const convs = convData.conversations || [];
        setConversations(convs);
        if (convs.length > 0) {
          setSelectedConversation(convs[0].id);
        }
      } catch (err) {
        console.error('Failed to load agent:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [agentId]);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const result = await api.updateAgent(agentId, {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
      });
      setAgent(result.agent);
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (err) {
      setSaveMessage('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      const result = await api.createConversation(agentId);
      setConversations((prev) => [result.conversation, ...prev]);
      setSelectedConversation(result.conversation.id);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-screen">
          <div className="w-8 h-8 border-2 border-omnii-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!agent) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-surface-300 mb-2">Agent not found</h2>
            <button onClick={() => router.push('/agents')} className="btn-primary">
              Back to Agents
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-screen">
        {/* Left: Agent Config */}
        <div className="w-80 border-r border-dark-4 flex flex-col bg-dark-1 overflow-y-auto">
          <div className="p-5 border-b border-dark-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-white">Agent Config</h2>
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
            </div>
            <p className="text-xs text-surface-600">{agent.model}</p>
          </div>

          <div className="p-5 space-y-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="input-field min-h-[200px] resize-y"
                rows={8}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              {saveMessage && (
                <span className={`text-sm ${saveMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
                  {saveMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat Interface */}
        <div className="flex-1 flex flex-col">
          {/* Conversation selector */}
          <div className="p-4 border-b border-dark-4 flex items-center gap-3 bg-dark-1">
            <select
              value={selectedConversation}
              onChange={(e) => setSelectedConversation(e.target.value)}
              className="input-field flex-1 max-w-xs"
            >
              <option value="" disabled>
                Select a conversation
              </option>
              {conversations.map((conv) => (
                <option key={conv.id} value={conv.id}>
                  {conv.title || `Conversation ${conv.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
            <button onClick={handleNewConversation} className="btn-secondary">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Chat */}
          {selectedConversation ? (
            <ChatInterface
              key={selectedConversation}
              conversationId={selectedConversation}
              agentId={agentId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-surface-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <h3 className="text-lg font-medium text-surface-300 mb-2">No conversation selected</h3>
                <p className="text-surface-500 mb-4">Select an existing conversation or start a new one.</p>
                <button onClick={handleNewConversation} className="btn-primary">
                  Start New Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
