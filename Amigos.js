// Pestaña Amigos del diseño nuevo: amigos, grupos, fechas importantes y
// colecciones en equipo. Va en un archivo aparte porque App.js es muy grande.
//
// Los datos de grupos, fechas y colecciones en equipo viven en tablas de
// Supabase que todavía hay que crear (ver PARA-FEDE.md). Mientras no existan,
// cada sección muestra "Muy pronto" en vez de datos inventados. Amigos (la
// tabla `follows`) y sus picks públicos ya funcionan hoy.
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Image, ActivityIndicator,
  Switch, Share, Alert, Modal, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Mismos valores que PK y DM de App.js
const A = {
  bg: '#FBF6F2', card: '#FFFFFF', ink: '#1E1A17', muted: '#6B625C', soft: '#5A5049',
  line: '#EDE4DD', pill: '#F1E9E2', accent: '#C2410C', accentDark: '#9A3412', accentLight: '#FDEBE2',
};
const F = { 400: 'DMSans_400Regular', 500: 'DMSans_500Medium', 600: 'DMSans_600SemiBold', 700: 'DMSans_700Bold', 800: 'DMSans_800ExtraBold' };
const TINTS = ['#F3E3D8', '#E3E0EC', '#DDE5DE', '#F0DCDC', '#DCE4EC', '#EDE6D3'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const GROUP_EMOJIS = ['⭐', '👥', '💼', '🏠', '🎉', '✈️', '🎁', '⚽'];
const DATE_KINDS = [
  { id: 'cumple', label: 'Cumple', emoji: '🎂' },
  { id: 'mudanza', label: 'Mudanza', emoji: '📦' },
  { id: 'aniversario', label: 'Aniversario', emoji: '🥂' },
  { id: 'viaje', label: 'Viaje', emoji: '✈️' },
  { id: 'fiesta', label: 'Fiesta', emoji: '🎄' },
  { id: 'otro', label: 'Otra', emoji: '📌' },
];
const NOTIFY_OPTIONS = [{ days: 1, label: '1 día antes' }, { days: 3, label: '3 días antes' }, { days: 7, label: '1 semana antes' }];

// ── Datos ───────────────────────────────────────────────────────────────────
// Si la tabla todavía no existe, Supabase responde 42P01 (Postgres) o PGRST2xx
// (no está en el esquema). En ese caso la sección queda en "Muy pronto".
function isNotReady(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === '42703' || code.startsWith('PGRST2') || /does not exist|schema cache/i.test(msg);
}

function createAmigosApi(supabase, backendUrl, me) {
  const run = async (query) => {
    try {
      const { data, error } = await query;
      if (error) return { data: null, ready: !isNotReady(error), error };
      return { data, ready: true, error: null };
    } catch (e) {
      return { data: null, ready: true, error: e };
    }
  };
  // Avisos para el servidor (notificaciones in-app/push). Si el servidor no
  // conoce el tipo todavía, lo ignora.
  const notify = (type, targetIds, extra = {}) => {
    (targetIds || []).filter(id => id && id !== me).forEach((target_user_id) => {
      fetch(`${backendUrl}/api/notifications/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target_user_id, actor_user_id: me, ...extra }),
      }).catch(() => {});
    });
  };
  return {
    notify,
    async friends() {
      const [following, followers] = await Promise.all([
        run(supabase.from('follows').select('following_id').eq('follower_id', me)),
        run(supabase.from('follows').select('follower_id').eq('following_id', me)),
      ]);
      const followingIds = (following.data || []).map(r => r.following_id);
      const followerIds = (followers.data || []).map(r => r.follower_id);
      const ids = [...new Set([...followingIds, ...followerIds])];
      let byId = {};
      if (ids.length) {
        // birthday_* pueden no existir todavía: si falla, se piden sin cumpleaños
        let res = await run(supabase.from('profiles').select('id, username, display_name, birthday_day, birthday_month, birthday_public').in('id', ids));
        if (res.error) res = await run(supabase.from('profiles').select('id, username, display_name').in('id', ids));
        (res.data || []).forEach(p => { byId[p.id] = p; });
      }
      return {
        following: followingIds.map(id => byId[id]).filter(Boolean),
        // Te siguen y vos no: "gente que quizás conocés"
        suggested: followerIds.filter(id => !followingIds.includes(id)).map(id => byId[id]).filter(Boolean),
      };
    },
    follow: (id) => run(supabase.from('follows').insert({ follower_id: me, following_id: id })),
    unfollow: (id) => run(supabase.from('follows').delete().eq('follower_id', me).eq('following_id', id)),
    async publicPicks(userId) {
      try {
        const res = await fetch(`${backendUrl}/api/picks/public/${userId}`);
        const json = await res.json();
        return Array.isArray(json.picks) ? json.picks : [];
      } catch (e) {
        return [];
      }
    },
    // Grupos
    groups: () => run(supabase.from('friend_groups').select('id, name, emoji, friend_group_members(user_id)').eq('owner_id', me).order('created_at')),
    async createGroup({ name, emoji, memberIds }) {
      const res = await run(supabase.from('friend_groups').insert({ owner_id: me, name, emoji }).select('id').single());
      if (res.error || !res.data) return res;
      if (memberIds.length) {
        const m = await run(supabase.from('friend_group_members').insert(memberIds.map(user_id => ({ group_id: res.data.id, user_id }))));
        if (m.error) return m;
      }
      return res;
    },
    // Fechas: la base solo devuelve las que te dejan ver (las tuyas y las que
    // compartieron con vos o con un grupo tuyo)
    dates: () => run(supabase.from('important_dates').select('*').order('month').order('day')),
    async createDate(row) {
      const res = await run(supabase.from('important_dates').insert({ owner_id: me, ...row }).select('id').single());
      if (!res.error && row.visibility !== 'private') notify('date_shared', row.person_ids || [], { date_id: res.data?.id });
      return res;
    },
    myBirthday: () => run(supabase.from('profiles').select('birthday_day, birthday_month, birthday_year, birthday_public').eq('id', me).maybeSingle()),
    saveBirthday: (b) => run(supabase.from('profiles').update(b).eq('id', me)),
    // Colecciones en equipo
    myTeamCollections: () => run(supabase.from('team_collection_members')
      .select('status, role, collection:team_collections(id, name, emoji, owner_id, allow_member_add, created_at, team_collection_members(user_id, status), team_collection_picks(id, img, created_at))')
      .eq('user_id', me)),
    async createTeamCollection({ name, emoji, memberIds, allowMemberAdd }) {
      const res = await run(supabase.from('team_collections').insert({ owner_id: me, name, emoji, allow_member_add: allowMemberAdd }).select('id').single());
      if (res.error || !res.data) return res;
      const rows = [{ collection_id: res.data.id, user_id: me, role: 'owner', status: 'joined' },
        ...memberIds.map(user_id => ({ collection_id: res.data.id, user_id, role: 'member', status: 'invited', invited_by: me }))];
      const m = await run(supabase.from('team_collection_members').insert(rows));
      if (m.error) return m;
      notify('team_invite', memberIds, { collection_id: res.data.id, collection_name: name });
      return res;
    },
    async inviteToTeam(collection, memberIds) {
      const res = await run(supabase.from('team_collection_members').insert(memberIds.map(user_id => ({ collection_id: collection.id, user_id, role: 'member', status: 'invited', invited_by: me }))));
      if (!res.error) notify('team_invite', memberIds, { collection_id: collection.id, collection_name: collection.name });
      return res;
    },
    answerInvite: (collectionId, accept) => accept
      ? run(supabase.from('team_collection_members').update({ status: 'joined' }).eq('collection_id', collectionId).eq('user_id', me))
      : run(supabase.from('team_collection_members').delete().eq('collection_id', collectionId).eq('user_id', me)),
    teamCollection: (id) => run(supabase.from('team_collections')
      .select('id, name, emoji, owner_id, allow_member_add, team_collection_members(user_id, status, role), team_collection_picks(id, added_by, name, img, url, domain, price, created_at)')
      .eq('id', id).maybeSingle()),
    async addTeamPick(collection, pick, memberIds) {
      const res = await run(supabase.from('team_collection_picks').insert({
        collection_id: collection.id, added_by: me, name: pick.name, img: pick.img, url: pick.url, domain: pick.domain, price: pick.price || null,
      }));
      if (!res.error) notify('team_pick_added', memberIds, { collection_id: collection.id, collection_name: collection.name, pick_name: pick.name });
      return res;
    },
  };
}

// ── Ayudas ──────────────────────────────────────────────────────────────────
const personName = (p) => {
  const n = p?.display_name;
  if (n && !String(n).includes('@')) return n;
  return p?.username ? `@${p.username}` : 'Alguien';
};
const firstName = (p) => personName(p).replace(/^@/, '').split(' ')[0];
const initial = (p) => (personName(p).replace(/^@/, '') || '?').charAt(0).toUpperCase();

// Próxima vez que cae una fecha (día/mes; si no se repite y ya pasó, null)
function nextOccurrence(day, month, year, repeats) {
  if (!day || !month) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (year && !repeats) {
    const d = new Date(year, month - 1, day);
    return d >= today ? d : null;
  }
  let d = new Date(today.getFullYear(), month - 1, day);
  if (d < today) d = new Date(today.getFullYear() + 1, month - 1, day);
  return d;
}
function daysUntil(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function whenLabel(days) {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days < 14) return `En ${days} días`;
  return `En ${Math.round(days / 7)} sem.`;
}
const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
const priceText = (p) => (p.price_current || p.price_saved || p.price ? `$ ${p.price_current || p.price_saved || p.price}`.replace('$ $', '$') : '');
const storeOf = (p) => {
  if (p.domain) return p.domain.replace(/^www\./, '').split('.')[0];
  try { return new URL(p.url).hostname.replace(/^www\./, '').split('.')[0]; } catch (e) { return ''; }
};

// ── Piezas chicas ───────────────────────────────────────────────────────────
function Avatar({ person, size = 44, avatarUrlFor, index = 0 }) {
  const [failed, setFailed] = useState(false);
  const uri = !failed && person?.id && avatarUrlFor ? avatarUrlFor(person.id) : null;
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: TINTS[index % TINTS.length] }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} onError={() => setFailed(true)} />
      ) : (
        <Text style={{ fontFamily: F[700], fontSize: size * 0.4, color: A.ink }}>{initial(person)}</Text>
      )}
    </View>
  );
}

function Header({ title, onBack, backLabel, right }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.back} hitSlop={8} accessibilityLabel={`Volver a ${backLabel || 'Amigos'}`}>
          <Ionicons name="chevron-back" size={24} color={A.ink} />
          <Text style={s.backText}>{backLabel || 'Amigos'}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.title}>{title}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View>
    </View>
  );
}

function Section({ title, sub, link, onLink, children }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>{title}</Text>
          {!!sub && <Text style={s.sectionSub}>{sub}</Text>}
        </View>
        {!!link && (
          <TouchableOpacity onPress={onLink} hitSlop={10}>
            <Text style={s.link}>{link}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function SoonCard({ icon, text }) {
  return (
    <View style={s.soon}>
      <Ionicons name={icon} size={20} color={A.accent} />
      <Text style={s.soonText}>{text}</Text>
      <View style={s.soonPill}><Text style={s.soonPillText}>Muy pronto</Text></View>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, busy, ghost }) {
  return (
    <TouchableOpacity
      style={[s.btn, ghost && s.btnGhost, (disabled || busy) && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
    >
      {busy ? <ActivityIndicator color={ghost ? A.accent : '#fff'} /> : <Text style={[s.btnText, ghost && { color: A.accent }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipOn]} onPress={onPress} activeOpacity={0.8} accessibilityState={{ selected: !!active }}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PickCard({ p, index, by, onOpen }) {
  return (
    <TouchableOpacity style={s.pickCard} onPress={onOpen} activeOpacity={0.88}>
      <View style={[s.pickImg, { backgroundColor: TINTS[index % TINTS.length] }]}>
        {p.img ? <Image source={{ uri: p.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Ionicons name="image-outline" size={26} color={A.muted} />}
        {!!by && (
          <View style={s.byPill}><Text style={s.byPillText} numberOfLines={1}>{by}</Text></View>
        )}
      </View>
      <Text style={s.pickStore} numberOfLines={1}>{storeOf(p)}</Text>
      <Text style={s.pickName} numberOfLines={1}>{p.name || p.title}</Text>
      {!!priceText(p) && <Text style={s.pickPrice}>{priceText(p)}</Text>}
    </TouchableOpacity>
  );
}

function FriendPicker({ friends, selected, onToggle, avatarUrlFor }) {
  if (!friends.length) return <Text style={s.sectionSub}>Todavía no seguís a nadie. Buscá gente desde Amigos.</Text>;
  return (
    <View style={{ gap: 2 }}>
      {friends.map((f, i) => {
        const on = selected.includes(f.id);
        return (
          <TouchableOpacity key={f.id} style={s.row} onPress={() => onToggle(f.id)} activeOpacity={0.75} accessibilityState={{ checked: on }}>
            <Avatar person={f} size={40} avatarUrlFor={avatarUrlFor} index={i} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{personName(f)}</Text>
              {!!f.username && <Text style={s.rowSub}>@{f.username}</Text>}
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? A.accent : A.line} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────
// Si la app tiene un fondo elegido, las pantallas lo dejan ver (como Mis tiendas y Mis Picks)
let amigosTransparent = false;
const bgStyle = () => (amigosTransparent ? { backgroundColor: 'transparent' } : null);

export default function AmigosScreen(props) {
  const { userProfile, onOpenAuth, bottomInset = 0 } = props;
  amigosTransparent = !!props.transparent;
  const [stack, setStack] = useState([{ name: 'home' }]);
  const view = stack[stack.length - 1];
  const push = (name, params = {}) => setStack(st => [...st, { name, params }]);
  const pop = () => setStack(st => (st.length > 1 ? st.slice(0, -1) : st));

  if (!userProfile) {
    return (
      <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
        <Header title="Amigos" />
        <View style={[s.center, { paddingBottom: bottomInset }]}>
          <Ionicons name="people-outline" size={44} color={A.accent} />
          <Text style={[s.sectionTitle, { textAlign: 'center' }]}>Guardá con tus amigos</Text>
          <Text style={[s.sectionSub, { textAlign: 'center' }]}>Entrá a tu cuenta para ver lo que guardan, armar colecciones juntos y no olvidarte de sus fechas.</Text>
          <PrimaryButton label="Entrar" onPress={onOpenAuth} />
        </View>
      </SafeAreaView>
    );
  }
  const common = { ...props, push, pop };
  if (view.name === 'perfil') return <AmigoPerfil {...common} {...view.params} />;
  if (view.name === 'invitar') return <InvitarAmigos {...common} />;
  if (view.name === 'grupo') return <NuevoGrupo {...common} />;
  if (view.name === 'fechas') return <FechasImportantes {...common} />;
  if (view.name === 'nuevaFecha') return <AgregarFecha {...common} {...view.params} />;
  if (view.name === 'coleccion') return <ColeccionEquipo {...common} {...view.params} />;
  if (view.name === 'nuevaColeccion') return <NuevaColeccion {...common} {...view.params} />;
  return <AmigosHome {...common} />;
}

function useApi(props) {
  const { supabase, backendUrl, userProfile } = props;
  return createAmigosApi(supabase, backendUrl, userProfile.id);
}

// ── 4 · Amigos ──────────────────────────────────────────────────────────────
function AmigosHome(props) {
  const { push, onOpenUrl, onOpenCommunity, avatarUrlFor, bottomInset, track, bell } = props;
  const api = useApi(props);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState({ ready: true, list: [] });
  const [teams, setTeams] = useState({ ready: true, joined: [], invites: [] });
  const [nextDates, setNextDates] = useState({ ready: true, list: [] });
  const [feed, setFeed] = useState([]);
  const [answering, setAnswering] = useState(null);
  const [joinedMsg, setJoinedMsg] = useState('');

  const load = useCallback(async () => {
    const [fr, gr, tm, dt] = await Promise.all([api.friends(), api.groups(), api.myTeamCollections(), api.dates()]);
    setFriends(fr.following);
    setGroups({ ready: gr.ready, list: gr.data || [] });
    const rows = (tm.data || []).filter(r => r.collection);
    setTeams({ ready: tm.ready, joined: rows.filter(r => r.status === 'joined').map(r => r.collection), invites: rows.filter(r => r.status === 'invited').map(r => r.collection) });
    setNextDates({ ready: dt.ready, list: upcomingDates(dt.data || [], fr.following).slice(0, 2) });
    setLoading(false);
    // Lo que guardaron: los picks públicos más nuevos de hasta 6 amigos
    const lists = await Promise.all(fr.following.slice(0, 6).map(f => api.publicPicks(f.id).then(ps => ps.slice(0, 4).map(p => ({ ...p, by: f })))));
    setFeed(lists.flat().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 8));
  }, [props.userProfile.id]);
  useEffect(() => { load(); }, [load]);

  const answer = async (col, accept) => {
    setAnswering(col.id);
    const res = await api.answerInvite(col.id, accept);
    setAnswering(null);
    if (res.error) { Alert.alert('No pudimos responder', 'Revisá tu conexión y probá de nuevo.'); return; }
    track?.('team_invite_answered', { accept });
    if (accept) setJoinedMsg(`Listo, ya sos parte de «${col.name}».`);
    load();
  };

  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <View style={s.logoRow}>
        <Text style={s.logo}>Picks</Text>
        {bell || null}
      </View>
      <Header
        title="Amigos"
        right={(
          <TouchableOpacity style={s.invitePill} onPress={() => push('invitar')} activeOpacity={0.85}>
            <Ionicons name="person-add-outline" size={15} color={A.accent} />
            <Text style={s.invitePillText}>Invitar</Text>
          </TouchableOpacity>
        )}
      />
      {loading ? <ActivityIndicator color={A.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]} showsVerticalScrollIndicator={false}>
          {!!joinedMsg && <View style={s.okBanner}><Ionicons name="checkmark-circle" size={18} color={A.accentDark} /><Text style={s.okText}>{joinedMsg}</Text></View>}
          {teams.invites.map(col => (
            <View key={col.id} style={s.inviteCard}>
              <Text style={s.inviteEyebrow}>Tenés una invitación</Text>
              <Text style={s.inviteTitle}>Te invitaron a «{col.name}»</Text>
              <Text style={s.sectionSub}>Todos los de la colección suman picks.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><PrimaryButton label="Unirme" busy={answering === col.id} onPress={() => answer(col, true)} /></View>
                <View style={{ flex: 1 }}><PrimaryButton ghost label="Ahora no" onPress={() => answer(col, false)} /></View>
              </View>
            </View>
          ))}

          <Section title="Tus amigos" sub={friends.length ? `${friends.length} ${friends.length === 1 ? 'persona' : 'personas'}` : null} link="Buscar gente" onLink={onOpenCommunity}>
            {friends.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                {friends.map((f, i) => (
                  <TouchableOpacity key={f.id} style={{ alignItems: 'center', gap: 4, width: 60 }} onPress={() => push('perfil', { person: f })} activeOpacity={0.8}>
                    <Avatar person={f} size={56} avatarUrlFor={avatarUrlFor} index={i} />
                    <Text style={s.avatarName} numberOfLines={1}>{firstName(f)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <TouchableOpacity style={s.soon} onPress={onOpenCommunity} activeOpacity={0.85}>
                <Ionicons name="search-outline" size={20} color={A.accent} />
                <Text style={s.soonText}>Todavía no seguís a nadie. Buscá a tus amigos por su usuario.</Text>
              </TouchableOpacity>
            )}
          </Section>

          <Section title="Tus grupos" link={groups.ready ? 'Nuevo grupo' : null} onLink={() => push('grupo')}>
            {!groups.ready ? <SoonCard icon="people-circle-outline" text="Armá grupos (Familia, Trabajo…) para compartir fechas y colecciones solo con algunos." /> : groups.list.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {groups.list.map(g => (
                  <View key={g.id} style={s.groupChip}>
                    <Text style={{ fontSize: 16 }}>{g.emoji || '👥'}</Text>
                    <Text style={s.groupName}>{g.name}</Text>
                    <Text style={s.groupCount}>{(g.friend_group_members || []).length}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <TouchableOpacity style={s.soon} onPress={() => push('grupo')} activeOpacity={0.85}>
                <Ionicons name="add-circle-outline" size={20} color={A.accent} />
                <Text style={s.soonText}>Armá tu primer grupo: Familia, Trabajo, Amigos…</Text>
              </TouchableOpacity>
            )}
          </Section>

          <Section title="Fechas importantes" link={nextDates.ready ? 'Ver todas' : null} onLink={() => push('fechas')}>
            {!nextDates.ready ? <SoonCard icon="calendar-outline" text="Cumples, mudanzas y aniversarios de tus amigos, con aviso antes." /> : nextDates.list.length ? (
              <View style={{ gap: 8 }}>
                {nextDates.list.map(d => <DateRow key={d.key} d={d} />)}
              </View>
            ) : (
              <TouchableOpacity style={s.soon} onPress={() => push('nuevaFecha')} activeOpacity={0.85}>
                <Ionicons name="calendar-outline" size={20} color={A.accent} />
                <Text style={s.soonText}>Sumá una fecha y te avisamos antes.</Text>
              </TouchableOpacity>
            )}
          </Section>

          <Section title="Colecciones con tus amigos" sub={teams.ready && teams.joined.length ? `${teams.joined.length}` : null} link={teams.ready ? 'Nueva' : null} onLink={() => push('nuevaColeccion')}>
            {!teams.ready ? <SoonCard icon="albums-outline" text="Armá colecciones en equipo: una mudanza, un regalo, un viaje. Todos suman picks." /> : teams.joined.length ? (
              <View style={{ gap: 8 }}>
                {teams.joined.map(col => {
                  const picks = col.team_collection_picks || [];
                  const members = (col.team_collection_members || []).filter(m => m.status === 'joined');
                  return (
                    <TouchableOpacity key={col.id} style={s.teamRow} onPress={() => push('coleccion', { collectionId: col.id })} activeOpacity={0.85}>
                      <View style={s.teamThumb}>
                        {picks[0]?.img ? <Image source={{ uri: picks[0].img }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 22 }}>{col.emoji || '🛍️'}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle}>{col.name}</Text>
                        <Text style={s.rowSub}>{members.length} {members.length === 1 ? 'persona' : 'personas'} · {picks.length} picks</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={A.muted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity style={s.soon} onPress={() => push('nuevaColeccion')} activeOpacity={0.85}>
                <Ionicons name="albums-outline" size={20} color={A.accent} />
                <Text style={s.soonText}>Armá una colección con tus amigos: todos suman picks.</Text>
              </TouchableOpacity>
            )}
          </Section>

          {feed.length > 0 && (
            <Section title="Lo que guardaron">
              <View style={s.grid}>
                {feed.map((p, i) => <PickCard key={`${p.id}-${i}`} p={p} index={i} by={firstName(p.by)} onOpen={() => p.url && onOpenUrl?.(p.url, 'Amigos')} />)}
              </View>
            </Section>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Fechas propias y compartidas + cumples de amigos que lo muestran, ordenadas
// por cuándo caen
function upcomingDates(rows, friends) {
  const out = [];
  rows.forEach(r => {
    const d = nextOccurrence(r.day, r.month, r.year, r.repeats_yearly);
    if (d) out.push({ key: `d-${r.id}`, emoji: r.emoji || '📌', title: r.title, audience: r.visibility === 'private' ? '🔒 Solo vos' : r.visibility === 'groups' ? '👥 Con tus grupos' : '👥 Compartida', date: d, days: daysUntil(d) });
  });
  friends.forEach(f => {
    if (!f.birthday_public || !f.birthday_day || !f.birthday_month) return;
    const d = nextOccurrence(f.birthday_day, f.birthday_month, null, true);
    out.push({ key: `b-${f.id}`, emoji: '🎂', title: `Cumple de ${firstName(f)}`, audience: 'Amigos', date: d, days: daysUntil(d) });
  });
  return out.sort((a, b) => a.days - b.days);
}

function DateRow({ d }) {
  const soon = d.days <= 7;
  return (
    <View style={[s.dateRow, soon && { borderColor: A.accent, backgroundColor: A.accentLight }]}>
      <View style={s.dateEmoji}><Text style={{ fontSize: 20 }}>{d.emoji}</Text></View>
      <View style={{ flex: 1 }}>
        {soon && <Text style={s.dateSoon}>{whenLabel(d.days)}</Text>}
        <Text style={s.rowTitle} numberOfLines={1}>{d.title}</Text>
        <Text style={s.rowSub}>{d.audience}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.dateDay}>{shortDate(d.date)}</Text>
        {!soon && <Text style={s.rowSub}>{whenLabel(d.days).toLowerCase()}</Text>}
      </View>
    </View>
  );
}

// ── 4c · Perfil de un amigo ─────────────────────────────────────────────────
function AmigoPerfil(props) {
  const { person, pop, push, onOpenUrl, avatarUrlFor, bottomInset, track } = props;
  const api = useApi(props);
  const [picks, setPicks] = useState(null);
  const [following, setFollowing] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.publicPicks(person.id).then(setPicks); }, [person.id]);

  const toggleFollow = async () => {
    setBusy(true);
    const res = following ? await api.unfollow(person.id) : await api.follow(person.id);
    setBusy(false);
    if (res.error) { Alert.alert('No pudimos actualizar', 'Probá de nuevo.'); return; }
    if (!following) api.notify('new_follower', [person.id]);
    track?.(following ? 'unfollow' : 'follow', { from: 'amigos_perfil' });
    setFollowing(f => !f);
  };

  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Avatar person={person} size={84} avatarUrlFor={avatarUrlFor} />
          <Text style={s.bigName}>{personName(person)}</Text>
          {!!person.username && <Text style={s.rowSub}>@{person.username}</Text>}
          <Text style={s.rowSub}><Text style={s.statNum}>{picks ? picks.length : '–'}</Text> picks públicos</Text>
          <View style={{ width: 180, marginTop: 6 }}>
            <PrimaryButton ghost={following} busy={busy} label={following ? 'Siguiendo' : 'Seguir'} onPress={toggleFollow} />
          </View>
        </View>
        <TouchableOpacity style={s.ctaCard} onPress={() => push('nuevaColeccion', { preselected: [person.id], suggestedName: '' })} activeOpacity={0.85}>
          <View style={s.dateEmoji}><Ionicons name="albums-outline" size={20} color={A.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Armar una colección con {firstName(person)}</Text>
            <Text style={s.rowSub}>Los dos suman picks a la misma lista</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={A.muted} />
        </TouchableOpacity>
        <Section title="Últimos picks">
          {picks === null ? <ActivityIndicator color={A.accent} /> : picks.length ? (
            <View style={s.grid}>
              {picks.slice(0, 12).map((p, i) => <PickCard key={p.id || i} p={p} index={i} onOpen={() => p.url && onOpenUrl?.(p.url, firstName(person))} />)}
            </View>
          ) : <Text style={s.sectionSub}>Todavía no tiene picks públicos.</Text>}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 4b · Invitar amigos ─────────────────────────────────────────────────────
function InvitarAmigos(props) {
  const { pop, push, userProfile, avatarUrlFor, bottomInset, track } = props;
  const api = useApi(props);
  const [suggested, setSuggested] = useState([]);
  const [followed, setFollowed] = useState({});
  useEffect(() => { api.friends().then(r => setSuggested(r.suggested)); }, []);
  // Todavía no hay link propio de descarga/perfil: se comparte el usuario
  const shareText = `Estoy usando Picks para guardar lo que me gusta de cualquier tienda.${userProfile?.username ? ` Buscame como @${userProfile.username}.` : ''}`;
  const share = () => { Share.share({ message: shareText }).catch(() => {}); track?.('friends_invite_shared', {}); };
  const follow = async (id) => {
    const res = await api.follow(id);
    if (!res.error) { setFollowed(f => ({ ...f, [id]: true })); api.notify('new_follower', [id]); }
  };
  const ideas = [
    { e: '📦', t: 'Una mudanza', d: 'Entre todos juntan lo que falta para la casa nueva.' },
    { e: '🎁', t: 'Un regalo', d: 'Ideas para el cumple de alguien, sin que se entere.' },
    { e: '✈️', t: 'Un viaje', d: 'Lo que hay que llevar, en una sola lista.' },
  ];
  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]}>
        <Text style={s.pageTitle}>Invitar amigos</Text>
        <View style={s.shareCard}>
          <Text style={s.rowTitle}>Guardá lo que te gusta, ahora más fácil</Text>
          <Text style={s.sectionSub}>Con tus amigos en Picks, cada idea que ven queda en un solo lugar.</Text>
          {!!userProfile?.username && <Text style={s.handle}>@{userProfile.username}</Text>}
          <PrimaryButton label="Compartir invitación" onPress={share} />
        </View>
        <Section title="Todo lo que podés hacer con las colecciones">
          <View style={{ gap: 8 }}>
            {ideas.map(k => (
              <View key={k.t} style={s.dateRow}>
                <View style={s.dateEmoji}><Text style={{ fontSize: 20 }}>{k.e}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.rowTitle}>{k.t}</Text><Text style={s.rowSub}>{k.d}</Text></View>
              </View>
            ))}
          </View>
        </Section>
        <TouchableOpacity style={s.ctaCard} onPress={() => push('grupo')} activeOpacity={0.85}>
          <View style={s.dateEmoji}><Text style={{ fontSize: 20 }}>👥</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Armá un grupo</Text>
            <Text style={s.rowSub}>Para compartir fechas y colecciones solo con algunos.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={A.muted} />
        </TouchableOpacity>
        {suggested.length > 0 && (
          <Section title="Gente que quizás conocés" sub="Te siguen y vos todavía no">
            {suggested.map((f, i) => (
              <View key={f.id} style={s.row}>
                <Avatar person={f} size={40} avatarUrlFor={avatarUrlFor} index={i} />
                <View style={{ flex: 1 }}><Text style={s.rowTitle}>{personName(f)}</Text>{!!f.username && <Text style={s.rowSub}>@{f.username}</Text>}</View>
                <TouchableOpacity style={[s.smallBtn, followed[f.id] && s.smallBtnOn]} disabled={!!followed[f.id]} onPress={() => follow(f.id)}>
                  <Text style={[s.smallBtnText, followed[f.id] && { color: A.accentDark }]}>{followed[f.id] ? 'Siguiendo' : 'Seguir'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 4g · Nuevo grupo ────────────────────────────────────────────────────────
function NuevoGrupo(props) {
  const { pop, avatarUrlFor, bottomInset, track } = props;
  const api = useApi(props);
  const [friends, setFriends] = useState([]);
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.friends().then(r => setFriends(r.following)); }, []);
  const toggle = (id) => setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));
  const create = async () => {
    setBusy(true);
    const res = await api.createGroup({ name: name.trim(), emoji, memberIds: selected });
    setBusy(false);
    if (!res.ready) { Alert.alert('Muy pronto', 'Los grupos todavía no están activados. Ya casi.'); return; }
    if (res.error) { Alert.alert('No pudimos crear el grupo', 'Revisá tu conexión y probá de nuevo.'); return; }
    track?.('friend_group_created', { members: selected.length });
    pop();
  };
  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>Nuevo grupo</Text>
        <Text style={s.sectionSub}>Armá un grupo para compartir fechas y colecciones solo con esa gente.</Text>
        <Section title="Ícono">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GROUP_EMOJIS.map(e => (
              <TouchableOpacity key={e} style={[s.emojiBtn, emoji === e && s.emojiBtnOn]} onPress={() => setEmoji(e)} accessibilityState={{ selected: emoji === e }}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
        <Section title="Nombre">
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ej: Familia, Trabajo, Fútbol" placeholderTextColor={A.muted} maxLength={40} />
        </Section>
        <Section title="Quiénes" sub={selected.length ? `${selected.length} elegidos` : null}>
          <FriendPicker friends={friends} selected={selected} onToggle={toggle} avatarUrlFor={avatarUrlFor} />
        </Section>
        <PrimaryButton label={name.trim() ? `Crear «${name.trim()}»` : 'Crear grupo'} disabled={!name.trim()} busy={busy} onPress={create} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 4e · Fechas importantes ─────────────────────────────────────────────────
function FechasImportantes(props) {
  const { pop, push, bottomInset } = props;
  const api = useApi(props);
  const [state, setState] = useState({ loading: true, ready: true, list: [] });
  const [bday, setBday] = useState(null);
  const load = useCallback(async () => {
    const [dt, fr, mine] = await Promise.all([api.dates(), api.friends(), api.myBirthday()]);
    setState({ loading: false, ready: dt.ready, list: upcomingDates(dt.data || [], fr.following) });
    setBday(mine.ready && !mine.error ? (mine.data || {}) : null);
  }, []);
  useEffect(() => { load(); }, [load]);
  const next = state.list[0];
  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]}>
        <Text style={s.pageTitle}>Fechas importantes</Text>
        <Text style={s.sectionSub}>Lo que vale la pena recordar con tus amigos. Te avisamos antes.</Text>
        {state.loading ? <ActivityIndicator color={A.accent} /> : !state.ready ? (
          <SoonCard icon="calendar-outline" text="Cumples, mudanzas y aniversarios de tus amigos, con aviso antes." />
        ) : (
          <>
            {!!bday && <MyBirthdayCard api={api} value={bday} onSaved={load} />}
            {next && next.days <= 7 && (
              <View style={s.heroDate}>
                <Text style={s.dateSoon}>{whenLabel(next.days)}</Text>
                <Text style={s.heroDateTitle}>{next.emoji} {next.title}</Text>
                <Text style={s.rowSub}>{shortDate(next.date)} · {next.audience}</Text>
              </View>
            )}
            <Section title="Próximas">
              {state.list.length ? (
                <View style={{ gap: 8 }}>{state.list.map(d => <DateRow key={d.key} d={d} />)}</View>
              ) : <Text style={s.sectionSub}>Todavía no hay fechas. Sumá la primera.</Text>}
            </Section>
            <PrimaryButton ghost label="+ Sumar una fecha" onPress={() => push('nuevaFecha')} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Tu cumple: tus amigos reciben un aviso antes si lo mostrás
function MyBirthdayCard({ api, value, onSaved }) {
  const [day, setDay] = useState(value.birthday_day ? String(value.birthday_day) : '');
  const [month, setMonth] = useState(value.birthday_month || null);
  const [pub, setPub] = useState(value.birthday_public !== false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const d = parseInt(day, 10);
  const valid = d >= 1 && d <= 31 && month;
  const save = async () => {
    setBusy(true);
    const res = await api.saveBirthday({ birthday_day: d, birthday_month: month, birthday_public: pub });
    setBusy(false);
    if (res.error) { Alert.alert('No pudimos guardar tu cumple', 'Probá de nuevo.'); return; }
    setSaved(true);
    onSaved?.();
  };
  return (
    <View style={s.shareCard}>
      <Text style={s.rowTitle}>Tu cumpleaños</Text>
      <Text style={s.sectionSub}>Tus amigos reciben un aviso antes y pueden armarte una lista de regalos.</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput style={[s.input, { width: 70, textAlign: 'center' }]} value={day} onChangeText={t => { setDay(t.replace(/\D/g, '').slice(0, 2)); setSaved(false); }} keyboardType="number-pad" placeholder="Día" placeholderTextColor={A.muted} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {MONTHS.map((m, i) => <Chip key={m} label={m.slice(0, 3)} active={month === i + 1} onPress={() => { setMonth(i + 1); setSaved(false); }} />)}
        </ScrollView>
      </View>
      <View style={s.switchRow}>
        <View style={{ flex: 1 }}><Text style={s.rowTitle}>Mostrar mi cumple a mis amigos</Text><Text style={s.rowSub}>Aparece en sus Fechas importantes.</Text></View>
        <Switch value={pub} onValueChange={v => { setPub(v); setSaved(false); }} trackColor={{ true: A.accent, false: A.line }} thumbColor="#fff" />
      </View>
      <PrimaryButton label={saved ? 'Guardado' : 'Guardar'} disabled={!valid || saved} busy={busy} onPress={save} />
    </View>
  );
}

// ── 4f · Agregar fecha ──────────────────────────────────────────────────────
function AgregarFecha(props) {
  const { pop, push, avatarUrlFor, bottomInset, track } = props;
  const api = useApi(props);
  const [kind, setKind] = useState(DATE_KINDS[1]);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [visibility, setVisibility] = useState('private');
  const [groupIds, setGroupIds] = useState([]);
  const [personIds, setPersonIds] = useState([]);
  const [notifyDays, setNotifyDays] = useState(3);
  const [makeTeam, setMakeTeam] = useState(false);
  const [repeats, setRepeats] = useState(false);
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.groups().then(r => setGroups(r.data || []));
    api.friends().then(r => setFriends(r.following));
  }, []);
  const pickKind = (k) => { setKind(k); setRepeats(k.id === 'cumple' || k.id === 'aniversario'); };
  const d = parseInt(day, 10);
  const valid = title.trim() && d >= 1 && d <= 31 && month;
  const toggleIn = (list, set) => (id) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const save = async () => {
    setBusy(true);
    let teamId = null;
    if (makeTeam) {
      // Las personas de la fecha (y las de sus grupos) quedan invitadas
      const fromGroups = groups.filter(g => groupIds.includes(g.id)).flatMap(g => (g.friend_group_members || []).map(m => m.user_id));
      const members = [...new Set([...personIds, ...fromGroups])];
      const t = await api.createTeamCollection({ name: title.trim(), emoji: kind.emoji, memberIds: members, allowMemberAdd: true });
      if (!t.error) teamId = t.data?.id || null;
    }
    const res = await api.createDate({
      title: title.trim(), kind: kind.id, emoji: kind.emoji, day: d, month, year: parseInt(year, 10) || null,
      repeats_yearly: repeats, visibility, group_ids: visibility === 'groups' ? groupIds : [], person_ids: visibility === 'people' ? personIds : [],
      notify_days_before: notifyDays, team_collection_id: teamId,
    });
    setBusy(false);
    if (!res.ready) { Alert.alert('Muy pronto', 'Las fechas importantes todavía no están activadas. Ya casi.'); return; }
    if (res.error) { Alert.alert('No pudimos guardar la fecha', 'Revisá tu conexión y probá de nuevo.'); return; }
    track?.('important_date_created', { kind: kind.id, visibility, team: !!teamId });
    pop();
  };

  const visOptions = [
    { id: 'private', e: '🔒', t: 'Solo vos', d: 'Nadie más la ve.' },
    { id: 'groups', e: '👥', t: 'Tus grupos', d: 'La ven los grupos que elijas.' },
    { id: 'people', e: '🙋', t: 'Algunas personas', d: 'Elegís quiénes.' },
  ];
  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} backLabel="Fechas" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>Nueva fecha</Text>
        <Section title="Qué querés recordar">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DATE_KINDS.map(k => <Chip key={k.id} label={`${k.emoji} ${k.label}`} active={kind.id === k.id} onPress={() => pickKind(k)} />)}
          </View>
        </Section>
        <Section title="Nombre">
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={kind.id === 'cumple' ? 'Ej: Cumple de Pablo' : 'Ej: Mudanza de Pedro'} placeholderTextColor={A.muted} maxLength={60} />
        </Section>
        <Section title="Fecha">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { width: 70, textAlign: 'center' }]} value={day} onChangeText={t => setDay(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="Día" placeholderTextColor={A.muted} />
            <TextInput style={[s.input, { width: 90, textAlign: 'center' }]} value={year} onChangeText={t => setYear(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="Año" placeholderTextColor={A.muted} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {MONTHS.map((m, i) => <Chip key={m} label={m} active={month === i + 1} onPress={() => setMonth(i + 1)} />)}
          </ScrollView>
        </Section>
        <Section title="Quién la ve" sub="Por defecto es privada: solo la ves vos.">
          <View style={{ gap: 8 }}>
            {visOptions.map(v => (
              <TouchableOpacity key={v.id} style={[s.dateRow, visibility === v.id && { borderColor: A.accent }]} onPress={() => setVisibility(v.id)} accessibilityState={{ selected: visibility === v.id }}>
                <View style={s.dateEmoji}><Text style={{ fontSize: 18 }}>{v.e}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.rowTitle}>{v.t}</Text><Text style={s.rowSub}>{v.d}</Text></View>
                <Ionicons name={visibility === v.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={visibility === v.id ? A.accent : A.line} />
              </TouchableOpacity>
            ))}
          </View>
          {visibility === 'groups' && (
            groups.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {groups.map(g => <Chip key={g.id} label={`${g.emoji || '👥'} ${g.name}`} active={groupIds.includes(g.id)} onPress={() => toggleIn(groupIds, setGroupIds)(g.id)} />)}
              </View>
            ) : (
              <TouchableOpacity onPress={() => push('grupo')}><Text style={s.link}>+ Nuevo grupo</Text></TouchableOpacity>
            )
          )}
          {visibility === 'people' && <FriendPicker friends={friends} selected={personIds} onToggle={toggleIn(personIds, setPersonIds)} avatarUrlFor={avatarUrlFor} />}
          <Text style={s.rowSub}>Tu cumpleaños se configura arriba, en Fechas importantes.</Text>
        </Section>
        <Section title="Avisarme">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NOTIFY_OPTIONS.map(o => <Chip key={o.days} label={o.label} active={notifyDays === o.days} onPress={() => setNotifyDays(o.days)} />)}
          </View>
        </Section>
        <Section title="Opciones">
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}><Text style={s.rowTitle}>Armar una colección en equipo</Text><Text style={s.rowSub}>«{title.trim() || 'Esta fecha'}»: todos suman picks y regalos.</Text></View>
            <Switch value={makeTeam} onValueChange={setMakeTeam} trackColor={{ true: A.accent, false: A.line }} thumbColor="#fff" />
          </View>
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}><Text style={s.rowTitle}>Repetir cada año</Text><Text style={s.rowSub}>Para cumples y aniversarios.</Text></View>
            <Switch value={repeats} onValueChange={setRepeats} trackColor={{ true: A.accent, false: A.line }} thumbColor="#fff" />
          </View>
        </Section>
        <PrimaryButton label="Guardar fecha" disabled={!valid} busy={busy} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 4d · Colección en equipo ────────────────────────────────────────────────
function ColeccionEquipo(props) {
  const { collectionId, pop, onOpenUrl, myPicks = [], avatarUrlFor, userProfile, bottomInset, track } = props;
  const api = useApi(props);
  const [col, setCol] = useState(null);
  const [people, setPeople] = useState({});
  const [friends, setFriends] = useState([]);
  const [sheet, setSheet] = useState(null); // 'pick' | 'invite'
  const [inviteSel, setInviteSel] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [res, fr] = await Promise.all([api.teamCollection(collectionId), api.friends()]);
    setFriends(fr.following);
    const map = {};
    fr.following.forEach(f => { map[f.id] = f; });
    map[userProfile.id] = { ...userProfile, display_name: 'Vos' };
    setPeople(map);
    setCol(res.data || false);
  }, [collectionId]);
  useEffect(() => { load(); }, [load]);

  if (col === null) return <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}><Header onBack={pop} /><ActivityIndicator color={A.accent} style={{ marginTop: 40 }} /></SafeAreaView>;
  if (col === false) return <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}><Header onBack={pop} /><Text style={[s.sectionSub, { padding: 20 }]}>No encontramos esta colección.</Text></SafeAreaView>;

  const members = (col.team_collection_members || []).filter(m => m.status === 'joined');
  const memberIds = members.map(m => m.user_id);
  const picks = [...(col.team_collection_picks || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const canAdd = col.allow_member_add || col.owner_id === userProfile.id;
  const names = members.map(m => firstName(people[m.user_id] || {})).filter(Boolean);
  const last = picks[0];
  const notIn = friends.filter(f => !(col.team_collection_members || []).some(m => m.user_id === f.id));

  const addPick = async (p) => {
    setBusy(true);
    const res = await api.addTeamPick(col, p, memberIds);
    setBusy(false);
    if (res.error) { Alert.alert('No pudimos agregar el pick', 'Probá de nuevo.'); return; }
    track?.('team_pick_added', {});
    setSheet(null);
    load();
  };
  const invite = async () => {
    setBusy(true);
    const res = await api.inviteToTeam(col, inviteSel);
    setBusy(false);
    if (res.error) { Alert.alert('No pudimos invitar', 'Probá de nuevo.'); return; }
    setInviteSel([]);
    setSheet(null);
    load();
  };
  const share = () => Share.share({ message: `Mirá «${col.name}» en Picks: ${picks.length} picks.` }).catch(() => {});

  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]}>
        <View style={{ gap: 6 }}>
          <Text style={s.inviteEyebrow}>Colección en equipo</Text>
          <Text style={s.pageTitle}>{col.emoji ? `${col.emoji} ` : ''}{col.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row' }}>
              {members.slice(0, 4).map((m, i) => (
                <View key={m.user_id} style={{ marginLeft: i ? -10 : 0, borderWidth: 2, borderColor: A.bg, borderRadius: 18 }}>
                  <Avatar person={people[m.user_id] || { id: m.user_id }} size={32} avatarUrlFor={avatarUrlFor} index={i} />
                </View>
              ))}
            </View>
            <Text style={[s.rowSub, { flex: 1 }]} numberOfLines={1}>{names.join(', ')} · {picks.length} picks</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><PrimaryButton ghost label="Invitar" onPress={() => setSheet('invite')} /></View>
          {canAdd && <View style={{ flex: 1 }}><PrimaryButton label="Agregar pick" onPress={() => setSheet('pick')} /></View>}
          <View style={{ flex: 1 }}><PrimaryButton ghost label="Compartir" onPress={share} /></View>
        </View>
        {!!last && (
          <View style={s.activity}>
            <Avatar person={people[last.added_by] || { id: last.added_by }} size={28} avatarUrlFor={avatarUrlFor} />
            <Text style={[s.rowSub, { flex: 1 }]} numberOfLines={2}>
              <Text style={s.rowTitle}>{firstName(people[last.added_by] || {})}</Text> agregó «{last.name}»
            </Text>
          </View>
        )}
        {picks.length ? (
          <View style={s.grid}>
            {picks.map((p, i) => <PickCard key={p.id} p={p} index={i} by={firstName(people[p.added_by] || {})} onOpen={() => p.url && onOpenUrl?.(p.url, col.name)} />)}
          </View>
        ) : <Text style={s.sectionSub}>Todavía no hay picks. Agregá el primero.</Text>}
      </ScrollView>

      <Modal visible={!!sheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
          <View style={s.header}>
            <Text style={s.sectionTitle}>{sheet === 'pick' ? 'Agregar uno de tus picks' : `Invitar a «${col.name}»`}</Text>
            <TouchableOpacity onPress={() => setSheet(null)} hitSlop={10} accessibilityLabel="Cerrar"><Ionicons name="close" size={24} color={A.muted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.body}>
            {sheet === 'pick' ? (myPicks.length ? (
              <View style={s.grid}>
                {myPicks.map((p, i) => <PickCard key={p.id} p={p} index={i} onOpen={() => !busy && addPick(p)} />)}
              </View>
            ) : <Text style={s.sectionSub}>Todavía no guardaste picks. Guardá uno desde Explorar o una tienda.</Text>) : (
              <>
                <FriendPicker friends={notIn} selected={inviteSel} onToggle={id => setInviteSel(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]))} avatarUrlFor={avatarUrlFor} />
                <PrimaryButton label="Invitar" disabled={!inviteSel.length} busy={busy} onPress={invite} />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Nueva colección en equipo ───────────────────────────────────────────────
function NuevaColeccion(props) {
  const { pop, push, preselected = [], avatarUrlFor, bottomInset, track } = props;
  const api = useApi(props);
  const [friends, setFriends] = useState([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎁');
  const [selected, setSelected] = useState(preselected);
  const [allowAdd, setAllowAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.friends().then(r => setFriends(r.following)); }, []);
  const create = async () => {
    setBusy(true);
    const res = await api.createTeamCollection({ name: name.trim(), emoji, memberIds: selected, allowMemberAdd: allowAdd });
    setBusy(false);
    if (!res.ready) { Alert.alert('Muy pronto', 'Las colecciones en equipo todavía no están activadas. Ya casi.'); return; }
    if (res.error) { Alert.alert('No pudimos crear la colección', 'Revisá tu conexión y probá de nuevo.'); return; }
    track?.('team_collection_created', { members: selected.length });
    pop();
    push('coleccion', { collectionId: res.data.id });
  };
  return (
    <SafeAreaView style={[s.screen, bgStyle()]} edges={[]}>
      <Header onBack={pop} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>Nueva colección en equipo</Text>
        <Text style={s.sectionSub}>Una mudanza, un regalo, un viaje: todos suman picks a la misma lista.</Text>
        <Section title="Ícono">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['🎁', '📦', '✈️', '🏠', '🎂', '🎄', '💍', '🛍️'].map(e => (
              <TouchableOpacity key={e} style={[s.emojiBtn, emoji === e && s.emojiBtnOn]} onPress={() => setEmoji(e)} accessibilityState={{ selected: emoji === e }}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
        <Section title="Nombre">
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Ej: Mudanza, Regalos de cumple" placeholderTextColor={A.muted} maxLength={50} />
        </Section>
        <Section title="Con quién" sub={selected.length ? `${selected.length} invitados` : null}>
          <FriendPicker friends={friends} selected={selected} onToggle={id => setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]))} avatarUrlFor={avatarUrlFor} />
        </Section>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}><Text style={s.rowTitle}>Dejar que agreguen picks</Text><Text style={s.rowSub}>Para armarla entre varios.</Text></View>
          <Switch value={allowAdd} onValueChange={setAllowAdd} trackColor={{ true: A.accent, false: A.line }} thumbColor="#fff" />
        </View>
        <PrimaryButton label="Crear colección" disabled={!name.trim()} busy={busy} onPress={create} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: A.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, minHeight: 52 },
  title: { fontFamily: F[800], fontSize: 26, lineHeight: 34, paddingRight: 14, marginRight: -8, color: A.ink, letterSpacing: 0 },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 6, paddingLeft: 20, paddingRight: 16 },
  logo: { fontSize: 30, lineHeight: 40, paddingRight: 16, marginRight: -10, fontFamily: 'DMSans_800ExtraBold_Italic', letterSpacing: -1.5, color: '#E0592A' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6, minHeight: 44 },
  backText: { fontFamily: F[700], fontSize: 15, color: A.ink },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 22 },
  pageTitle: { fontFamily: F[800], fontSize: 24, color: A.ink, letterSpacing: -0.4 },
  bigName: { fontFamily: F[800], fontSize: 22, color: A.ink },
  statNum: { fontFamily: F[800], color: A.ink },
  sectionTitle: { fontFamily: F[800], fontSize: 17, color: A.ink },
  sectionSub: { fontFamily: F[400], fontSize: 13, color: A.muted, lineHeight: 18 },
  link: { fontFamily: F[700], fontSize: 13, color: A.accent },
  invitePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: A.accentLight, borderRadius: 18, paddingHorizontal: 12, minHeight: 36 },
  invitePillText: { fontFamily: F[700], fontSize: 13, color: A.accent },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarName: { fontFamily: F[600], fontSize: 12, color: A.ink },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 16, padding: 14 },
  soonText: { flex: 1, fontFamily: F[500], fontSize: 13, color: A.soft, lineHeight: 18 },
  soonPill: { backgroundColor: A.pill, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  soonPillText: { fontFamily: F[700], fontSize: 11, color: A.soft },
  btn: { minHeight: 48, borderRadius: 24, backgroundColor: A.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnGhost: { backgroundColor: A.card, borderWidth: 1, borderColor: A.line },
  btnText: { fontFamily: F[700], fontSize: 15, color: '#fff' },
  chip: { minHeight: 36, borderRadius: 99, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: A.card, borderWidth: 1, borderColor: A.line },
  chipOn: { backgroundColor: A.ink, borderColor: A.ink },
  chipText: { fontFamily: F[600], fontSize: 13, color: A.soft },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  rowTitle: { fontFamily: F[700], fontSize: 14, color: A.ink },
  rowSub: { fontFamily: F[400], fontSize: 12, color: A.muted },
  smallBtn: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: A.accent },
  smallBtnOn: { backgroundColor: A.accentLight },
  smallBtnText: { fontFamily: F[700], fontSize: 13, color: '#fff' },
  inviteCard: { backgroundColor: A.card, borderRadius: 18, borderWidth: 1, borderColor: A.accent, padding: 16, gap: 8 },
  inviteEyebrow: { fontFamily: F[700], fontSize: 11, color: A.accent, textTransform: 'uppercase', letterSpacing: 0.6 },
  inviteTitle: { fontFamily: F[800], fontSize: 16, color: A.ink },
  okBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: A.accentLight, borderRadius: 14, padding: 12 },
  okText: { flex: 1, fontFamily: F[600], fontSize: 13, color: A.accentDark },
  groupChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 99, paddingHorizontal: 14, minHeight: 40 },
  groupName: { fontFamily: F[700], fontSize: 13, color: A.ink },
  groupCount: { fontFamily: F[600], fontSize: 12, color: A.muted },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 16, padding: 12 },
  dateEmoji: { width: 40, height: 40, borderRadius: 12, backgroundColor: A.pill, alignItems: 'center', justifyContent: 'center' },
  dateSoon: { fontFamily: F[800], fontSize: 11, color: A.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateDay: { fontFamily: F[700], fontSize: 13, color: A.ink },
  heroDate: { backgroundColor: A.accentLight, borderRadius: 18, padding: 16, gap: 4 },
  heroDateTitle: { fontFamily: F[800], fontSize: 20, color: A.ink },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 16, padding: 10 },
  teamThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: A.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  pickCard: { width: '48%', gap: 2 },
  pickImg: { aspectRatio: 1, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  byPill: { position: 'absolute', left: 8, bottom: 8, maxWidth: '80%', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  byPillText: { fontFamily: F[700], fontSize: 11, color: A.ink },
  pickStore: { fontFamily: F[700], fontSize: 11, color: A.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  pickName: { fontFamily: F[600], fontSize: 13, color: A.ink, paddingHorizontal: 4 },
  pickPrice: { fontFamily: F[800], fontSize: 14, color: A.accent, paddingHorizontal: 4 },
  ctaCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 16, padding: 12 },
  shareCard: { backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 18, padding: 16, gap: 10 },
  handle: { fontFamily: F[700], fontSize: 15, color: A.accentDark, backgroundColor: A.accentLight, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  emojiBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, alignItems: 'center', justifyContent: 'center' },
  emojiBtnOn: { borderColor: A.accent, backgroundColor: A.accentLight },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: A.line, backgroundColor: A.card, paddingHorizontal: 14, fontFamily: F[500], fontSize: 15, color: A.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: A.card, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: A.line },
});
