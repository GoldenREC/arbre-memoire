import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore.js';
import {
  invitableRoles,
  memberRoleLabel,
  listTreeMembers,
  listTreeInvitations,
  createInvitation,
  revokeInvitation,
  invitationLink,
  updateMemberRole,
  removeMember,
} from '../../lib/db/invitations.js';
import {
  ownershipConfirmationPhrase,
  SELF_DOWNGRADE_PHRASE,
  listPendingTransfers,
  requestOwnershipTransfer,
  respondOwnershipTransfer,
  cancelOwnershipTransfer,
  selfDowngradeAdmin,
  sendTransferMail,
  fetchTreeOwnerId,
  renameTree,
} from '../../lib/db/ownership.js';

const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  revoked: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  expired: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
};

const inputClass = 'rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900';
const buttonPrimary = 'rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60';
const errorClass = 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300';

/** Onglet Paramètres → Membres. Visible aux admins (propriétaire inclus) ; voir supabase/multi_tree.sql. */
export default function MembersPanel() {
  const { t } = useTranslation();
  const { currentTreeId, user, isOwner, trees, loadTrees, renameLocalTree } = useAuthStore();
  const currentTree = trees.find((tr) => tr.id === currentTreeId);

  const [members, setMembers] = useState([]);
  const [ownerId, setOwnerId] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [treeName, setTreeName] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('guest');
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const [transferTarget, setTransferTarget] = useState('');
  const [transferConfirm, setTransferConfirm] = useState('');
  const [downgradeConfirm, setDowngradeConfirm] = useState('');

  const emailOf = (id) => members.find((m) => m.userId === id)?.email || id;
  const roles = invitableRoles(isOwner);

  async function reload() {
    setLoading(true);
    try {
      const [m, inv, tr, owner] = await Promise.all([
        listTreeMembers(currentTreeId),
        listTreeInvitations(currentTreeId),
        listPendingTransfers(currentTreeId),
        fetchTreeOwnerId(currentTreeId),
      ]);
      setMembers(m);
      setOwnerId(owner);
      setInvitations(inv.filter((i) => i.status === 'pending' || i.status === 'expired'));
      setTransfers(tr);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentTreeId) reload();
    setTreeName(currentTree?.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTreeId]);

  function flash(message) {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  }

  // Tout passe par une même gestion d'erreur : la base renvoie les messages de règle.
  async function guard(fn) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRename(e) {
    e.preventDefault();
    await guard(async () => {
      await renameTree(currentTreeId, treeName);
      renameLocalTree(currentTreeId, treeName.trim());
      flash('Nom de l\'arbre enregistré.');
    });
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setLastInviteLink(null);
    await guard(async () => {
      const created = await createInvitation(currentTreeId, inviteEmail, inviteRole);
      setLastInviteLink(invitationLink(created.token));
      setInviteEmail('');
      await reload();
    });
    setInviting(false);
  }

  async function handleCopy(link, id) {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  }

  async function handleRevoke(id) {
    await guard(async () => { await revokeInvitation(id); await reload(); });
  }

  async function handleRoleChange(userId, role) {
    await guard(async () => { await updateMemberRole(currentTreeId, userId, role); await reload(); });
  }

  async function handleRemove(userId) {
    if (!window.confirm(t('members.removeConfirm', 'Retirer ce membre de l\'arbre ?'))) return;
    await guard(async () => { await removeMember(currentTreeId, userId); await reload(); });
  }

  async function handleRequestTransfer(e) {
    e.preventDefault();
    const target = members.find((m) => m.userId === transferTarget);
    if (!target?.email) return;
    await guard(async () => {
      const id = await requestOwnershipTransfer(currentTreeId, target.email, transferConfirm);
      sendTransferMail(id, 'requested');
      setTransferTarget('');
      setTransferConfirm('');
      await reload();
      flash('Demande envoyée. Rien ne change tant que l\'admin n\'a pas répondu.');
    });
  }

  async function handleRespond(transfer, accept) {
    await guard(async () => {
      await respondOwnershipTransfer(transfer.id, accept);
      sendTransferMail(transfer.id, accept ? 'accepted' : 'refused');
      await loadTrees();
      await reload();
    });
  }

  async function handleCancelTransfer(transfer) {
    await guard(async () => { await cancelOwnershipTransfer(transfer.id); await reload(); });
  }

  async function handleSelfDowngrade(e) {
    e.preventDefault();
    await guard(async () => {
      await selfDowngradeAdmin(currentTreeId, downgradeConfirm);
      await loadTrees();
      flash('Tu es maintenant membre de cet arbre.');
    });
  }

  const myMembership = members.find((m) => m.userId === user?.id);
  const incomingPending = transfers.find((tr) => tr.to_user === user?.id);
  const outgoingPending = transfers.find((tr) => tr.from_user === user?.id);
  const transferCandidates = members.filter((m) => m.role === 'admin' && m.userId !== user?.id);

  return (
    <div className="space-y-8">
      {error && <p className={errorClass}>{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{notice}</p>}

      {/* Nom de l'arbre */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">Nom de l'arbre</h2>
        <form onSubmit={handleRename} className="flex flex-wrap items-end gap-2">
          <input value={treeName} onChange={(e) => setTreeName(e.target.value)} maxLength={120} className={`${inputClass} min-w-[14rem] flex-1`} />
          <button type="submit" disabled={!treeName.trim() || treeName.trim() === currentTree?.name} className={buttonPrimary}>Enregistrer</button>
        </form>
      </section>

      {/* Invitation */}
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">{t('settings.members.inviteTitle')}</h2>
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label className="mb-1 block text-xs text-neutral-500">{t('settings.members.emailLabel')}</label>
            <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="prenom.nom@email.com" className={`${inputClass} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">{t('settings.members.roleLabel')}</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className={inputClass}>
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={inviting} className={buttonPrimary}>
            {inviting ? '…' : t('settings.members.sendInvite')}
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-400">
          {isOwner ? 'Tu peux inviter un admin ou un membre.' : 'Tu peux inviter un membre. Seul le propriétaire nomme un admin.'}
        </p>
        <p className="mt-1 text-xs text-neutral-400">{t('settings.members.noEmailSending')}</p>

        {lastInviteLink && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-800">
            <code className="flex-1 truncate">{lastInviteLink}</code>
            <button onClick={() => handleCopy(lastInviteLink, 'last')} className="rounded bg-accent-600 px-2 py-1 font-medium text-white hover:bg-accent-700">
              {copiedId === 'last' ? t('common.copied') : t('settings.members.copyLink')}
            </button>
          </div>
        )}
      </section>

      {/* Transfert de propriété : demande reçue / envoyée */}
      {incomingPending && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="mb-2 text-sm font-semibold">Demande de transfert de propriété</h2>
          <p className="mb-3 text-sm">
            <span className="font-medium">{emailOf(incomingPending.from_user)}</span> souhaite te transférer la propriété de cet arbre.
            Tant que tu n'as pas répondu, rien ne change.
          </p>
          <div className="flex gap-2">
            <button onClick={() => handleRespond(incomingPending, true)} className={buttonPrimary}>Accepter</button>
            <button onClick={() => handleRespond(incomingPending, false)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">Refuser</button>
          </div>
        </section>
      )}
      {outgoingPending && (
        <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-semibold">Transfert en attente</h2>
          <p className="mb-3 text-sm">En attente de la réponse de <span className="font-medium">{emailOf(outgoingPending.to_user)}</span>.</p>
          <button onClick={() => handleCancelTransfer(outgoingPending)} className="text-xs text-red-600 hover:underline">Annuler la demande</button>
        </section>
      )}

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
                  {memberRoleLabel(inv.role, false)}
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
              const isOwnerRow = m.userId === ownerId;
              const label = memberRoleLabel(m.role, isOwnerRow);
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm dark:border-neutral-800">
                  <span className="flex-1 truncate">
                    {m.email || m.userId}
                    {isSelf && <span className="ml-1 text-xs text-neutral-400">{t('settings.members.you')}</span>}
                  </span>
                  {isOwnerRow || isSelf || !isOwner ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{label}</span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      {ROLE_CHOICES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  )}
                  {!isOwnerRow && !isSelf && (isOwner || m.role === 'guest') && (
                    <button onClick={() => handleRemove(m.userId)} className="text-xs text-red-600 hover:underline">
                      {t('settings.members.remove')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Propriétaire : transférer la propriété */}
      {isOwner && (
        <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-semibold">Transférer la propriété</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Seul un admin de l'arbre peut recevoir la propriété. Tu deviens admin, il devient propriétaire. Il doit accepter.
          </p>
          {transferCandidates.length === 0 ? (
            <p className="text-xs text-neutral-400">Aucun admin à qui transférer l'arbre. Nomme d'abord un admin.</p>
          ) : (
            <form onSubmit={handleRequestTransfer} className="space-y-2">
              <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">Choisir un admin…</option>
                {transferCandidates.map((m) => <option key={m.userId} value={m.userId}>{m.email || m.userId}</option>)}
              </select>
              {transferTarget && (
                <>
                  <p className="text-xs text-neutral-500">
                    Pour confirmer, tape exactement :
                    <code className="mt-1 block break-all rounded bg-neutral-50 px-2 py-1 dark:bg-neutral-800">
                      {ownershipConfirmationPhrase(members.find((m) => m.userId === transferTarget)?.email || '')}
                    </code>
                  </p>
                  <input value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} className={`${inputClass} w-full`} placeholder="Texte de confirmation" />
                </>
              )}
              <button
                type="submit"
                disabled={!transferTarget || transferConfirm.trim() !== ownershipConfirmationPhrase(members.find((m) => m.userId === transferTarget)?.email || '')}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Demander le transfert
              </button>
            </form>
          )}
        </section>
      )}

      {/* Admin non propriétaire : se rétrograder en membre */}
      {!isOwner && myMembership?.role === 'admin' && (
        <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-semibold">Passer en membre</h2>
          <p className="mb-3 text-xs text-neutral-500">Tu ne pourras plus créer ni modifier de fiches dans cet arbre. Pour confirmer, tape exactement :</p>
          <code className="mb-2 block rounded bg-neutral-50 px-2 py-1 text-xs dark:bg-neutral-800">{SELF_DOWNGRADE_PHRASE}</code>
          <form onSubmit={handleSelfDowngrade} className="flex flex-wrap gap-2">
            <input value={downgradeConfirm} onChange={(e) => setDowngradeConfirm(e.target.value)} className={`${inputClass} min-w-[14rem] flex-1`} placeholder="Texte de confirmation" />
            <button type="submit" disabled={downgradeConfirm.trim() !== SELF_DOWNGRADE_PHRASE} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
              Passer en membre
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

// Choix de rôle dans la liste des membres : le propriétaire promeut ou rétrograde.
const ROLE_CHOICES = [
  { value: 'admin', label: 'Admin' },
  { value: 'guest', label: 'Membre' },
];
