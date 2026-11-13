import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore.js';
import {
  ROLE_OPTIONS,
  listTreeMembers,
  listTreeInvitations,
  createInvitation,
  revokeInvitation,
  invitationLink,
  updateMemberRole,
  removeMember,
} from '../../lib/db/invitations.js';

const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  revoked: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  expired: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
};

/** Onglet Paramètres → Membres & invitations. Réservé aux administrateurs (voir SettingsPage.jsx). */
export default function MembersPanel() {
  const { t } = useTranslation();
  const { currentTreeId, user } = useAuthStore();

  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('guest');
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [m, inv] = await Promise.all([listTreeMembers(currentTreeId), listTreeInvitations(currentTreeId)]);
      setMembers(m);
      setInvitations(inv.filter((i) => i.status === 'pending' || i.status === 'expired'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentTreeId) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTreeId]);

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setLastInviteLink(null);
    try {
      const created = await createInvitation(currentTreeId, inviteEmail, inviteRole);
      setLastInviteLink(invitationLink(created.token));
      setInviteEmail('');
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy(link, id) {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  }

  async function handleRevoke(id) {
    await revokeInvitation(id);
    await reload();
  }

  async function handleRoleChange(userId, role) {
    await updateMemberRole(currentTreeId, userId, role);
    await reload();
  }

  async function handleRemove(userId) {
    if (!window.confirm(t('members.removeConfirm', 'Retirer ce membre de l\'arbre ?'))) return;
    await removeMember(currentTreeId, userId);
    await reload();
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {/* Invitation */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">{t('settings.members.inviteTitle')}</h2>
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label className="mb-1 block text-xs text-neutral-500">{t('settings.members.emailLabel')}</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="prenom.nom@email.com"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">{t('settings.members.roleLabel')}</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={inviting} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
            {inviting ? '…' : t('settings.members.sendInvite')}
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-400">{t('settings.members.noEmailSending')}</p>

        {lastInviteLink && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-800">
            <code className="flex-1 truncate">{lastInviteLink}</code>
            <button onClick={() => handleCopy(lastInviteLink, 'last')} className="rounded bg-accent-600 px-2 py-1 font-medium text-white hover:bg-accent-700">
              {copiedId === 'last' ? t('common.copied') : t('settings.members.copyLink')}
            </button>
          </div>
        )}
      </section>

      {/* Invitations en attente */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">{t('settings.members.pendingInvites')}</h2>
        {loading ? (
          <p className="text-xs text-neutral-400">{t('common.loading')}</p>
        ) : invitations.length === 0 ? (
          <p className="text-xs text-neutral-400">{t('settings.members.noPending')}</p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm dark:border-neutral-800">
                <span className="flex-1 truncate">{inv.email}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {ROLE_OPTIONS.find((r) => r.value === inv.role)?.label || inv.role}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status]}`}>
                  {t(`settings.members.status.${inv.status}`)}
                </span>
                <button onClick={() => handleCopy(invitationLink(inv.token), inv.id)} className="text-xs text-accent-600 hover:underline">
                  {copiedId === inv.id ? t('common.copied') : t('settings.members.copyLink')}
                </button>
                {inv.status === 'pending' && (
                  <button onClick={() => handleRevoke(inv.id)} className="text-xs text-red-600 hover:underline">
                    {t('settings.members.revoke')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Membres actuels */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">{t('settings.members.title')}</h2>
        {loading ? (
          <p className="text-xs text-neutral-400">{t('common.loading')}</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-neutral-400">{t('settings.members.noMembers')}</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => {
              const isSelf = m.userId === user?.id;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm dark:border-neutral-800">
                  <span className="flex-1 truncate">
                    {m.email || m.userId}
                    {isSelf && <span className="ml-1 text-xs text-neutral-400">{t('settings.members.you')}</span>}
                  </span>
                  {isSelf ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {ROLE_OPTIONS.find((r) => r.value === m.role)?.label || m.role}
                    </span>
                  ) : (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                        className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <button onClick={() => handleRemove(m.userId)} className="text-xs text-red-600 hover:underline">
                        {t('settings.members.remove')}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
