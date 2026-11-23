// Tendencias del diseño nuevo (arriba de la lista de Explorar → Tendencias):
// Nº 1 de la semana, top, lo que busca la gente y tiendas en alza.
//
// Los rankings los calcula el servidor en GET /api/trends (ver PARA-FEDE.md).
// Si todavía no existe o falla, no se muestra nada y Tendencias queda como antes.
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet } from 'react-native';

// Mismos valores que PK y DM de App.js
const A = { ink: '#1E1A17', muted: '#6B625C', soft: '#5A5049', line: '#EDE4DD', pill: '#F1E9E2', card: '#FFFFFF', accent: '#C2410C', accentLight: '#FDEBE2' };
const F = { 500: 'DMSans_500Medium', 600: 'DMSans_600SemiBold', 700: 'DMSans_700Bold', 800: 'DMSans_800ExtraBold' };

const savesLabel = (n) => (n === 1 ? '1 persona lo guardó' : `${n || 0} lo guardaron`);

export default function TrendsHeader({ backendUrl, country = 'UY', myDomains = [], onOpenUrl, onSearch }) {
  const [scope, setScope] = useState('all'); // 'all' | 'mine'
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ country });
    if (scope === 'mine' && myDomains.length) params.set('domains', myDomains.join(','));
    fetch(`${backendUrl}/api/trends?${params.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setData(j && Array.isArray(j.top) ? j : null); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [scope, country, myDomains.join(',')]);

  if (!data || !data.top.length) return null;
  const [hero, ...rest] = data.top;
  return (
    <View style={s.wrap}>
      <View style={s.scope}>
        {[{ id: 'all', label: 'Todo Picks' }, { id: 'mine', label: 'Mis tiendas' }].map(o => (
          <TouchableOpacity key={o.id} style={[s.scopeBtn, scope === o.id && s.scopeOn]} onPress={() => setScope(o.id)} accessibilityState={{ selected: scope === o.id }}>
            <Text style={[s.scopeText, scope === o.id && { color: '#fff' }]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.hero} onPress={() => hero.url && onOpenUrl?.(hero.url)} activeOpacity={0.9}>
        <View style={s.heroImg}>{hero.img ? <Image source={{ uri: hero.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}</View>
        <View style={s.heroBadge}><Text style={s.heroBadgeText}>Nº 1 de la semana</Text></View>
        <View style={{ padding: 14, gap: 2 }}>
          <Text style={s.store}>{hero.store}</Text>
          <Text style={s.heroName} numberOfLines={2}>{hero.title}</Text>
          <Text style={s.meta}>{hero.priceText ? `${hero.priceText} · ` : ''}{savesLabel(hero.saves)}</Text>
        </View>
      </TouchableOpacity>

      {rest.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.title}>Top de la semana</Text>
          {rest.slice(0, 5).map((p, i) => (
            <TouchableOpacity key={p.url || i} style={s.topRow} onPress={() => p.url && onOpenUrl?.(p.url)} activeOpacity={0.85}>
              <Text style={s.rank}>{i + 2}</Text>
              <View style={s.topImg}>{p.img ? <Image source={{ uri: p.img }} style={{ width: '100%', height: '100%' }} /> : null}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.topName} numberOfLines={1}>{p.title}</Text>
                <Text style={s.meta} numberOfLines={1}>{p.store} · {savesLabel(p.saves)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {Array.isArray(data.searches) && data.searches.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.title}>Lo que busca la gente</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {data.searches.slice(0, 8).map(q => (
              <TouchableOpacity key={q.q} style={s.searchChip} onPress={() => onSearch?.(q.q)} activeOpacity={0.85}>
                <Text style={s.searchText}>{q.q}</Text>
                {q.up > 0 && <Text style={s.up}>↑{q.up}%</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {Array.isArray(data.stores) && data.stores.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.title}>Tiendas en alza</Text>
          <Text style={s.meta}>Las que más sumaron seguidores</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {data.stores.slice(0, 10).map(t => (
              <TouchableOpacity key={t.domain} style={s.storeCard} onPress={() => onOpenUrl?.(t.url || `https://${t.domain}`)} activeOpacity={0.85}>
                <View style={s.storeMark}><Text style={s.storeMarkText}>{(t.name || t.domain || '?').charAt(0).toUpperCase()}</Text></View>
                <Text style={s.topName} numberOfLines={1}>{t.name || t.domain}</Text>
                <Text style={s.up}>+{t.new_followers || 0}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <Text style={s.title}>Más tendencias</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 20, paddingBottom: 16 },
  scope: { flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 4, backgroundColor: A.pill, borderRadius: 99 },
  scopeBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 99, justifyContent: 'center' },
  scopeOn: { backgroundColor: A.ink },
  scopeText: { fontFamily: F[700], fontSize: 13, color: A.soft },
  hero: { backgroundColor: A.card, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: A.line },
  heroImg: { aspectRatio: 4 / 3, backgroundColor: A.pill },
  heroBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: A.accent, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  heroBadgeText: { fontFamily: F[800], fontSize: 12, color: '#fff' },
  store: { fontFamily: F[700], fontSize: 11, color: A.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroName: { fontFamily: F[800], fontSize: 18, color: A.ink },
  meta: { fontFamily: F[500], fontSize: 12, color: A.muted },
  title: { fontFamily: F[800], fontSize: 17, color: A.ink },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 22, fontFamily: F[800], fontSize: 18, color: A.accent, textAlign: 'center', fontVariant: ['tabular-nums'] },
  topImg: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: A.pill },
  topName: { fontFamily: F[700], fontSize: 14, color: A.ink },
  searchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 99, backgroundColor: A.card, borderWidth: 1, borderColor: A.line },
  searchText: { fontFamily: F[600], fontSize: 13, color: A.ink },
  up: { fontFamily: F[700], fontSize: 12, color: A.accent },
  storeCard: { width: 110, gap: 4, backgroundColor: A.card, borderWidth: 1, borderColor: A.line, borderRadius: 16, padding: 12 },
  storeMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: A.accentLight, alignItems: 'center', justifyContent: 'center' },
  storeMarkText: { fontFamily: F[800], fontSize: 16, color: A.accent },
});
