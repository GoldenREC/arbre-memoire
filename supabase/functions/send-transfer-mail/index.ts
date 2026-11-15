// Fonction Edge Supabase : envoie les mails de transfert de propriété.
//
// Déploiement (une fois) :
//   supabase functions deploy send-transfer-mail
//   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Arbre & Mémoire <noreply@ton-domaine>"
//
// Sécurité : seul l'un des deux utilisateurs de la demande (demandeur ou
// destinataire) peut déclencher un mail, et uniquement pour l'état réel de
// la demande en base. Le mail ne contient ni token, ni lien d'action : il
// renvoie vers l'application, où la réponse se donne après connexion.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Arbre & Mémoire <onboarding@resend.dev>';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://goldenrec.github.io/arbre-memoire';

type Kind = 'requested' | 'accepted' | 'refused';

function buildMail(kind: Kind, treeName: string, fromEmail: string) {
  switch (kind) {
    case 'requested':
      return {
        subject: `Demande de transfert de propriété : ${treeName}`,
        text: `${fromEmail} souhaite te transférer la propriété de l'arbre « ${treeName} ».\n\nRien ne change tant que tu n'as pas répondu. Connecte-toi pour accepter ou refuser :\n${APP_URL}/parametres/membres\n`,
      };
    case 'accepted':
      return {
        subject: `Transfert accepté : ${treeName}`,
        text: `Le transfert de propriété de l'arbre « ${treeName} » a été accepté. Tu es maintenant admin de cet arbre.\n`,
      };
    case 'refused':
      return {
        subject: `Transfert refusé : ${treeName}`,
        text: `Le transfert de propriété de l'arbre « ${treeName} » a été refusé. Tu restes propriétaire.\n`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const { transferId, kind } = await req.json().catch(() => ({}));
  if (!transferId || !['requested', 'accepted', 'refused'].includes(kind)) {
    return new Response('Requête invalide', { status: 400 });
  }

  // 1. L'appelant doit être connecté ; la lecture de la demande passe par la RLS.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: transfer, error } = await userClient
    .from('ownership_transfers')
    .select('id, tree_id, from_user, to_user, status')
    .eq('id', transferId)
    .maybeSingle();
  if (error || !transfer) return new Response('Demande introuvable', { status: 403 });

  const { data: { user } } = await userClient.auth.getUser();
  if (!user || (user.id !== transfer.from_user && user.id !== transfer.to_user)) {
    return new Response('Non autorisé', { status: 403 });
  }

  // 2. Cohérence : l'état annoncé doit correspondre à l'état réel.
  const expectedStatus = kind === 'requested' ? 'pending' : kind === 'accepted' ? 'accepted' : 'refused';
  if (transfer.status !== expectedStatus) {
    return new Response('État de la demande incompatible', { status: 409 });
  }

  // 3. Adresses et nom de l'arbre, lus avec le service role (pas de fuite côté client).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const [{ data: fromU }, { data: toU }, { data: tree }] = await Promise.all([
    admin.auth.admin.getUserById(transfer.from_user),
    admin.auth.admin.getUserById(transfer.to_user),
    admin.from('trees').select('name').eq('id', transfer.tree_id).maybeSingle(),
  ]);
  const fromEmail = fromU?.user?.email;
  const toEmail = toU?.user?.email;
  const treeName = tree?.name ?? 'Arbre';
  if (!fromEmail || !toEmail) return new Response('Adresse introuvable', { status: 500 });

  // 4. Destinataire : la demande va au destinataire ; la réponse va au demandeur.
  const recipient = kind === 'requested' ? toEmail : fromEmail;
  const mail = buildMail(kind as Kind, treeName, fromEmail);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [recipient], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) return new Response('Envoi du mail impossible', { status: 502 });

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
