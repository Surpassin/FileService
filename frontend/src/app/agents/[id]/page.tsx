'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Agent, Conversation, Team, TeamMember } from '@/types';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import ChatInterface from '@/components/chat/ChatInterface';

interface AccessUser {
  user_id: string;
  name: string;
  email: string;
}

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
  const [isOwner, setIsOwner] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [mondayEnabled, setMondayEnabled] = useState(false);
  const [mondayBoards, setMondayBoards] = useState<string[]>([]);
  const [mondayWriteToDoc, setMondayWriteToDoc] = useState(false);
  const [outlookEnabled, setOutlookEnabled] = useState(false);
  const [powerbiBidEnabled, setPowerbiBidEnabled] = useState(false);
  // Visibility
  const [visibility, setVisibility] = useState<'private' | 'team' | 'selected'>('private');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agentData, convData, meData] = await Promise.all([
          api.getAgent(agentId),
          api.getConversations(agentId),
          api.getMe(),
        ]);
        const ag = agentData.agent;
        setAgent(ag);
        setName(ag.name);
        setDescription(ag.description || '');
        setSystemPrompt(ag.system_prompt || '');
        setVisibility(((ag as any).visibility as any) || 'private');
        setTeamId((ag as any).team_id || '');
        setIsOwner((ag as any).owner_id === meData.user.id);

        try {
          const cfg = JSON.parse((ag as any).config || '{}');
          if (cfg.integrations?.monday) {
            setMondayEnabled(true);
            setMondayBoards(cfg.integrations.monday.boards || []);
            setMondayWriteToDoc(!!cfg.integrations.monday.write_to_doc);
          }
        if (cfg.integrations?.outlook) {
            setOutlookEnabled(true);
          }
        if (cfg.integrations?.powerbi_bid) {
            setPowerbiBidEnabled(true);
          }  
        } catch { /* ignore parse errors */ }

        const convs = convData.conversations || [];
        setConversations(convs);
        if (convs.length > 0) {
          setSelectedConversation(convs[0].id);
        }

        // Load teams and access list for owner
        if ((ag as any).owner_id === meData.user.id) {
          const teamsData = await api.getTeams();
          setTeams(teamsData.teams || []);

          try {
            const accessData = await api.getAgentAccess(agentId);
            setAccessUsers(accessData.access || []);
          } catch { /* ignore if no access yet */ }

          // Load team members for the member picker
          if (teamsData.teams?.length > 0) {
            const firstTeam = (ag as any).team_id || teamsData.teams[0].id;
            try {
              const membersData = await api.getTeamMembers(firstTeam);
              setTeamMembers(
                (membersData.members || []).filter((m: TeamMember) => m.user_id !== meData.user.id)
              );
            } catch { /* ignore */ }
          }
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
      const config: any = {};
      if (mondayEnabled && mondayBoards.length > 0) {
        config.integrations = {
          monday: {
            boards: mondayBoards,
            ...(mondayWriteToDoc ? { write_to_doc: true } : {}),
          },
        };
      }
      if (powerbiBidEnabled) {
        config.integrations = config.integrations || {};
        config.integrations.powerbi_bid = true;
      }
      if (outlookEnabled) {
        config.integrations = config.integrations || {};
        config.integrations.outlook = true;
      } 
      const updateData: any = {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
        config: JSON.stringify(config),
        visibility,
      };

      if (visibility === 'team' && teamId) {
        updateData.team_id = teamId;
      }
      if (visibility === 'selected') {
        updateData.access_user_ids = accessUsers.map((u) => u.user_id);
        if (teamId) updateData.team_id = teamId;
      }
      if (visibility === 'private') {
        updateData.access_user_ids = [];
      }

      const result = await api.updateAgent(agentId, updateData);
      setAgent(result.agent);
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (err) {
      setSaveMessage('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMemberAccess = (member: TeamMember) => {
    setAccessUsers((prev) => {
      const exists = prev.find((u) => u.user_id === member.user_id);
      if (exists) {
        return prev.filter((u) => u.user_id !== member.user_id);
      }
      return [...prev, { user_id: member.user_id, name: member.name, email: member.email }];
    });
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

            <div className="border-t border-dark-4 pt-4">
              <label className="block text-sm font-medium text-surface-300 mb-2">Integrations</label>
              <div className="bg-dark-3 rounded-lg p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mondayEnabled}
                    onChange={(e) => {
                      setMondayEnabled(e.target.checked);
                      if (!e.target.checked) setMondayBoards([]);
                    }}
                    className="w-4 h-4 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                  />
                  <span className="text-sm text-surface-300">Monday.com</span>
                </label>
                {mondayEnabled && (
                  <div className="mt-2 ml-6 space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mondayBoards.includes('olt_actions')}
                        onChange={(e) => {
                          setMondayBoards(prev =>
                            e.target.checked
                              ? [...prev, 'olt_actions']
                              : prev.filter(b => b !== 'olt_actions')
                          );
                        }}
                        className="w-3.5 h-3.5 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                      />
                      <span className="text-xs text-surface-400">OLT Actions Board</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mondayBoards.includes('ceo')}
                        onChange={(e) => {
                          setMondayBoards(prev =>
                            e.target.checked
                              ? [...prev, 'ceo']
                              : prev.filter(b => b !== 'ceo')
                          );
                        }}
                        className="w-3.5 h-3.5 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                      />
                      <span className="text-xs text-surface-400">CEO Board</span>
                    </label>
                    <div className="border-t border-dark-5 mt-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mondayWriteToDoc}
                          onChange={(e) => setMondayWriteToDoc(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                        />
                        <span className="text-xs text-surface-400">Write to OLT Doc</span>
                      </label>
                      {mondayWriteToDoc && (
                        <p className="text-xs text-surface-600 ml-5 mt-1">
                          Agent will write CEO section directly to the OLT meeting doc
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="border-t border-dark-5 mt-3 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={outlookEnabled}
                      onChange={(e) => setOutlookEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                    />
                    <span className="text-sm text-surface-300">Outlook (calendar &amp; email)</span>
                  </label>
                  {outlookEnabled && (
                    <p className="text-xs text-surface-600 ml-6 mt-1">
                      Agent will read your calendar and sent emails from the last week
                    </p>
                  )}
                  <div className="border-t border-dark-5 mt-3 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={powerbiBidEnabled}
                      onChange={(e) => setPowerbiBidEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                    />
                    <span className="text-sm text-surface-300">Power BI (client bid data)</span>
                  </label>
                  {powerbiBidEnabled && (
                    <p className="text-xs text-surface-600 ml-6 mt-1">
                      Agent will look up client conversion and profit data from the Bid Conversion Report
                    </p>
                  )}
                </div>
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="border-t border-dark-4 pt-4">
                <label className="block text-sm font-medium text-surface-300 mb-2">Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="input-field mb-2"
                >
                  <option value="private">Private (only me)</option>
                  {teams.length > 0 && <option value="team">Entire team</option>}
                  {teams.length > 0 && <option value="selected">Selected members</option>}
                </select>

                {visibility === 'team' && teams.length > 0 && (
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="input-field"
                  >
                    <option value="" disabled>Select team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}

                {visibility === 'selected' && (
                  <div className="bg-dark-3 rounded-lg p-3 mt-2 space-y-1">
                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-surface-500">No team members to select. Create a team and invite members first.</p>
                    ) : (
                      teamMembers.map((member) => (
                        <label key={member.user_id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={accessUsers.some((u) => u.user_id === member.user_id)}
                            onChange={() => toggleMemberAccess(member)}
                            className="w-3.5 h-3.5 rounded border-dark-5 text-omnii-500 focus:ring-omnii-500"
                          />
                          <div>
                            <span className="text-xs text-surface-300">{member.name}</span>
                            <span className="text-xs text-surface-600 ml-1">({member.email})</span>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

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
