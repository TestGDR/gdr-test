-- =====================================================================
-- Dati di esempio: una mappa con alcuni luoghi e le loro liste.
-- Eseguire DOPO 0001_schema.sql
-- =====================================================================

with m as (
  insert into public.maps (name, description, image_url)
  values ('Valdoria', 'La città di Valdoria e i suoi dintorni.', '/maps/valdoria.svg')
  returning id
),
l as (
  insert into public.locations (map_id, name, description, x, y)
  select m.id, v.name, v.description, v.x, v.y
  from m, (values
    ('Taverna del Drago Ubriaco', 'Una taverna fumosa, piena di avventurieri e chiacchiere.', 38.0, 42.0),
    ('Piazza del Mercato',        'Il cuore pulsante della città, tra bancarelle e mercanti.', 52.0, 55.0),
    ('Porto',                     'Moli di legno, navi mercantili e marinai dalla lingua lunga.', 78.0, 70.0),
    ('Bosco Nebbioso',            'Un bosco antico dove la nebbia non si dirada mai.', 18.0, 22.0),
    ('Rovine della Torre',        'Ciò che resta di una torre di magi, sulla collina.', 72.0, 18.0)
  ) as v(name, description, x, y)
  returning id, name
)
insert into public.rooms (location_id, name, description, sort_order)
select l.id, r.name, r.description, r.sort_order
from l
join (values
  ('Taverna del Drago Ubriaco', 'Sala comune',        'Tavoli, boccali e un bardo stonato.', 1),
  ('Taverna del Drago Ubriaco', 'Bancone',            'Dove l''oste ascolta tutto.', 2),
  ('Taverna del Drago Ubriaco', 'Stanze al piano di sopra', 'Camere per la notte.', 3),
  ('Piazza del Mercato',        'Bancarelle',         'Spezie, stoffe e merci esotiche.', 1),
  ('Piazza del Mercato',        'Fontana',            'Luogo d''incontro per eccellenza.', 2),
  ('Porto',                     'Moli',               'Il via vai delle navi.', 1),
  ('Porto',                     'Magazzini',          'Casse, corde e affari poco puliti.', 2),
  ('Bosco Nebbioso',            'Sentiero',           'Il sentiero che si perde tra gli alberi.', 1),
  ('Bosco Nebbioso',            'Radura',             'Un cerchio di pietre muschiose.', 2),
  ('Rovine della Torre',        'Ingresso',           'Un portale crollato a metà.', 1)
) as r(location_name, name, description, sort_order)
  on r.location_name = l.name;
