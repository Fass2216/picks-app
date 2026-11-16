# Para Fede: lo que falta en el servidor para Amigos y Tendencias

Hola Fede. Esto lo dejó Agus (con Claude). Las pantallas del diseño nuevo que
faltaban ya están armadas en la app, en la rama `agus-diseno`:

- **Pestaña Amigos** (`Amigos.js`): amigos, grupos, fechas importantes,
  cumpleaños, colecciones en equipo e invitaciones.
- **Explorar → Tendencias** (`Tendencias.js`): Nº 1 de la semana, top, lo que
  busca la gente y tiendas en alza.

Lo que ya anda hoy: los amigos (tabla `follows`), su perfil, seguir y dejar de
seguir, y "Lo que guardaron" (`/api/picks/public/:id`).

El resto necesita tablas y lógica en el servidor que todavía no existen.
**Mientras no existan, la app no se rompe:** cada sección muestra "Muy pronto"
(Amigos) o no aparece (Tendencias). Cuando crees lo de abajo, se activa solo,
sin publicar una versión nueva de la app.

Las dos pantallas van en archivos aparte (`Amigos.js`, `Tendencias.js`) para no
agrandar `App.js`. `npm run revisar` también los revisa.

---

## 1. Supabase: tablas nuevas

La app lee y escribe estas tablas directo con Supabase (igual que `follows` y
`profiles`). Si la tabla no existe, Supabase responde `42P01` o `PGRST205` y la
app muestra "Muy pronto". Los nombres de tablas y columnas tienen que ser
exactamente estos, porque la app los usa así.

```sql
-- Cumpleaños en el perfil (Fechas importantes → "Tu cumpleaños")
alter table profiles
  add column if not exists birthday_day smallint check (birthday_day between 1 and 31),
  add column if not exists birthday_month smallint check (birthday_month between 1 and 12),
  add column if not exists birthday_year smallint,
  add column if not exists birthday_public boolean not null default true;

-- Grupos de amigos (Favoritos, Trabajo, Familia…)
create table friend_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  created_at timestamptz not null default now()
);
create table friend_group_members (
  group_id uuid not null references friend_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id, user_id)
);

-- Fechas importantes
create table important_dates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'otro',          -- cumple | mudanza | aniversario | viaje | fiesta | otro
  emoji text,
  day smallint not null check (day between 1 and 31),
  month smallint not null check (month between 1 and 12),
  year smallint,
  repeats_yearly boolean not null default false,
  visibility text not null default 'private', -- private | groups | people
  group_ids uuid[] not null default '{}',
  person_ids uuid[] not null default '{}',
  notify_days_before smallint not null default 3,
  team_collection_id uuid,                     -- si se armó una colección en equipo para esta fecha
  created_at timestamptz not null default now()
);

-- Colecciones en equipo ("Mudanza", "Regalos de cumple")
create table team_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  allow_member_add boolean not null default true,
  created_at timestamptz not null default now()
);
create table team_collection_members (
  collection_id uuid not null references team_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',     -- owner | member
  status text not null default 'invited',  -- invited | joined
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);
create table team_collection_picks (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references team_collections(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  name text, img text, url text, domain text, price text,
  created_at timestamptz not null default now()
);
```

### Permisos (RLS)

Sin estas reglas, cualquiera podría leer las fechas o colecciones de otros.
Ojo: las políticas de `team_collection_members` se consultan a sí mismas, y
eso puede dar recursión en Postgres. Si pasa, mové el chequeo a una función
`security definer` (por ejemplo `is_team_member(collection_id)`).

```sql
alter table friend_groups enable row level security;
alter table friend_group_members enable row level security;
alter table important_dates enable row level security;
alter table team_collections enable row level security;
alter table team_collection_members enable row level security;
alter table team_collection_picks enable row level security;

-- Grupos: solo el dueño los ve y los cambia
create policy "grupos del dueño" on friend_groups for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "miembros de mis grupos" on friend_group_members for all
  using (exists (select 1 from friend_groups g where g.id = group_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from friend_groups g where g.id = group_id and g.owner_id = auth.uid()));

-- Fechas: el dueño hace todo. Las ve también quien está en person_ids o en
-- un grupo de group_ids
create policy "mis fechas" on important_dates for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "fechas compartidas conmigo" on important_dates for select using (
  (visibility = 'people' and auth.uid() = any(person_ids))
  or (visibility = 'groups' and exists (
    select 1 from friend_group_members m where m.group_id = any(group_ids) and m.user_id = auth.uid()))
);

-- Colecciones en equipo: las ven sus miembros (invitados o unidos)
create policy "ver colecciones donde estoy" on team_collections for select using (
  owner_id = auth.uid() or exists (
    select 1 from team_collection_members m where m.collection_id = id and m.user_id = auth.uid()));
create policy "crear colección propia" on team_collections for insert with check (owner_id = auth.uid());
create policy "dueño edita" on team_collections for update using (owner_id = auth.uid());

create policy "ver miembros" on team_collection_members for select using (
  exists (select 1 from team_collection_members me where me.collection_id = collection_id and me.user_id = auth.uid()));
-- El dueño, o un miembro unido, invita
create policy "invitar" on team_collection_members for insert with check (
  user_id = auth.uid()
  or exists (select 1 from team_collection_members me where me.collection_id = collection_id and me.user_id = auth.uid() and me.status = 'joined'));
-- Cada uno acepta (update) o rechaza (delete) su propia invitación
create policy "responder mi invitación" on team_collection_members for update using (user_id = auth.uid());
create policy "salir o rechazar" on team_collection_members for delete using (user_id = auth.uid());

create policy "ver picks del equipo" on team_collection_picks for select using (
  exists (select 1 from team_collection_members m where m.collection_id = collection_id and m.user_id = auth.uid() and m.status = 'joined'));
create policy "sumar picks" on team_collection_picks for insert with check (
  added_by = auth.uid() and exists (
    select 1 from team_collection_members m join team_collections c on c.id = m.collection_id
    where m.collection_id = collection_id and m.user_id = auth.uid() and m.status = 'joined'
      and (c.allow_member_add or c.owner_id = auth.uid())));

-- Cumpleaños de otros: hoy profiles se lee entero. Si querés esconder el
-- cumple de quien no lo muestra, hacé una vista o una función que devuelva
-- birthday_day/month solo si birthday_public = true.
```

---

## 2. Servidor: notificaciones nuevas

La app ya llama a `POST /api/notifications/social` (el mismo de "te siguió")
con estos tipos nuevos. Hoy el servidor seguramente los ignora; hay que
sumarlos como notificación in-app y push:

| `type` | Cuándo lo manda la app | Campos extra | Texto sugerido |
|---|---|---|---|
| `team_invite` | Alguien te invita a una colección en equipo | `collection_id`, `collection_name` | «Nico te invitó a "Regalos de cumple"» con botones Unirme / Ahora no |
| `team_pick_added` | Un miembro suma un pick | `collection_id`, `collection_name`, `pick_name` | «Maru agregó "Sillón individual" a Mudanza» |
| `date_shared` | Alguien comparte una fecha con personas puntuales | `date_id` | «Pedro te sumó a "Mudanza de Pedro"» |

Siempre llegan `target_user_id` (a quién avisar) y `actor_user_id` (quién lo hizo).

**Aviso antes de las fechas (tarea programada, una vez por día):**

- Para cada fila de `important_dates`: si faltan `notify_days_before` días para
  la próxima vez que cae (si `repeats_yearly`, cada año), avisar al dueño y a
  quien la ve (`person_ids` o miembros de `group_ids`).
- Para cada perfil con `birthday_public = true`: avisar a quien lo sigue 3 días
  antes («En 3 días es el cumple de Nacho. Mirá su lista»).
- **Por qué:** es lo central de Fechas importantes («Te avisamos antes»), y la
  app no puede hacerlo sola, porque necesita correr aunque nadie la abra.

---

## 3. Servidor: `GET /api/trends`

Lo llama Explorar → Tendencias. Si no existe o da error, la sección no se
muestra.

**Pedido:** `GET /api/trends?country=UY` y, con "Mis tiendas" elegido,
`&domains=zara.com,hm.com` (solo esas tiendas).

**Respuesta esperada:**

```json
{
  "top": [
    { "title": "Alfombra baño ROSVIK", "img": "https://…", "url": "https://…", "store": "JYSK", "priceText": "$ 719", "saves": 37 }
  ],
  "searches": [ { "q": "lentes de sol", "up": 40 } ],
  "stores": [ { "name": "JYSK", "domain": "jysk.com.uy", "url": "https://jysk.com.uy", "new_followers": 120 } ]
}
```

- `top`: productos más guardados en los últimos 7 días (de la tabla de picks,
  agrupando por URL). El primero es el "Nº 1 de la semana".
- `searches`: búsquedas que más crecieron contra la semana anterior; `up` en %.
  Sale de lo que ya se registra en `/api/search/products` o de PostHog
  (`product_search_results`).
- `stores`: tiendas que más gente sumó a Mis tiendas en la semana.
- **Por qué en el servidor:** necesita juntar datos de todos los usuarios. En
  el diseño, Agus dejó anotado que Tendencias "aún no me cierra", así que esto
  puede cambiar.

---

## 4. Otras cosas del diseño que te tocan

| Del diseño | Qué falta | Por qué |
|---|---|---|
| Invitar amigos con link | Un link de perfil o descarga (por ejemplo `picks.app/u/usuario`) | Hoy "Invitar" comparte solo el @usuario |
| Entrar con Google | Activar Google en Supabase Auth y la redirección a la app (`picks://`) | Hoy se entra solo con email |
| Compartir una colección en equipo con link | Una página pública como `/c/:id`, pero para colecciones en equipo | Hoy "Compartir" manda solo el nombre |

---

## 5. Cómo probarlo

1. Corré el SQL de la sección 1 en Supabase.
2. En Picks Prueba, abrí Amigos. Las secciones dejan de decir "Muy pronto".
3. Creá un grupo, una fecha y una colección en equipo invitando a otra cuenta.
4. Con la otra cuenta: aparece «Tenés una invitación» arriba de Amigos.
   Unirme la suma a la colección.

## 6. Para que Claude pueda subir cambios

Claude, desde la nube, no puede hacer `git push` a este repositorio (error 403)
porque la app de Claude no está instalada para `Fass2216/picks-app`.
Instalala en https://github.com/apps/claude/installations/select_target. Así
los cambios de Agus te llegan como Pull Request, sin pasar archivos a mano.
