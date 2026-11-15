-- Scénario de test : cascade DIRECTE des cadenas (arbre de test uniquement).
-- À exécuter dans l'éditeur SQL Supabase après avoir appliqué le bloc
-- "Cascade DIRECTE" de supabase/multi_tree.sql (fonctions individual_direct_locked,
-- spouses_of, individual_locked, event_locked, media_locked).
--
-- Famille de test : M (mère) = partenaire de C (mariage MAR1, divorcée) et de G
-- (mariage MAR2) ; C = partenaire de Ma (mariage MAR3).
-- Attendu : cadenas sur M => M, C, G protégés (fiche, événements, actes) ;
-- Ma n'est PAS protégée (ce n'est pas un conjoint direct de M).
--
-- Sortie : une ligne par étape "ACCEPTÉ" ou "REFUSÉ: <message>".

drop table if exists t_results, t_ids, t_p, t_u, t_e, t_s, t_m, t_tests;
create temp table t_results(step text, outcome text); grant all on t_results to authenticated;
create temp table t_ids as select
 (select owner_id from trees where id='23a3a254-5e57-40fc-add6-b5effecfdd64') as owner,
 (select id from auth.users where email='lt.proaccor@gmail.com') as tester,
 '23a3a254-5e57-40fc-add6-b5effecfdd64'::uuid as tree;
grant select on t_ids to authenticated;
insert into tree_members(tree_id,user_id,role)
 select tree,tester,'admin' from t_ids
 where not exists (select 1 from tree_members m join t_ids x on m.tree_id=x.tree and m.user_id=x.tester);
create temp table t_p(k text, id uuid); grant all on t_p to authenticated;
insert into t_p(k,id) select k, gen_random_uuid() from (values ('M'),('C'),('G'),('Ma')) v(k);
insert into individuals(id,tree_id,first_names,last_name,sex,is_deceased)
 select p.id, t.tree, v.fn, v.ln, v.sx::sex_type, false from t_p p join t_ids t on true
 join (values ('M','Laetitia','Test-Mere','F'),('C','Christophe','Test-Pere','M'),('G','Gilles','Test-Beaupere','M'),('Ma','Maritza','Test-Belle','F')) v(k,fn,ln,sx) on v.k=p.k;
create temp table t_u(k text, id uuid); grant all on t_u to authenticated;
insert into t_u(k,id) values ('U1',gen_random_uuid()),('U2',gen_random_uuid()),('U3',gen_random_uuid());
insert into unions(id,tree_id,union_type,status)
 select u.id, t.tree, 'marriage'::union_type_enum, (case when u.k='U1' then 'divorced' else 'ongoing' end)::union_status from t_u u join t_ids t on true;
insert into union_partners(union_id,individual_id)
 select u.id, p.id from (values ('U1','M'),('U1','C'),('U2','M'),('U2','G'),('U3','C'),('U3','Ma')) v(uk,pk)
 join t_u u on u.k=v.uk join t_p p on p.k=v.pk;
insert into events(tree_id,subject_kind,subject_id,event_type,label,event_date,date_precision)
 select t.tree,'union',u.id,'marriage','Mariage test','1980-06-01','exact' from t_u u join t_ids t on true;
insert into events(tree_id,subject_kind,subject_id,event_type,label,event_date,date_precision)
 select t.tree,'individual',p.id,'birth','Naissance test','1955-03-01','exact' from t_p p join t_ids t on true where p.k='M';
create temp table t_e(k text, id uuid); grant all on t_e to authenticated;
insert into t_e select 'MAR1', e.id from events e join t_u u on e.subject_kind='union' and e.subject_id=u.id where u.k='U1';
insert into t_e select 'MAR2', e.id from events e join t_u u on e.subject_kind='union' and e.subject_id=u.id where u.k='U2';
insert into t_e select 'MAR3', e.id from events e join t_u u on e.subject_kind='union' and e.subject_id=u.id where u.k='U3';
insert into t_e select 'BIRTHM', e.id from events e join t_p p on e.subject_kind='individual' and e.subject_id=p.id and e.event_type='birth' where p.k='M';
create temp table t_s(k text, id uuid); grant all on t_s to authenticated;
insert into t_s(k,id) values ('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid());
insert into sources(id,tree_id,title) select s.id, t.tree, 'Acte test '||s.k from t_s s join t_ids t on true;
create temp table t_m(k text, id uuid); grant all on t_m to authenticated;
insert into t_m(k,id) values ('MD1',gen_random_uuid()),('MD2',gen_random_uuid()),('MD3',gen_random_uuid());
insert into media(id,tree_id,media_type,storage_path,title,source_id)
 select m.id, t.tree, 'document'::media_type_enum, 'test/'||m.k||'.pdf', 'Test '||m.k, s.id from t_m m join t_s s on s.k='S'||substr(m.k,3) join t_ids t on true;
-- MD1 cité sur le mariage MAR1 ; MD2 cité sur la naissance de M ; MD3 cité sur la fiche de G.
insert into citations(tree_id,source_id,event_id) select t.tree,(select id from t_s where k='S1'),(select id from t_e where k='MAR1') from t_ids t;
insert into citations(tree_id,source_id,event_id) select t.tree,(select id from t_s where k='S2'),(select id from t_e where k='BIRTHM') from t_ids t;
insert into citations(tree_id,source_id,individual_id) select t.tree,(select id from t_s where k='S3'),(select id from t_p where k='G') from t_ids t;

create temp table t_tests(ord serial, who text, step text, sql text); grant all on t_tests to authenticated;
insert into t_tests(who,step,sql) values
 ('owner','00 propriétaire pose cadenas fiche M',$q$insert into record_locks(tree_id,target_kind,target_id,locked_by) select tree,'individual',(select id from t_p where k='M'),owner from t_ids$q$),
 ('tester','01 admin modifie naissance de M (fiche protégée) : attendu REFUSÉ',$q$update events set label=label where id=(select id from t_e where k='BIRTHM')$q$),
 ('tester','02 admin modifie mariage MAR1 (M+C) : attendu REFUSÉ',$q$update events set label=label where id=(select id from t_e where k='MAR1')$q$),
 ('tester','03 admin modifie fiche C (conjoint de M) : attendu REFUSÉ',$q$update individuals set first_names=first_names where id=(select id from t_p where k='C')$q$),
 ('tester','04 admin modifie fiche G (conjoint de M via MAR2) : attendu REFUSÉ',$q$update individuals set first_names=first_names where id=(select id from t_p where k='G')$q$),
 ('tester','05 admin modifie fiche Ma (conjointe de C, pas de M) : attendu ACCEPTÉ',$q$update individuals set first_names=first_names where id=(select id from t_p where k='Ma')$q$),
 ('tester','06 admin supprime mariage MAR1 : attendu REFUSÉ',$q$delete from events where id=(select id from t_e where k='MAR1')$q$),
 ('tester','07 admin supprime naissance de M : attendu REFUSÉ',$q$delete from events where id=(select id from t_e where k='BIRTHM')$q$),
 ('owner','08 propriétaire supprime fiche M : attendu REFUSÉ',$q$select delete_individual((select id from t_p where k='M'))$q$),
 ('owner','09 propriétaire retire cadenas M',$q$delete from record_locks where target_kind='individual' and target_id=(select id from t_p where k='M')$q$),
 ('owner','10 propriétaire pose cadenas acte MD1 (cité sur MAR1)',$q$insert into record_locks(tree_id,target_kind,target_id,locked_by) select tree,'media',(select id from t_m where k='MD1'),owner from t_ids$q$),
 ('tester','11 admin supprime MD1 cadenassé : attendu REFUSÉ',$q$delete from media where id=(select id from t_m where k='MD1')$q$),
 ('owner','12 propriétaire retire cadenas MD1',$q$delete from record_locks where target_kind='media' and target_id=(select id from t_m where k='MD1')$q$),
 ('owner','13 propriétaire pose cadenas mariage MAR2 (M+G)',$q$insert into record_locks(tree_id,target_kind,target_id,locked_by) select tree,'event',(select id from t_e where k='MAR2'),owner from t_ids$q$),
 ('tester','14 admin modifie MAR2 cadenassé : attendu REFUSÉ',$q$update events set label=label where id=(select id from t_e where k='MAR2')$q$),
 ('tester','15 admin supprime MAR2 cadenassé : attendu REFUSÉ',$q$delete from events where id=(select id from t_e where k='MAR2')$q$),
 ('owner','16 propriétaire retire cadenas MAR2',$q$delete from record_locks where target_kind='event' and target_id=(select id from t_e where k='MAR2')$q$),
 ('owner','17 propriétaire pose cadenas fiche M (2e fois)',$q$insert into record_locks(tree_id,target_kind,target_id,locked_by) select tree,'individual',(select id from t_p where k='M'),owner from t_ids$q$),
 ('tester','18 admin supprime MD2 (cité sur naissance de M protégée) : attendu REFUSÉ',$q$delete from media where id=(select id from t_m where k='MD2')$q$),
 ('tester','19 admin supprime MD3 (cité sur fiche G, conjoint protégé) : attendu REFUSÉ',$q$delete from media where id=(select id from t_m where k='MD3')$q$),
 ('owner','20 propriétaire retire cadenas M',$q$delete from record_locks where target_kind='individual' and target_id=(select id from t_p where k='M')$q$),
 ('tester','21 admin modifie fiche G (plus de cadenas) : attendu ACCEPTÉ',$q$update individuals set first_names=first_names where id=(select id from t_p where k='G')$q$),
 ('owner','22 nettoyage retire tous les cadenas de test',$q$delete from record_locks where tree_id=(select tree from t_ids)$q$),
 ('owner','23 nettoyage supprime actes de test',$q$delete from media where tree_id=(select tree from t_ids) and title like 'Test %'$q$),
 ('owner','24 nettoyage supprime citations de test',$q$delete from citations where tree_id=(select tree from t_ids) and source_id in (select id from t_s)$q$),
 ('owner','25 nettoyage supprime sources de test',$q$delete from sources where tree_id=(select tree from t_ids) and title like 'Acte test %'$q$),
 ('owner','26 nettoyage supprime mariages de test',$q$delete from events where tree_id=(select tree from t_ids) and subject_kind='union' and subject_id in (select id from t_u)$q$),
 ('owner','27 nettoyage supprime partenaires de test',$q$delete from union_partners where union_id in (select id from t_u)$q$),
 ('owner','28 nettoyage supprime unions de test',$q$delete from unions where id in (select id from t_u)$q$),
 ('owner','29 nettoyage supprime fiches de test',$q$select delete_individual(id) from individuals where tree_id=(select tree from t_ids) and last_name like 'Test-%'$q$),
 ('owner','30 nettoyage retire le membre de test',$q$delete from tree_members where user_id=(select tester from t_ids) and tree_id=(select tree from t_ids)$q$);

do $$ declare r record; u uuid; n int; begin
 for r in select * from t_tests order by ord loop
  select case when r.who='owner' then owner else tester end into u from t_ids;
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  set local role authenticated;
  begin
   execute r.sql;
   get diagnostics n = row_count;
   insert into t_results values (r.step, 'ACCEPTÉ, lignes='||n);
  exception when others then
   insert into t_results values (r.step, 'REFUSÉ: '||sqlerrm);
  end;
  reset role;
 end loop;
end $$;

select r.step || ' => ' || r.outcome as resultat from t_results r join t_tests t on t.step=r.step order by t.ord;
