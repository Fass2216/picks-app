import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

const COLORS = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  border: '#E8E2DA',
  borderSoft: '#EFEAE1',
  textPrimary: '#2A2826',
  textSecondary: '#8A8580',
  textTertiary: '#A8A29A',
  accent: '#E8512A',
  accentLight: '#FCE5DC',
};

const STORES = [
  { name: 'Mercado Libre', domain: 'mercadolibre.com.ar', url: 'https://www.mercadolibre.com.ar', bg: '#FFE600', fg: '#333', short: 'ML' },
  { name: 'Zara', domain: 'zara.com', url: 'https://www.zara.com/ar/', bg: '#000000', fg: '#FFFFFF', short: 'ZA' },
  { name: 'Falabella', domain: 'falabella.com.ar', url: 'https://www.falabella.com.ar', bg: '#179B47', fg: '#FFFFFF', short: 'FA' },
  { name: 'Shein', domain: 'shein.com', url: 'https://ar.shein.com', bg: '#000000', fg: '#FFFFFF', short: 'SH' },
  { name: 'H&M', domain: 'hm.com', url: 'https://www2.hm.com/es_ar/index.html', bg: '#E50010', fg: '#FFFFFF', short: 'HM' },
  { name: 'Dafiti', domain: 'dafiti.com.ar', url: 'https://www.dafiti.com.ar', bg: '#ED2891', fg: '#FFFFFF', short: 'DA' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [browserUrl, setBrowserUrl] = useState(null);
  const [picks, setPicks] = useState([]);

  function openUrl(url) {
    setBrowserUrl(url);
  }

  function closeBrowser() {
    setBrowserUrl(null);
  }

  function changeTab(tab) {
    setBrowserUrl(null);
    setActiveTab(tab);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.content}>
        {browserUrl ? (
          <BrowserView url={browserUrl} onClose={closeBrowser} />
        ) : activeTab === 'home' ? (
          <HomeView onOpenUrl={openUrl} />
        ) : (
          <PicksView picks={picks} />
        )}
      </View>

      <TabBar
        activeTab={browserUrl ? 'home' : activeTab}
        setActiveTab={changeTab}
        pickCount={picks.length}
      />
    </SafeAreaView>
  );
}

function HomeView({ onOpenUrl }) {
  const [input, setInput] = useState('');

  function go() {
    const raw = input.trim();
    if (!raw) return;
    Keyboard.dismiss();
    let url;
    if (/^https?:\/\//.test(raw)) {
      url = raw;
    } else if (/\.[a-z]{2,}/i.test(raw) && !raw.includes(' ')) {
      url = 'https://' + raw;
    } else {
      url = 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(raw);
    }
    onOpenUrl(url);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.greeting}>Hola</Text>
      <Text style={styles.title}>¿Qué buscás?</Text>

      <View style={styles.searchCard}>
        <View style={styles.searchIconWrap}>
          <Ionicons name="search" size={22} color={COLORS.accent} />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder='Buscar o pegar link'
          placeholderTextColor={COLORS.textTertiary}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={go}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {input.length > 0 && (
          <TouchableOpacity onPress={go} hitSlop={10}>
            <Ionicons name="arrow-forward-circle" size={28} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionTitle}>Tiendas destacadas</Text>

      <View style={{ gap: 10 }}>
        {STORES.map((store) => (
          <TouchableOpacity
            key={store.domain}
            style={styles.storeCard}
            onPress={() => onOpenUrl(store.url)}
            activeOpacity={0.85}
          >
            <View style={[styles.storeCover, { backgroundColor: store.bg }]}>
              <Text style={[styles.storeShort, { color: store.fg }]}>{store.short}</Text>
            </View>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              <View style={styles.storeDomain}>
                <Ionicons name="link" size={11} color={COLORS.textTertiary} />
                <Text style={styles.storeDomainText}>{store.domain}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={COLORS.accent}
          style={{ marginTop: 1 }}
        />
        <Text style={styles.infoText}>
          Próximamente: mantené presionada una imagen y arrastrala a Mis picks para
          guardarla. Estamos terminando esa parte.
        </Text>
      </View>
    </ScrollView>
  );
}

function BrowserView({ url, onClose }) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const webRef = useRef(null);

  function handleBack() {
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
    } else {
      onClose();
    }
  }

  function getDomain(u) {
    try {
      const parsed = new URL(u);
      return parsed.hostname.replace(/^www\./, '');
    } catch (e) {
      return u;
    }
  }

  return (
    <View style={styles.browserContainer}>
      <View style={styles.browserBar}>
        <TouchableOpacity onPress={handleBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.browserUrl}>
          <Ionicons name="lock-closed" size={11} color={COLORS.textSecondary} />
          <Text style={styles.browserUrlText} numberOfLines={1}>
            {getDomain(currentUrl)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => webRef.current?.reload()} hitSlop={8}>
          <Ionicons name="refresh" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: COLORS.background }}
        onNavigationStateChange={(state) => {
          setCurrentUrl(state.url);
          setCanGoBack(state.canGoBack);
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        )}
        allowsBackForwardNavigationGestures={true}
      />
    </View>
  );
}

function PicksView({ picks }) {
  return (
    <View style={styles.viewContent}>
      <Text style={styles.title}>Mis picks</Text>
      <Text style={styles.subtitle}>
        {picks.length === 0
          ? 'Todavía no guardaste nada'
          : picks.length === 1
          ? '1 producto guardado'
          : `${picks.length} productos guardados`}
      </Text>

      {picks.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyTitle}>Acá van tus picks</Text>
          <Text style={styles.emptyDesc}>
            Cuando termine el gesto de arrastrar, vas a poder guardar productos
            navegando cualquier tienda real adentro de la app.
          </Text>
        </View>
      )}
    </View>
  );
}

function TabBar({ activeTab, setActiveTab, pickCount }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarWrap}>
      <View style={styles.tabBar}>
        <Tab
          label="Navegar"
          iconName="home-outline"
          iconActive="home"
          isActive={activeTab === 'home'}
          onPress={() => setActiveTab('home')}
        />
        <Tab
          label="Mis picks"
          iconName="heart-outline"
          iconActive="heart"
          isActive={activeTab === 'picks'}
          onPress={() => setActiveTab('picks')}
          badge={pickCount}
        />
      </View>
    </SafeAreaView>
  );
}

function Tab({ label, iconName, iconActive, isActive, onPress, badge }) {
  const color = isActive ? COLORS.textPrimary : COLORS.textSecondary;
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.tabIconWrap}>
        <Ionicons name={isActive ? iconActive : iconName} size={24} color={color} />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '500' : '400' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  viewContent: {
    flex: 1,
    padding: 24,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '500',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  searchCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 0.5,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 28,
  },
  searchIconWrap: {
    backgroundColor: COLORS.accentLight,
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  storeCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 0.5,
    borderRadius: 14,
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  storeCover: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeShort: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  storeInfo: {
    flex: 1,
    paddingLeft: 14,
    paddingRight: 8,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  storeDomain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  storeDomainText: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  infoCard: {
    backgroundColor: COLORS.borderSoft,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#5F5C58',
    lineHeight: 19,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  tabBarWrap: {
    backgroundColor: COLORS.background,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  browserContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  browserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  browserUrl: {
    flex: 1,
    backgroundColor: COLORS.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  browserUrlText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
