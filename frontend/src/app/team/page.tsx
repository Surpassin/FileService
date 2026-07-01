'use client';

import { useState, useEffect } from 'react';
import { Team, TeamMember } from '@/types';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';

export default function TeamPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const data = await api.getTeams();
      setTeams(data.teams || []);
      if (data.teams?.length > 0 && !selectedTeam) {
        selectTeam(data.teams[0]);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectTeam = async (team: Team) => {
    setSelectedTeam(team);
    try {
      const data = await api.getTeamMembers(team.id);
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setIsCreating(true);
    setError('');
    try {
      const data = await api.createTeam(teamName.trim());
      setTeams((prev) => [...prev, data.team]);
      selectTeam(data.team);
      setTeamName('');
      setShowCreateTeam(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedTeam) return;
    setIsInviting(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.inviteTeamMember(selectedTeam.id, inviteEmail.trim(), inviteRole);
      setMembers((prev) => [...prev, data.member]);
      setInviteEmail('');
      setSuccess(`${data.member.name} has been added to the team`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to invite member');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!selectedTeam) return;
    try {
      await api.removeTeamMember(selectedTeam.id, member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
      setTimeout(() => setError(''), 5000);
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

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Team Management</h1>
            <p className="text-surface-500 mt-1">Manage your teams and invite members to share agents</p>
          </div>
          <button onClick={() => setShowCreateTeam(true)} className="btn-primary">
            + Create Team
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
            {success}
          </div>
        )}

        {showCreateTeam && (
          <div className="mb-6 p-5 bg-dark-2 border border-dark-4 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-3">Create a New Team</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name (e.g. Omnii Marketing)"
                className="input-field flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
              />
              <button onClick={handleCreateTeam} disabled={isCreating} className="btn-primary">
                {isCreating ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setShowCreateTeam(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {teams.length === 0 && !showCreateTeam ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-surface-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <h3 className="text-lg font-medium text-surface-300 mb-2">No teams yet</h3>
            <p className="text-surface-500 mb-4">Create a team to share agents with your colleagues.</p>
            <button onClick={() => setShowCreateTeam(true)} className="btn-primary">
              Create Your First Team
            </button>
          </div>
        ) : teams.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Team list */}
            <div className="space-y-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => selectTeam(team)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    selectedTeam?.id === team.id
                      ? 'bg-omnii-600/10 border-omnii-600/30 text-white'
                      : 'bg-dark-2 border-dark-4 text-surface-300 hover:border-dark-5'
                  }`}
                >
                  <div className="font-medium">{team.name}</div>
                  <div className="text-xs text-surface-500 mt-1">
                    {team.member_count} member{team.member_count !== 1 ? 's' : ''} · {team.member_role}
                  </div>
                </button>
              ))}
            </div>

            {/* Members panel */}
            {selectedTeam && (
              <div className="lg:col-span-2">
                <div className="bg-dark-2 border border-dark-4 rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-white mb-4">{selectedTeam.name} — Members</h3>

                  {/* Invite form */}
                  {selectedTeam.member_role === 'admin' && (
                    <div className="mb-5 p-4 bg-dark-3 rounded-lg">
                      <h4 className="text-sm font-medium text-surface-300 mb-2">Invite a team member</h4>
                      <p className="text-xs text-surface-500 mb-3">
                        They must have a registered account first. Share this link for them to sign up:
                        <br />
                        <span className="text-omnii-400 select-all">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/register
                        </span>
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Enter their email address"
                          className="input-field flex-1"
                          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="input-field w-28"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button onClick={handleInvite} disabled={isInviting} className="btn-primary">
                          {isInviting ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Members list */}
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-dark-3 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-omnii-600/20 flex items-center justify-center text-omnii-400 text-sm font-medium">
                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-surface-200">{member.name}</div>
                            <div className="text-xs text-surface-500">{member.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            member.role === 'admin'
                              ? 'bg-omnii-600/15 text-omnii-400'
                              : 'bg-dark-4 text-surface-400'
                          }`}>
                            {member.role}
                          </span>
                          {selectedTeam.member_role === 'admin' && member.role !== 'admin' && (
                            <button
                              onClick={() => handleRemoveMember(member)}
                              className="text-surface-600 hover:text-red-400 transition-colors"
                              title="Remove member"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
