-- =====================================================================
-- RÈGLE DES 130 ANS : une personne née il y a plus de 130 ans est
-- considérée comme décédée. Appliquée en base pour que toute écriture
-- (formulaire, import, API) donne le même résultat que l'interface.
-- À exécuter UNE FOIS après multi_tree.sql.
-- =====================================================================

create or replace function enforce_deceased_130()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.birth_date is not null
     and new.birth_date < (current_date - interval '130 years')::date then
    new.is_deceased := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_deceased_130 on individuals;
create trigger trg_enforce_deceased_130
  before insert or update of birth_date, is_deceased on individuals
  for each row execute function enforce_deceased_130();

-- Rattrapage des fiches existantes.
update individuals
set is_deceased = true
where birth_date < (current_date - interval '130 years')::date
  and is_deceased = false;
