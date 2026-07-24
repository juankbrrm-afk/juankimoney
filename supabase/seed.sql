-- Semilla de desarrollo — mismo dataset curado que apps/web/lib/data/places.ts, en SQL,
-- para que un `supabase db reset` deje la base lista para conectar el frontend real.
-- Alcance del MVP: Panamá, Ciudad de Panamá / Casco Antiguo (docs/panama-ai/09-mvp.md).

insert into countries (code, name, default_locale, currency, timezone, is_active, launched_at)
values ('PA', 'Panamá', 'es', 'USD', 'America/Panama', true, now());

insert into cities (country_id, name, slug, latitude, longitude)
select id, 'Ciudad de Panamá', 'ciudad-de-panama', 8.9824, -79.5199 from countries where code = 'PA';

insert into zones (city_id, name, slug)
select id, z.name, z.slug from cities,
  (values
    ('Casco Antiguo', 'casco-antiguo'),
    ('Amador', 'amador'),
    ('Corredor Sur', 'corredor-sur'),
    ('Golfo de Panamá', 'golfo-de-panama'),
    ('Ciudad de Panamá', 'ciudad-de-panama')
  ) as z(name, slug)
where cities.slug = 'ciudad-de-panama';

insert into categories (slug, name, kind)
values
  ('restaurantes', '{"es":"Restaurantes","en":"Restaurants"}', 'restaurant'),
  ('rooftops', '{"es":"Rooftops","en":"Rooftops"}', 'rooftop'),
  ('playas', '{"es":"Playas","en":"Beaches"}', 'beach'),
  ('hoteles', '{"es":"Hoteles","en":"Hotels"}', 'hotel'),
  ('tours', '{"es":"Tours","en":"Tours"}', 'tour'),
  ('vida-nocturna', '{"es":"Vida nocturna","en":"Nightlife"}', 'nightlife'),
  ('museos', '{"es":"Museos","en":"Museums"}', 'museum'),
  ('familiar', '{"es":"Actividades familiares","en":"Family activities"}', 'family');

-- Lugares. price_level: 1=$ .. 4=$$$$. status='published' porque este es dataset curado
-- editorialmente (business_id null — ningún negocio lo ha reclamado todavía).
with p as (
  select
    (select id from countries where code = 'PA') as country_id,
    (select id from cities where slug = 'ciudad-de-panama') as city_id
)
insert into places (country_id, city_id, zone_id, category_id, slug, name, description, price_level, status, avg_rating)
select
  p.country_id, p.city_id,
  (select id from zones where slug = v.zone_slug),
  (select id from categories where slug = v.category_slug),
  v.slug, v.name, jsonb_build_object('es', v.description), v.price_level, 'published', v.avg_rating
from p, (values
  ('donde-jose', 'Donde José', 'restaurantes', 'casco-antiguo', 'Menú de degustación que reinterpreta ingredientes panameños de mercado. Reserva obligatoria, mesas limitadas por noche.', 4, 4.8),
  ('mercado-de-mariscos', 'Mercado de Mariscos', 'restaurantes', 'casco-antiguo', 'Ceviche recién hecho de pie frente al mar. La experiencia más panameña y económica para comer pescado del día.', 1, 4.5),
  ('tantalo-rooftop', 'Tántalo Rooftop', 'rooftops', 'casco-antiguo', 'Terraza sobre los techos de Casco Antiguo, DJ desde el atardecer, la vista clásica del skyline al fondo.', 3, 4.6),
  ('isla-taboga', 'Isla Taboga', 'playas', 'golfo-de-panama', 'La playa más cercana a la ciudad accesible en ferry de 30 minutos. Ideal para medio día sin salir de la capital.', 2, 4.3),
  ('biomuseo', 'Biomuseo', 'museos', 'amador', 'Diseñado por Frank Gehry, cuenta la historia de cómo el istmo de Panamá cambió la biodiversidad del planeta.', 2, 4.6),
  ('casco-viejo-free-walk', 'Recorrido a pie por Casco Antiguo', 'tours', 'casco-antiguo', 'Ruta autoguiada por las plazas coloniales, murallas y fachadas restauradas del centro histórico declarado Patrimonio de la Humanidad.', 1, 4.7),
  ('canal-de-panama-miraflores', 'Esclusas de Miraflores', 'tours', 'corredor-sur', 'Ver de cerca un buque cruzar el Canal de Panamá, con centro de visitantes y museo. La actividad emblemática del país.', 2, 4.7),
  ('selina-casco-viejo', 'Selina Casco Viejo', 'hoteles', 'casco-antiguo', 'Hostel/hotel boutique con rooftop propio, ideal para viajeros que quieren estar caminando dentro del casco histórico.', 2, 4.2),
  ('casa-casco', 'Casa Casco Hotel Boutique', 'hoteles', 'casco-antiguo', 'Hotel boutique de lujo en un edificio colonial restaurado, a media cuadra de la Plaza de la Independencia.', 4, 4.9),
  ('relic-bar', 'Relic Bar', 'vida-nocturna', 'casco-antiguo', 'Bar dentro de un antiguo hostel-convento, ambiente under y buena música en vivo los fines de semana.', 2, 4.4),
  ('parque-natural-metropolitano', 'Parque Natural Metropolitano', 'familiar', 'ciudad-de-panama', 'Selva tropical real dentro de los límites de la ciudad, senderos cortos con posibilidad de ver perezosos y tucanes.', 1, 4.5),
  ('mi-ranchito', 'Mi Ranchito', 'restaurantes', 'amador', 'Comida típica panameña frente al mar con vista al skyline y a los barcos esperando para cruzar el Canal.', 2, 4.4)
) as v(slug, name, category_slug, zone_slug, description, price_level, avg_rating);

insert into place_contacts (place_id, phone, whatsapp, instagram, website)
select id, v.phone, v.whatsapp, v.instagram, v.website
from places, (values
  ('donde-jose', null, '+50760000001', '@dondejosepanama', null),
  ('mercado-de-mariscos', '+5072120000', null, null, null),
  ('tantalo-rooftop', null, null, '@tantalopanama', 'https://tantalohotel.com'),
  ('isla-taboga', null, null, null, 'https://tabogaexpress.com'),
  ('biomuseo', null, null, null, 'https://biomuseopanama.org'),
  ('casco-viejo-free-walk', null, null, null, null),
  ('canal-de-panama-miraflores', null, null, null, 'https://pancanal.com'),
  ('selina-casco-viejo', null, '+50760000008', null, 'https://selina.com'),
  ('casa-casco', null, null, null, 'https://casacasco.com'),
  ('relic-bar', null, null, '@relicbarpanama', null),
  ('parque-natural-metropolitano', null, null, null, 'https://parquemetropolitano.org'),
  ('mi-ranchito', '+5073140000', null, null, null)
) as v(slug, phone, whatsapp, instagram, website)
where places.slug = v.slug;

insert into business_plans (country_id, code, price_monthly, features)
select id, plan.code, plan.price, plan.features::jsonb from countries,
  (values
    ('free', 0, '{"featured": false, "photos_max": 3, "analytics": false}'),
    ('pro', 25, '{"featured": false, "photos_max": 15, "analytics": true}'),
    ('premium', 75, '{"featured": true, "photos_max": 30, "analytics": true, "priority_support": true}')
  ) as plan(code, price, features)
where countries.code = 'PA';
