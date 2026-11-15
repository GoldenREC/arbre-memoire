-- =====================================================================
-- SCÉNARIOS DE TEST des règles multi-arbres, rôles, transferts et cadenas.
-- Pour une base de test UNIQUEMENT (jamais la base de production) :
-- après avoir exécuté schema.sql, policies.sql, realtime.sql, storage.sql,
-- map.sql, settings.sql et multi_tree.sql, lancer :
--   psql -d <base_test> -f supabase/tests/multi_tree_scenarios.sql
-- Chaque étape affiche le résultat attendu ; les erreurs affichées sont
-- celles qui doivent être refusées (ex. : « Seul le propriétaire… »).
-- Ce script crée des comptes factices (auth.users) : ne pas l'exécuter en production.
-- =====================================================================
\set ON_ERROR_STOP 0
\pset pager off
-- Utilisateurs de test
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-00000000000a','owner@x.fr'),
 ('00000000-0000-0000-0000-00000000000b','admin@x.fr'),
 ('00000000-0000-0000-0000-00000000000c','member@x.fr'),
 ('00000000-0000-0000-0000-00000000000d','outsider@x.fr');

\echo '== 1. Le propriétaire crée un arbre'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select create_tree_with_admin('Arbre du propriétaire') as tree \gset
\echo 'arbre :' :tree

\echo '== 2. Le propriétaire ajoute un admin et un membre'
insert into tree_members (tree_id,user_id,role) values (:'tree','00000000-0000-0000-0000-00000000000b','admin');
insert into tree_members (tree_id,user_id,role) values (:'tree','00000000-0000-0000-0000-00000000000c','guest');
select user_id, role from tree_members where tree_id = :'tree' order by role;

\echo '== 3. Le propriétaire crée une fiche (attendu : OK)'
insert into individuals (tree_id, first_names, last_name) values (:'tree','Jean','Test') returning id as ind1 \gset
select count(*) as fiches_apres_creation from individuals where tree_id=:'tree';

\echo '== 4. Le membre tente dajouter une fiche (attendu : refus RLS)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
insert into individuals (tree_id, first_names, last_name) values (:'tree','Intrus','Membre');
select count(*) as fiches_vues_par_membre from individuals where tree_id=:'tree';

\echo '== 5. L admin crée et modifie une fiche (attendu : OK)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
insert into individuals (tree_id, first_names, last_name) values (:'tree','Paul','Admin') returning id as ind2 \gset
update individuals set first_names='Pauline' where id=:'ind2';
select first_names from individuals where id=:'ind2';

\echo '== 6. L admin tente de supprimer une fiche (attendu : 0 ligne supprimée, ou erreur)'
delete from individuals where id=:'ind2';
select count(*) as fiche_encore_la from individuals where id=:'ind2';

\echo '== 7. L admin tente de se nommer propriétaire (attendu : erreur)'
update trees set owner_id='00000000-0000-0000-0000-00000000000b' where id=:'tree';

\echo '== 8. L admin tente de promouvoir le membre (attendu : 0 ligne modifiée)'
update tree_members set role='admin' where tree_id=:'tree' and user_id='00000000-0000-0000-0000-00000000000c';
select user_id, role from tree_members where tree_id=:'tree' order by role;

\echo '== 9. L admin tente d ajouter un admin directement (attendu : refus)'
insert into tree_members (tree_id,user_id,role) values (:'tree','00000000-0000-0000-0000-00000000000d','admin');

\echo '== 10. L admin invite un membre (attendu : OK)'
insert into tree_members (tree_id,user_id,role) values (:'tree','00000000-0000-0000-0000-00000000000d','guest');
select count(*) as membres from tree_members where tree_id=:'tree';

\echo '== 11. Un étranger ne voit pas l arbre'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select count(*) as arbres_vus_par_etranger from trees where id=:'tree';
select count(*) as fiches_vues_par_etranger from individuals where tree_id=:'tree';

\echo '== 12. Le propriétaire pose un cadenas sur une fiche ; l admin ne peut plus la modifier'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into record_locks (tree_id,target_kind,target_id,locked_by) values (:'tree','individual',:'ind2','00000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
update individuals set first_names='Modifie' where id=:'ind2';
select first_names as prenom_apres_tentative from individuals where id=:'ind2';
\echo '   (l admin tente aussi de poser un cadenas : attendu refus)'
insert into record_locks (tree_id,target_kind,target_id,locked_by) values (:'tree','individual',:'ind1','00000000-0000-0000-0000-00000000000b');

\echo '== 13. Le propriétaire retire le cadenas puis supprime la fiche (attendu : OK)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
delete from record_locks where target_kind='individual' and target_id=:'ind2';
select delete_individual(:'ind2');
select count(*) as fiche_supprimee_reste from individuals where id=:'ind2';

\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000e0','etranger@x.fr');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select create_tree_with_admin('Arbre 2') as tree \gset
insert into tree_members (tree_id,user_id,role) values (:'tree','00000000-0000-0000-0000-00000000000b','admin');
insert into tree_members (tree_id,user_id,role) values (:'tree','00000000-0000-0000-0000-00000000000c','guest');
insert into individuals (tree_id, first_names, last_name) values (:'tree','Marie','Acte') returning id as ind \gset
insert into sources (tree_id, title) values (:'tree','Acte de naissance 1850') returning id as src \gset
insert into media (tree_id, media_type, storage_path, title, source_id) values (:'tree','document','p/acte.jpg','Acte 1850',:'src') returning id as med \gset
insert into media_links (media_id, subject_kind, subject_id) values (:'med','individual',:'ind');
insert into events (tree_id, subject_kind, subject_id, event_type, event_date) values (:'tree','individual',:'ind','birth','1850-03-01') returning id as ev \gset
insert into citations (tree_id, source_id, event_id) values (:'tree',:'src',:'ev');

\echo '== A. Cadenas sur l acte seul : l admin peut modifier la fiche et l evenement'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into record_locks (tree_id,target_kind,target_id,locked_by) values (:'tree','media',:'med','00000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
update individuals set first_names='Marie-Anne' where id=:'ind';
update events set event_date='1850-03-02' where id=:'ev';
select 'modif fiche/evenement par admin : ' || (select first_names from individuals where id=:'ind') || ' / ' || (select event_date::text from events where id=:'ev') as resultat_A;

\echo '== B. Acte cadenasse : evenement non supprimable, acte non retirable, fiche non supprimable'
delete from events where id=:'ev';
select count(*) as evenement_encore_la from events where id=:'ev';
delete from citations where event_id=:'ev';
select count(*) as citation_encore_la from citations where event_id=:'ev';
delete from media_links where media_id=:'med';
select count(*) as lien_acte_fiche_encore_la from media_links where media_id=:'med';
delete from media where id=:'med';
select count(*) as acte_encore_la from media where id=:'med';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select delete_individual(:'ind');
select count(*) as fiche_encore_la_B from individuals where id=:'ind';

\echo '== C. Le proprietaire retire le cadenas de l acte : la suppression redevient possible'
delete from record_locks where target_kind='media' and target_id=:'med';
delete from events where id=:'ev';
select count(*) as evenement_apres_retrait from events where id=:'ev';

\echo '== D. Cadenas sur un evenement : admin ne peut plus le modifier, proprietaire oui'
insert into events (tree_id, subject_kind, subject_id, event_type, event_date) values (:'tree','individual',:'ind','baptism','1851-01-01') returning id as ev2 \gset
insert into record_locks (tree_id,target_kind,target_id,locked_by) values (:'tree','event',:'ev2','00000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
update events set event_date='1852-01-01' where id=:'ev2';
select 'admin, evenement cadenasse : date=' || event_date::text as resultat_D from events where id=:'ev2';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
update events set event_date='1852-01-01' where id=:'ev2';
select 'proprietaire, evenement cadenasse : date=' || event_date::text as resultat_D2 from events where id=:'ev2';

\echo '== E. Etranger : aucun acces'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e0',false);
select count(*) as arbres_vus_etranger from trees where id=:'tree';
select count(*) as fiches_vues_etranger from individuals where tree_id=:'tree';
select count(*) as cadenas_vus_etranger from record_locks where tree_id=:'tree';

\echo '== F. Transfert : mauvaise phrase refusee, bonne phrase acceptee, pas de changement avant reponse'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select request_ownership_transfer(:'tree','admin@x.fr','je souhaite transferer') as essai_mauvaise_phrase;
select request_ownership_transfer(:'tree','admin@x.fr', ownership_confirmation_phrase('admin@x.fr')) as demande \gset
select request_ownership_transfer(:'tree','member@x.fr', ownership_confirmation_phrase('member@x.fr')) as essai_membre_non_admin;
select owner_id = '00000000-0000-0000-0000-00000000000a' as proprietaire_inchange_avant_reponse from trees where id=:'tree';
select count(*) as notif_pour_admin from notifications where user_id='00000000-0000-0000-0000-00000000000b' and kind='ownership_transfer';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select respond_ownership_transfer(:'demande', true) as essai_par_membre;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select respond_ownership_transfer(:'demande', true) as reponse_admin;
select owner_id = '00000000-0000-0000-0000-00000000000b' as nouveau_proprietaire from trees where id=:'tree';
select role as ancien_role from tree_members where tree_id=:'tree' and user_id='00000000-0000-0000-0000-00000000000a';

\echo '== G. Ex-proprietaire (maintenant admin) ne peut plus supprimer ni transferer'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select request_ownership_transfer(:'tree','member@x.fr', ownership_confirmation_phrase('member@x.fr')) as essai_ancien_proprio;
select delete_individual(:'ind') as essai_suppression;

\echo '== H. Auto-retrogradation : mauvaise phrase refusee, bonne phrase acceptee'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select self_downgrade_admin(:'tree','je veux partir') as essai_mauvaise;
select self_downgrade_admin(:'tree','je souhaite devenir membre de cet arbre') as essai_ok;
select role from tree_members where tree_id=:'tree' and user_id='00000000-0000-0000-0000-00000000000a';

\echo '== I. Le proprietaire ne peut pas se retrograder directement, ni changer son propre role'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select self_downgrade_admin(:'tree','je souhaite devenir membre de cet arbre') as proprietaire_se_retrograde;
update tree_members set role='guest' where tree_id=:'tree' and user_id='00000000-0000-0000-0000-00000000000b';
select role from tree_members where tree_id=:'tree' and user_id='00000000-0000-0000-0000-00000000000b';


\set ON_ERROR_STOP 0
\pset pager off
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000b1','prop5@x.fr') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select create_tree_with_admin('Arbre a supprimer') as t5 \gset
insert into individuals (tree_id, first_names, last_name) values (:'t5','Lou','Cascade') returning id as i5 \gset
insert into sources (tree_id, title) values (:'t5','Source X') returning id as s5 \gset
insert into media (tree_id, media_type, storage_path, title, source_id) values (:'t5','document','p/x.jpg','X',:'s5') returning id as m5 \gset
insert into media_links (media_id, subject_kind, subject_id) values (:'m5','individual',:'i5');
insert into events (tree_id, subject_kind, subject_id, event_type) values (:'t5','individual',:'i5','birth') returning id as e5 \gset
insert into citations (tree_id, source_id, event_id) values (:'t5',:'s5',:'e5');
insert into record_locks (tree_id,target_kind,target_id,locked_by) values (:'t5','media',:'m5','00000000-0000-0000-0000-0000000000b1');
\echo '== O. Suppression de l arbre avec un acte cadenasse : la cascade ne doit pas etre bloquee'
delete from trees where id=:'t5';
select count(*) as arbre_restant from trees where id=:'t5';
select count(*) as fiches_restantes from individuals where tree_id=:'t5';
select count(*) as cadenas_restants from record_locks where tree_id=:'t5';
\echo '== P. Propriétaire sans arbre : suppression de compte autorisée'
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000b1';
select count(*) as compte_b1_restant from auth.users where id='00000000-0000-0000-0000-0000000000b1';
\echo '== Q. Membre (sans arbre possédé) : suppression de compte autorisée'
delete from auth.users where id='00000000-0000-0000-0000-00000000000d';
select count(*) as compte_d_restant from auth.users where id='00000000-0000-0000-0000-00000000000d';

-- ---------------------------------------------------------------------
-- R. Règle des 130 ans (à exécuter après deceased_130.sql)
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select create_tree_with_admin('Test 130') as t130 \gset
insert into individuals (tree_id, first_names, last_name, birth_date, is_deceased) values (:'t130','Ancien','Ne','1850-01-01',false) returning is_deceased as ancien_attendu_vrai;
insert into individuals (tree_id, first_names, last_name, birth_date, is_deceased) values (:'t130','Recent','Ne','1990-01-01',false) returning is_deceased as recent_attendu_faux;
