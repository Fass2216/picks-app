import { useState, useRef, useEffect, useCallback, useContext, useMemo, createContext } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Image,
  Dimensions,
  Animated,
  Easing,
  Alert,
  Share,
  Vibration,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Switch,
  LayoutAnimation,
  UIManager,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
 
// ============ ANALYTICS (PostHog vía REST API + DEBUG) ============
const POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_KEY = 'phc_nKmex7vEsBpDfpePezdS8HHDXsFMea9ubQemfdfY8deC';
const DEBUG_ANALYTICS = false;

// ============ BACKEND DE NOTIFICACIONES ============
const BACKEND_URL = 'https://picks-backend-30ur.onrender.com';

// ============ FONDOS PERSONALIZABLES ============
// Imágenes suaves y translúcidas, opcionales, que el usuario puede elegir en
// su perfil para darle un poco de personalidad a la app sin afectar la lectura.
const APP_BACKGROUND_STORAGE_KEY = 'app-background-v1';
const BACKGROUNDS = [
  { id: 'amanecer', label: 'Terracota',  source: require('./assets/backgrounds/bg-amanecer.png') },
  { id: 'salvia',   label: 'Bosque',     source: require('./assets/backgrounds/bg-salvia.png') },
  { id: 'bruma',    label: 'Nocturno',   source: require('./assets/backgrounds/bg-bruma.png') },
  { id: 'coral',    label: 'Frambuesa',  source: require('./assets/backgrounds/bg-coral.png') },
  { id: 'arena',    label: 'Mostaza',    source: require('./assets/backgrounds/bg-arena.png') },
];
function getBackgroundSource(id) {
  return BACKGROUNDS.find(b => b.id === id)?.source || null;
}

// ── Supabase Auth ─────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://gbzjpfhhullpqvcycwkp.supabase.co';
const SUPABASE_ANON = 'sb_publishable_FybYxjnA40bJfaZMDhzXFg_1Lf8u2SK';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// ── Categorías de interés ─────────────────────────────────────────────────────
const INTEREST_CATEGORIES = [
  { id: 'indumentaria', label: 'Indumentaria',     emoji: '👗', icon: 'shirt-outline' },
  { id: 'calzado',      label: 'Calzado',           emoji: '👟', icon: 'footsteps-outline' },
  { id: 'skincare',     label: 'Skincare & Belleza',emoji: '💄', icon: 'sparkles-outline' },
  { id: 'hogar',        label: 'Hogar & Deco',      emoji: '🏠', icon: 'home-outline' },
  { id: 'tecnologia',   label: 'Tecnología',        emoji: '📱', icon: 'phone-portrait-outline' },
  { id: 'deportes',     label: 'Deportes',          emoji: '⚽', icon: 'football-outline' },
  { id: 'vehiculos',    label: 'Vehículos',         emoji: '🚗', icon: 'car-outline' },
  { id: 'repuestos',    label: 'Repuestos y Accesorios', emoji: '🔩', icon: 'build-outline' },
  { id: 'herramientas', label: 'Herramientas',      emoji: '🔧', icon: 'construct-outline' },
  { id: 'gaming',       label: 'Gaming',            emoji: '🎮', icon: 'game-controller-outline' },
  { id: 'mascotas',     label: 'Mascotas',          emoji: '🐾', icon: 'paw-outline' },
  { id: 'salud',        label: 'Salud & Bienestar', emoji: '🌿', icon: 'leaf-outline' },
  { id: 'bebes',        label: 'Bebés & Niños',     emoji: '👶', icon: 'happy-outline' },
];

// Keywords por categoría para personalizar el feed
const INTEREST_KEYWORDS = {
  indumentaria: ['ropa','remera','pantalon','vestido','campera','blusa','short','jean','chomba','saco'],
  calzado:      ['zapatilla','zapato','bota','sandalia','calzado','sneaker','mocasin','taco'],
  skincare:     ['crema','serum','facial','hidratante','sunscreen','protector','skincare','perfume','maquillaje','labial'],
  hogar:        ['silla','mesa','lampara','cojin','hogar','living','cocina','manta','alfombra','deco'],
  tecnologia:   ['celular','notebook','auricular','cargador','smartwatch','tablet','electronico','computadora'],
  deportes:     ['deportivo','running','training','gym','fitness','sport','pelota','bicicleta','natacion'],
  vehiculos:    ['automotora','concesionaria','0km','auto usado','camioneta','pickup','sedan','financiacion auto'],
  repuestos:    ['repuesto','autopartes','neumatico','llanta','frenos','filtro auto','bateria auto','volante','amortiguador'],
  herramientas: ['herramienta','taladro','sierra','llave','tornillo','martillo','electricidad','pintura'],
  gaming:       ['gaming','consola','joystick','headset','mouse gamer','teclado gamer','monitor'],
  mascotas:     ['mascota','perro','gato','collar','racion','juguete mascota','correa'],
  salud:        ['vitamina','suplemento','proteina','salud','bienestar','medicamento','termometro'],
  bebes:        ['bebe','nino','nena','infantil','juguete','cochecito','mamadera','panal'],
};


// ID de dispositivo persistente (se guarda en AsyncStorage la primera vez)
let DEVICE_ID = null; // caché en memoria para track()
async function getOrCreateDeviceId() {
  if (DEVICE_ID) return DEVICE_ID;
  try {
    let id = await AsyncStorage.getItem('device-id-v1');
    if (!id) {
      id = 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      await AsyncStorage.setItem('device-id-v1', id);
    }
    DEVICE_ID = id;
    return id;
  } catch (e) {
    const fallback = 'd_fallback_' + Math.random().toString(36).slice(2, 8);
    DEVICE_ID = fallback;
    return fallback;
  }
}

// Mis Picks y colecciones se guardan por cuenta (no por dispositivo), para que
// dos cuentas de Supabase en el mismo teléfono no compartan la misma lista.
function picksStorageKey(uid) { return `picks-v1-${uid || 'guest'}`; }
function collectionsStorageKey(uid) { return `collections-v1-${uid || 'guest'}`; }

// Mutex en memoria para que la migración única de datos viejos no corra dos
// veces en paralelo si se cambia de cuenta rápido (evita copiar los picks
// del dueño original a una segunda cuenta por una condición de carrera).
let legacyMigrationPromise = null;
function runLegacyMigrationOnce(pKey, cKey) {
  if (!legacyMigrationPromise) {
    legacyMigrationPromise = (async () => {
      const migrated = await AsyncStorage.getItem('legacy-storage-migrated-v1');
      if (migrated) return;
      // Marcamos como migrado ANTES de copiar, para que cualquier llamada
      // concurrente vea el flag lo antes posible.
      await AsyncStorage.setItem('legacy-storage-migrated-v1', '1');
      const [legacyPicks, legacyCollections, hasNewPicks, hasNewCollections] = await Promise.all([
        AsyncStorage.getItem('picks-v1'),
        AsyncStorage.getItem('collections-v1'),
        AsyncStorage.getItem(pKey),
        AsyncStorage.getItem(cKey),
      ]);
      if (!hasNewPicks && legacyPicks) await AsyncStorage.setItem(pKey, legacyPicks);
      if (!hasNewCollections && legacyCollections) await AsyncStorage.setItem(cKey, legacyCollections);
    })();
  }
  return legacyMigrationPromise;
}

// Configurar cómo se muestran las notificaciones cuando la app está abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let debugAlertShown = false;
 
function track(event, props) {
  const body = JSON.stringify({
    api_key: POSTHOG_KEY,
    event: event,
    distinct_id: DEVICE_ID,
    properties: { ...(props || {}), $lib: 'picks-native', $lib_version: '1.0.0' },
    timestamp: new Date().toISOString(),
  });
  fetch(POSTHOG_HOST + '/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body,
  }).then((r) => {
    if (DEBUG_ANALYTICS && !debugAlertShown && event === 'app_opened') {
      debugAlertShown = true;
      Alert.alert('Analytics OK', 'event=' + event + ' status=' + r.status + ' device=' + DEVICE_ID.slice(0, 12));
    }
  }).catch((err) => {
    if (DEBUG_ANALYTICS && !debugAlertShown && event === 'app_opened') {
      debugAlertShown = true;
      Alert.alert('Analytics FALLÓ', (err && err.message) || String(err) || 'sin error info');
    }
  });
}
 
const COLORS = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  card: '#F1ECE3',
  border: '#E8E2DA',
  borderSoft: '#EFEAE1',
  textPrimary: '#2A2826',
  textSecondary: '#8A8580',
  textTertiary: '#A8A29A',
  accent: '#E8512A',
  accentLight: '#FCE5DC',
};
 
const STORES = [
  { name: 'Zara', domain: 'zara.com', url: 'https://www.zara.com/uy/', bg: '#000000', fg: '#FFFFFF', short: 'ZA' },
  { name: 'H&M', domain: 'hm.com', url: 'https://www2.hm.com', bg: '#E50010', fg: '#FFFFFF', short: 'HM' },
  { name: 'Renner', domain: 'renner.com', url: 'https://www.renner.com', bg: '#E70062', fg: '#FFFFFF', short: 'RE' },
  { name: 'Rotunda', domain: 'rotundastore.com', url: 'https://www.rotundastore.com', bg: '#C9968A', fg: '#FFFFFF', short: 'RO' },
  { name: 'Austera', domain: 'austera.com.uy', url: 'https://www.austera.com.uy', bg: '#1A1A1A', fg: '#FFFFFF', short: 'AU', logo: 'https://www.austera.com.uy/cdn/shop/files/IMG_8800.jpg?v=1760655992&width=600' },
  { name: 'Caro Criado', domain: 'carocriado.com', url: 'https://www.carocriado.com', bg: '#D4A4A4', fg: '#FFFFFF', short: 'CC' },
  { name: 'Lolita', domain: 'lolita.com.uy', url: 'https://www.lolita.com.uy', bg: '#DB6B8A', fg: '#FFFFFF', short: 'LO' },
  { name: 'Decathlon', domain: 'decathlon.com.uy', url: 'https://www.decathlon.com.uy', bg: '#0082C3', fg: '#FFFFFF', short: 'DC' },

  { name: 'La Cancha', domain: 'lacancha.uy', url: 'https://www.lacancha.uy', bg: '#007F3E', fg: '#FFFFFF', short: 'LC' },
  { name: 'Tienda Inglesa', domain: 'tiendainglesa.com.uy', url: 'https://www.tiendainglesa.com.uy', bg: '#0033A0', fg: '#FFFFFF', short: 'TI' },
  { name: 'Multiahorro', domain: 'multiahorrohogar.com.uy', url: 'https://www.multiahorrohogar.com.uy', bg: '#E2231A', fg: '#FFFFFF', short: 'MA' },
  { name: 'Indian', domain: 'indian.com.uy', url: 'https://www.indian.com.uy', bg: '#8B6914', fg: '#FFFFFF', short: 'IN', logo: 'https://www.indian.com.uy/public/web/img/logo-og.png' },
];
 
const STORES_AR = [
  { name: 'Zara', domain: 'zara.com', url: 'https://www.zara.com/ar/', searchUrl: (q) => `https://www.zara.com/ar/es/search?searchTerm=${encodeURIComponent(q)}`, bg: '#000000', fg: '#FFFFFF', short: 'ZA' },
  { name: 'Rapsodia', domain: 'rapsodia.com', url: 'https://www.rapsodia.com', bg: '#6B3FA0', fg: '#FFFFFF', short: 'RA' },
  { name: 'Wanama', domain: 'wanama.com', url: 'https://www.wanama.com', bg: '#1A1A2E', fg: '#FFFFFF', short: 'WA' },
  { name: '47 Street', domain: '47street.com.ar', url: 'https://www.47street.com.ar', bg: '#FF6B00', fg: '#FFFFFF', short: '47' },
  { name: 'Kosiuko', domain: 'kosiuko.com', url: 'https://www.kosiuko.com', bg: '#2C2C54', fg: '#FFFFFF', short: 'KO' },
  { name: 'Paula Cahen', domain: 'paulacahendanvers.com.ar', url: 'https://www.paulacahendanvers.com.ar', bg: '#B5451B', fg: '#FFFFFF', short: 'PC' },
  { name: 'Vitamina', domain: 'emarketpeople.com', url: 'https://www.emarketpeople.com/collections/vitamina', bg: '#C8102E', fg: '#FFFFFF', short: 'VI' },
  { name: 'Prune', domain: 'prune.com.ar', url: 'https://www.prune.com.ar', bg: '#8B1A1A', fg: '#FFFFFF', short: 'PR' },
  { name: 'Decathlon', domain: 'decathlon.com.ar', url: 'https://www.decathlon.com.ar', searchUrl: (q) => `https://www.decathlon.com.ar/search?q=${encodeURIComponent(q)}`, bg: '#0082C3', fg: '#FFFFFF', short: 'DC' },
  { name: 'Indian', domain: 'indian.ar', url: 'https://www.indian.ar', bg: '#8B6914', fg: '#FFFFFF', short: 'IN' },
];

const STORES_CL = [
  { name: 'Zara', domain: 'zara.com', url: 'https://www.zara.com/cl/', searchUrl: (q) => `https://www.zara.com/cl/es/search?searchTerm=${encodeURIComponent(q)}`, bg: '#000000', fg: '#FFFFFF', short: 'ZA' },
  { name: 'Paris', domain: 'paris.cl', url: 'https://www.paris.cl', bg: '#1565C0', fg: '#FFFFFF', short: 'PA' },
  { name: 'Mango', domain: 'mango.com', url: 'https://shop.mango.com/cl', bg: '#D81B60', fg: '#FFFFFF', short: 'MG' },
  { name: 'Pull & Bear', domain: 'pullandbear.com', url: 'https://www.pullandbear.com/cl/es/', bg: '#E65100', fg: '#FFFFFF', short: 'PB' },
  { name: 'Bershka', domain: 'bershka.com', url: 'https://www.bershka.com/cl/es/', bg: '#6A1B9A', fg: '#FFFFFF', short: 'BE' },
  { name: 'Adidas', domain: 'adidas.cl', url: 'https://www.adidas.cl', bg: '#0277BD', fg: '#FFFFFF', short: 'AD' },
  { name: 'Decathlon', domain: 'decathlon.cl', url: 'https://www.decathlon.cl', searchUrl: (q) => `https://www.decathlon.cl/search?q=${encodeURIComponent(q)}`, bg: '#0082C3', fg: '#FFFFFF', short: 'DC' },
];

const STORES_PY = [
  { name: 'Zara', domain: 'zara.com', url: 'https://www.zara.com', bg: '#000000', fg: '#FFFFFF', short: 'ZA' },
  { name: 'Adidas', domain: 'adidas.com', url: 'https://www.adidas.com', bg: '#D84315', fg: '#FFFFFF', short: 'AD' },
  { name: 'Decathlon', domain: 'decathlon.com.py', url: 'https://www.decathlon.com.py', searchUrl: (q) => `https://www.decathlon.com.py/search?q=${encodeURIComponent(q)}`, bg: '#0082C3', fg: '#FFFFFF', short: 'DC' },
  { name: 'Tecnostore', domain: 'tecnostore.com.py', url: 'https://www.tecnostore.com.py', bg: '#333333', fg: '#FFFFFF', short: 'TS' },
  { name: 'Metasports', domain: 'metasports.com.py', url: 'https://www.metasports.com.py', bg: '#1A1A2E', fg: '#FFFFFF', short: 'MS' },
  { name: 'Unicentro', domain: 'unicentro.com.py', url: 'https://www.unicentro.com.py', bg: '#4A0E8F', fg: '#FFFFFF', short: 'UC' },
  { name: 'Puma Store', domain: 'pumastore.com.uy', url: 'https://www.pumastore.com.uy', bg: '#CC0000', fg: '#FFFFFF', short: 'PS' },
  { name: 'Indian', domain: 'indian.com.py', url: 'https://www.indian.com.py', bg: '#8B6914', fg: '#FFFFFF', short: 'IN' },
];

const STORES_BY_COUNTRY = { UY: STORES, AR: STORES_AR, CL: STORES_CL, PY: STORES_PY };

const COUNTRY_INFO = {
  UY: { name: 'Uruguay', flag: '🇺🇾' },
  AR: { name: 'Argentina', flag: '🇦🇷' },
  CL: { name: 'Chile', flag: '🇨🇱' },
  PY: { name: 'Paraguay', flag: '🇵🇾' },
};

const SCREEN = Dimensions.get('window');
const URL_BAR_OFFSET = 90;

// URLs de búsqueda por tienda
const STORE_SEARCH_URL = {
  'zara.com':                 (q) => `https://www.zara.com/uy/es/search?searchTerm=${encodeURIComponent(q)}`,
  'hm.com':                   (q) => `https://uy.hm.com/s?q=${encodeURIComponent(q)}&fuzzy=0&operator=and&sort=score_desc&page=0`,
  'renner.com':               (q) => `https://www.renner.com/uy/b?q=${encodeURIComponent(q)}`,
  'rotundastore.com':         (q) => `https://www.rotundastore.com/catalogo?q=${encodeURIComponent(q)}`,
  'austera.com.uy':           (q) => `https://www.austera.com.uy/search?q=${encodeURIComponent(q)}`,
  'carocriado.com':           (q) => `https://www.carocriado.com/catalogo?q=${encodeURIComponent(q)}`,
  'lolita.com.uy':            (q) => `https://lolita.com.uy/productos?q=${encodeURIComponent(q)}`,
  'decathlon.com.uy':         (q) => `https://www.decathlon.com.uy/search?q=${encodeURIComponent(q)}`,
  // kiabi.uy bloqueado por protección anti-bots (Datadome)
  // 'kiabi.es': ...,
  'lacancha.uy':              (q) => `https://www.lacancha.uy/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  'tiendainglesa.com.uy':     (q) => `https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,${encodeURIComponent(q)},0`,
  'multiahorrohogar.com.uy':  (q) => `https://www.tata.com.uy/s/?q=${encodeURIComponent(q)}&sort=score_desc`,
  'bas.com.uy':               (q) => `https://www.bas.com.uy/s?q=${encodeURIComponent(q)}&sort=score_desc&page=0`,
};
 
function getRegisteredDomain(domain) {
  if (!domain) return 'web';
  domain = domain.replace(/^www\./, '');
  const parts = domain.split('.');
  // Manejar TLD compuestos tipo .com.uy, .co.uk
  if (parts.length >= 3 && (parts[parts.length - 2] === 'com' || parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'org')) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

// El título de una pestaña del navegador suele venir como "Producto - Tienda"
// o "Producto | Tienda" — para usarlo como búsqueda en OTRAS tiendas hay que
// sacarle el nombre de la tienda de origen, si no la búsqueda nunca matchea.
function cleanProductTitle(title) {
  if (!title) return '';
  return title.split(/[|·\-–—]/)[0].trim().slice(0, 60);
}

const CUSTOM_COLORS = [
  { bg: '#A55CA0', fg: '#FFFFFF' },
  { bg: '#3B7A57', fg: '#FFFFFF' },
  { bg: '#8B4513', fg: '#FFFFFF' },
  { bg: '#2E4057', fg: '#FFFFFF' },
  { bg: '#C04848', fg: '#FFFFFF' },
  { bg: '#6B5B95', fg: '#FFFFFF' },
];
 
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(w => (w[0] || '').toUpperCase()).join('').slice(0, 2) || '??';
}
 
// Devuelve el código de país (UY/AR/CL/PY) de un dominio, o null si no se puede determinar
function getDomainCountry(domain, url) {
  const reg = getRegisteredDomain(domain);
  const found = [];
  for (const [code, stores] of Object.entries(STORES_BY_COUNTRY)) {
    if (stores.some(s => s.domain === reg)) found.push(code);
  }
  if (found.length === 1) return found[0];
  // Para stores que aparecen en varios países, inferir por el path de la URL
  if (url && found.length > 1) {
    for (const code of found) {
      const lc = code.toLowerCase();
      if (url.includes('/' + lc + '/') || url.includes('.' + lc + '/') || url.includes('.' + lc + '.')) return code;
    }
  }
  return null;
}

function getStoreDisplayName(domain) {
  const reg = getRegisteredDomain(domain);
  for (let i = 0; i < STORES.length; i++) {
    if (reg === STORES[i].domain || reg.endsWith('.' + STORES[i].domain) || STORES[i].domain.endsWith(reg)) {
      return STORES[i].name;
    }
  }
  // Match parcial por marca
  const brand = reg.split('.')[0];
  for (let i = 0; i < STORES.length; i++) {
    if (STORES[i].domain.startsWith(brand)) return STORES[i].name;
  }
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}
 
const INJECTED_JS = `
(function() {
  if (window.__picksInjected) return;
  window.__picksInjected = true;
 
  // Inyectar CSS que desactiva el comportamiento nativo de iOS sobre imagenes
  var style = document.createElement('style');
  style.textContent = 'img, a img { -webkit-touch-callout: none !important; -webkit-user-select: none !important; -khtml-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important; user-select: none !important; -webkit-user-drag: none !important; -webkit-tap-highlight-color: transparent !important; }';
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', function() { document.head.appendChild(style); });
  }
 
  // Helper: dominio registrable (igual logica que en React Native)
  function regDomain(host) {
    if (!host) return '';
    host = host.replace(/^www\\./, '');
    var p = host.split('.');
    if (p.length >= 3 && (p[p.length-2] === 'com' || p[p.length-2] === 'co' || p[p.length-2] === 'org')) {
      return p.slice(-3).join('.');
    }
    return p.slice(-2).join('.');
  }
  function isSameSite(h1, h2) {
    return regDomain(h1) === regDomain(h2);
  }
 
  // Quitar meta tags que sugieran abrir app nativa
  function removeAppMeta() {
    var metas = document.querySelectorAll('meta[name="apple-itunes-app"], meta[name="google-play-app"], meta[property="al:ios:url"], meta[property="al:android:url"], meta[property="al:ios:app_store_id"]');
    for (var i = 0; i < metas.length; i++) metas[i].parentNode && metas[i].parentNode.removeChild(metas[i]);
    var banners = document.querySelectorAll('[class*="smartbanner"], [class*="smart-banner"], [class*="app-banner"], [id*="smartbanner"]');
    for (var j = 0; j < banners.length; j++) banners[j].style.display = 'none';
  }
  removeAppMeta();
  fixTargets();

  // Usar MutationObserver en vez de setInterval — solo corre cuando el DOM cambia
  try {
    var domObserver = new MutationObserver(function(mutations) {
      var hasNew = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) { hasNew = true; break; }
      }
      if (hasNew) { removeAppMeta(); fixTargets(); }
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e) {}

  // Forzar todo a _self y bloquear que se abra la app nativa
  function fixTargets() {
    var links = document.querySelectorAll('a[target="_blank"]');
    for (var i = 0; i < links.length; i++) links[i].target = '_self';
    var forms = document.querySelectorAll('form[target="_blank"]');
    for (var i = 0; i < forms.length; i++) forms[i].target = '_self';
  }
 
  // Override window.open para que use la misma ventana
  try {
    window.open = function(url) {
      if (url && typeof url === 'string' && (url.indexOf('http') === 0)) {
        window.location.href = url;
      }
      return null;
    };
  } catch (e) {}
 
  // Interceptar forms.submit() para forzar _self
  try {
    var origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function() {
      this.target = '_self';
      return origSubmit.apply(this, arguments);
    };
  } catch (e) {}
 
  // Capturar todos los clicks: bloquear schemas custom, forzar _self
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a && a.href) {
      var h = a.getAttribute('href') || '';
      if (h.indexOf('http') !== 0 && h.indexOf('#') !== 0 && h.indexOf('/') !== 0 && h.indexOf('mailto:') !== 0) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      a.target = '_self';
    }
  }, true);
 
  // Bloquear submits de formularios que apunten a esquemas no http
  document.addEventListener('submit', function(e) {
    var f = e.target;
    if (f && f.tagName === 'FORM') {
      f.target = '_self';
      if (f.action && f.action.indexOf('http') !== 0 && f.action.indexOf('/') !== 0) {
        e.preventDefault();
      }
    }
  }, true);
 
  var pressTimer = null;
  var pressTarget = null;
  var startX = 0, startY = 0;
  var LONG_PRESS_MS = 350;
  var MOVE_THRESHOLD = 10;
 
  function post(data) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
  }
 
  function getImageSrc(img) {
    return img.src || img.currentSrc || img.dataset.src || img.dataset.lazySrc || img.getAttribute('data-original') || img.getAttribute('data-image') || '';
  }
 
  function isValidImage(img) {
    if (!img) return false;
    var src = getImageSrc(img);
    if (!src || src.startsWith('data:image/svg')) return false;
    var w = img.naturalWidth || img.width || img.clientWidth || 0;
    var h = img.naturalHeight || img.height || img.clientHeight || 0;
    return (w > 60 && h > 60);
  }
 
  function getImageElement(target) {
    if (!target) return null;
    if (target.tagName === 'IMG' && isValidImage(target)) return target;
 
    // Buscar dentro del target (si se toco un wrapper)
    if (target.querySelector) {
      var inner = target.querySelector('img');
      if (inner && isValidImage(inner)) return inner;
    }
 
    // Caminar hacia arriba buscando imagenes
    var p = target;
    var depth = 0;
    while (p && p !== document.body && depth < 6) {
      if (p.querySelector) {
        var found = p.querySelector('img');
        if (found && isValidImage(found)) return found;
      }
      p = p.parentElement;
      depth++;
    }
 
    return null;
  }
 
  function scoreLink(u, depth) {
    // Mas puntos = mas probable que sea un producto especifico
    var s = 0;
    var path = u.pathname || '';
    // Patrones de URL de producto
    if (/\\/MLU?-?\\d/i.test(path) || /-_JM/i.test(u.href)) s += 100;
    if (/(MLM|MPE|MCO|MEC|MLB|MLC)-?\\d/i.test(path)) s += 100;
    if (/\\/(p|producto|product|articulo|item|productos|products)\\//i.test(path)) s += 80;
    if (/\\/(c|categoria|category|cat|departamento|seccion|search|busqueda|tag)\\//i.test(path)) s -= 100;
    // Mas segmentos = mas especifico
    s += (path.split('/').filter(Boolean).length) * 5;
    // Mas largo = mas especifico
    s += Math.min(path.length, 200) / 10;
    // Bonus por cercania a la imagen (depth 0 = el <a> envuelve directo al img)
    if (typeof depth === 'number') {
      if (depth <= 2) s += 50;
      else if (depth <= 5) s += 25;
      else if (depth <= 10) s += 8;
    }
    return s;
  }
 
  // Extrae precio y nombre del producto desde JSON-LD Schema.org
  // Funciona en cualquier tienda que implemente datos estructurados (la mayoría)
  function extractFromJsonLd() {
    var result = { price: null, title: null };
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < scripts.length; i++) {
        var data = JSON.parse(scripts[i].textContent || '{}');
        var items = Array.isArray(data) ? data : [data];
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          // Buscar nombre del producto
          if (!result.title && item.name && typeof item.name === 'string' && item.name.trim().length > 2) {
            result.title = item.name.trim().slice(0, 100);
          }
          // Buscar precio en offers
          var offers = item.offers;
          if (!offers) continue;
          var offerArr = Array.isArray(offers) ? offers : [offers];
          for (var k = 0; k < offerArr.length; k++) {
            var o = offerArr[k];
            if (o.price != null && !result.price) {
              var p = parseFloat(String(o.price).replace(/,/g, '.'));
              if (!isNaN(p) && p > 0) {
                var currency = o.priceCurrency || '';
                result.price = (currency ? currency + ' ' : '') + o.price;
              }
            }
            // AggregateOffer tiene lowPrice
            if (o.lowPrice != null && !result.price) {
              var lp = parseFloat(String(o.lowPrice).replace(/,/g, '.'));
              if (!isNaN(lp) && lp > 0) {
                result.price = String(o.lowPrice);
              }
            }
          }
          if (result.price) break;
        }
        if (result.price) break;
      }
    } catch (e) {}
    return result;
  }

  function findProductInfo(img) {
    var src = getImageSrc(img);
    // Filtrar alt texts que parecen nombres de archivo (IMG_2047207, DSC_001, etc.)
    var rawAlt = (img.alt || '').trim();
    var isFilenameAlt = /^[\w-]+_\d+$/i.test(rawAlt) || /^\d+$/.test(rawAlt) || /^(img|dsc|photo|pic|foto)\d*/i.test(rawAlt);
    var title = isFilenameAlt ? '' : rawAlt;
    var price = '';

    // ── Paso 0: JSON-LD Schema.org (universal, máxima confiabilidad) ──────────
    var jsonLd = extractFromJsonLd();
    if (jsonLd.price) price = jsonLd.price;
    if (jsonLd.title && !title) title = jsonLd.title;
    var currentHost = window.location.hostname;
    var candidates = [];
 
    function maybePrice(text) {
      var pm = (text || '').match(/(\\\$U?\\s*[\\d.,]+|UYU\\s*[\\d.,]+|US\\\$\\s*[\\d.,]+|USD\\s*[\\d.,]+|R\\\$\\s*[\\d.,]+)/i);
      if (pm && !price) price = pm[0].trim();
    }
 
    // La URL actual del navegador tambien compite (sin bonus de proximidad,
    // gana solo si no hay <a> cercanos al image con buen score)
    try {
      var pageUrl = new URL(window.location.href);
      candidates.push({ url: pageUrl, depth: 100, parent: null, score: scoreLink(pageUrl) });
    } catch (e) {}
 
    var parent = img.parentElement;
    var depth = 0;
    while (parent && parent !== document.body && depth < 25) {
      if (parent.tagName === 'A' && parent.href) {
        try {
          var aUrl = new URL(parent.href, window.location.href);
          if (isSameSite(aUrl.hostname, currentHost)) {
            candidates.push({ url: aUrl, depth: depth, parent: parent, score: scoreLink(aUrl, depth) });
            if (!title) title = parent.title || parent.getAttribute('aria-label') || (parent.textContent || '').trim().slice(0, 80);
            maybePrice(parent.textContent);
          }
        } catch (e) {}
      }
      var dh = parent.getAttribute && (parent.getAttribute('data-href') || parent.getAttribute('data-link') || parent.getAttribute('data-product-url'));
      if (dh) {
        try {
          var u2 = new URL(dh, window.location.href);
          if (isSameSite(u2.hostname, currentHost)) {
            candidates.push({ url: u2, depth: depth, parent: parent, score: scoreLink(u2, depth) });
            maybePrice(parent.textContent);
          }
        } catch (e) {}
      }
      // Buscar tambien <a> hijos (a veces el link esta en un hermano del img)
      if (parent.querySelectorAll && depth >= 1 && depth <= 4) {
        var nearby = parent.querySelectorAll('a[href]');
        for (var k = 0; k < nearby.length; k++) {
          try {
            var nu = new URL(nearby[k].href, window.location.href);
            if (isSameSite(nu.hostname, currentHost)) {
              candidates.push({ url: nu, depth: depth + 2, parent: nearby[k], score: scoreLink(nu, depth + 2) });
              maybePrice(nearby[k].textContent);
            }
          } catch (e) {}
        }
      }
      parent = parent.parentElement;
      depth++;
    }
 
    // Elegir el mejor candidato (score mas alto, deshempate por proximidad al img)
    var link = '';
    if (candidates.length > 0) {
      candidates.sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.depth - b.depth;
      });
      link = candidates[0].url.href;
    }
 
    // Si no se encontró precio en los links, buscar en elementos de precio
    if (!price) {
      var storeHost = window.location.hostname.replace(/^www\./, '');
      // Selectores específicos por tienda buscados a nivel documento
      var storeSelMap = {
        'zara.com':          ['[data-qa-label="price"]','.price__amount','.money-amount__main','[class*="price__amount"]','.price-current__amount'],
        'hm.com':            ['.product-item-price','[data-testid="product-price"]','.price.regular','[class*="product-price"]','.price'],
        'renner.com':        ['.renner-product-price','.vtex-product-price','[class*="product-price"]'],
        'rotundastore.com':  ['.product__price','span.money','.price'],
        'austera.com.uy':    ['.price','[class*="price"]','span.money'],
        'carocriado.com':    ['.price','[class*="price"]'],
        'lolita.com.uy':     ['.price','[class*="price"]'],
        'decathlon.com.uy':  ['[class*="sellingPrice"]','[class*="spotPrice"]','[class*="Price"]'],
        'decathlon.com.ar':  ['[class*="sellingPrice"]','[class*="spotPrice"]','[class*="Price"]'],
        'lacancha.uy':       ['.price','.product-price','[itemprop="price"]'],
        'indian.com.uy':     ['.price','[class*="price"]','span.money'],
        'indian.ar':         ['.price','[class*="price"]','span.money'],
      };
      var specificSels = null;
      for (var sk in storeSelMap) {
        if (storeHost.indexOf(sk) !== -1) { specificSels = storeSelMap[sk]; break; }
      }
      // Selectores de precio muy específicos del producto principal (no carruseles)
      // Ordered by specificity — se usan a nivel documento solo los que identifican
      // el precio del producto actual, no de productos relacionados
      var productPriceSelectors = specificSels || [];
      // Agregar selectores genéricos de alto nivel de especificidad
      var highSpecificity = [
        '[data-qa-label="price"]',          // Zara
        '[itemprop="price"]',               // Schema.org
        '[data-testid="product-price"]',    // H&M y otros
        '[class*="sellingPrice"]',          // VTEX (Decathlon)
        '[class*="spotPrice"]',             // VTEX alternativo
      ];
      for (var hs = 0; hs < highSpecificity.length; hs++) {
        if (productPriceSelectors.indexOf(highSpecificity[hs]) === -1) {
          productPriceSelectors.push(highSpecificity[hs]);
        }
      }

      // 1) Buscar subiendo desde la imagen — más preciso porque estamos cerca del producto
      var priceSelectors = [
        '[class*="price"]','[class*="precio"]','[class*="Price"]',
        '[itemprop="price"]','[data-testid*="price"]',
        '.money','[class*="amount"]','[class*="selling"]',
        '[data-qa-label="price"]','[class*="spot-price"]',
      ];
      var searchRoot = img.parentElement;
      var pd = 0;
      while (searchRoot && pd < 12) {
        for (var ps = 0; ps < priceSelectors.length; ps++) {
          var priceEl = searchRoot.querySelector(priceSelectors[ps]);
          if (priceEl) { maybePrice(priceEl.textContent); if (price) break; }
        }
        if (price) break;
        searchRoot = searchRoot.parentElement;
        pd++;
      }

      // 2) Último recurso: selectores de alto nivel de especificidad en documento
      //    (evitamos [class*="price"] genérico para no agarrar carruseles)
      if (!price) {
        for (var si = 0; si < productPriceSelectors.length; si++) {
          var allEls = document.querySelectorAll(productPriceSelectors[si]);
          // Tomar el primero que esté visible y tenga texto con número
          for (var ei = 0; ei < allEls.length; ei++) {
            var el = allEls[ei];
            var t = (el.textContent || '').trim();
            if (t && /\d/.test(t) && el.offsetParent !== null) {
              maybePrice(t);
              if (price) break;
            }
          }
          if (price) break;
        }
      }
    }

    if (!link) link = window.location.href;

    // Si no se encontró título, buscar en h1 o elementos comunes de nombre de producto
    if (!title) {
      var titleSelectors = ['h1','[class*="product-name"]','[class*="product-title"]','[itemprop="name"]','[data-testid*="title"]','[data-testid*="name"]'];
      for (var ts = 0; ts < titleSelectors.length; ts++) {
        var titleEl = document.querySelector(titleSelectors[ts]);
        if (titleEl) { var t = (titleEl.textContent || '').trim(); if (t && t.length > 2 && t.length < 200) { title = t.slice(0, 100); break; } }
      }
    }
    if (!title) title = document.title || 'Producto';
 
    return { img: src, title: title.slice(0, 100), link: link, price: price };
  }
 
  function onTouchStart(e) {
    var target = getImageElement(e.target);
    if (!target) return;
 
    var t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    pressTarget = target;
 
    pressTarget.style.transition = 'opacity 200ms, transform 200ms';
 
    pressTimer = setTimeout(function() {
      if (pressTarget) {
        var info = findProductInfo(pressTarget);
        if (!info.img) { cancel(); return; }
 
        pressTarget.style.transform = 'scale(0.95)';
        pressTarget.style.opacity = '0.6';
 
        post({ type: 'pickStart', x: startX, y: startY, img: info.img, title: info.title, link: info.link, price: info.price });
 
        setTimeout(function() {
          if (pressTarget) {
            pressTarget.style.transform = '';
            pressTarget.style.opacity = '';
          }
          pressTarget = null;
        }, 500);
      }
    }, LONG_PRESS_MS);
  }
 
  function onTouchMove(e) {
    if (!pressTimer) return;
    var t = e.touches[0];
    var dx = Math.abs(t.clientX - startX);
    var dy = Math.abs(t.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) cancel();
  }
 
  function onTouchEnd() { cancel(); }
 
  function cancel() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (pressTarget) {
      pressTarget.style.transform = '';
      pressTarget.style.opacity = '';
      pressTarget = null;
    }
  }
 
  document.addEventListener('touchstart', onTouchStart, true);
  document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
  document.addEventListener('touchend', onTouchEnd, true);
  document.addEventListener('touchcancel', cancel, true);
 
  // Enviar titulo de la pagina (para agregar a destacadas con nombre amigable)
  function sendTitle() {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageTitle', title: (document.title || '').slice(0, 60) }));
      }
    } catch (e) {}
  }
  sendTitle();
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(sendTitle, 300);
  } else {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(sendTitle, 300); });
  }
 
  document.addEventListener('contextmenu', function(e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  }, true);
})();
true;
`;
 
export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [browserUrl, setBrowserUrl] = useState(null);
  const [picks, setPicks] = useState([]);
  const [ghost, setGhost] = useState(null);
  const [toast, setToast] = useState('');
  const [customStores, setCustomStores] = useState([]);
  const [currentPageTitle, setCurrentPageTitle] = useState('');
  const [currentBrowserUrl, setCurrentBrowserUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [picksLoaded, setPicksLoaded] = useState(false);
  // Refs (no state) con la key de storage de la cuenta actualmente cargada.
  // Se usan en vez de userProfile?.id en los efectos de guardado para evitar
  // que, al cambiar de cuenta, se llegue a guardar el pick de la cuenta VIEJA
  // bajo la key de la cuenta NUEVA (carrera entre el efecto de carga y el de guardado).
  const activePicksKeyRef = useRef(null);
  const activeCollectionsKeyRef = useRef(null);
  const [userProfile, setUserProfile] = useState(null);   // null = no logueado
  const [userInterests, setUserInterests] = useState([]);  // ids de categorías
  const [unreadNotifCount, setUnreadNotifCount] = useState(0); // para el contador de la campanita
  const [searchInitialQuery, setSearchInitialQuery] = useState(null); // texto libre pre-cargado desde "Mis tiendas" (modo Toda la web)
  const [customBackLabel, setCustomBackLabel] = useState(null); // label del botón "volver" del navegador cuando se abrió desde un lugar puntual (ej. una colección)
  // "Comparar en otras tiendas": lista de tiendas de la categoría (para el
  // modal de selección múltiple) + qué se terminó eligiendo, para pasarle a
  // la pestaña Buscar como tiendas extra + query pre-cargada.
  const [compareOptions, setCompareOptions] = useState(null); // { query, stores: [...] } | null = modal cerrado
  const [compareSelected, setCompareSelected] = useState({}); // { [domain]: true }
  const [searchPreset, setSearchPreset] = useState(null); // { query, stores } que le pasamos a SearchView
  // Avatar URL siempre se deriva del ID del usuario (sin depender de metadata)
  const [avatarCacheBust, setAvatarCacheBust] = useState('');
  const getAvatarUrl = (uid) => uid
    ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${uid}.jpg${avatarCacheBust}`
    : null;
  const [country, setCountry] = useState('UY');
  const [storesOrderSwapped, setStoresOrderSwapped] = useState(false);
  const [collections, setCollections] = useState([]);          // [{ id, name, pickIds }]
  const [collectionModal, setCollectionModal] = useState(null); // pick pendiente de asignar
  const [picksTab, setPicksTab] = useState('todos');            // persiste al abrir browser
  const [openCollection, setOpenCollection] = useState(null);   // persiste al abrir browser
  const [appBackground, setAppBackground] = useState(null);     // id del fondo elegido, o null = ninguno

  const changeAppBackground = async (id) => {
    setAppBackground(id);
    try { await AsyncStorage.setItem(APP_BACKGROUND_STORAGE_KEY, id || ''); } catch (e) {}
  };

  // ── Colección compartida (deep link picks://collection/<id>) ────────────────
  const [sharedCollectionId, setSharedCollectionId] = useState(null);
  const [sharedCollection, setSharedCollection] = useState(null);
  const [loadingSharedCollection, setLoadingSharedCollection] = useState(false);
  const [sharedCollectionError, setSharedCollectionError] = useState('');

  function extractSharedCollectionId(url) {
    if (!url) return null;
    const m = url.match(/collection\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  useEffect(() => {
    const handleUrl = (url) => {
      const id = extractSharedCollectionId(url);
      if (id) setSharedCollectionId(id);
    };
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (!sharedCollectionId) return;
    let cancelled = false;
    setLoadingSharedCollection(true);
    setSharedCollectionError('');
    setSharedCollection(null);
    fetch(`${BACKEND_URL}/api/collections/${sharedCollectionId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (!data.collection) { setSharedCollectionError('Esta colección ya no está disponible.'); return; }
        setSharedCollection(data.collection);
      })
      .catch(() => { if (!cancelled) setSharedCollectionError('No se pudo cargar la colección.'); })
      .finally(() => { if (!cancelled) setLoadingSharedCollection(false); });
    return () => { cancelled = true; };
  }, [sharedCollectionId]);

  // Cargar tiendas custom, orden y país guardados al arrancar (esto no depende de la cuenta)
  useEffect(() => {
    (async () => {
      try {
        const sc = await AsyncStorage.getItem('customStores-v1');
        if (sc) setCustomStores(JSON.parse(sc));
        const so = await AsyncStorage.getItem('storesOrder-v1');
        if (so === 'swapped') setStoresOrderSwapped(true);
        const savedBg = await AsyncStorage.getItem(APP_BACKGROUND_STORAGE_KEY);
        if (savedBg) setAppBackground(savedBg);
        // Detectar país: primero preferencia guardada, luego por IP
        const savedCountry = await AsyncStorage.getItem('country-v1');
        if (savedCountry && STORES_BY_COUNTRY[savedCountry]) {
          setCountry(savedCountry);
        } else {
          try {
            const res = await Promise.race([
              fetch('https://ipapi.co/json/'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
            ]);
            const geo = await res.json();
            const code = geo.country_code;
            if (code && STORES_BY_COUNTRY[code]) {
              setCountry(code);
              await AsyncStorage.setItem('country-v1', code);
            }
          } catch (e) { /* timeout o sin red — queda UY por defecto */ }
        }
      } catch (e) {}
      setLoaded(true);
      // Registrar dispositivo para notificaciones (sin bloquear la UI)
      registerForNotifications();
    })();
    track('app_opened');
  }, []);

  // Cargar Mis Picks y Colecciones DE LA CUENTA ACTUAL (o "invitado" si no hay sesión).
  // Se re-ejecuta cada vez que cambia la cuenta logueada, para que dos cuentas
  // en el mismo teléfono no se mezclen. La primera vez migra los datos viejos
  // (guardados antes de separar por cuenta) a la cuenta que esté activa en ese momento.
  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    const uid = userProfile?.id || null;
    const pKey = picksStorageKey(uid);
    const cKey = collectionsStorageKey(uid);
    // Bloquear guardados YA MISMO (síncrono, vía ref) para que el efecto de
    // guardado no llegue a escribir los picks de la cuenta anterior bajo la
    // key de esta cuenta nueva mientras termina de cargar.
    activePicksKeyRef.current = null;
    activeCollectionsKeyRef.current = null;
    setPicksLoaded(false);
    (async () => {
      try {
        await runLegacyMigrationOnce(pKey, cKey);

        const [sp, scol] = await Promise.all([
          AsyncStorage.getItem(pKey),
          AsyncStorage.getItem(cKey),
        ]);
        if (cancelled) return;
        const loadedPicks = sp ? JSON.parse(sp) : [];
        const loadedCollections = scol ? JSON.parse(scol) : [];
        setPicks(loadedPicks);
        setCollections(loadedCollections);
        activePicksKeyRef.current = pKey;
        activeCollectionsKeyRef.current = cKey;
        // Re-sincronizar picks de esta cuenta al backend (por si reinició y perdió datos).
        // Se pasan las colecciones recién leídas (no el estado, que puede estar desactualizado
        // en este mismo flush) para calcular is_public correctamente.
        syncAllPicksToBackend(loadedPicks, loadedCollections);
        syncAllCollectionsToBackend(loadedCollections);
      } catch (e) {
        if (!cancelled) {
          setPicks([]);
          setCollections([]);
          activePicksKeyRef.current = pKey;
          activeCollectionsKeyRef.current = cKey;
        }
      } finally {
        if (!cancelled) setPicksLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecked, userProfile?.id]);
 
  // Escuchar cambios de sesión Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserProfile(session.user);
        setUserInterests(session.user.user_metadata?.interests || []);
        // avatar URL derived from user ID, no metadata needed
      }
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserProfile(session?.user || null);
      setUserInterests(session?.user?.user_metadata?.interests || []);
      setAuthChecked(true);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!picksLoaded || !activeCollectionsKeyRef.current) return;
    AsyncStorage.setItem(activeCollectionsKeyRef.current, JSON.stringify(collections)).catch(() => {});
  }, [collections, picksLoaded]);

  // Persistir picks cuando cambian (guardados por cuenta, no por dispositivo).
  // Usa activePicksKeyRef (no userProfile?.id) para evitar guardar bajo la
  // cuenta equivocada durante el instante en que se está cambiando de cuenta.
  useEffect(() => {
    if (!picksLoaded || !activePicksKeyRef.current) return;
    AsyncStorage.setItem(activePicksKeyRef.current, JSON.stringify(picks)).catch(() => {});
  }, [picks, picksLoaded]);
 
  // Persistir tiendas custom cuando cambian
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('customStores-v1', JSON.stringify(customStores)).catch(() => {});
  }, [customStores, loaded]);

  // Persistir orden de secciones
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('storesOrder-v1', storesOrderSwapped ? 'swapped' : 'normal').catch(() => {});
  }, [storesOrderSwapped, loaded]);
 
  const ghostAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ghostScale = useRef(new Animated.Value(1)).current;
  const ghostOpacity = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
 
  function openUrl(url, backLabel) {
    setCurrentPageTitle('');
    setCurrentBrowserUrl(url);
    setBrowserUrl(url);
    setCustomBackLabel(backLabel || null);
  }
  function closeBrowser() {
    setBrowserUrl(null);
    setCurrentBrowserUrl(null);
    setCustomBackLabel(null);
  }
  function changeTab(tab) {
    setBrowserUrl(null);
    setCurrentBrowserUrl(null);
    setActiveTab(tab);
    if (['home', 'explorar', 'picks'].includes(tab)) refreshUnreadCount();
  }

  // Contador de la campanita: eventos de precio/stock (por device_id, andan
  // sin cuenta) + actividad social (por user_id, solo si hay sesión).
  const refreshUnreadCount = useCallback(async () => {
    try {
      const device_id = await getOrCreateDeviceId();
      const params = new URLSearchParams({ device_id });
      if (userProfile?.id) params.set('user_id', userProfile.id);
      const res = await fetch(`${BACKEND_URL}/api/notifications/unread-count?${params.toString()}`);
      const data = await res.json();
      setUnreadNotifCount(data.count || 0);
    } catch (e) {}
  }, [userProfile?.id]);

  useEffect(() => { refreshUnreadCount(); }, [refreshUnreadCount]);

  // ── Tutorial de onboarding (globitos) ───────────────────────────────────────
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourTargets, setTourTargets] = useState({});
  const registerTourTarget = useCallback((id, layout) => {
    setTourTargets(prev => {
      const ex = prev[id];
      if (ex && ex.x === layout.x && ex.y === layout.y && ex.width === layout.width && ex.height === layout.height) return prev;
      return { ...prev, [id]: layout };
    });
  }, []);
  const tourCtxValue = useMemo(() => ({ registerTarget: registerTourTarget }), [registerTourTarget]);

  // La primera vez que se abre la app (nunca antes visto), arranca el tour solo.
  useEffect(() => {
    AsyncStorage.getItem('onboarding-tour-seen-v1').then((seen) => {
      if (!seen) setTimeout(() => setTourActive(true), 900);
    }).catch(() => {});
  }, []);

  // Cada paso del tour puede requerir estar en otra pantalla — si no coincide, cambiamos de tab.
  useEffect(() => {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStepIndex];
    if (step && activeTab !== step.tab) setActiveTab(step.tab);
  }, [tourActive, tourStepIndex]);

  function tourNext() {
    if (tourStepIndex >= TOUR_STEPS.length - 1) { tourFinish(); return; }
    setTourStepIndex((i) => i + 1);
  }
  function tourFinish() {
    setTourActive(false);
    setTourStepIndex(0);
    AsyncStorage.setItem('onboarding-tour-seen-v1', '1').catch(() => {});
  }
  function replayTour() {
    setActiveTab('home');
    setTourStepIndex(0);
    setTimeout(() => setTourActive(true), 350);
  }

  function getActiveBrowserUrl() {
    return currentBrowserUrl || browserUrl;
  }
 
  function isCurrentFavorite() {
    const url = getActiveBrowserUrl();
    if (!url) return false;
    try {
      const d = new URL(url).hostname.replace(/^www\./, '');
      const reg = getRegisteredDomain(d);
      const activeStores = STORES_BY_COUNTRY[country] || STORES;
    return activeStores.some(s => s.domain === reg) || customStores.some(s => s.domain === reg);
    } catch (e) { return false; }
  }
 
  // Agrega una tienda nueva a "Mis tiendas" (usada tanto por el toggle de
  // favorito en el browser como por el prompt "¿Agregar esta tienda?" de
  // la búsqueda unificada en Mis tiendas).
  function addCustomStore({ domain, name, url }) {
    const cleanName = (name || domain.split('.')[0]).slice(0, 25);
    const color = CUSTOM_COLORS[customStores.length % CUSTOM_COLORS.length];
    const newStore = {
      name: cleanName,
      domain,
      url: (url || `https://${domain}`).split('#')[0],
      bg: color.bg,
      fg: color.fg,
      short: getInitials(cleanName),
      custom: true,
    };
    setCustomStores(prev => [...prev, newStore]);
    track('custom_store_added', { store: newStore.name, domain: newStore.domain });
    showToast('Agregada a tus tiendas');
    syncCustomStoreToBackend(newStore);
    return newStore;
  }

  function toggleCurrentFavorite() {
    const url = getActiveBrowserUrl();
    if (!url) return;
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return; }
    const reg = getRegisteredDomain(domain);
    const activeStores = STORES_BY_COUNTRY[country] || STORES;

    // Si ya está en tiendas predefinidas del país → no se puede quitar
    if (activeStores.some(s => s.domain === reg)) {
      showToast('Tienda predefinida de tu país');
      return;
    }
    // Si está en Mis tiendas → quitarla
    if (customStores.some(s => s.domain === reg)) {
      removeCustomStore(reg);
      return;
    }
    // No está en ninguna → agregar como custom
    const titleSource = currentPageTitle || reg.split('.')[0];
    const cleanName = titleSource.split(/[|·\-–—]/)[0].trim().slice(0, 25) || reg.split('.')[0];
    addCustomStore({ domain: reg, name: cleanName, url: url.split('#')[0] });
  }

  // Handler para el prompt "¿Agregar esta tienda?" de la búsqueda unificada
  // en Mis tiendas (HomeView, modo "Toda la web" con una URL/dominio directo).
  function onAddCustomStoreByDomain(domain, url) {
    if (!domain) return;
    if (customStores.some(s => s.domain === domain)) return;
    addCustomStore({ domain, name: domain.split('.')[0], url });
  }

  // Intenta inferir a qué categoría de interés pertenece una tienda a partir
  // de su nombre y dominio, usando las mismas palabras clave que ya usamos
  // para personalizar Explorar. Best-effort: si no matchea nada, devuelve null
  // y esa tienda simplemente no se suma a la base compartida (sigue quedando
  // en "Mis tiendas" localmente, como siempre).
  function inferStoreCategory(name = '', domain = '') {
    const text = `${name} ${domain}`.toLowerCase();
    for (const catId of Object.keys(INTEREST_KEYWORDS)) {
      const kws = INTEREST_KEYWORDS[catId] || [];
      if (kws.some((kw) => text.includes(kw))) return catId;
    }
    return null;
  }

  // Cuando el usuario agrega una tienda propia a "Mis tiendas", la suma
  // automáticamente a la base de tiendas compartida del backend (si logramos
  // inferirle una categoría), para que le sirva a todos los usuarios.
  async function syncCustomStoreToBackend(s) {
    try {
      const category = inferStoreCategory(s.name, s.domain);
      if (!category) return;
      const device_id = await getOrCreateDeviceId();
      const user_id = userProfile?.id || null;
      await fetch(`${BACKEND_URL}/api/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id, user_id,
          store: {
            domain: s.domain, name: s.name, category, country: country || 'UY',
            url: s.url, bg: s.bg, fg: s.fg, short: s.short,
          },
        }),
      });
    } catch (e) {}
  }
 
  function removeCustomStore(domain) {
    const removed = customStores.find(s => s.domain === domain);
    if (removed) track('custom_store_removed', { store: removed.name, domain: removed.domain });
    setCustomStores(prev => prev.filter(s => s.domain !== domain));
    showToast('Tienda eliminada');
  }

  // "Buscar en otras tiendas de esta categoría": mira en qué categoría está
  // catalogada la tienda que se está navegando (base compartida del backend)
  // y ofrece abrir el mismo producto buscado en las otras tiendas top de esa
  // categoría, usando Google Shopping restringido al dominio de cada una.
  // Abre el modal de selección múltiple con las tiendas de la misma categoría
  // que la que se está navegando. El usuario puede tildar varias.
  async function compareInOtherStores() {
    const url = getActiveBrowserUrl();
    if (!url) return;
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return; }
    const reg = getRegisteredDomain(domain);
    try {
      const lookupRes = await fetch(`${BACKEND_URL}/api/stores/lookup?domain=${encodeURIComponent(reg)}&country=${country}`);
      const found = await lookupRes.json();
      if (!found || !found.category) {
        Alert.alert(
          'Todavía no la tenemos categorizada',
          'Esta tienda no está en nuestra base compartida todavía, así que no podemos sugerirte dónde comparar. Se va a poder comparar en cuanto la sumemos a alguna categoría.'
        );
        return;
      }
      const storesRes = await fetch(`${BACKEND_URL}/api/stores?country=${country}&category=${found.category}&limit=8`);
      const stores = await storesRes.json();
      const others = (Array.isArray(stores) ? stores : []).filter(s => s.domain !== reg);
      if (others.length === 0) {
        showToast('No encontramos otras tiendas en esta categoría todavía');
        return;
      }
      const productQuery = cleanProductTitle(currentPageTitle);
      track('compare_category_opened', { domain: reg, category: found.category });
      setCompareSelected({});
      setCompareOptions({ query: productQuery, stores: others.slice(0, 8), category: found.category, fromDomain: reg });
    } catch (e) {}
  }

  // Confirma la selección del modal de comparar: manda a la pestaña Buscar
  // con esas tiendas cargadas (usan el mismo buscador inyectado que ya usan
  // las tiendas "Mis tiendas") y la query del producto ya escrita.
  function confirmCompareSelection() {
    if (!compareOptions) return;
    const chosen = compareOptions.stores.filter(s => compareSelected[s.domain]);
    if (chosen.length === 0) {
      showToast('Elegí al menos una tienda');
      return;
    }
    track('compare_category_stores_chosen', {
      from: compareOptions.fromDomain,
      category: compareOptions.category,
      count: chosen.length,
    });
    setSearchPreset({ query: compareOptions.query, stores: chosen, nonce: Date.now() });
    setCompareOptions(null);
    closeBrowser();
    setActiveTab('search');
  }
 
  function showToast(msg) {
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(''));
  }
 
  async function changeCountry(code) {
    setCountry(code);
    try { await AsyncStorage.setItem('country-v1', code); } catch (e) {}
    track('country_changed', { country: code });
  }

  // Un pick es público si pertenece a alguna colección marcada como pública.
  function computeIsPublic(pickId, cols) {
    return (cols || []).some(c => c.isPublic && c.pickIds?.includes(pickId));
  }

  // Re-sincroniza los picks de la cuenta activa al backend.
  // Se llama siempre que carga (o cambia) la cuenta, independiente de si hay permisos de notificaciones.
  async function syncAllPicksToBackend(allPicks, cols) {
    try {
      if (!allPicks || allPicks.length === 0) return;
      const device_id = await getOrCreateDeviceId();
      const user_id = userProfile?.id || null;
      const useCols = cols !== undefined ? cols : collections;
      for (const pick of allPicks) {
        fetch(`${BACKEND_URL}/api/picks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id, user_id, pick: { ...pick, is_public: computeIsPublic(pick.id, useCols) } }),
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // Notifica al backend que cambió la visibilidad pública de un pick puntual
  // (se usa al togglear una colección pública/privada, sin re-mandar todo el objeto).
  // Reenvía el pick COMPLETO (no solo el flag) para garantizar que el backend
  // tenga siempre el user_id correcto, incluso si el pick se creó antes de
  // que existiera esta sincronización (picks viejos que nunca mandaron user_id).
  async function syncPickVisibility(pick, isPublic) {
    if (!pick) return;
    try {
      const device_id = await getOrCreateDeviceId();
      const user_id = userProfile?.id || null;
      await fetch(`${BACKEND_URL}/api/picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, user_id, pick: { ...pick, is_public: isPublic } }),
      });
    } catch (e) {}
  }

  // Sincroniza una colección (nombre, público/privado, qué picks contiene) al
  // backend, para que se puedan armar "colecciones públicas" de otros usuarios.
  async function syncCollectionToBackend(collection) {
    if (!collection) return;
    try {
      const device_id = await getOrCreateDeviceId();
      const user_id = userProfile?.id || null;
      await fetch(`${BACKEND_URL}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, user_id, collection }),
      });
    } catch (e) {}
  }

  async function syncAllCollectionsToBackend(allCollections) {
    try {
      if (!allCollections || allCollections.length === 0) return;
      for (const col of allCollections) syncCollectionToBackend(col);
    } catch (e) {}
  }

  async function registerForNotifications() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      // projectId es requerido en builds standalone (Ad Hoc / App Store)
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '06059259-c03f-47f0-8658-605cf298974c',
      });
      const push_token = tokenData.data;
      const device_id = await getOrCreateDeviceId();
      await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, push_token }),
      });
      // Si el usuario ya había desactivado los avisos localmente, re-sincronizarlo
      // (por si el registro del token ocurrió recién ahora y el backend no lo sabía).
      const storedPref = await AsyncStorage.getItem('notifications-enabled-v1');
      if (storedPref === 'false') {
        await fetch(`${BACKEND_URL}/api/notifications/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id, enabled: false }),
        }).catch(() => {});
      }
    } catch (e) {
      // Silencioso — las notificaciones son opcionales
    }
  }

  async function syncPickToBackend(pick) {
    try {
      const device_id = await getOrCreateDeviceId();
      const user_id = userProfile?.id || null;
      await fetch(`${BACKEND_URL}/api/picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, user_id, pick: { ...pick, is_public: computeIsPublic(pick.id, collections) } }),
      });
    } catch (e) {}
  }

  async function removePickFromBackend(pickId) {
    try {
      const device_id = await getOrCreateDeviceId();
      await fetch(`${BACKEND_URL}/api/picks/${pickId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id }),
      });
    } catch (e) {}
  }

  // Revisa contra el backend (que chequea stock periódicamente) cuáles de los
  // Picks de la cuenta activa ya están agotados, sin borrar nada todavía.
  async function checkOutOfStockPicks() {
    const device_id = await getOrCreateDeviceId();
    const res = await fetch(`${BACKEND_URL}/api/picks/${device_id}`);
    const data = await res.json();
    const outOfStockIds = new Set((data.picks || []).filter(p => p.in_stock === 0).map(p => p.id));
    return picks.filter(p => outOfStockIds.has(p.id));
  }

  function removeOutOfStockPicks(ids) {
    const idSet = new Set(ids);
    setPicks(prev => prev.filter(p => !idSet.has(p.id)));
    setCollections(prev => prev.map(c => ({ ...c, pickIds: c.pickIds.filter(pid => !idSet.has(pid)) })));
    ids.forEach(id => removePickFromBackend(id));
    track('picks_cleaned_out_of_stock', { count: ids.length });
  }

  function addPick(data) {
    var domain = 'web';
    try { domain = new URL(data.link || browserUrl).hostname.replace(/^www\./, ''); } catch (e) {}
    const pick = {
      id: 'p-' + Date.now(),
      name: data.title || 'Producto',
      img: data.img,
      url: data.link || browserUrl,
      domain: domain,
      price: data.price || '',
    };
    setPicks(prev => {
      if (prev.find(p => p.img === pick.img)) {
        showToast('Ya estaba en tus Picks');
        return prev;
      }
      track('pick_saved', { store: getStoreDisplayName(domain), domain: domain, has_price: !!data.price, img: data.img || '', product_url: data.link || '', title: (data.title || '').slice(0, 80) });
      showToast('Guardado en Mis Picks ✓');
      syncPickToBackend(pick);
      setTimeout(() => setCollectionModal(pick), 350);
      return [pick, ...prev];
    });
  }
 
  function flyToPicks(startX, startY, imgUri, productData) {
    const screenStartX = startX;
    const screenStartY = startY + URL_BAR_OFFSET;
 
    const targetX = SCREEN.width * 0.75 - 60;
    const targetY = SCREEN.height - 100;
 
    setGhost({ img: imgUri });
    ghostAnim.setValue({ x: screenStartX - 60, y: screenStartY - 75 });
    ghostScale.setValue(1);
    ghostOpacity.setValue(1);
 
    Animated.parallel([
      Animated.timing(ghostAnim, {
        toValue: { x: targetX, y: targetY },
        duration: 600,
        easing: Easing.bezier(0.5, 0, 0.7, 0.5),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(ghostScale, { toValue: 1.1, duration: 150, useNativeDriver: true }),
        Animated.timing(ghostScale, { toValue: 0.2, duration: 450, useNativeDriver: true }),
      ]),
      Animated.timing(ghostOpacity, {
        toValue: 0,
        duration: 400,
        delay: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setGhost(null);
      addPick(productData);
    });
  }
 
  function handleWebMessage(event) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'pickStart' && msg.img) {
        flyToPicks(msg.x, msg.y, msg.img, {
          title: msg.title,
          link: msg.link,
          price: msg.price,
          img: msg.img,
        });
      } else if (msg.type === 'pageTitle') {
        if (msg.title) setCurrentPageTitle(msg.title);
      }
    } catch (e) {}
  }
 
  return (
    <TourContext.Provider value={tourCtxValue}>
      {!!getBackgroundSource(appBackground) && (
        <Image
          source={getBackgroundSource(appBackground)}
          style={styles.appBackgroundImg}
          resizeMode="cover"
          pointerEvents="none"
        />
      )}
      <SafeAreaView
        style={[styles.container, !!appBackground && { backgroundColor: 'transparent' }]}
        edges={['top', 'left', 'right']}
      >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
 
      <View style={styles.content}>
        {browserUrl ? (
          <BrowserView
            url={browserUrl}
            onClose={closeBrowser}
            backLabel={customBackLabel || (activeTab === 'picks' ? 'Colecciones' : activeTab === 'home' ? 'Inicio' : activeTab === 'explorar' ? 'Explorar' : 'Volver')}
            onMessage={handleWebMessage}
            isFavorite={isCurrentFavorite()}
            isCustomFavorite={customStores.some(s => {
              try {
                const d = getRegisteredDomain(new URL(getActiveBrowserUrl() || '').hostname.replace(/^www\./, ''));
                return s.domain === d;
              } catch(e) { return false; }
            })}
            onToggleFavorite={toggleCurrentFavorite}
            onUrlChange={setCurrentBrowserUrl}
            onCompare={compareInOtherStores}
          />
        ) : activeTab === 'home' ? (
          <HomeView
            onOpenUrl={openUrl}
            customStores={customStores}
            onRemoveCustom={removeCustomStore}
            country={country}
            countryStores={STORES_BY_COUNTRY[country] || STORES}
            onChangeCountry={changeCountry}
            storesOrderSwapped={storesOrderSwapped}
            onToggleStoresOrder={() => setStoresOrderSwapped(v => !v)}
            userInterests={userInterests}
            onOpenSearchWithQuery={(text) => {
              setSearchInitialQuery({ query: text, nonce: Date.now() });
              setActiveTab('search');
            }}
            onAddCustomStoreByDomain={onAddCustomStoreByDomain}
            unreadNotifCount={unreadNotifCount}
            onOpenNotifications={() => setActiveTab('notifications')}
          />
        ) : activeTab === 'search' ? (
          <SearchView
            onMessage={handleWebMessage}
            customStores={customStores}
            countryStores={STORES_BY_COUNTRY[country] || STORES}
            country={country}
            onOpenUrl={openUrl}
            preset={searchPreset}
            onPresetConsumed={() => setSearchPreset(null)}
            onBack={() => setActiveTab('home')}
            initialQuery={searchInitialQuery}
            onInitialQueryConsumed={() => setSearchInitialQuery(null)}
          />
        ) : activeTab === 'explorar' ? (
          <ExplorarScreen
            picks={picks}
            customStores={customStores}
            userInterests={userInterests}
            onOpenUrl={openUrl}
            onAddPick={(item) => {
              addPick({ title: item.title, img: item.img, link: item.url, price: item.price ? String(item.price) : '' });
            }}
            unreadNotifCount={unreadNotifCount}
            onOpenNotifications={() => setActiveTab('notifications')}
            userProfile={userProfile}
          />
        ) : activeTab === 'auth' ? (
          <AuthScreen
            picksCount={picks.length}
            onClose={() => setActiveTab('picks')}
            onClearMyPicks={async () => {
              setPicks([]);
              setCollections([]);
              try {
                if (activePicksKeyRef.current) await AsyncStorage.removeItem(activePicksKeyRef.current);
                if (activeCollectionsKeyRef.current) await AsyncStorage.removeItem(activeCollectionsKeyRef.current);
              } catch (e) {}
            }}
          />
        ) : activeTab === 'editProfile' ? (
          <EditProfileScreen
            userProfile={userProfile}
            avatarUrl={getAvatarUrl(userProfile?.id)}
            onAvatarChange={() => setAvatarCacheBust('?t=' + Date.now())}
            onClose={() => setActiveTab('picks')}
          />
        ) : activeTab === 'settings' ? (
          <SettingsScreen
            userProfile={userProfile}
            userInterests={userInterests}
            onInterestsChange={async (interests) => {
              await supabase.auth.updateUser({ data: { interests } });
              setUserInterests(interests);
            }}
            country={country}
            onChangeCountry={changeCountry}
            picksCount={picks.length}
            onClearMyPicks={async () => {
              setPicks([]);
              setCollections([]);
              try {
                if (activePicksKeyRef.current) await AsyncStorage.removeItem(activePicksKeyRef.current);
                if (activeCollectionsKeyRef.current) await AsyncStorage.removeItem(activeCollectionsKeyRef.current);
              } catch (e) {}
            }}
            onCheckOutOfStock={checkOutOfStockPicks}
            onRemoveOutOfStock={removeOutOfStockPicks}
            currentBackground={appBackground}
            onBackgroundChange={changeAppBackground}
            onOpenCommunity={() => setActiveTab('community')}
            onOpenEditProfile={() => setActiveTab('editProfile')}
            onClose={() => setActiveTab('picks')}
            onReplayTour={replayTour}
            onLogout={async () => {
              setPicksLoaded(false);
              setPicks([]);
              setCollections([]);
              await supabase.auth.signOut();
              setUserProfile(null);
              setUserInterests([]);
              setAvatarCacheBust('');
              setActiveTab('picks');
            }}
          />
        ) : activeTab === 'community' ? (
          <CommunityScreen
            userProfile={userProfile}
            onOpenUrl={openUrl}
            onClose={() => setActiveTab('picks')}
          />
        ) : activeTab === 'notifications' ? (
          <NotificationsScreen
            userProfile={userProfile}
            onOpenUrl={openUrl}
            onOpenCommunity={() => setActiveTab('community')}
            onClose={() => setActiveTab('picks')}
            onRead={() => setUnreadNotifCount(0)}
          />
        ) : (
          <PicksView
            picks={picks}
            collections={collections}
            picksTab={picksTab}
            setPicksTab={setPicksTab}
            openCollection={openCollection}
            setOpenCollection={setOpenCollection}
            userProfile={userProfile}
            avatarUrl={getAvatarUrl(userProfile?.id)}
            onOpenAuth={() => setActiveTab('auth')}
            onOpenEditProfile={() => setActiveTab('editProfile')}
            onOpenSettings={() => setActiveTab('settings')}
            onOpenCommunity={() => setActiveTab('community')}
            unreadNotifCount={unreadNotifCount}
            onOpenNotifications={() => setActiveTab('notifications')}
            onRemove={(id) => {
              const removed = picks.find(p => p.id === id);
              if (removed) track('pick_removed', { store: getStoreDisplayName(removed.domain), domain: removed.domain });
              setPicks(prev => prev.filter(p => p.id !== id));
              setCollections(prev => prev.map(c => ({ ...c, pickIds: c.pickIds.filter(pid => pid !== id) })));
              removePickFromBackend(id);
            }}
            onOpen={(url) => {
              const opened = picks.find(p => p.url === url);
              if (opened) track('pick_opened', { store: getStoreDisplayName(opened.domain), domain: opened.domain });
              openUrl(url);
            }}
            onToggleCollectionPublic={(colId, isPublic) => {
              const col = collections.find(c => c.id === colId);
              setCollections(prev => prev.map(c => c.id === colId ? { ...c, isPublic } : c));
              (col?.pickIds || []).forEach(pid => {
                const pk = picks.find(p => p.id === pid);
                if (pk) syncPickVisibility(pk, isPublic);
              });
              if (col) syncCollectionToBackend({ ...col, isPublic });
              track('collection_visibility_changed', { isPublic });
            }}
          />
        )}
      </View>

      {collectionModal && (
        <CollectionModal
          pick={collectionModal}
          collections={collections}
          onClose={() => setCollectionModal(null)}
          onSave={(colId, newColName) => {
            if (newColName) {
              const newCol = { id: 'c-' + Date.now(), name: newColName, pickIds: [collectionModal.id], isPublic: false };
              setCollections(prev => [...prev, newCol]);
              syncCollectionToBackend(newCol);
            } else if (colId) {
              const targetCol = collections.find(c => c.id === colId);
              setCollections(prev => prev.map(c =>
                c.id === colId && !c.pickIds.includes(collectionModal.id)
                  ? { ...c, pickIds: [...c.pickIds, collectionModal.id] }
                  : c
              ));
              if (targetCol?.isPublic) syncPickVisibility(collectionModal, true);
              if (targetCol) syncCollectionToBackend({ ...targetCol, pickIds: [...targetCol.pickIds, collectionModal.id] });
            }
            setCollectionModal(null);
          }}
        />
      )}

      <Modal
        visible={!!sharedCollectionId && !browserUrl}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSharedCollectionId(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
            borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.textPrimary }} numberOfLines={1}>
                {sharedCollection?.name || 'Colección compartida'}
              </Text>
              {!!sharedCollection && (
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                  {sharedCollection.picks.length} {sharedCollection.picks.length === 1 ? 'Pick' : 'Picks'}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setSharedCollectionId(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          {loadingSharedCollection ? (
            <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 30 }} />
          ) : !!sharedCollectionError ? (
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 30, paddingHorizontal: 24 }}>
              {sharedCollectionError}
            </Text>
          ) : sharedCollection && sharedCollection.picks.length > 0 ? (
            <ScrollView contentContainerStyle={styles.picksGridContent}>
              <View style={styles.picksGrid}>
                {sharedCollection.picks.map(p => {
                  let domain = 'web';
                  try { domain = new URL(p.url).hostname.replace(/^www\./, ''); } catch (e) {}
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickCard}
                      activeOpacity={0.85}
                      onPress={() => openUrl(p.url, sharedCollection?.name || 'Colección')}
                    >
                      <View style={styles.pickImgWrap}>
                        <Image source={{ uri: p.img }} style={styles.pickImg} resizeMode="cover" />
                      </View>
                      <View style={styles.pickInfo}>
                        <Text style={styles.pickName} numberOfLines={2}>{p.name}</Text>
                        <View style={styles.pickMeta}>
                          <Text style={[styles.pickDomain, { flexShrink: 1 }]} numberOfLines={1}>{getStoreDisplayName(domain)}</Text>
                          {(p.price_current || p.price_saved) ? <Text style={styles.pickPrice} numberOfLines={1}>${p.price_current || p.price_saved}</Text> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 30, paddingHorizontal: 24 }}>
              Esta colección todavía no tiene Picks públicos.
            </Text>
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!compareOptions}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCompareOptions(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14,
            borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.textPrimary }}>
                Comparar en otras tiendas
              </Text>
              {!!compareOptions?.query && (
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }} numberOfLines={1}>
                  "{compareOptions.query}"
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setCompareOptions(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 }}>
              Elegí una o más tiendas — te lleva a Buscar con cada una lista para ver sus resultados.
            </Text>
            {(compareOptions?.stores || []).map((s) => {
              const checked = !!compareSelected[s.domain];
              return (
                <TouchableOpacity
                  key={s.domain}
                  onPress={() => setCompareSelected(prev => ({ ...prev, [s.domain]: !prev[s.domain] }))}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.borderSoft,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                    borderColor: checked ? COLORS.accent : COLORS.border,
                    backgroundColor: checked ? COLORS.accent : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <Ionicons name="checkmark" size={15} color="#fff" />}
                  </View>
                  <View style={{
                    width: 32, height: 32, borderRadius: 8, backgroundColor: s.bg || '#2C2C2C',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: s.fg || '#fff', fontSize: 12, fontWeight: '700' }}>{s.short}</Text>
                  </View>
                  <Text style={{ fontSize: 15, color: COLORS.textPrimary, flex: 1 }}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={{ padding: 20, borderTopWidth: 0.5, borderTopColor: COLORS.border }}>
            <TouchableOpacity
              style={{
                backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                opacity: Object.values(compareSelected).some(Boolean) ? 1 : 0.4,
              }}
              onPress={confirmCompareSelection}
              disabled={!Object.values(compareSelected).some(Boolean)}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                Buscar en {Object.values(compareSelected).filter(Boolean).length || ''} tienda{Object.values(compareSelected).filter(Boolean).length === 1 ? '' : 's'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <TabBar
        activeTab={
          browserUrl ? 'home'
          : activeTab === 'search' ? 'home'
          : ['auth', 'editProfile', 'settings', 'community', 'notifications'].includes(activeTab) ? 'picks'
          : activeTab
        }
        setActiveTab={changeTab}
        pickCount={picks.length}
      />
 
      {ghost && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              transform: [
                { translateX: ghostAnim.x },
                { translateY: ghostAnim.y },
                { scale: ghostScale },
              ],
              opacity: ghostOpacity,
            },
          ]}
        >
          <Image source={{ uri: ghost.img }} style={styles.ghostImg} />
        </Animated.View>
      )}
 
      {toast !== '' && (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons name="heart" size={14} color={COLORS.accent} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      {tourActive && !browserUrl && (
        <TourOverlay
          step={TOUR_STEPS[tourStepIndex]}
          stepIndex={tourStepIndex}
          totalSteps={TOUR_STEPS.length}
          target={tourTargets[TOUR_STEPS[tourStepIndex]?.targetKey]}
          onNext={tourNext}
          onSkip={tourFinish}
        />
      )}
    </SafeAreaView>
    </TourContext.Provider>
  );
}


function InterestTile({ cat, active, onPress, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevActive = useRef(active);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.9, speed: 50, bounciness: 0, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, speed: 16, bounciness: 9, useNativeDriver: true }).start();
  };

  // Pequeño "pop" extra cuando pasa a activo (más allá del press-in/out normal)
  useEffect(() => {
    if (active && !prevActive.current) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, speed: 30, bounciness: 0, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 16, bounciness: 9, useNativeDriver: true }),
      ]).start();
    }
    prevActive.current = active;
  }, [active]);

  return (
    <Animated.View style={{ width: (SCREEN.width - 40 - 20) / 3, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[profileStyles.interestTile, active && profileStyles.interestTileActive]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.9}
      >
        <Ionicons name={cat.icon} size={20} color={active ? '#fff' : COLORS.textSecondary} />
        <Text style={[profileStyles.interestLabel, active && profileStyles.interestLabelActive]} numberOfLines={2}>
          {cat.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Nombre a mostrar para otro usuario: preferimos display_name, pero algunas
// cuentas viejas (creadas antes de pedir el nombre en el registro) quedaron
// con el email guardado ahí — en ese caso mostramos el @usuario en su lugar.
function personDisplayLabel(person) {
  const name = person?.display_name;
  const looksLikeEmail = typeof name === 'string' && name.includes('@');
  if (name && !looksLikeEmail) return name;
  if (person?.username) return `@${person.username}`;
  return name || 'Usuario';
}

// ── AuthScreen ───────────────────────────────────────────────────────────────
// Login / registro. Antes vivía adentro de la pestaña "Perfil"; ahora se llega
// acá desde el banner de "Iniciá sesión" en Mis Picks.
function AuthScreen({ picksCount = 0, onClearMyPicks, onClose }) {
  const [tab, setTab] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) { setError('Completá email y contraseña'); return; }
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : err.message);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Ingresá tu email primero'); setSuccess(''); return; }
    setError(''); setSuccess('');
    setForgotLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${BACKEND_URL}/reset-password`,
      });
      if (err) { setError(err.message); return; }
      setSuccess('Te enviamos un email con un link para restablecer tu contraseña.');
    } catch (e) {
      setError('No se pudo enviar el email. Probá de nuevo.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) { setError('Completá email y contraseña'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() || null, interests: [] } },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSuccess('¡Cuenta creada! Revisá tu email para confirmar.');
  };

  const handleClearMyPicks = () => {
    Alert.alert(
      'Vaciar mis Picks',
      `Se van a borrar los ${picksCount} Picks guardados en este dispositivo. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Vaciar', style: 'destructive', onPress: () => { onClearMyPicks?.(); } },
      ]
    );
  };

  return (
    <SafeAreaView style={profileStyles.container} edges={['top']}>
      {!!onClose && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }} hitSlop={10}>
            <Ionicons name="close" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={profileStyles.authContent} keyboardShouldPersistTaps="handled">
          <View style={profileStyles.authHeader}>
            <View style={profileStyles.authLogo}>
              <Ionicons name="bookmark" size={32} color="#fff" />
            </View>
            <Text style={profileStyles.authTitle}>Picks</Text>
            <Text style={profileStyles.authSub}>
              {tab === 'login' ? 'Iniciá sesión para sincronizar tus Picks' : 'Creá tu cuenta gratuita'}
            </Text>
          </View>

          <View style={profileStyles.tabToggle}>
            <TouchableOpacity
              style={[profileStyles.toggleBtn, tab === 'login' && profileStyles.toggleBtnActive]}
              onPress={() => { setTab('login'); setError(''); setSuccess(''); }}
            >
              <Text style={[profileStyles.toggleText, tab === 'login' && profileStyles.toggleTextActive]}>
                Ingresar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[profileStyles.toggleBtn, tab === 'register' && profileStyles.toggleBtnActive]}
              onPress={() => { setTab('register'); setError(''); setSuccess(''); }}
            >
              <Text style={[profileStyles.toggleText, tab === 'register' && profileStyles.toggleTextActive]}>
                Registrarse
              </Text>
            </TouchableOpacity>
          </View>

          <View style={profileStyles.form}>
            {tab === 'register' && (
              <>
                <Text style={profileStyles.inputLabel}>Nombre</Text>
                <TextInput
                  style={profileStyles.input}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder="Tu nombre"
                  placeholderTextColor={COLORS.textTertiary}
                />
              </>
            )}
            <Text style={profileStyles.inputLabel}>Email</Text>
            <TextInput
              style={profileStyles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholder="tu@email.com"
              placeholderTextColor={COLORS.textTertiary}
            />
            <Text style={profileStyles.inputLabel}>Contraseña</Text>
            <TextInput
              style={profileStyles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={tab === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
              placeholderTextColor={COLORS.textTertiary}
            />

            {tab === 'login' && (
              <TouchableOpacity onPress={handleForgotPassword} disabled={forgotLoading} style={{ alignSelf: 'flex-end', marginTop: 10 }}>
                {forgotLoading
                  ? <ActivityIndicator size="small" color={COLORS.accent} />
                  : <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
                }
              </TouchableOpacity>
            )}

            {!!error && <Text style={profileStyles.errorText}>{error}</Text>}
            {!!success && <Text style={profileStyles.successText}>{success}</Text>}

            <TouchableOpacity
              style={[profileStyles.authBtn, loading && { opacity: 0.7 }]}
              onPress={tab === 'login' ? handleLogin : handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={profileStyles.authBtnText}>
                    {tab === 'login' ? 'Ingresar' : 'Crear cuenta'}
                  </Text>
              }
            </TouchableOpacity>

            {picksCount > 0 && (
              <TouchableOpacity onPress={handleClearMyPicks} style={{ marginTop: 24, alignSelf: 'center' }}>
                <Text style={{ color: COLORS.textTertiary, fontSize: 12, textAlign: 'center' }}>
                  Vaciar los {picksCount} Picks guardados en este dispositivo
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── EditProfileScreen ─────────────────────────────────────────────────────────
function EditProfileScreen({ userProfile, avatarUrl, onAvatarChange, onClose }) {
  const [myProfileRow, setMyProfileRow] = useState(null);
  const [nameValue, setNameValue] = useState('');
  const [usernameValue, setUsernameValue] = useState('');
  const [bioValue, setBioValue] = useState('');
  const [loadingRow, setLoadingRow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => { setAvatarError(false); }, [avatarUrl]);

  useEffect(() => {
    if (!userProfile) return;
    setNameValue(userProfile.user_metadata?.name || '');
    supabase.from('profiles').select('*').eq('id', userProfile.id).maybeSingle()
      .then(({ data }) => {
        setMyProfileRow(data || null);
        setUsernameValue(data?.username || '');
        setBioValue(data?.bio || '');
      })
      .catch(() => {})
      .finally(() => setLoadingRow(false));
  }, [userProfile?.id]);

  const pickAndUploadAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería para cambiar la foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled) return;

      setUploadingAvatar(true);
      const uri = result.assets[0].uri;
      const fileName = `${userProfile.id}.jpg`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, { upsert: true, contentType: 'image/jpeg' });

      if (upErr) { Alert.alert('Error', upErr.message || 'No se pudo subir la foto.'); setUploadingAvatar(false); return; }

      setAvatarError(false);
      onAvatarChange?.();
    } catch (e) {
      Alert.alert('Error', 'No se pudo subir la foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveAll = async () => {
    const cleanUsername = usernameValue.trim().toLowerCase();
    setUsernameError('');
    if (cleanUsername && !/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setUsernameError('3-20 caracteres: minúsculas, números y guión bajo');
      return;
    }
    setSaving(true);
    try {
      if (cleanUsername && cleanUsername !== myProfileRow?.username) {
        const { data: existing, error: checkErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', cleanUsername)
          .neq('id', userProfile.id)
          .maybeSingle();
        if (checkErr) { setUsernameError('No se pudo verificar disponibilidad. Probá de nuevo.'); setSaving(false); return; }
        if (existing) { setUsernameError('Ese nombre de usuario ya está en uso'); setSaving(false); return; }
      }
      const cleanName = nameValue.trim() || null;
      await supabase.auth.updateUser({ data: { name: cleanName } });
      const { error: profErr } = await supabase
        .from('profiles')
        .upsert({ id: userProfile.id, display_name: cleanName, username: cleanUsername || null, bio: bioValue.trim() || null }, { onConflict: 'id' });
      if (profErr) {
        // La columna "bio" puede no existir todavía en Supabase — reintentamos sin ella.
        const { error: profErr2 } = await supabase
          .from('profiles')
          .upsert({ id: userProfile.id, display_name: cleanName, username: cleanUsername || null }, { onConflict: 'id' });
        if (profErr2) { Alert.alert('Error', profErr2.message || 'No se pudo guardar el perfil.'); setSaving(false); return; }
      }
      onClose?.();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={profileStyles.container} edges={['top']}>
      <View style={profileStyles.viewingHeader}>
        <TouchableOpacity onPress={onClose} style={{ padding: 6, marginRight: 4 }} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={profileStyles.viewingTitle}>Editar perfil</Text>
        <View style={{ width: 30 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {loadingRow ? (
            <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 30 }} />
          ) : (
            <>
              <View style={{ alignItems: 'center', marginBottom: 28 }}>
                <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} activeOpacity={0.85}>
                  <View style={profileStyles.avatarCircle}>
                    {avatarUrl && !avatarError
                      ? <Image
                          source={{ uri: avatarUrl }}
                          style={{ width: 72, height: 72, borderRadius: 36 }}
                          onError={() => setAvatarError(true)}
                        />
                      : <Ionicons name="person" size={36} color="#fff" />
                    }
                    {uploadingAvatar
                      ? <View style={profileStyles.avatarOverlay}><ActivityIndicator color="#fff" /></View>
                      : <View style={profileStyles.avatarEditBadge}>
                          <Ionicons name="camera" size={12} color="#fff" />
                        </View>
                    }
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} style={{ marginTop: 8 }}>
                  <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>Cambiar foto</Text>
                </TouchableOpacity>
              </View>

              <Text style={profileStyles.sectionEyebrow}>NOMBRE</Text>
              <TextInput
                style={[profileStyles.input, { marginBottom: 16 }]}
                value={nameValue}
                onChangeText={setNameValue}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Tu nombre"
                placeholderTextColor={COLORS.textTertiary}
              />

              <Text style={profileStyles.sectionEyebrow}>USUARIO</Text>
              <View style={[profileStyles.searchInputRow, { marginBottom: 4 }]}>
                <Text style={profileStyles.searchAtSign}>@</Text>
                <TextInput
                  style={profileStyles.searchInputField}
                  value={usernameValue}
                  onChangeText={(t) => setUsernameValue(t.replace(/^@+/, ''))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="usuario"
                  placeholderTextColor={COLORS.textTertiary}
                />
              </View>
              {!!usernameError && <Text style={profileStyles.errorText}>{usernameError}</Text>}

              <Text style={[profileStyles.sectionEyebrow, { marginTop: 16 }]}>BIO</Text>
              <TextInput
                style={[profileStyles.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 13 }]}
                value={bioValue}
                onChangeText={(t) => setBioValue(t.slice(0, 140))}
                multiline
                placeholder="Contá algo sobre vos (opcional)"
                placeholderTextColor={COLORS.textTertiary}
              />

              <TouchableOpacity
                style={[profileStyles.authBtn, { marginTop: 28 }, saving && { opacity: 0.7 }]}
                onPress={saveAll}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={profileStyles.authBtnText}>Guardar cambios</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── SettingsScreen ("Configuración") ─────────────────────────────────────────
function SettingsScreen({
  userProfile, userInterests, onInterestsChange, country, onChangeCountry,
  picksCount = 0, onClearMyPicks, onCheckOutOfStock, onRemoveOutOfStock,
  currentBackground, onBackgroundChange, onLogout, onOpenCommunity, onOpenEditProfile, onClose,
  onReplayTour,
}) {
  const [myProfileRow, setMyProfileRow] = useState(null);
  const [savingInterests, setSavingInterests] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [savingNotifPref, setSavingNotifPref] = useState(false);
  const [explorarDefaultView, setExplorarDefaultView] = useState('reel');
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [checkingOutOfStock, setCheckingOutOfStock] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    supabase.from('profiles').select('*').eq('id', userProfile.id).maybeSingle()
      .then(({ data }) => setMyProfileRow(data || null))
      .catch(() => {});
  }, [userProfile?.id]);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const [{ count: followers }, { count: following }] = await Promise.all([
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userProfile.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userProfile.id),
        ]);
        setFollowerCount(followers || 0);
        setFollowingCount(following || 0);
      } catch (e) {}
    })();
  }, [userProfile?.id]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('notifications-enabled-v1');
        if (stored !== null) setNotifEnabled(stored !== 'false');
        const storedView = await AsyncStorage.getItem('explorar-default-view-v1');
        if (storedView === 'lista' || storedView === 'reel') setExplorarDefaultView(storedView);
      } catch (e) {}
    })();
  }, []);

  const toggleNotifications = async (value) => {
    setNotifEnabled(value);
    setSavingNotifPref(true);
    try {
      await AsyncStorage.setItem('notifications-enabled-v1', value ? 'true' : 'false');
      const device_id = await getOrCreateDeviceId();
      await fetch(`${BACKEND_URL}/api/notifications/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, enabled: value }),
      });
    } catch (e) {
    } finally {
      setSavingNotifPref(false);
    }
  };

  const changeExplorarDefault = async (view) => {
    setExplorarDefaultView(view);
    try { await AsyncStorage.setItem('explorar-default-view-v1', view); } catch (e) {}
  };

  const toggleInterest = async (id) => {
    const next = userInterests.includes(id)
      ? userInterests.filter(i => i !== id)
      : [...userInterests, id];
    setSavingInterests(true);
    await onInterestsChange(next);
    setSavingInterests(false);
  };

  const savePassword = async () => {
    setPasswordError(''); setPasswordSuccess('');
    if (newPassword.length < 6) { setPasswordError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Las contraseñas no coinciden'); return; }
    setSavingPassword(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) { setPasswordError(err.message); return; }
      setPasswordSuccess('Contraseña actualizada ✓');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setChangingPassword(false); setPasswordSuccess(''); }, 1400);
    } catch (e) {
      setPasswordError('No se pudo actualizar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  const cancelPasswordChange = () => {
    setChangingPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
  };

  const handleClearMyPicks = () => {
    Alert.alert(
      'Vaciar mis Picks',
      `Se van a borrar los ${picksCount} Picks guardados en este dispositivo para esta cuenta. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Vaciar', style: 'destructive', onPress: () => { onClearMyPicks?.(); } },
      ]
    );
  };

  const handleCleanOutOfStock = async () => {
    setCheckingOutOfStock(true);
    try {
      const outOfStock = await onCheckOutOfStock?.();
      if (!outOfStock || outOfStock.length === 0) {
        Alert.alert('Todo al día', 'No tenés Picks agotados en este momento.');
        return;
      }
      Alert.alert(
        'Limpiar Picks agotados',
        `Se van a borrar ${outOfStock.length} Pick${outOfStock.length !== 1 ? 's' : ''} que ya no tienen stock. Esta acción no se puede deshacer.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Borrar', style: 'destructive', onPress: () => onRemoveOutOfStock?.(outOfStock.map(p => p.id)) },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'No se pudo revisar el estado de tus Picks. Probá de nuevo.');
    } finally {
      setCheckingOutOfStock(false);
    }
  };

  return (
    <SafeAreaView style={profileStyles.container} edges={['top']}>
      <View style={profileStyles.viewingHeader}>
        <Text style={profileStyles.viewingTitle}>Configuración</Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 6 }} hitSlop={10}>
          <Ionicons name="close" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Región */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>REGIÓN</Text>
          <TouchableOpacity
            style={profileStyles.notifRow}
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert(
                'Seleccioná tu país',
                '',
                [
                  ...Object.entries(COUNTRY_INFO).map(([code, info]) => ({
                    text: `${info.flag}  ${info.name}`,
                    onPress: () => onChangeCountry(code),
                  })),
                  { text: 'Cancelar', style: 'cancel' },
                ]
              );
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={profileStyles.notifRowLabel}>País para buscar tiendas</Text>
              <Text style={profileStyles.notifRowSub}>Usalo si viajás o querés comparar precios afuera</Text>
            </View>
            <Text style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' }}>
              {COUNTRY_INFO[country]?.name || country} <Ionicons name="chevron-down" size={12} />
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mis intereses */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>MIS INTERESES</Text>
          <Text style={profileStyles.sectionSub}>Para personalizar tu feed y las tiendas destacadas.</Text>
          <View style={profileStyles.interestsGrid}>
            {INTEREST_CATEGORIES.map(cat => {
              const active = userInterests.includes(cat.id);
              return (
                <InterestTile
                  key={cat.id}
                  cat={cat}
                  active={active}
                  disabled={savingInterests}
                  onPress={() => toggleInterest(cat.id)}
                />
              );
            })}
          </View>
          {savingInterests && <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 12 }} />}
        </View>

        {/* Notificaciones */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>NOTIFICACIONES</Text>
          <View style={profileStyles.notifRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={profileStyles.notifRowLabel}>Avisos de rebajas y stock</Text>
              <Text style={profileStyles.notifRowSub}>Precios, stock y actividad de tu comunidad</Text>
            </View>
            {savingNotifPref
              ? <ActivityIndicator size="small" color={COLORS.accent} />
              : <Switch
                  value={notifEnabled}
                  onValueChange={toggleNotifications}
                  trackColor={{ false: COLORS.border, true: COLORS.accent }}
                  thumbColor="#fff"
                />
            }
          </View>
        </View>

        {/* Explorar */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>EXPLORAR</Text>
          <View style={profileStyles.notifRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={profileStyles.notifRowLabel}>Vista por defecto</Text>
              <Text style={profileStyles.notifRowSub}>Cómo abrir Explorar la próxima vez</Text>
            </View>
            <View style={profileStyles.segmentedRow}>
              <TouchableOpacity
                style={[profileStyles.segmentedBtn, explorarDefaultView === 'lista' && profileStyles.segmentedBtnActive]}
                onPress={() => changeExplorarDefault('lista')}
              >
                <Text style={[profileStyles.segmentedText, explorarDefaultView === 'lista' && profileStyles.segmentedTextActive]}>Lista</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[profileStyles.segmentedBtn, explorarDefaultView === 'reel' && profileStyles.segmentedBtnActive]}
                onPress={() => changeExplorarDefault('reel')}
              >
                <Text style={[profileStyles.segmentedText, explorarDefaultView === 'reel' && profileStyles.segmentedTextActive]}>Reel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Comunidad */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>COMUNIDAD</Text>
          <TouchableOpacity style={profileStyles.notifRow} onPress={onOpenCommunity} activeOpacity={0.7}>
            <Text style={profileStyles.notifRowLabel}>
              <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{followerCount}</Text> seguidor{followerCount === 1 ? '' : 'es'} · <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{followingCount}</Text> siguiendo
            </Text>
            <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '700' }}>Ver</Text>
          </TouchableOpacity>
        </View>

        {/* Cuenta */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>CUENTA</Text>

          <TouchableOpacity style={profileStyles.notifRow} onPress={onOpenEditProfile} activeOpacity={0.7}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={profileStyles.notifRowLabel}>Nombre de usuario</Text>
              <Text style={profileStyles.notifRowSub}>
                {myProfileRow?.username ? `@${myProfileRow.username}` : 'Elegí uno para que otros te puedan seguir'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
          </TouchableOpacity>

          <View style={{ height: 10 }} />

          {!changingPassword ? (
            <TouchableOpacity style={profileStyles.notifRow} onPress={() => setChangingPassword(true)} activeOpacity={0.7}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={profileStyles.notifRowLabel}>Cambiar contraseña</Text>
                <Text style={profileStyles.notifRowSub}>Actualizá la contraseña de tu cuenta</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={profileStyles.inputLabel}>Nueva contraseña</Text>
              <TextInput
                style={profileStyles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={COLORS.textTertiary}
              />
              <Text style={profileStyles.inputLabel}>Confirmar contraseña</Text>
              <TextInput
                style={profileStyles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Repetí la contraseña"
                placeholderTextColor={COLORS.textTertiary}
              />
              {!!passwordError && <Text style={profileStyles.errorText}>{passwordError}</Text>}
              {!!passwordSuccess && <Text style={profileStyles.successText}>{passwordSuccess}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[profileStyles.authBtn, { flex: 1, marginTop: 0 }, savingPassword && { opacity: 0.7 }]}
                  onPress={savePassword}
                  disabled={savingPassword}
                >
                  {savingPassword
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={profileStyles.authBtnText}>Guardar</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[profileStyles.authBtn, { flex: 1, marginTop: 0, backgroundColor: COLORS.card }]}
                  onPress={cancelPasswordChange}
                  disabled={savingPassword}
                >
                  <Text style={[profileStyles.authBtnText, { color: COLORS.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 10 }} />

          <TouchableOpacity style={profileStyles.notifRow} onPress={handleCleanOutOfStock} activeOpacity={0.7} disabled={checkingOutOfStock}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={profileStyles.notifRowLabel}>Limpiar Picks agotados</Text>
              <Text style={profileStyles.notifRowSub}>Borra los Picks que ya no tienen stock</Text>
            </View>
            {checkingOutOfStock
              ? <ActivityIndicator size="small" color={COLORS.accent} />
              : <Ionicons name="sparkles-outline" size={18} color={COLORS.textTertiary} />
            }
          </TouchableOpacity>

          <View style={{ height: 10 }} />

          <TouchableOpacity style={profileStyles.notifRow} onPress={handleClearMyPicks} activeOpacity={0.7}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[profileStyles.notifRowLabel, { color: COLORS.danger || '#e0524a' }]}>Vaciar mis Picks</Text>
              <Text style={profileStyles.notifRowSub}>Borra los {picksCount} Picks guardados en este dispositivo para esta cuenta</Text>
            </View>
            <Ionicons name="trash-outline" size={18} color={COLORS.danger || '#e0524a'} />
          </TouchableOpacity>
        </View>

        {/* Ayuda */}
        {!!onReplayTour && (
          <View style={profileStyles.section}>
            <View style={profileStyles.sectionDivider} />
            <Text style={profileStyles.sectionEyebrow}>AYUDA</Text>
            <TouchableOpacity style={profileStyles.notifRow} onPress={() => { onClose?.(); onReplayTour(); }} activeOpacity={0.7}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={profileStyles.notifRowLabel}>Ver tutorial de nuevo</Text>
                <Text style={profileStyles.notifRowSub}>Repetí la guía de las funciones principales de la app</Text>
              </View>
              <Ionicons name="school-outline" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Fondo */}
        <View style={profileStyles.section}>
          <View style={profileStyles.sectionDivider} />
          <Text style={profileStyles.sectionEyebrow}>PERSONALIZAR</Text>
          <Text style={profileStyles.sectionTitle}>Fondo</Text>
          <Text style={profileStyles.sectionSub}>
            Un toque de color suave y translúcido detrás de la app. Es opcional.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            <TouchableOpacity
              style={profileStyles.bgSwatchWrap}
              onPress={() => onBackgroundChange?.(null)}
              activeOpacity={0.8}
            >
              <View style={[
                profileStyles.bgSwatchNone,
                !currentBackground && profileStyles.bgSwatchSelected,
              ]}>
                <Ionicons name="close" size={18} color={COLORS.textTertiary} />
              </View>
              <Text style={profileStyles.bgSwatchLabel}>Ninguno</Text>
            </TouchableOpacity>
            {BACKGROUNDS.map(bg => (
              <TouchableOpacity
                key={bg.id}
                style={profileStyles.bgSwatchWrap}
                onPress={() => onBackgroundChange?.(bg.id)}
                activeOpacity={0.8}
              >
                <Image
                  source={bg.source}
                  style={[
                    profileStyles.bgSwatch,
                    currentBackground === bg.id && profileStyles.bgSwatchSelected,
                  ]}
                />
                <Text style={profileStyles.bgSwatchLabel}>{bg.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={[profileStyles.section, { marginTop: 8, alignItems: 'center' }]}>
          <TouchableOpacity style={profileStyles.logoutBtn} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.textSecondary} />
            <Text style={profileStyles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── CommunityScreen ("Comunidad": seguidores / siguiendo) ────────────────────
function CommunityScreen({ userProfile, onOpenUrl, onClose }) {
  const [subTab, setSubTab] = useState('seguidores'); // 'seguidores' | 'siguiendo'
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleResults, setPeopleResults] = useState([]);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [peopleSearchError, setPeopleSearchError] = useState('');
  const [myFollowing, setMyFollowing] = useState({});
  const [followActionLoading, setFollowActionLoading] = useState({});
  const [viewingPerson, setViewingPerson] = useState(null);
  const [viewingPicks, setViewingPicks] = useState([]);
  const [loadingViewingPicks, setLoadingViewingPicks] = useState(false);
  const [viewingPicksError, setViewingPicksError] = useState('');

  const loadLists = async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      const [{ data: followerRows }, { data: followingRows }] = await Promise.all([
        supabase.from('follows').select('follower_id').eq('following_id', userProfile.id),
        supabase.from('follows').select('following_id').eq('follower_id', userProfile.id),
      ]);
      const followerIds = (followerRows || []).map(r => r.follower_id);
      const followingIds = (followingRows || []).map(r => r.following_id);
      const allIds = [...new Set([...followerIds, ...followingIds])];
      let profilesById = {};
      if (allIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, username, display_name').in('id', allIds);
        (profiles || []).forEach(p => { profilesById[p.id] = p; });
      }
      setFollowers(followerIds.map(id => profilesById[id]).filter(Boolean));
      setFollowing(followingIds.map(id => profilesById[id]).filter(Boolean));
      const map = {};
      followingIds.forEach(id => { map[id] = true; });
      setMyFollowing(map);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLists(); }, [userProfile?.id]);

  useEffect(() => {
    const q = peopleQuery.trim().toLowerCase().replace(/^@/, '');
    if (q.length < 2) { setPeopleResults([]); return; }
    setSearchingPeople(true);
    const t = setTimeout(async () => {
      setPeopleSearchError('');
      try {
        const { data, error: searchErr } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .neq('id', userProfile.id)
          .not('username', 'is', null)
          .ilike('username', `%${q}%`)
          .limit(15);
        if (searchErr) {
          setPeopleResults([]);
          setPeopleSearchError(searchErr.message || 'No se pudo buscar. Probá de nuevo.');
          return;
        }
        setPeopleResults(data || []);
      } catch (e) {
        setPeopleResults([]);
        setPeopleSearchError('No se pudo buscar. Probá de nuevo.');
      } finally {
        setSearchingPeople(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [peopleQuery]);

  const toggleFollow = async (targetId) => {
    const isFollowing = !!myFollowing[targetId];
    setFollowActionLoading(prev => ({ ...prev, [targetId]: true }));
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', userProfile.id).eq('following_id', targetId);
        setMyFollowing(prev => ({ ...prev, [targetId]: false }));
      } else {
        const { error: err } = await supabase.from('follows').insert({ follower_id: userProfile.id, following_id: targetId });
        if (err) throw err;
        setMyFollowing(prev => ({ ...prev, [targetId]: true }));
        // Avisamos al backend para que le llegue como notificación in-app a
        // la persona seguida (el backend no ve la tabla `follows` de Supabase).
        fetch(`${BACKEND_URL}/api/notifications/social`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'new_follower', target_user_id: targetId, actor_user_id: userProfile.id }),
        }).catch(() => {});
      }
      loadLists();
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar. Probá de nuevo.');
    } finally {
      setFollowActionLoading(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const openPersonPicks = async (person) => {
    setViewingPerson(person);
    setViewingPicks([]);
    setViewingPicksError('');
    setLoadingViewingPicks(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/picks/public/${person.id}`);
      const data = await res.json();
      setViewingPicks(data.picks || []);
    } catch (e) {
      setViewingPicksError('No se pudieron cargar sus Picks. Probá de nuevo.');
    } finally {
      setLoadingViewingPicks(false);
    }
  };

  const list = subTab === 'seguidores' ? followers : following;

  return (
    <SafeAreaView style={profileStyles.container} edges={['top']}>
      <View style={profileStyles.viewingHeader}>
        <TouchableOpacity onPress={onClose} style={{ padding: 6, marginRight: 4 }} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={[profileStyles.viewingTitle, { flex: 1 }]}>Comunidad</Text>
        <TouchableOpacity onPress={() => setSearchOpen(v => !v)} style={{ padding: 6 }} hitSlop={10}>
          <Ionicons name={searchOpen ? 'close' : 'search-outline'} size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {searchOpen && (
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <View style={profileStyles.searchInputRow}>
            <Text style={profileStyles.searchAtSign}>@</Text>
            <TextInput
              style={profileStyles.searchInputField}
              value={peopleQuery}
              onChangeText={(t) => setPeopleQuery(t.replace(/^@+/, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Buscar usuario para seguir"
              placeholderTextColor={COLORS.textTertiary}
              returnKeyType="search"
              autoFocus
            />
          </View>
          {searchingPeople && <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 12 }} />}
          {peopleResults.map(person => {
            const isFollowing = !!myFollowing[person.id];
            const busy = !!followActionLoading[person.id];
            return (
              <View key={person.id} style={profileStyles.personRow}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => openPersonPicks(person)} activeOpacity={0.7}>
                  <Text style={profileStyles.personName}>{personDisplayLabel(person)}</Text>
                  <Text style={profileStyles.personUsername}>@{person.username}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[profileStyles.followBtn, isFollowing && profileStyles.followBtnActive]}
                  onPress={() => toggleFollow(person.id)}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator size="small" color={isFollowing ? COLORS.textSecondary : '#fff'} />
                    : <Text style={[profileStyles.followBtnText, isFollowing && profileStyles.followBtnTextActive]}>
                        {isFollowing ? 'Siguiendo' : 'Seguir'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            );
          })}
          {!!peopleSearchError && <Text style={profileStyles.errorText}>{peopleSearchError}</Text>}
          {!searchingPeople && !peopleSearchError && peopleQuery.trim().length >= 2 && peopleResults.length === 0 && (
            <Text style={[profileStyles.sectionSub, { marginTop: 10 }]}>No encontramos usuarios con ese nombre.</Text>
          )}
        </View>
      )}

      <View style={profileStyles.segmentedRow2}>
        <TouchableOpacity
          style={[profileStyles.segmentedBtn2, subTab === 'seguidores' && profileStyles.segmentedBtn2Active]}
          onPress={() => setSubTab('seguidores')}
        >
          <Text style={[profileStyles.segmentedText2, subTab === 'seguidores' && profileStyles.segmentedText2Active]}>
            Seguidores ({followers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[profileStyles.segmentedBtn2, subTab === 'siguiendo' && profileStyles.segmentedBtn2Active]}
          onPress={() => setSubTab('siguiendo')}
        >
          <Text style={[profileStyles.segmentedText2, subTab === 'siguiendo' && profileStyles.segmentedText2Active]}>
            Siguiendo ({following.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 30 }} />
      ) : list.length === 0 ? (
        <Text style={[profileStyles.sectionSub, { textAlign: 'center', marginTop: 30, paddingHorizontal: 24 }]}>
          {subTab === 'seguidores' ? 'Todavía no tenés seguidores.' : 'Todavía no seguís a nadie. Tocá la lupa de arriba para buscar gente.'}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}>
          {list.map(person => (
            <TouchableOpacity key={person.id} style={profileStyles.personRow} onPress={() => openPersonPicks(person)} activeOpacity={0.75}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={profileStyles.personAvatarCircle}>
                  <Text style={profileStyles.personAvatarInitial}>{(personDisplayLabel(person) || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={profileStyles.personName}>{personDisplayLabel(person)}</Text>
                  <Text style={profileStyles.personUsername}>@{person.username}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={!!viewingPerson}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewingPerson(null)}
      >
        <SafeAreaView style={profileStyles.container} edges={['top']}>
          <View style={profileStyles.viewingHeader}>
            <View style={{ flex: 1 }}>
              <Text style={profileStyles.viewingTitle}>{personDisplayLabel(viewingPerson)}</Text>
              <Text style={profileStyles.viewingSub}>@{viewingPerson?.username}</Text>
            </View>
            <TouchableOpacity onPress={() => setViewingPerson(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          {loadingViewingPicks ? (
            <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 30 }} />
          ) : !!viewingPicksError ? (
            <Text style={[profileStyles.errorText, { textAlign: 'center', marginTop: 20 }]}>{viewingPicksError}</Text>
          ) : viewingPicks.length === 0 ? (
            <Text style={[profileStyles.sectionSub, { textAlign: 'center', marginTop: 30, paddingHorizontal: 24 }]}>
              Todavía no tiene Picks públicos.
            </Text>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {viewingPicks.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={profileStyles.viewingPickRow}
                  onPress={() => onOpenUrl ? onOpenUrl(p.url, personDisplayLabel(viewingPerson)) : Linking.openURL(p.url).catch(() => {})}
                  activeOpacity={0.75}
                >
                  {p.img
                    ? <Image source={{ uri: p.img }} style={profileStyles.viewingPickImg} />
                    : <View style={[profileStyles.viewingPickImg, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="image-outline" size={20} color={COLORS.textTertiary} />
                      </View>
                  }
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={profileStyles.viewingPickName} numberOfLines={2}>{p.name}</Text>
                    {!!(p.price_current || p.price_saved) && (
                      <Text style={profileStyles.viewingPickPrice}>${p.price_current || p.price_saved}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── NotificationBell ─────────────────────────────────────────────────────────
// Ícono chico para el header de las 3 pestañas principales, con el contador
// de no leídas. El conteo en sí vive en App (se refresca al cambiar de
// pestaña); acá solo se dibuja.
function NotificationBell({ count = 0, onPress, color }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} activeOpacity={0.7} style={{ position: 'relative' }}>
      <Ionicons name="notifications-outline" size={21} color={color || COLORS.textSecondary} />
      {count > 0 && (
        <View style={notifStyles.badge}>
          <Text style={notifStyles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

const NOTIF_GROUPS = [
  { id: 'precio', label: 'Precio', icon: 'pricetag-outline' },
  { id: 'stock', label: 'Stock', icon: 'cube-outline' },
  { id: 'social', label: 'Social', icon: 'people-outline' },
];

function notifIconFor(type) {
  if (type === 'price_drop') return { name: 'trending-down-outline', color: '#22c55e' };
  if (type === 'out_of_stock') return { name: 'close-circle-outline', color: '#ef4444' };
  if (type === 'back_in_stock') return { name: 'checkmark-circle-outline', color: '#22c55e' };
  if (type === 'new_follower') return { name: 'person-add-outline', color: COLORS.accent };
  return { name: 'notifications-outline', color: COLORS.textSecondary };
}

// ── NotificationsScreen ───────────────────────────────────────────────────────
function NotificationsScreen({ userProfile, onOpenUrl, onOpenCommunity, onClose, onRead }) {
  const [group, setGroup] = useState('precio');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const device_id = await getOrCreateDeviceId();
        const params = new URLSearchParams({ device_id });
        if (userProfile?.id) params.set('user_id', userProfile.id);
        const res = await fetch(`${BACKEND_URL}/api/notifications/list?${params.toString()}`);
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
        // Se marcan como leídas al abrir la pantalla (no una por una).
        fetch(`${BACKEND_URL}/api/notifications/mark-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id, user_id: userProfile?.id || null }),
        }).catch(() => {});
        onRead?.();
      } catch (e) {
      } finally {
        setLoading(false);
      }
    })();
  }, [userProfile?.id]);

  const grouped = NOTIF_GROUPS.reduce((acc, g) => {
    acc[g.id] = items.filter(n => n.group === g.id);
    return acc;
  }, {});
  const list = grouped[group] || [];

  const handlePress = (n) => {
    if (n.data?.url) { onOpenUrl?.(n.data.url); return; }
    if (n.type === 'new_follower') { onOpenCommunity?.(); return; }
  };

  return (
    <SafeAreaView style={profileStyles.container} edges={['top']}>
      <View style={profileStyles.viewingHeader}>
        <TouchableOpacity onPress={onClose} style={{ padding: 6, marginRight: 4 }} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={[profileStyles.viewingTitle, { flex: 1 }]}>Notificaciones</Text>
      </View>

      <View style={notifStyles.tabsRow}>
        {NOTIF_GROUPS.map(g => {
          const active = group === g.id;
          const count = grouped[g.id]?.length || 0;
          return (
            <TouchableOpacity
              key={g.id}
              style={[notifStyles.tabBtn, active && notifStyles.tabBtnActive]}
              onPress={() => setGroup(g.id)}
              activeOpacity={0.7}
            >
              <Ionicons name={g.icon} size={15} color={active ? '#fff' : COLORS.textSecondary} />
              <Text style={[notifStyles.tabText, active && notifStyles.tabTextActive]}>
                {g.label}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: 30 }} />
      ) : list.length === 0 ? (
        <Text style={[profileStyles.sectionSub, { textAlign: 'center', marginTop: 30, paddingHorizontal: 24 }]}>
          {group === 'precio' ? 'Sin novedades de precio todavía.'
            : group === 'stock' ? 'Sin novedades de stock todavía.'
            : 'Sin actividad social todavía.'}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30 }}>
          {list.map(n => {
            const icon = notifIconFor(n.type);
            return (
              <TouchableOpacity key={n.id} style={notifStyles.row} onPress={() => handlePress(n)} activeOpacity={0.75}>
                <View style={[notifStyles.iconWrap, { backgroundColor: icon.color + '1A' }]}>
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={notifStyles.title} numberOfLines={2}>{n.title}</Text>
                  <Text style={notifStyles.body} numberOfLines={2}>{n.body}</Text>
                  <Text style={notifStyles.time}>{timeAgo(n.created_at)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const notifStyles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -6, backgroundColor: COLORS.accent,
    borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 3,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
  },
  tabBtnActive: { backgroundColor: COLORS.textPrimary },
  tabText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 12, marginBottom: 10,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  body: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  time: { fontSize: 11, color: COLORS.textTertiary, marginTop: 4 },
});

const profileStyles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.background },
  header:        { alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 20 },
  avatarCircle:  { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', borderRadius: 36 },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.accent, borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  nameRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  nameText:      { fontSize: 18, color: COLORS.textPrimary, fontWeight: '700' },
  nameTextPlaceholder: { fontSize: 15, color: COLORS.textTertiary, fontWeight: '500', fontStyle: 'italic' },
  nameEditRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
  nameEditInput: {
    fontSize: 15, color: COLORS.textPrimary, fontWeight: '600',
    backgroundColor: COLORS.card, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    minWidth: 140, textAlign: 'center',
  },
  nameEditBtn:   { padding: 6 },
  emailText:     { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500', marginBottom: 16 },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: COLORS.card, borderRadius: 20 },
  logoutText:    { fontSize: 13, color: COLORS.textSecondary },
  section:       { paddingHorizontal: 20, paddingTop: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionDivider: { height: 0.5, backgroundColor: COLORS.border, marginBottom: 20 },
  sectionEyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 1, marginBottom: 4 },
  sectionTitle:  { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6 },
  sectionSub:    { fontSize: 13, color: COLORS.textSecondary, marginBottom: 18, lineHeight: 18 },
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  interestTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  interestTileActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  interestLabel:       { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', textAlign: 'center' },
  interestLabelActive: { color: '#fff', fontWeight: '600' },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  notifRowLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  notifRowSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  personRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  personName:     { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  personUsername: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  followBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.accent, minWidth: 90, alignItems: 'center',
  },
  followBtnActive:   { backgroundColor: COLORS.card },
  followBtnText:     { fontSize: 13, fontWeight: '700', color: '#fff' },
  followBtnTextActive: { color: COLORS.textSecondary },
  searchInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16,
  },
  searchAtSign: { fontSize: 15, color: COLORS.textTertiary, fontWeight: '600' },
  searchInputField: { flex: 1, paddingVertical: 13, paddingLeft: 2, fontSize: 15, color: COLORS.textPrimary },
  viewingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  viewingTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  viewingSub:   { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  viewingPickRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 10, marginBottom: 10,
  },
  viewingPickImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: COLORS.card },
  viewingPickName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  viewingPickPrice: { fontSize: 13, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  bgSwatchWrap: { alignItems: 'center', marginRight: 14, width: 64 },
  bgSwatch: {
    width: 56, height: 56, borderRadius: 16,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  bgSwatchNone: {
    width: 56, height: 56, borderRadius: 16,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.card,
    justifyContent: 'center', alignItems: 'center',
  },
  bgSwatchSelected: { borderColor: COLORS.accent, borderWidth: 3 },
  bgSwatchLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6, textAlign: 'center' },
  // Segmentado chico (ej. "Lista"/"Reel" en Configuración)
  segmentedRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 10, padding: 3 },
  segmentedBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  segmentedBtnActive: { backgroundColor: COLORS.textPrimary },
  segmentedText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  segmentedTextActive: { color: '#fff' },
  // Segmentado ancho (tabs Seguidores/Siguiendo en Comunidad)
  segmentedRow2: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 4 },
  segmentedBtn2: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentedBtn2Active: { backgroundColor: COLORS.textPrimary },
  segmentedText2: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  segmentedText2Active: { color: '#fff' },
  personAvatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  personAvatarInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Auth styles
  authContent:   { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, justifyContent: 'center' },
  authHeader:    { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  authLogo:      { width: 68, height: 68, borderRadius: 20, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  authTitle:     { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  authSub:       { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  tabToggle:     { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 4, marginBottom: 24 },
  toggleBtn:     { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  toggleBtnActive:   { backgroundColor: COLORS.background, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  toggleText:        { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  toggleTextActive:  { color: COLORS.textPrimary, fontWeight: '700' },
  form:          { gap: 4 },
  inputLabel:    { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6, marginTop: 12 },
  input:         { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: COLORS.textPrimary },
  errorText:     { color: '#ef4444', fontSize: 13, marginTop: 8 },
  successText:   { color: '#22c55e', fontSize: 13, marginTop: 8 },
  authBtn:       { backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  authBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
});


// Alturas variables para el efecto masonry (estilo Pinterest)
const MASONRY_HEIGHTS = [165, 195, 180, 150, 190, 170, 155, 205];

function StoreGridCard({ store, onPress, onLongPress, index = 0, bgImage, height = 200 }) {
  const [logoIdx, setLogoIdx] = useState(0);
  const [bgFailed, setBgFailed] = useState(false);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgFadeAnim = useRef(new Animated.Value(0)).current;

  const handleBgLoad = () => {
    Animated.timing(bgFadeAnim, {
      toValue: 1,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  const bgOpacity = bgFadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

  const logoUrls = [
    ...(store.logo ? [store.logo] : []),
    `https://logo.clearbit.com/${store.domain}?size=256&format=png`,
    `https://${store.domain}/apple-touch-icon.png`,
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${store.domain}&size=256`,
  ];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 380,
      delay: index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, speed: 60, bounciness: 0, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, speed: 20, bounciness: 5, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }, { scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.masonryCard, { height, backgroundColor: store.bg }]}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {bgImage && !bgFailed ? (
          <>
            <Animated.Image
              source={{ uri: bgImage }}
              style={[styles.masonryBgImage, { opacity: bgOpacity }]}
              resizeMode="cover"
              onLoad={handleBgLoad}
              onError={() => setBgFailed(true)}
            />
            <View style={[styles.masonryBgScrim, { backgroundColor: store.bg + 'B3' }]} />
          </>
        ) : (
          <Text style={[styles.masonryWatermark, { color: store.fg }]} numberOfLines={1}>
            {store.short}
          </Text>
        )}

        <View style={styles.masonryLogoBadge}>
          {logoIdx < logoUrls.length ? (
            <Image
              source={{ uri: logoUrls[logoIdx] }}
              style={styles.masonryLogoImg}
              resizeMode="contain"
              onError={() => setLogoIdx(prev => prev + 1)}
            />
          ) : (
            <Text style={[styles.masonryLogoInitials, { color: store.fg }]}>{store.short}</Text>
          )}
        </View>

        <View style={styles.masonryCaptionScrim} />
        <View style={styles.masonryCaption}>
          <Text style={styles.masonryCaptionName} numberOfLines={1}>{store.name}</Text>
          <Text style={styles.masonryCaptionDomain} numberOfLines={1}>{store.domain}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Grilla de dos columnas con alturas escalonadas, tipo Pinterest
function MasonryStoreGrid({ stores, storeImages, onPress, onLongPress }) {
  const left = [];
  const right = [];
  stores.forEach((store, idx) => {
    (idx % 2 === 0 ? left : right).push({ store, idx });
  });

  return (
    <View style={styles.masonryRow}>
      <View style={styles.masonryCol}>
        {left.map(({ store, idx }) => (
          <StoreGridCard
            key={store.domain}
            store={store}
            index={idx}
            height={MASONRY_HEIGHTS[idx % MASONRY_HEIGHTS.length]}
            bgImage={storeImages[store.domain]}
            onPress={() => onPress(store)}
            onLongPress={onLongPress ? () => onLongPress(store) : undefined}
          />
        ))}
      </View>
      <View style={styles.masonryCol}>
        {right.map(({ store, idx }) => (
          <StoreGridCard
            key={store.domain}
            store={store}
            index={idx}
            height={MASONRY_HEIGHTS[(idx + 3) % MASONRY_HEIGHTS.length]}
            bgImage={storeImages[store.domain]}
            onPress={() => onPress(store)}
            onLongPress={onLongPress ? () => onLongPress(store) : undefined}
          />
        ))}
      </View>
    </View>
  );
}


// Muestra las categorías de interés del usuario como chips (misma apariencia
// que "Mis intereses" en Perfil). Al tocar una, las tiendas destacadas de esa
// categoría cambian cuál es la lista mostrada en la pestaña "Destacadas".
function InterestCategoryChips({ categories, selected, onSelect }) {
  if (!categories || categories.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.interestStoresSection}
      contentContainerStyle={{ paddingRight: 8 }}
    >
      {categories.map((catId) => {
        const catDef = INTEREST_CATEGORIES.find((c) => c.id === catId);
        const active = catId === selected;
        return (
          <TouchableOpacity
            key={catId}
            style={[styles.interestCatChip, active && styles.interestCatChipActive]}
            activeOpacity={0.85}
            onPress={() => onSelect(active ? null : catId)}
          >
            {!!catDef?.icon && (
              <Ionicons name={catDef.icon} size={14} color={active ? '#fff' : COLORS.textSecondary} />
            )}
            <Text style={[styles.interestCatChipLabel, active && styles.interestCatChipLabelActive]}>
              {catDef?.label || catId}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function HomeView({ onOpenUrl, customStores, onRemoveCustom, onAddCustomStoreByDomain, country = 'UY', countryStores = STORES, onChangeCountry, storesOrderSwapped = false, onToggleStoresOrder, userInterests = [], onOpenSearchWithQuery, unreadNotifCount = 0, onOpenNotifications }) {
  const [input, setInput] = useState('');
  const [searchMode, setSearchMode] = useState('mis'); // 'mis' | 'web'
  const [featuredCollapsed, setFeaturedCollapsed] = useState(false);
  const [storeImages, setStoreImages] = useState({}); // domain -> og:image url de la web de la tienda
  const [interestStoresByCat, setInterestStoresByCat] = useState({}); // categoria -> tiendas del backend
  const [selectedInterestCat, setSelectedInterestCat] = useState(null); // categoria elegida en los chips, o null = todas
  const [interestStoresLoading, setInterestStoresLoading] = useState(false);

  // Trae, para cada categoría de interés del usuario, las tiendas de la base
  // compartida del backend. Al abrir el Home arranca mostrando la primera
  // categoría de interés (ya no existe una "destacadas" genérica); al elegir
  // otra categoría en los chips, la lista de tiendas cambia a esa.
  useEffect(() => {
    if (!userInterests || userInterests.length === 0) {
      setInterestStoresByCat({});
      setSelectedInterestCat(null);
      setInterestStoresLoading(false);
      return;
    }
    let cancelled = false;
    setInterestStoresLoading(true);
    Promise.all(
      userInterests.map((cat) =>
        fetch(`${BACKEND_URL}/api/stores?country=${country || 'UY'}&category=${cat}&limit=10`)
          .then((r) => r.json())
          .then((list) => [cat, Array.isArray(list) ? list : []])
          .catch(() => [cat, []])
      )
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach(([cat, list]) => { if (list.length) map[cat] = list; });
      setInterestStoresByCat(map);
      // Si la categoría elegida ya no está disponible, cae a la primera de la
      // lista (orden = mismo orden que "Mis intereses" en Perfil).
      setSelectedInterestCat((prev) => (prev && map[prev]) ? prev : (Object.keys(map)[0] || null));
      setInterestStoresLoading(false);
    });
    return () => { cancelled = true; };
  }, [JSON.stringify(userInterests), country]);

  const destacadasStores = selectedInterestCat
    ? (interestStoresByCat[selectedInterestCat] || [])
    : countryStores;

  const titleScale   = useRef(new Animated.Value(2.2)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleSkew    = useRef(new Animated.Value(0)).current;

  // Traer la imagen de portada (og:image) de cada tienda visible, en batch
  useEffect(() => {
    const domains = [...new Set([
      ...(countryStores || []).map(s => s.domain),
      ...(customStores || []).map(s => s.domain),
      ...Object.values(interestStoresByCat).flat().map(s => s.domain),
    ])].filter(d => d && !(d in storeImages));
    if (domains.length === 0) return;
    fetch(`${BACKEND_URL}/api/store-images?domains=${domains.join(',')}`)
      .then(r => r.json())
      .then(data => setStoreImages(prev => ({ ...prev, ...(data.images || {}) })))
      .catch(() => {});
  }, [countryStores, customStores, interestStoresByCat]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(titleScale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Vibration.vibrate(40);
      Animated.spring(titleSkew, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  function confirmRemove(store) {
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('¿Eliminar ' + store.name + ' de tus destacadas?')) onRemoveCustom(store.domain);
      return;
    }
    // En RN usamos Alert
    require('react-native').Alert.alert(
      'Eliminar tienda',
      '¿Eliminar ' + store.name + ' de tus destacadas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onRemoveCustom(store.domain) },
      ]
    );
  }
 
  // Filtro en vivo de "Mis tiendas" por nombre (no navega a ningún lado, solo
  // acota la grilla de abajo — es la forma de "buscar en tus tiendas").
  const filteredCustomStores = (customStores || []).filter(s =>
    !input.trim() || s.name.toLowerCase().includes(input.trim().toLowerCase())
  );

  function switchSearchMode(mode) {
    setSearchMode(mode);
    setInput('');
  }

  // Modo "Toda la web": si es una URL/dominio, abre directo (y si esa tienda
  // todavía no está en Mis tiendas, pregunta si la querés agregar antes).
  // Si es una frase/producto, manda a la pantalla de Buscar (con IA/mic).
  function submitWebSearch() {
    const raw = input.trim();
    if (!raw) return;
    Keyboard.dismiss();
    const isDirectUrl = /^https?:\/\//.test(raw);
    const isDomain = !isDirectUrl && /\.[a-z]{2,}/i.test(raw) && !raw.includes(' ');
    if (isDirectUrl || isDomain) {
      const url = isDirectUrl ? raw : 'https://' + raw;
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
      const reg = getRegisteredDomain(domain);
      const known = countryStores.some(s => s.domain === reg) || (customStores || []).some(s => s.domain === reg);
      track('search_url_entered', { type: isDirectUrl ? 'direct_url' : 'domain' });
      if (!known && reg && reg !== 'web') {
        Alert.alert(
          '¿Agregar esta tienda?',
          `${reg} todavía no está en Mis tiendas.`,
          [
            { text: 'Solo abrir', onPress: () => onOpenUrl(url) },
            {
              text: 'Agregar y abrir',
              onPress: () => { onAddCustomStoreByDomain?.(reg, url); onOpenUrl(url); },
            },
            { text: 'Cancelar', style: 'cancel' },
          ]
        );
      } else {
        onOpenUrl(url);
      }
    } else {
      track('search_performed', { query: raw.toLowerCase(), query_length: raw.length });
      onOpenSearchWithQuery?.(raw);
    }
  }

  function submitSearch() {
    if (searchMode === 'web') submitWebSearch();
    // en modo 'mis' el input ya filtra en vivo — Enter no hace nada más
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.brandHeader}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={homeExtraStyles.screenTitle}>Mis tiendas</Text>
          {!!onOpenNotifications && (
            <TourTarget id="notif-bell">
              <NotificationBell count={unreadNotifCount} onPress={onOpenNotifications} color={COLORS.textPrimary} />
            </TourTarget>
          )}
        </View>
      </View>

      {/* Buscador único: Mis tiendas (filtra la grilla) / Toda la web (abre o manda a Buscar) */}
      <View style={homeExtraStyles.searchRow}>
        <View style={homeExtraStyles.searchInputWrap}>
          <Ionicons name="search-outline" size={17} color={COLORS.textSecondary} />
          <TextInput
            style={homeExtraStyles.searchInputField}
            placeholder={searchMode === 'mis' ? 'Buscar en tus tiendas...' : 'Buscar en la web...'}
            placeholderTextColor={COLORS.textTertiary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submitSearch}
            returnKeyType={searchMode === 'mis' ? 'search' : 'go'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {input.length > 0 && (
            <TouchableOpacity onPress={() => setInput('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TourTarget id="search-mode-chip">
          <TouchableOpacity
            style={homeExtraStyles.modeChip}
            activeOpacity={0.7}
            onPress={() => switchSearchMode(searchMode === 'mis' ? 'web' : 'mis')}
          >
            <Ionicons name={searchMode === 'mis' ? 'lock-closed-outline' : 'globe-outline' } size={13} color={COLORS.textPrimary} />
            <Text style={homeExtraStyles.modeChipText}>{searchMode === 'mis' ? 'Mis tiendas' : 'Toda la web'}</Text>
          </TouchableOpacity>
        </TourTarget>
      </View>

      {searchMode === 'web' && (
        <TouchableOpacity
          style={[homeExtraStyles.webSearchBtn, !input.trim() && { opacity: 0.5 }]}
          onPress={submitWebSearch}
          disabled={!input.trim()}
          activeOpacity={0.8}
        >
          <Text style={homeExtraStyles.webSearchBtnText}>Buscar en la web</Text>
        </TouchableOpacity>
      )}

      <TrendsSection onOpenUrl={onOpenUrl} />

      <Text style={homeExtraStyles.sectionHeading}>
        Mis tiendas{customStores && customStores.length > 0 ? ` (${customStores.length})` : ''}
      </Text>
      {customStores && customStores.length > 0 ? (
        filteredCustomStores.length > 0 ? (
          <View>
            <MasonryStoreGrid
              stores={filteredCustomStores}
              storeImages={storeImages}
              onPress={(store) => { track('store_opened', { store: store.name, type: 'custom' }); onOpenUrl(store.url); }}
              onLongPress={confirmRemove}
            />
            <Text style={[styles.picksHint, { marginTop: 8, marginBottom: 8 }]}>Mantené presionada una tienda para eliminarla</Text>
          </View>
        ) : (
          <View style={styles.emptyStores}>
            <Ionicons name="search-outline" size={30} color={COLORS.textTertiary} />
            <Text style={styles.emptyStoresText}>Ninguna tienda tuya coincide con "{input.trim()}"</Text>
          </View>
        )
      ) : (
        <View style={styles.emptyStores}>
          <Ionicons name="storefront-outline" size={36} color={COLORS.textTertiary} />
          <Text style={styles.emptyStoresText}>Todavía no agregaste tiendas</Text>
          <Text style={[styles.picksHint, { textAlign: 'center', marginTop: 4 }]}>
            Tocá la estrella arriba en cualquier web para agregarla acá
          </Text>
        </View>
      )}

      <Text style={[homeExtraStyles.sectionHeading, { marginTop: 24 }]}>Descubrir tiendas por categoría</Text>
      {interestStoresLoading && Object.keys(interestStoresByCat).length === 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Cargando tus categorías…</Text>
        </View>
      )}
      <InterestCategoryChips
        categories={Object.keys(interestStoresByCat)}
        selected={selectedInterestCat}
        onSelect={setSelectedInterestCat}
      />
      {destacadasStores.length > 0 ? (
        <MasonryStoreGrid
          stores={destacadasStores}
          storeImages={storeImages}
          onPress={(store) => { track('store_opened', { store: store.name, type: selectedInterestCat ? 'category' : 'predefined' }); onOpenUrl(store.url); }}
        />
      ) : (
        <View style={styles.emptyStores}>
          <Ionicons name="storefront-outline" size={36} color={COLORS.textTertiary} />
          <Text style={styles.emptyStoresText}>Todavía no hay tiendas cargadas en esta categoría</Text>
        </View>
      )}

      <View style={styles.infoCard}>
        <Ionicons
          name="hand-left-outline"
          size={20}
          color={COLORS.accent}
          style={{ marginTop: 1 }}
        />
        <Text style={styles.infoText}>
          Mantené presionada una imagen de cualquier tienda y se va a guardar
          en Mis Picks. Tocá la estrella arriba en cualquier web para agregarla
          a tus tiendas destacadas.
        </Text>
      </View>
    </ScrollView>
  );
}

const homeExtraStyles = StyleSheet.create({
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInputField: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 44,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  webSearchBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  webSearchBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
});

function BrowserView({ url, onClose, backLabel = 'Volver', onMessage, isFavorite, isCustomFavorite, onToggleFavorite, onUrlChange, onCompare }) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [canGoBack, setCanGoBack] = useState(false);
  const webRef = useRef(null);
  const canGoBackRef = useRef(false);

  // Franja izquierda: captura swipe antes que el WebView
  const edgePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy)) {
          if (canGoBackRef.current) {
            webRef.current?.goBack();
          } else {
            onClose();
          }
        }
      },
    })
  ).current;

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
      {/* Franja izquierda invisible: captura swipe horizontal antes que el WebView */}
      <View
        {...edgePan.panHandlers}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, zIndex: 20 }}
      />
      <View style={styles.browserBar}>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: COLORS.borderSoft, borderRadius: 14 }}
        >
          <Ionicons name="chevron-back" size={16} color={COLORS.accent} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.accent }}>{backLabel}</Text>
        </TouchableOpacity>
        <View style={styles.browserUrl}>
          <Ionicons name="lock-closed" size={11} color={COLORS.textSecondary} />
          <Text style={styles.browserUrlText} numberOfLines={1}>
            {getDomain(currentUrl)}
          </Text>
        </View>
        <TouchableOpacity onPress={onToggleFavorite} hitSlop={8}>
          <Ionicons
            name={isCustomFavorite ? 'star' : isFavorite ? 'star' : 'star-outline'}
            size={20}
            color={isFavorite ? COLORS.accent : COLORS.textPrimary}
          />
          {isCustomFavorite && (
            <View style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent, borderWidth: 1.5, borderColor: COLORS.background }} />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => webRef.current?.reload()} hitSlop={8}>
          <Ionicons name="refresh" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        {!!onCompare && (
          <TouchableOpacity onPress={onCompare} hitSlop={8}>
            <Ionicons name="swap-horizontal-outline" size={21} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: COLORS.background }}
        onNavigationStateChange={(state) => {
          setCurrentUrl(state.url);
          setCanGoBack(state.canGoBack);
          canGoBackRef.current = state.canGoBack;
          if (onUrlChange) onUrlChange(state.url);
        }}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        )}
        allowsBackForwardNavigationGestures={true}
        injectedJavaScript={INJECTED_JS}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsLinkPreview={false}
        sharedCookiesEnabled={true}

        setSupportMultipleWindows={false}
        originWhitelist={['http://*', 'https://*']}
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        onShouldStartLoadWithRequest={(req) => {
          // Solo permitir http/https - bloquea esquemas custom como meli://, mercadolibre://, etc.
          if (req.url.startsWith('http://') || req.url.startsWith('https://') || req.url === 'about:blank') {
            return true;
          }
          return false;
        }}
      />
    </View>
  );
}

// ── CollectionModal ───────────────────────────────────────────────────────────
function CollectionModal({ pick, collections, onSave, onClose }) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;
  const [newName, setNewName]     = useState('');
  const [creating, setCreating]   = useState(false);
  const [kbHeight, setKbHeight]   = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
      Animated.timing(bgAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKbHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const close = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }),
      Animated.timing(bgAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { onClose(); cb && cb(); });
  };

  const handleSelect = (col) => close(() => onSave(col.id));

  const handleCreate = () => {
    if (!newName.trim()) return;
    close(() => onSave(null, newName.trim()));
  };

  return (
    <KeyboardAvoidingView
      style={colStyles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
    >
      <Animated.View style={[colStyles.backdrop, { opacity: bgAnim }]} />
      <Animated.View style={[colStyles.sheet, { transform: [{ translateY: slideAnim }], marginBottom: kbHeight }]}>
        {/* Handle */}
        <View style={colStyles.handle} />

        {/* Pick mini-preview */}
        <View style={colStyles.pickPreview}>
          <Image source={{ uri: pick.img }} style={colStyles.pickThumb} />
          <View style={{ flex: 1 }}>
            <Text style={colStyles.pickName} numberOfLines={2}>{pick.name}</Text>
            {pick.price ? <Text style={colStyles.pickPrice}>${pick.price}</Text> : null}
          </View>
        </View>

        <Text style={colStyles.sheetTitle}>¿Agregar a una colección?</Text>

        {/* Colecciones existentes */}
        {collections.length > 0 && (
          <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
            {collections.map(col => (
              <TouchableOpacity key={col.id} style={colStyles.colRow} onPress={() => handleSelect(col)}>
                <View style={colStyles.colIcon}>
                  <Ionicons name="folder" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={colStyles.colName}>{col.name}</Text>
                  <Text style={colStyles.colCount}>{col.pickIds.length} {col.pickIds.length === 1 ? 'Pick' : 'Picks'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Crear nueva colección */}
        {creating ? (
          <View style={colStyles.createRow}>
            <TextInput
              style={colStyles.createInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Nombre de la colección..."
              placeholderTextColor={COLORS.textTertiary}
              autoFocus
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <TouchableOpacity style={colStyles.createBtn} onPress={handleCreate}>
              <Ionicons name="checkmark" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={colStyles.newColBtn} onPress={() => setCreating(true)}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.accent} />
            <Text style={colStyles.newColText}>Nueva colección</Text>
          </TouchableOpacity>
        )}

        {/* Botón "ahora no" */}
        <TouchableOpacity style={colStyles.skipBtn} onPress={() => close()}>
          <Text style={colStyles.skipText}>Ahora no</Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const colStyles = StyleSheet.create({
  overlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 999 },
  backdrop:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { backgroundColor: '#16161e', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  handle:       { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  pickPreview:  { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 10, marginBottom: 16 },
  pickThumb:    { width: 52, height: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  pickName:     { fontSize: 13, fontWeight: '600', color: '#ffffff', lineHeight: 18 },
  pickPrice:    { fontSize: 12, color: COLORS.accent, marginTop: 2 },
  sheetTitle:   { fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 14 },
  colRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)' },
  colIcon:      { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.accent + '30', justifyContent: 'center', alignItems: 'center' },
  colName:      { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  colCount:     { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  newColBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  newColText:   { fontSize: 15, color: COLORS.accent, fontWeight: '600' },
  createRow:    { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  createInput:  { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#ffffff', borderWidth: 1.5, borderColor: COLORS.accent },
  createBtn:    { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  skipBtn:      { alignItems: 'center', paddingTop: 4 },
  skipText:     { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  colListRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F5F1EB', borderRadius: 16, padding: 12 },
  colListThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.accent + '18', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  colListName:  { fontSize: 15, fontWeight: '600', color: '#2A2826' },
  colListCount: { fontSize: 12, color: '#8A8580', marginTop: 1 },
});

// Header de perfil fusionado en la pestaña "Mis Picks" (antes vivía en "Perfil").
const picksHeaderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 12, marginTop: 14, marginBottom: 16,
  },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  username: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  counts: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  authBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.accentLight || COLORS.card, borderRadius: 16,
    padding: 14, marginTop: 14, marginBottom: 16,
  },
  authBannerTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  authBannerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});


function ShareCardContent({ pick, onImageReady }) {
  const store = getStoreDisplayName(pick.domain);
  return (
    <View style={styles.shareCard}>
      {pick.img ? (
        <Image
          source={{ uri: pick.img }}
          style={styles.shareCardImg}
          resizeMode="cover"
          onLoadEnd={onImageReady}
          onError={onImageReady}
        />
      ) : (
        <View style={[styles.shareCardImg, { backgroundColor: COLORS.borderSoft }]} />
      )}
      <View style={styles.shareCardBody}>
        <Text style={styles.shareCardBrand}>Picks</Text>
        <Text style={styles.shareCardName} numberOfLines={2}>{pick.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={styles.shareCardStore} numberOfLines={1}>{store}</Text>
          {pick.price ? <Text style={styles.shareCardPrice}>{pick.price}</Text> : null}
        </View>
      </View>
      <View style={styles.shareCardFooter}>
        <Text style={styles.shareCardFooterText}>Descubrí más en Picks — tu wishlist universal</Text>
      </View>
    </View>
  );
}

function PicksView({
  picks, collections = [], onRemove, onOpen, picksTab, setPicksTab, openCollection, setOpenCollection, onToggleCollectionPublic,
  userProfile, avatarUrl, onOpenAuth, onOpenEditProfile, onOpenSettings, onOpenCommunity,
  unreadNotifCount = 0, onOpenNotifications,
}) {
  const [myProfileRow, setMyProfileRow] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => { setAvatarError(false); }, [avatarUrl]);

  // Datos livianos del header de perfil — se recargan cada vez que se vuelve
  // a esta pestaña logueado (ej. después de editar el perfil).
  useEffect(() => {
    if (!userProfile) { setMyProfileRow(null); return; }
    supabase.from('profiles').select('*').eq('id', userProfile.id).maybeSingle()
      .then(({ data }) => setMyProfileRow(data || null))
      .catch(() => {});
    (async () => {
      try {
        const [{ count: followers }, { count: following }] = await Promise.all([
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userProfile.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userProfile.id),
        ]);
        setFollowerCount(followers || 0);
        setFollowingCount(following || 0);
      } catch (e) {}
    })();
  }, [userProfile?.id]);
  const [query, setQuery] = useState('');
  const [activeStore, setActiveStore] = useState(null);
  const [activeCountry, setActiveCountry] = useState(null);
  const [shareCardPick, setShareCardPick] = useState(null);
  const shareCardRef = useRef(null);
  const shareImageReady = useRef(null);

  const titleScale   = useRef(new Animated.Value(2.2)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleSkew    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(titleScale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Vibration.vibrate(40);
      Animated.spring(titleSkew, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  async function shareTextOnly(p) {
    try {
      const store = getStoreDisplayName(p.domain);
      const price = p.price ? ` · ${p.price}` : '';
      await Share.share({
        message: `${p.name}${price}\n${p.url}`,
        title: `${p.name} — ${store}`,
      });
    } catch (e) {}
  }

  async function sharePick(p) {
    try {
      setShareCardPick(p);
      // Esperamos a que la imagen del pick termine de cargar en la tarjeta oculta
      // (o 2.5s como tope si no carga / no tiene imagen) antes de capturarla.
      await new Promise((resolve) => {
        shareImageReady.current = resolve;
        if (!p.img) { resolve(); return; }
        setTimeout(resolve, 2500);
      });
      await new Promise((resolve) => setTimeout(resolve, 60)); // un frame extra para que pinte
      const uri = await shareCardRef.current?.capture?.();
      setShareCardPick(null);
      if (!uri) throw new Error('no capture');
      const available = await Sharing.isAvailableAsync();
      if (!available) throw new Error('sharing unavailable');
      const store = getStoreDisplayName(p.domain);
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${p.name} — ${store}`,
        UTI: 'public.png',
      });
    } catch (e) {
      setShareCardPick(null);
      shareTextOnly(p);
    }
  }

  async function shareCollection(list = picks, name = 'Mis Picks') {
    if (list.length === 0) return;
    const shown = list.slice(0, 20);
    const items = shown.map(p => `• ${p.name}${p.price ? ` (${p.price})` : ''}\n  ${p.url}`).join('\n\n');
    const extra = list.length > shown.length ? `\n\n…y ${list.length - shown.length} más en la app.` : '';
    try {
      await Share.share({
        message: `${name} 🧡\n\n${items}${extra}`,
        title: name,
      });
    } catch (e) {}
  }

  // Comparte una colección GUARDADA (con id) como link de Picks — abre la app
  // directo si la tenés instalada. Requiere que la colección sea pública.
  async function shareCollectionLink(col, list) {
    if (!col) return shareCollection(list, 'Mis Picks');
    if (list.length === 0) return;
    if (!col.isPublic) {
      Alert.alert(
        'Colección privada',
        'Para compartir un link tenés que marcar la colección como pública primero (el interruptor de arriba).'
      );
      return;
    }
    const link = `${BACKEND_URL}/c/${col.id}`;
    try {
      await Share.share({
        message: `${col.name} 🧡 — Miralo en Picks\n${link}`,
        title: col.name,
        url: link,
      });
      track('collection_link_shared', { collection_id: col.id, pick_count: list.length });
    } catch (e) {}
  }

  // Países presentes en los picks
  const countryMap = {};
  picks.forEach(p => {
    const c = getDomainCountry(p.domain, p.url);
    if (c && !countryMap[c]) countryMap[c] = { code: c, flag: COUNTRY_INFO[c].flag, name: COUNTRY_INFO[c].name, count: 0 };
    if (c) countryMap[c].count += 1;
  });
  const countries = Object.values(countryMap).sort((a, b) => b.count - a.count);

  // Auto-generar chips agrupando por nombre comercial (no por dominio raw)
  const storeMap = {};
  picks.forEach(p => {
    if (activeCountry && getDomainCountry(p.domain, p.url) !== activeCountry) return;
    const key = getRegisteredDomain(p.domain);
    const name = getStoreDisplayName(p.domain);
    if (!storeMap[key]) storeMap[key] = { key, name, count: 0 };
    storeMap[key].count += 1;
  });
  const stores = Object.values(storeMap).sort((a, b) => b.count - a.count);

  const filtered = picks.filter(p => {
    if (activeCountry && getDomainCountry(p.domain, p.url) !== activeCountry) return false;
    if (activeStore && getRegisteredDomain(p.domain) !== activeStore) return false;
    if (query.trim() === '') return true;
    const q = query.trim().toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.domain || '').toLowerCase().includes(q) ||
      (p.price || '').toLowerCase().includes(q) ||
      getStoreDisplayName(p.domain).toLowerCase().includes(q)
    );
  });
 
  // ── Vista de colección abierta ─────────────────────────────────────────────
  // Zona de swipe dedicada: sin hijos interactivos = PanResponder tiene control total
  const swipeZone = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy)) setOpenCollection(null);
      },
    })
  ).current;

  if (openCollection) {
    const col = collections.find(c => c.id === openCollection);
    const colPicks = col ? picks.filter(p => col.pickIds.includes(p.id)) : [];
    return (
      <View style={styles.viewContent}>
        <TouchableOpacity onPress={() => setOpenCollection(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
          <Text style={{ fontSize: 14, color: COLORS.accent }}>Mis Picks</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>{col?.name}</Text>
          {colPicks.length > 0 && (
            <TouchableOpacity
              onPress={() => shareCollectionLink(col, colPicks)}
              style={styles.shareCollectionBtn}
              hitSlop={10}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.collectionVisibilityRow}>
          <Ionicons
            name={col?.isPublic ? 'globe-outline' : 'lock-closed-outline'}
            size={14}
            color={col?.isPublic ? COLORS.accent : COLORS.textTertiary}
          />
          <Text style={[styles.collectionVisibilityText, col?.isPublic && { color: COLORS.accent }]}>
            {col?.isPublic ? 'Colección pública' : 'Colección privada'}
          </Text>
          <Switch
            value={!!col?.isPublic}
            onValueChange={(val) => onToggleCollectionPublic?.(col?.id, val)}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor="#fff"
            style={{ transform: [{ scale: 0.8 }] }}
          />
        </View>
        <Text style={styles.subtitle}>{colPicks.length} {colPicks.length === 1 ? 'Pick' : 'Picks'}</Text>
        {/* Zona de swipe: barra ancha sin elementos interactivos entre header y lista */}
        <View
          {...swipeZone.panHandlers}
          style={{ width: '100%', height: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chevron-back" size={14} color={COLORS.textTertiary} />
            <View style={{ width: 40, height: 3, backgroundColor: COLORS.border, borderRadius: 4 }} />
            <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} />
          </View>
        </View>
        {colPicks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>Colección vacía</Text>
          </View>
        ) : (
          <FlatList
            data={colPicks}
            keyExtractor={p => p.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
            renderItem={({ item: p }) => (
              <TouchableOpacity
                style={styles.pickCard}
                activeOpacity={0.85}
                onPress={() => onOpen(p.url)}
                onLongPress={() => onRemove(p.id)}
              >
                <View style={styles.pickImgWrap}>
                  <Image source={{ uri: p.img }} style={styles.pickImg} resizeMode="cover" />
                </View>
                <View style={styles.pickInfo}>
                  <Text style={styles.pickName} numberOfLines={2}>{p.name}</Text>
                  <View style={styles.pickMeta}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                      {(() => { const c = getDomainCountry(p.domain, p.url); return c ? <Text style={{ fontSize: 11 }}>{COUNTRY_INFO[c].flag}</Text> : null; })()}
                      <Text style={[styles.pickDomain, { flexShrink: 1 }]} numberOfLines={1}>{getStoreDisplayName(p.domain)}</Text>
                    </View>
                    {p.price ? <Text style={styles.pickPrice} numberOfLines={1}>{p.price}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => sharePick(p)}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="share-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.shareBtnText}>Compartir</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.viewContent}>
      {shareCardPick && (
        <View style={styles.shareCardOffscreen} pointerEvents="none">
          <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 0.92, result: 'tmpfile' }}>
            <ShareCardContent pick={shareCardPick} onImageReady={() => shareImageReady.current?.()} />
          </ViewShot>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Animated.Text style={[styles.title, {
          opacity: titleOpacity,
          transform: [
            { scale: titleScale },
            { skewX: titleSkew.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] }) },
          ],
        }]}>
          Mis Picks
        </Animated.Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {picks.length > 0 && (
            <TouchableOpacity onPress={() => shareCollection()} style={styles.shareCollectionBtn} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
          {!!onOpenNotifications && (
            <NotificationBell count={unreadNotifCount} onPress={onOpenNotifications} />
          )}
          {!!userProfile && (
            <TouchableOpacity onPress={onOpenSettings} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {userProfile ? (
        <View style={picksHeaderStyles.row}>
          <View style={picksHeaderStyles.avatarCircle}>
            {avatarUrl && !avatarError
              ? <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} onError={() => setAvatarError(true)} />
              : <Ionicons name="person" size={20} color="#fff" />
            }
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={picksHeaderStyles.name} numberOfLines={1}>
              {userProfile.user_metadata?.name || myProfileRow?.username || 'Fede'}
            </Text>
            {!!myProfileRow?.username && (
              <Text style={picksHeaderStyles.username}>@{myProfileRow.username}</Text>
            )}
            <TouchableOpacity onPress={onOpenCommunity} activeOpacity={0.7}>
              <Text style={picksHeaderStyles.counts}>
                {followerCount} seguidor{followerCount === 1 ? '' : 'es'} · {followingCount} siguiendo
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={picksHeaderStyles.editBtn} onPress={onOpenEditProfile} activeOpacity={0.7}>
            <Ionicons name="pencil-outline" size={12} color={COLORS.textPrimary} />
            <Text style={picksHeaderStyles.editBtnText}>Editar perfil</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={picksHeaderStyles.authBanner} onPress={onOpenAuth} activeOpacity={0.8}>
          <View style={{ flex: 1 }}>
            <Text style={picksHeaderStyles.authBannerTitle}>Iniciá sesión</Text>
            <Text style={picksHeaderStyles.authBannerSub}>Sincronizá tus Picks y seguí a otros usuarios</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
        </TouchableOpacity>
      )}

      <View style={styles.storeSectionTabs}>
        <TouchableOpacity
          style={[styles.storeSectionTab, picksTab === 'todos' && styles.storeSectionTabActive]}
          onPress={() => setPicksTab('todos')}
        >
          <Text style={[styles.storeSectionTabText, picksTab === 'todos' && styles.storeSectionTabTextActive]}>
            Todos ({picks.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.storeSectionTab, picksTab === 'colecciones' && styles.storeSectionTabActive]}
          onPress={() => setPicksTab('colecciones')}
        >
          <Text style={[styles.storeSectionTabText, picksTab === 'colecciones' && styles.storeSectionTabTextActive]}>
            Colecciones ({collections.length})
          </Text>
        </TouchableOpacity>
      </View>

      {picksTab === 'colecciones' ? (
        collections.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTitle}>Sin colecciones</Text>
            <Text style={styles.emptyDesc}>Al guardar un pick podrás organizarlo en colecciones.</Text>
          </View>
        ) : (
          <FlatList
            data={collections}
            keyExtractor={c => c.id}
            contentContainerStyle={{ gap: 10, paddingBottom: 20, paddingTop: 4 }}
            renderItem={({ item: col }) => {
              const thumb = picks.find(p => col.pickIds.includes(p.id));
              return (
                <TouchableOpacity style={colStyles.colListRow} onPress={() => setOpenCollection(col.id)} activeOpacity={0.85}>
                  <View style={colStyles.colListThumb}>
                    {thumb
                      ? <Image source={{ uri: thumb.img }} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
                      : <Ionicons name="folder" size={28} color={COLORS.accent} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={colStyles.colListName}>{col.name}</Text>
                    <Text style={colStyles.colListCount}>{col.pickIds.length} {col.pickIds.length === 1 ? 'Pick' : 'Picks'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
                </TouchableOpacity>
              );
            }}
          />
        )
      ) : (

      picks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyTitle}>Acá van tus Picks</Text>
          <Text style={styles.emptyDesc}>
            Entrá a una tienda, mantené presionada una imagen y se guarda acá.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.picksSearch}>
            <Ionicons name="search" size={17} color={COLORS.textSecondary} />
            <TextInput
              style={styles.picksSearchInput}
              placeholder="Buscar entre lo guardado..."
              placeholderTextColor={COLORS.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
 
          {countries.length > 1 && (
            <View style={[styles.chipsContainer, { marginBottom: 8 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {countries.map(c => {
                  const active = activeCountry === c.code;
                  return (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => { setActiveCountry(active ? null : c.code); setActiveStore(null); }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 13 }}>{c.flag}</Text>
                      <Text style={[styles.chipText, active && styles.chipTextActive, { marginLeft: 4 }]}>{c.name}</Text>
                      <Text style={[styles.chipCount, active && styles.chipCountActive]}>{' '}{c.count}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {stores.length > 1 && (
            <View style={styles.chipsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {stores.map(s => {
                  const active = activeStore === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setActiveStore(active ? null : s.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {s.name}
                      </Text>
                      <Text style={[styles.chipCount, active && styles.chipCountActive]}>
                        {' '}{s.count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {activeStore && (
                  <TouchableOpacity
                    style={[styles.chip, styles.chipClear]}
                    onPress={() => setActiveStore(null)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={11} color={COLORS.accent} />
                    <Text style={[styles.chipText, { color: COLORS.accent, marginLeft: 3 }]}>Limpiar</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          )}
 
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="sad-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyDesc}>Probá con otras palabras o sacá el filtro.</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.picksGridContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.picksGrid}>
                {filtered.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.pickCard}
                    activeOpacity={0.85}
                    onPress={() => onOpen(p.url)}
                    onLongPress={() => onRemove(p.id)}
                  >
                    <View style={styles.pickImgWrap}>
                      <Image source={{ uri: p.img }} style={styles.pickImg} resizeMode="cover" />
                    </View>
                    <View style={styles.pickInfo}>
                      <Text style={styles.pickName} numberOfLines={2}>{p.name}</Text>
                      <View style={styles.pickMeta}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                          {(() => { const c = getDomainCountry(p.domain, p.url); return c ? <Text style={{ fontSize: 11 }}>{COUNTRY_INFO[c].flag}</Text> : null; })()}
                          <Text style={[styles.pickDomain, { flexShrink: 1 }]} numberOfLines={1}>{getStoreDisplayName(p.domain)}</Text>
                        </View>
                        {p.price ? <Text style={styles.pickPrice} numberOfLines={1}>{p.price}</Text> : null}
                      </View>
                      <TouchableOpacity
                        style={styles.shareBtn}
                        onPress={() => sharePick(p)}
                        hitSlop={8}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="share-outline" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.shareBtnText}>Compartir</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.picksHint}>Tocá para abrir en la tienda · Mantené presionado para eliminar</Text>
            </ScrollView>
          )}
        </>
      )
      )}
    </View>
  );
}

function SearchView({ onMessage, customStores = [], countryStores = STORES, country = 'UY', onOpenUrl, preset = null, onPresetConsumed, onBack, initialQuery = null, onInitialQueryConsumed }) {
  const [inputText, setInputText] = useState('');
  const [query, setQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(0);
  const [pickingImage, setPickingImage] = useState(false);
  const [nlLoading, setNlLoading] = useState(false);
  const [suggestedStores, setSuggestedStores] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const searchInjected = useRef(false);
  const webRef = useRef(null);
  const inputRef = useRef(null);
  const finalTranscriptRef = useRef('');

  // Búsqueda por voz: usa el reconocimiento de voz nativo del teléfono (sin
  // mandar audio a ningún servidor). Al terminar de hablar, el texto
  // reconocido se busca solo, pasando por el mismo camino conversacional
  // que si se hubiera escrito.
  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript || '';
    setInputText(transcript);
    if (event.isFinal) finalTranscriptRef.current = transcript;
  });
  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    const t = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = '';
    if (t) doSearch(t);
  });
  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      Alert.alert('No pudimos escucharte', 'Probá de nuevo o escribí tu búsqueda.');
    }
  });

  async function handleMicPress() {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permiso necesario', 'Necesitamos acceso al micrófono para buscar por voz.');
        return;
      }
      finalTranscriptRef.current = '';
      setInputText('');
      ExpoSpeechRecognitionModule.start({ lang: 'es-UY', interimResults: true });
      track('voice_search_started', {});
    } catch (e) {
      Alert.alert('No pudimos activar el micrófono', 'Probá escribiendo tu búsqueda.');
    }
  }

  // Búsqueda conversacional: cuando el usuario escribe una frase (no un
  // producto suelto), se la mandamos a la IA para que la convierta en una
  // consulta corta + una categoría, y con eso sugerimos tiendas de esa
  // categoría (además de igual buscar la consulta refinada en todas las tiendas).
  async function runConversationalSearch(text) {
    setNlLoading(true);
    setSuggestedStores([]);
    try {
      const res = await fetch(`${BACKEND_URL}/api/search/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json();
      const refined = (data.query || text).trim();
      setInputText(refined);
      searchInjected.current = false;
      setQuery(refined);
      setSelectedStore(0);
      track('conversational_search', { category: data.category || '', query: refined });
      if (data.category) {
        fetch(`${BACKEND_URL}/api/stores?country=${country || 'UY'}&category=${data.category}&limit=6`)
          .then((r) => r.json())
          .then((list) => setSuggestedStores(Array.isArray(list) ? list : []))
          .catch(() => setSuggestedStores([]));
      }
    } catch (e) {
      // Si falla la interpretación, degradamos a buscar el texto tal cual.
      searchInjected.current = false;
      setQuery(text);
      setSelectedStore(0);
    } finally {
      setNlLoading(false);
    }
  }

  async function runImageSearch(pickerResult) {
    if (pickerResult.canceled || !pickerResult.assets?.[0]?.base64) return;
    setPickingImage(true);
    try {
      const asset = pickerResult.assets[0];
      const res = await fetch(`${BACKEND_URL}/api/vision/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: asset.base64, media_type: asset.mimeType || 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok || !data.query) throw new Error(data.error || 'No se pudo reconocer la imagen');
      Keyboard.dismiss();
      setInputText(data.query);
      searchInjected.current = false;
      setQuery(data.query);
      setSelectedStore(0);
      setCompareMode(false);
      track('image_search', { query: data.query });
    } catch (e) {
      Alert.alert('No pudimos reconocer la imagen', 'Probá con otra foto o buscá escribiendo el producto.');
    } finally {
      setPickingImage(false);
    }
  }

  async function handleImageSearchPress() {
    Alert.alert(
      'Buscar con una foto',
      'Elegí una imagen y buscamos productos parecidos en las tiendas.',
      [
        {
          text: 'Tomar foto',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permiso necesario', 'Necesitamos acceso a tu cámara para tomar la foto.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
            runImageSearch(result);
          },
        },
        {
          text: 'Elegir de la galería',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería para elegir la foto.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
            runImageSearch(result);
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  }

  // Todas las tiendas del país activo (la inyección JS maneja las que no tienen URL conocida)
  const predefinedSearchable = countryStores;

  // Tiendas custom: se carga el home y se inyecta la búsqueda via JS
  const customSearchable = customStores.map(s => ({
    ...s,
    isCustom: true,
  }));

  // Tiendas "extra" que llegan desde "Comparar en otras tiendas" (BrowserView):
  // no siempre son parte de countryStores/customStores, así que se agregan
  // como pestañas temporales. Usan el mismo buscador inyectado que las custom.
  const [extraStores, setExtraStores] = useState([]);
  // Mientras estamos "en modo comparar" (recién llegamos desde el ícono de
  // comparar), el buscador muestra SOLO las tiendas que se eligieron ahí, no
  // mezcladas con el resto — así los resultados son realmente de esa
  // categoría. Se apaga solo si el usuario arranca una búsqueda manual nueva.
  const [compareMode, setCompareMode] = useState(false);
  const lastPresetNonce = useRef(null);

  useEffect(() => {
    if (preset && preset.nonce !== lastPresetNonce.current) {
      lastPresetNonce.current = preset.nonce;
      setExtraStores(preset.stores || []);
      setCompareMode(true);
      setInputText(preset.query || '');
      setQuery(preset.query || '');
      setSuggestedStores([]);
      setSelectedStore(0);
      searchInjected.current = false;
      if (onPresetConsumed) onPresetConsumed();
    }
  }, [preset]);

  // Query pre-cargada desde "Mis tiendas" (modo Toda la web con texto libre):
  // a diferencia de `preset`, NO acota a un set de tiendas — busca en todas
  // las conocidas, como si el usuario la hubiera tipeado acá directamente.
  const lastInitialQueryNonce = useRef(null);
  useEffect(() => {
    if (initialQuery && initialQuery.nonce !== lastInitialQueryNonce.current) {
      lastInitialQueryNonce.current = initialQuery.nonce;
      setInputText(initialQuery.query || '');
      doSearch(initialQuery.query || '');
      if (onInitialQueryConsumed) onInitialQueryConsumed();
    }
  }, [initialQuery]);

  const knownDomains = new Set([
    ...predefinedSearchable.map(s => s.domain),
    ...customSearchable.map(s => s.domain),
  ]);
  const dedupedExtra = extraStores
    .filter(s => !knownDomains.has(s.domain))
    .map(s => ({ ...s, isCustom: true }));

  const searchableStores = compareMode
    ? dedupedExtra
    : [
        ...dedupedExtra,
        ...predefinedSearchable,
        ...customSearchable,
      ];

  // Resetear inyección cuando cambia tienda o búsqueda
  useEffect(() => {
    searchInjected.current = false;
  }, [selectedStore, query]);

  function doSearch(overrideText) {
    const q = (overrideText !== undefined ? overrideText : inputText).trim();
    if (!q) return;
    Keyboard.dismiss();
    setSuggestedStores([]);
    setCompareMode(false);
    // Frases largas ("quiero zapatillas de running para correr 5km, livianas")
    // se interpretan con IA antes de buscar; términos cortos van directo.
    const wordCount = q.split(/\s+/).length;
    if (wordCount >= 4) {
      runConversationalSearch(q);
      return;
    }
    searchInjected.current = false;
    setQuery(q);
    setSelectedStore(0);
  }

  // Script que busca el input de búsqueda en la página y hace submit.
  // Reintenta hasta 6 veces con delay para SPAs que renderizan el DOM después del load.
  function buildSearchScript(q) {
    return `
(function trySearch(attempt) {
  var q = ${JSON.stringify(q)};
  var selectors = [
    'input[type="search"]',
    'input[name="q"]',
    'input[name="s"]',
    'input[name="search"]',
    'input[name="busqueda"]',
    'input[name="buscar"]',
    'input[name="query"]',
    'input[id*="search"]',
    'input[id*="busca"]',
    'input[class*="search"]',
    'input[class*="busca"]',
    'input[placeholder*="busca"]',
    'input[placeholder*="search"]',
    'input[placeholder*="Busca"]',
    'input[placeholder*="Search"]',
  ];
  var input = null;
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) { input = el; break; }
  }
  if (!input) {
    // SPA todavía renderizando — reintentar con backoff
    if (attempt < 6) setTimeout(function() { trySearch(attempt + 1); }, 600);
    return;
  }
  input.focus();
  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, q);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  var form = input.closest('form');
  if (form) {
    form.submit();
  } else {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
  }
})(0);
true;
    `;
  }

  function handleLoadEnd() {
    const store = searchableStores[selectedStore];
    if (!query || searchInjected.current) return;
    // Solo inyectar si la tienda no tiene URL de búsqueda conocida
    const hasKnownUrl = store?.searchUrl || STORE_SEARCH_URL[store?.domain];
    if (hasKnownUrl) return;
    searchInjected.current = true;
    webRef.current?.injectJavaScript(buildSearchScript(query));
  }

  function getSearchUrl(storeIndex) {
    const store = searchableStores[storeIndex];
    if (!store || !query) return null;
    // 1) URL específica del store (tiene precedencia — permite URLs por país)
    if (store.searchUrl) return store.searchUrl(query);
    // 2) STORE_SEARCH_URL por dominio (tiendas predefinidas UY y bas.com.uy)
    const fn = STORE_SEARCH_URL[store.domain];
    if (fn) return fn(query);
    // 3) Para tiendas sin URL conocida: cargar home e inyectar búsqueda via JS
    return store.url || null;
  }

  const searchUrl = getSearchUrl(selectedStore);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {!!onBack && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10 }}>
          <TouchableOpacity onPress={onBack} style={{ padding: 6, marginLeft: -6 }} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginLeft: 2 }}>Buscar</Text>
        </View>
      )}
      {/* Barra de búsqueda */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBarInner}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            ref={inputRef}
            style={styles.searchBarInput}
            placeholder="Buscar en todas las tiendas..."
            placeholderTextColor={COLORS.textTertiary}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => doSearch()}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {inputText.length > 0 && (
            <TouchableOpacity onPress={() => { setInputText(''); setQuery(''); }} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchBtn, { paddingHorizontal: 12 }, pickingImage && { opacity: 0.6 }]}
          onPress={handleImageSearchPress}
          disabled={pickingImage}
          activeOpacity={0.7}
        >
          {pickingImage
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="camera-outline" size={18} color="#fff" />
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.searchBtn, { paddingHorizontal: 12 }, isListening && { backgroundColor: '#D64545' }]}
          onPress={handleMicPress}
          activeOpacity={0.7}
        >
          <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.searchBtn, !inputText.trim() && { opacity: 0.4 }]}
          onPress={() => doSearch()}
          disabled={!inputText.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.searchBtnText}>Buscar</Text>
        </TouchableOpacity>
      </View>

      {nlLoading ? (
        <View style={styles.searchEmpty}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={[styles.searchEmptySubtitle, { marginTop: 10 }]}>Interpretando tu búsqueda…</Text>
        </View>
      ) : !query ? (
        /* Estado vacío */
        <View style={styles.searchEmpty}>
          <Ionicons name="search" size={48} color={COLORS.border} />
          <Text style={styles.searchEmptyTitle}>Buscá en todas las tiendas</Text>
          <Text style={styles.searchEmptySubtitle}>
            Escribí un producto arriba, o tocá {'\u{1F4F7}'} para buscar con una foto
          </Text>
        </View>
      ) : (
        <>
          {suggestedStores.length > 0 && (
            <View style={styles.nlSuggestRow}>
              <Text style={styles.nlSuggestLabel}>Tiendas recomendadas para esto</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {suggestedStores.map((s) => (
                  <TouchableOpacity
                    key={s.domain}
                    style={[styles.interestStoreChipSm, { backgroundColor: s.bg || '#2C2C2C' }]}
                    activeOpacity={0.8}
                    onPress={() => {
                      if (onOpenUrl) onOpenUrl(s.url, 'Buscar');
                      track('conversational_search_store_opened', { store: s.name, category: s.category });
                    }}
                  >
                    <Text style={{ color: s.fg || '#FFFFFF', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {/* Selector de tienda */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.storeTabsScroll}
            contentContainerStyle={styles.storeTabsContent}
          >
            {searchableStores.map((store, i) => (
              <TouchableOpacity
                key={store.domain}
                onPress={() => setSelectedStore(i)}
                activeOpacity={0.7}
                style={[
                  styles.storeTab,
                  selectedStore === i && { backgroundColor: store.bg, borderColor: store.bg },
                ]}
              >
                <Text style={[
                  styles.storeTabText,
                  selectedStore === i && { color: store.fg },
                ]}>
                  {store.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* WebView con resultados */}
          {searchUrl && (
            <WebView
              key={searchUrl}
              ref={webRef}
              source={{ uri: searchUrl }}
              style={{ flex: 1 }}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={COLORS.accent} />
                </View>
              )}
              injectedJavaScript={INJECTED_JS}
              onMessage={onMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsBackForwardNavigationGestures={true}
              sharedCookiesEnabled={true}
      
              setSupportMultipleWindows={false}
              originWhitelist={['http://*', 'https://*']}
              userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
              onShouldStartLoadWithRequest={(req) => {
                if (req.url.startsWith('http://') || req.url.startsWith('https://') || req.url === 'about:blank') return true;
                return false;
              }}
              onLoadEnd={handleLoadEnd}
            />
          )}
        </>
      )}
    </View>
  );
}

function TrendsSection({ onOpenUrl }) {
  const [topStores, setTopStores] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('trendsCollapsed-v1').then(v => { if (v === 'true') setCollapsed(true); }).catch(() => {});
    (async () => {
      try {
        const res = await Promise.race([
          fetch(`${BACKEND_URL}/api/trends`),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
        ]);
        const data = await res.json();
        setTopStores(data.stores || []);
        setTopProducts(data.products || []);
      } catch (e) {}
    })();
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    AsyncStorage.setItem('trendsCollapsed-v1', String(next)).catch(() => {});
  }

  if (topStores.length === 0 && topProducts.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : undefined }}>
        <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Esta semana en Picks</Text>
        <TouchableOpacity onPress={toggleCollapsed} hitSlop={10}>
          <Ionicons name={collapsed ? 'chevron-down-outline' : 'chevron-up-outline'} size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {!collapsed && topStores.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.trendsSubtitle}>Tiendas más guardadas</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {topStores.map((s, i) => (
              <View key={i} style={styles.trendStoreChip}>
                <Text style={{ fontSize: 14 }}>{i === 0 ? '🔥' : i === 1 ? '⭐' : '✨'}</Text>
                <Text style={styles.trendStoreName}>{s.store}</Text>
                <Text style={styles.trendStoreCount}>{s.count} Picks</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!collapsed && topProducts.length > 0 && (
        <View>
          <Text style={styles.trendsSubtitle}>Productos más guardados</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 10 }}>
            {topProducts.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.trendProductCard}
                onPress={() => p.url && onOpenUrl(p.url)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: p.img }} style={styles.trendProductImg} resizeMode="cover" />
                <View style={styles.trendProductInfo}>
                  <Text style={styles.trendProductName} numberOfLines={2}>{p.title}</Text>
                  <Text style={styles.trendProductStore} numberOfLines={1}>{p.store}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Explorar ─────────────────────────────────────────────────────────────────
function getStoreBgColor(storeName) {
  const allStores = [...STORES, ...STORES_AR, ...STORES_CL, ...STORES_PY];
  const found = allStores.find(s => s.name === storeName);
  return found ? found.bg : '#555555';
}

function ExplorarScreen({ picks, customStores = [], userInterests = [], onOpenUrl, onAddPick, unreadNotifCount = 0, onOpenNotifications, userProfile }) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('reel'); // 'lista' | 'reel'
  const [reelHeight, setReelHeight] = useState(SCREEN.height - 160);
  const [chip, setChip] = useState('para_vos'); // 'para_vos' | 'tendencias' | 'amigos'
  const [exploreQuery, setExploreQuery] = useState('');
  const [friendsFeed, setFriendsFeed] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const titleScale   = useRef(new Animated.Value(2.2)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleSkew    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(titleScale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(titleOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      Animated.spring(titleSkew, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    });
  }, []);

  // Vista con la que abrir Explorar la próxima vez (configurable en Configuración).
  useEffect(() => {
    AsyncStorage.getItem('explorar-default-view-v1')
      .then((v) => { if (v === 'lista' || v === 'reel') setViewMode(v); })
      .catch(() => {});
  }, []);

  // Feed de "Amigos": picks públicos de la gente que seguís. Se trae aparte
  // porque no viene de /api/explorar (que es de productos de tiendas) sino
  // de los Picks que guardó gente real de la comunidad.
  useEffect(() => {
    if (!userProfile) { setFriendsFeed([]); return; }
    let cancelled = false;
    setFriendsLoading(true);
    (async () => {
      try {
        const { data: followRows } = await supabase.from('follows').select('following_id').eq('follower_id', userProfile.id);
        const ids = (followRows || []).map(r => r.following_id);
        if (ids.length === 0) { if (!cancelled) setFriendsFeed([]); return; }
        const [{ data: profiles }, picksRes] = await Promise.all([
          supabase.from('profiles').select('id, username, display_name').in('id', ids),
          fetch(`${BACKEND_URL}/api/picks/public?user_ids=${ids.join(',')}`).then(r => r.json()),
        ]);
        const nameById = {};
        (profiles || []).forEach(p => { nameById[p.id] = personDisplayLabel(p); });
        const items = (picksRes.picks || []).map(p => {
          let store = '';
          try { store = getStoreDisplayName(new URL(p.url).hostname); } catch (e) {}
          const price = parseFloat(p.price_current || p.price_saved) || null;
          return {
            title: p.name, img: p.img, url: p.url, price, store,
            type: 'friend_pick',
            actorName: nameById[p.user_id] || 'Alguien',
          };
        });
        if (!cancelled) setFriendsFeed(items);
      } catch (e) {
        if (!cancelled) setFriendsFeed([]);
      } finally {
        if (!cancelled) setFriendsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.id]);

  async function loadFeed(isRefresh = false) {
    if (!isRefresh) setLoading(true);
    try {
      // Dominios de picks del usuario (para priorizar esas tiendas)
      const pickDomains = [...new Set(picks.map(p => p.domain).filter(Boolean))];
      // Dominios de Mis tiendas (para intentar traer productos de tiendas custom)
      const customDomains = customStores.map(s => s.domain).filter(Boolean);
      const params = new URLSearchParams();
      if (pickDomains.length) params.set('stores', pickDomains.join(','));
      if (customDomains.length) params.set('custom', customDomains.join(','));
      // Títulos de picks + keywords de intereses para personalización del feed
      const pickTitles = picks.slice(0, 30).map(p => p.title).filter(Boolean);
      const interestKws = userInterests.flatMap(id => INTEREST_KEYWORDS[id] || []);
      const allTitles = [...pickTitles, ...interestKws];
      if (allTitles.length) params.set('titles', allTitles.join('|'));
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await Promise.race([
        fetch(`${BACKEND_URL}/api/explorar${query}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      const data = await res.json();
      setFeed(data.feed || []);
    } catch (e) {
      console.log('[explorar] Error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadFeed(); }, []);

  function onRefresh() { setRefreshing(true); loadFeed(true); }

  const isAlreadyPicked = (url) => picks.some(p => p.url === url);

  // Keywords de "Mis intereses" — mismo criterio best-effort que se usa en
  // el resto de la app (inferStoreCategory, personalización del Home).
  const interestKeywords = userInterests.flatMap(id => INTEREST_KEYWORDS[id] || []);
  const matchesInterests = (item) => {
    if (interestKeywords.length === 0) return true; // sin intereses cargados, no filtramos
    const t = (item.title || '').toLowerCase();
    return interestKeywords.some(k => t.includes(k));
  };
  const matchesQuery = (item) => {
    const q = exploreQuery.trim().toLowerCase();
    if (!q) return true;
    return (item.title || '').toLowerCase().includes(q) || (item.store || '').toLowerCase().includes(q);
  };

  const chipBaseFeed =
    chip === 'amigos' ? friendsFeed
    : chip === 'tendencias' ? feed.filter(i => i.type === 'trending')
    : feed.filter(matchesInterests); // 'para_vos'
  const displayFeed = chipBaseFeed.filter(matchesQuery);

  // ── Lista card ──────────────────────────────────────────────────────────────
  function renderListCard({ item }) {
    const picked = isAlreadyPicked(item.url);
    const storeBg = getStoreBgColor(item.store);
    return (
      <TouchableOpacity
        style={styles.explorarCard}
        onPress={() => item.url && onOpenUrl(item.url)}
        activeOpacity={0.88}
      >
        {item.img ? (
          <Image source={{ uri: item.img }} style={styles.explorarCardImg} resizeMode="cover" />
        ) : (
          <View style={[styles.explorarCardImg, styles.explorarCardImgEmpty]}>
            <Ionicons name="image-outline" size={28} color={COLORS.textTertiary} />
          </View>
        )}
        <View style={styles.explorarCardBody}>
          {item.type === 'friend_pick' ? (
            <View style={[styles.explorarStoreBadge, { backgroundColor: COLORS.accent, marginBottom: 6, alignSelf: 'flex-start' }]}>
              <Text style={styles.explorarStoreBadgeText}>🧡 {item.actorName} guardó un Pick</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <View style={[styles.explorarStoreBadge, { backgroundColor: storeBg }]}>
                <Text style={styles.explorarStoreBadgeText}>{item.store}</Text>
              </View>
              {item.type === 'trending' && (
                <View style={styles.explorarTrendingBadge}>
                  <Text style={styles.explorarTrendingText}>🔥 tendencia</Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.explorarCardTitle} numberOfLines={2}>{item.title}</Text>
          {item.price ? (
            <Text style={styles.explorarCardPrice}>
              ${item.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.explorarPickBtn}
          onPress={() => !picked && onAddPick(item)}
          hitSlop={10}
          activeOpacity={0.7}
        >
          <Ionicons name={picked ? 'heart' : 'heart-outline'} size={22} color={picked ? COLORS.accent : COLORS.textTertiary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // ── Reel card ───────────────────────────────────────────────────────────────
  function renderReelCard({ item }) {
    const picked = isAlreadyPicked(item.url);
    const storeBg = getStoreBgColor(item.store);
    return (
      <View style={[styles.reelCard, { height: reelHeight }]}>
        {item.img ? (
          <Image source={{ uri: item.img }} style={styles.reelImg} resizeMode="cover" />
        ) : (
          <View style={[styles.reelImg, { backgroundColor: COLORS.borderSoft }]} />
        )}

        {/* Sin overlay — fondo directo en el bloque de info */}

        {/* Info abajo a la izquierda */}
        <View style={styles.reelInfo}>
          {item.type === 'friend_pick' ? (
            <View style={[styles.explorarStoreBadge, { backgroundColor: COLORS.accent, marginBottom: 10, alignSelf: 'flex-start' }]}>
              <Text style={styles.explorarStoreBadgeText}>🧡 {item.actorName} guardó un Pick</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={[styles.explorarStoreBadge, { backgroundColor: storeBg }]}>
                <Text style={styles.explorarStoreBadgeText}>{item.store}</Text>
              </View>
              {item.type === 'trending' && (
                <View style={styles.explorarTrendingBadge}>
                  <Text style={styles.explorarTrendingText}>🔥 tendencia</Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.reelTitle} numberOfLines={3}>{item.title}</Text>
          {item.price ? (
            <Text style={styles.reelPrice}>
              ${item.price.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.reelOpenBtn}
            onPress={() => item.url && onOpenUrl(item.url)}
            activeOpacity={0.85}
          >
            <Text style={styles.reelOpenBtnText}>Ver producto →</Text>
          </TouchableOpacity>
        </View>

        {/* Acciones lado derecho */}
        <View style={styles.reelActions}>
          <TouchableOpacity
            style={styles.reelActionBtn}
            onPress={() => !picked && onAddPick(item)}
            activeOpacity={0.7}
          >
            <Ionicons name={picked ? 'heart' : 'heart-outline'} size={32} color={picked ? COLORS.accent : '#fff'} />
            <Text style={styles.reelActionLabel}>{picked ? 'Guardado' : 'Guardar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.reelActionBtn}
            onPress={() => item.url && onOpenUrl(item.url)}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={28} color="#fff" />
            <Text style={styles.reelActionLabel}>Abrir</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const emptyMessage =
    chip === 'amigos'
      ? (friendsLoading ? 'Cargando...' : !userProfile ? 'Iniciá sesión y seguí gente para ver esto.' : 'Nadie que seguís guardó Picks públicos todavía.')
      : exploreQuery.trim()
      ? 'No encontramos nada con esa búsqueda.'
      : 'No hay novedades por acá todavía.';

  const chipsRow = (light) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {EXPLORAR_CHIPS.map(c => (
        <TouchableOpacity
          key={c.id}
          style={[styles.chip, chip === c.id && styles.chipActive, light && chip !== c.id && { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.4)' }]}
          onPress={() => setChip(c.id)}
          activeOpacity={0.75}
        >
          <Text style={[styles.chipText, chip === c.id && styles.chipTextActive, light && chip !== c.id && { color: '#fff' }]}>
            {c.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header — solo visible en modo lista; en reel flota todo encima del video */}
      {viewMode === 'lista' && (
        <>
          <View style={styles.explorarToggleBar}>
            <Animated.Text style={[styles.brandName, {
              fontSize: 24,
              opacity: titleOpacity,
              transform: [
                { scale: titleScale },
                { skewX: titleSkew.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] }) },
              ],
            }]}>
              Picks
            </Animated.Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity onPress={() => setViewMode('reel')} hitSlop={10} activeOpacity={0.7}>
                <Ionicons name="play-circle-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              {!!onOpenNotifications && (
                <NotificationBell count={unreadNotifCount} onPress={onOpenNotifications} />
              )}
            </View>
          </View>

          <View style={explorarExtraStyles.searchWrap}>
            <Ionicons name="search-outline" size={17} color={COLORS.textSecondary} />
            <TextInput
              style={explorarExtraStyles.searchInput}
              placeholder="Buscar productos, marcas, ideas..."
              placeholderTextColor={COLORS.textTertiary}
              value={exploreQuery}
              onChangeText={setExploreQuery}
              autoCorrect={false}
            />
            {exploreQuery.length > 0 && (
              <TouchableOpacity onPress={() => setExploreQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={17} color={COLORS.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <TourTarget id="explorar-chips">
              {chipsRow(false)}
            </TourTarget>
          </View>
        </>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={{ color: COLORS.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando novedades...</Text>
        </View>
      ) : viewMode === 'lista' ? (
        displayFeed.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
            <Ionicons name="compass-outline" size={40} color={COLORS.border} />
            <Text style={{ color: COLORS.textPrimary, fontWeight: '500', fontSize: 15, marginTop: 12, textAlign: 'center' }}>{emptyMessage}</Text>
            {chip !== 'amigos' && (
              <TouchableOpacity onPress={() => loadFeed()} style={{ marginTop: 20 }}>
                <Text style={{ color: COLORS.accent, fontWeight: '500' }}>Reintentar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={displayFeed}
            renderItem={renderListCard}
            keyExtractor={(item, i) => `lista-${i}-${item.url || ''}`}
            contentContainerStyle={styles.explorarList}
            refreshing={refreshing}
            onRefresh={onRefresh}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        <View
          style={{ flex: 1 }}
          onLayout={(e) => setReelHeight(e.nativeEvent.layout.height)}
        >
          {/* Marca + toggle + campana + chips, flotando arriba del reel sin bloquear el swipe */}
          <View style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 5 }} pointerEvents="box-none">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.brandName, { fontSize: 18, color: '#fff' }]}>Picks</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setViewMode('lista')}
                  hitSlop={10}
                  activeOpacity={0.8}
                  style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, padding: 7 }}
                >
                  <Ionicons name="list-outline" size={18} color="#fff" />
                </TouchableOpacity>
                {!!onOpenNotifications && (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, padding: 7 }}>
                    <NotificationBell count={unreadNotifCount} onPress={onOpenNotifications} color="#fff" />
                  </View>
                )}
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              {chipsRow(true)}
            </View>
          </View>

          {displayFeed.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: '#161616' }}>
              <Text style={{ color: '#fff', fontWeight: '500', fontSize: 15, textAlign: 'center' }}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={displayFeed}
              renderItem={renderReelCard}
              keyExtractor={(item, i) => `reel-${i}-${item.url || ''}`}
              pagingEnabled
              snapToAlignment="start"
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: reelHeight, offset: reelHeight * index, index })}
            />
          )}
        </View>
      )}
    </View>
  );
}

const EXPLORAR_CHIPS = [
  { id: 'para_vos', label: 'Para vos' },
  { id: 'tendencias', label: 'Tendencias' },
  { id: 'amigos', label: 'Amigos' },
];

const explorarExtraStyles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 12,
    marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
});

// Menú inferior: 3 pestañas flotantes estilo Instagram. "Mis tiendas" y
// "Buscar"/"Perfil" (login, editar perfil, configuración, comunidad) siguen
// existiendo como pantallas — se llega a ellas desde adentro de estas 3.
// ============ TUTORIAL DE ONBOARDING (globitos sobre la UI real) ============
// Contexto global: cualquier elemento envuelto en <TourTarget id="..."> se
// "registra" (mide su posición real en pantalla) cada vez que se dibuja.
// El tour recorre una lista de pasos, cada uno apuntando a un id ya registrado,
// cambiando de pantalla (activeTab) cuando hace falta.
const TourContext = createContext(null);

function TourTarget({ id, style, children }) {
  const ctx = useContext(TourContext);
  const viewRef = useRef(null);
  const measure = useCallback(() => {
    if (!ctx) return;
    requestAnimationFrame(() => {
      viewRef.current?.measureInWindow?.((x, y, width, height) => {
        if (width > 0 && height > 0) ctx.registerTarget(id, { x, y, width, height });
      });
    });
  }, [ctx, id]);
  return (
    <View ref={viewRef} collapsable={false} onLayout={measure} style={style}>
      {children}
    </View>
  );
}

const TOUR_STEPS = [
  {
    id: 'save-gesture',
    tab: 'home',
    targetKey: 'tab-picks',
    placement: 'top',
    title: 'Así se guarda un Pick',
    body: 'En cualquier tienda, mantené presionada la imagen de un producto: se guarda solo acá, en "Mis Picks".',
  },
  {
    id: 'tab-explorar',
    tab: 'home',
    targetKey: 'tab-explorar',
    placement: 'top',
    title: 'Explorar',
    body: 'Descubrí productos para vos, en tendencia, o guardados por la gente que seguís.',
  },
  {
    id: 'tab-home',
    tab: 'home',
    targetKey: 'tab-home',
    placement: 'top',
    title: 'Mis tiendas',
    body: 'Todas tus tiendas favoritas juntas, con acceso directo a cada una.',
  },
  {
    id: 'notif-bell',
    tab: 'home',
    targetKey: 'notif-bell',
    placement: 'bottom',
    title: 'Notificaciones',
    body: 'Te avisamos acá si baja el precio de un Pick o vuelve a tener stock.',
  },
  {
    id: 'search-modes',
    tab: 'home',
    targetKey: 'search-mode-chip',
    placement: 'bottom',
    title: 'Mis tiendas o toda la web',
    body: 'Tocá acá para alternar: "Mis tiendas" busca solo en las que agregaste; "Toda la web" te deja escribir cualquier producto o sitio.',
  },
  {
    id: 'explorar-chips',
    tab: 'explorar',
    targetKey: 'explorar-chips',
    placement: 'bottom',
    title: 'Para vos / Tendencias / Amigos',
    body: 'Cambiá el feed de Explorar según tus intereses, lo más popular, o lo que guardó la gente que seguís.',
  },
];

function TourOverlay({ step, stepIndex, totalSteps, target, onNext, onSkip }) {
  const { width: W, height: H } = Dimensions.get('window');
  if (!step) return null;
  const pad = 8;
  if (!target) {
    // Todavía no se midió el elemento (recién se cambió de pantalla) — mostramos
    // solo el fondo oscuro mientras tanto, sin globito, para no "flashear" mal ubicado.
    return <View pointerEvents="auto" style={tourStyles.backdrop} />;
  }
  const rect = {
    x: Math.max(0, target.x - pad),
    y: Math.max(0, target.y - pad),
    width: target.width + pad * 2,
    height: target.height + pad * 2,
  };
  const isLast = stepIndex >= totalSteps - 1;
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Cuatro franjas oscuras alrededor del target = efecto "spotlight" */}
      <View pointerEvents="auto" style={[tourStyles.dim, { top: 0, left: 0, right: 0, height: rect.y }]} />
      <View pointerEvents="auto" style={[tourStyles.dim, { top: rect.y + rect.height, left: 0, right: 0, bottom: 0 }]} />
      <View pointerEvents="auto" style={[tourStyles.dim, { top: rect.y, left: 0, width: rect.x, height: rect.height }]} />
      <View pointerEvents="auto" style={[tourStyles.dim, { top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }]} />
      <View pointerEvents="none" style={[tourStyles.ring, { top: rect.y, left: rect.x, width: rect.width, height: rect.height }]} />

      <View
        pointerEvents="box-none"
        style={[
          tourStyles.bubbleWrap,
          step.placement === 'bottom'
            ? { top: rect.y + rect.height + 14 }
            : { bottom: H - rect.y + 14 },
        ]}
      >
        <View style={tourStyles.bubble}>
          <Text style={tourStyles.bubbleStep}>{stepIndex + 1} / {totalSteps}</Text>
          <Text style={tourStyles.bubbleTitle}>{step.title}</Text>
          <Text style={tourStyles.bubbleBody}>{step.body}</Text>
          <View style={tourStyles.bubbleActions}>
            <TouchableOpacity onPress={onSkip} hitSlop={8}>
              <Text style={tourStyles.bubbleSkip}>Saltar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} style={tourStyles.bubbleNextBtn} activeOpacity={0.85}>
              <Text style={tourStyles.bubbleNextText}>{isLast ? 'Entendido' : 'Siguiente'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const tourStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: 16,
  },
  bubbleWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  bubble: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  bubbleStep: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, marginBottom: 4 },
  bubbleTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  bubbleBody: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  bubbleActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  bubbleSkip: { fontSize: 13, fontWeight: '600', color: COLORS.textTertiary },
  bubbleNextBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  bubbleNextText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

function TabBar({ activeTab, setActiveTab, pickCount }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarWrap}>
      <View style={styles.tabBar}>
        <Tab
          label="Explorar"
          iconName="compass-outline"
          iconActive="compass"
          isActive={activeTab === 'explorar'}
          onPress={() => setActiveTab('explorar')}
          tourId="tab-explorar"
        />
        <Tab
          label="Mis tiendas"
          iconName="bag-outline"
          iconActive="bag"
          isActive={activeTab === 'home'}
          onPress={() => setActiveTab('home')}
          tourId="tab-home"
        />
        <Tab
          label="Mis Picks"
          iconName="bookmark-outline"
          iconActive="bookmark"
          isActive={activeTab === 'picks'}
          onPress={() => setActiveTab('picks')}
          badge={pickCount}
          tourId="tab-picks"
        />
      </View>
    </SafeAreaView>
  );
}

function Tab({ label, iconName, iconActive, isActive, onPress, badge, tourId }) {
  const color = isActive ? COLORS.accent : COLORS.textSecondary;
  const inner = (
    <>
      <View style={styles.tabIconWrap}>
        <Ionicons name={isActive ? iconActive : iconName} size={24} color={color} />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '600' : '400' }]}>
        {label}
      </Text>
    </>
  );
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.6}>
      {tourId ? <TourTarget id={tourId} style={{ alignItems: 'center' }}>{inner}</TourTarget> : inner}
    </TouchableOpacity>
  );
}
 
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  appBackgroundImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  viewContent: { flex: 1, paddingTop: 24, paddingHorizontal: 24 },
  brandHeader: { marginBottom: 20, paddingBottom: 18, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  brandName: { fontSize: 32, fontWeight: '700', color: COLORS.accent, letterSpacing: -1 },
  brandTagline: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, letterSpacing: 0.3 },
  greeting: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  title: { fontSize: 30, fontWeight: '500', color: COLORS.textPrimary, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 },
  searchCard: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 0.5,
    borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center',
    gap: 12, marginTop: 18, marginBottom: 28,
  },
  searchIconWrap: {
    backgroundColor: COLORS.accentLight, width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, paddingVertical: 4 },
  interestStoresSection: { marginBottom: 20 },
  interestCatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    marginRight: 8, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  interestCatChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  interestCatChipLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  interestCatChipLabelActive: { color: '#fff', fontWeight: '600' },
  nlSuggestRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  nlSuggestLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', marginBottom: 8 },
  interestStoreChipSm: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    marginRight: 8, minWidth: 70, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 12, color: COLORS.textSecondary, letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 12,
  },
  storeCard: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 0.5,
    borderRadius: 14, height: 80, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  storeCover: { width: 80, height: '100%', justifyContent: 'center', alignItems: 'center' },
  storeShort: { fontSize: 22, fontWeight: '700', letterSpacing: 1 },
  storeInfo: { flex: 1, paddingLeft: 14, paddingRight: 8 },
  storeName: { fontSize: 15, fontWeight: '500', color: COLORS.textPrimary },
  storeDomain: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  storeDomainText: { fontSize: 11, color: COLORS.textTertiary },

  // ── Store Grid ───────────────────────────────────────────────────────────────
  storeSectionTabs:         { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 4, marginBottom: 14, marginTop: 6 },
  storeSectionTab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  storeSectionTabActive:    { backgroundColor: COLORS.background, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  storeSectionTabText:      { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  storeSectionTabTextActive:{ color: COLORS.textPrimary, fontWeight: '700' },
  emptyStores:              { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyStoresText:          { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  // Masonry de dos columnas, estilo Pinterest
  masonryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  masonryCol: {
    flex: 1,
    gap: 10,
  },
  masonryCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  masonryBgImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  masonryBgScrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  masonryWatermark: {
    position: 'absolute',
    right: -10,
    bottom: 22,
    fontSize: 58,
    fontWeight: '800',
    letterSpacing: -1.5,
    opacity: 0.16,
    transform: [{ rotate: '-6deg' }],
  },
  masonryLogoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 2,
  },
  masonryLogoImg: {
    width: '100%',
    height: '100%',
  },
  masonryLogoInitials: {
    fontSize: 13,
    fontWeight: '700',
  },
  masonryCaptionScrim: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '52%',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  masonryCaption: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 6,
  },
  masonryCaptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  masonryCaptionDomain: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 1,
  },
  infoCard: {
    backgroundColor: COLORS.borderSoft, borderRadius: 12, padding: 14,
    flexDirection: 'row', gap: 10, marginTop: 24,
  },
  infoText: { flex: 1, fontSize: 13, color: '#5F5C58', lineHeight: 19 },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: COLORS.textPrimary, marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  picksGridContent: { paddingBottom: 30 },
  picksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pickCard: {
    width: (SCREEN.width - 48 - 12) / 2,
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 0.5,
    borderRadius: 14, overflow: 'hidden',
  },
  pickImgWrap: { aspectRatio: 4/5, backgroundColor: COLORS.borderSoft },
  pickImg: { width: '100%', height: '100%' },
  pickInfo: { padding: 10 },
  pickName: { fontSize: 13, fontWeight: '500', color: COLORS.textPrimary, lineHeight: 17 },
  pickMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 6 },
  pickDomain: { fontSize: 11, color: COLORS.textTertiary, flex: 1 },
  pickPrice: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  shareBtnText: { fontSize: 11, color: COLORS.textSecondary },
  shareCollectionBtn: { padding: 8, backgroundColor: COLORS.card, borderRadius: 20 },
  collectionVisibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  collectionVisibilityText: { fontSize: 12, color: COLORS.textTertiary, fontWeight: '500', flex: 1 },
  shareCardOffscreen: { position: 'absolute', top: -3000, left: 0 },
  shareCard: { width: 320, backgroundColor: '#fff' },
  shareCardImg: { width: 320, height: 380 },
  shareCardBody: { padding: 16 },
  shareCardBrand: { fontSize: 13, fontWeight: '800', fontStyle: 'italic', color: COLORS.accent, marginBottom: 6 },
  shareCardName: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, lineHeight: 21 },
  shareCardStore: { fontSize: 12, color: COLORS.textTertiary, flex: 1, marginRight: 8 },
  shareCardPrice: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  shareCardFooter: { backgroundColor: COLORS.background, paddingVertical: 10, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: COLORS.border },
  shareCardFooterText: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  picksHint: { fontSize: 11, color: COLORS.textTertiary, textAlign: 'center', marginTop: 16 },
  picksSearch: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 0.5,
    borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 12, height: 40,
  },
  picksSearchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, paddingVertical: 0 },
  chipsContainer: { height: 36, marginBottom: 12 },
  chipsRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingRight: 4 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: '#D8D2C8',
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', height: 28,
  },
  chipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  chipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextActive: { color: COLORS.background, fontWeight: '500' },
  chipCount: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '400' },
  chipCountActive: { color: COLORS.background, opacity: 0.7 },
  chipClear: { borderColor: COLORS.accentLight, backgroundColor: 'transparent' },
  tabBarWrap: { backgroundColor: 'transparent' },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 6,
    paddingTop: 10, paddingBottom: 10, paddingHorizontal: 8,
    backgroundColor: COLORS.surface, borderRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12,
    elevation: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  tabIconWrap: { position: 'relative' },
  tabLabel: { fontSize: 11, marginTop: 3 },
  badge: {
    position: 'absolute', top: -4, right: -10, backgroundColor: COLORS.accent,
    borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  // Search styles
  searchBarWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  searchBarInner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.borderSoft, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchBarInput: {
    flex: 1, fontSize: 15, color: COLORS.textPrimary, padding: 0,
  },
  searchBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  searchEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  searchEmptyTitle: {
    fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center',
  },
  searchEmptySubtitle: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20,
  },
  storeTabsScroll: { maxHeight: 50, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  storeTabsContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  storeTab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  storeTabText: { fontSize: 13, fontWeight: '500', color: COLORS.textPrimary },
  // Browser styles
  browserContainer: { flex: 1, backgroundColor: COLORS.background },
  browserBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  browserUrl: {
    flex: 1, backgroundColor: COLORS.borderSoft, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  browserUrlText: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '500', flex: 1, textAlign: 'center' },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  trendsSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  trendStoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderWidth: 0.5, borderColor: COLORS.border,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  trendStoreName: { fontSize: 13, fontWeight: '500', color: COLORS.textPrimary },
  trendStoreCount: { fontSize: 11, color: COLORS.textTertiary },
  trendProductCard: {
    width: 130, backgroundColor: COLORS.surface,
    borderWidth: 0.5, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden',
  },
  trendProductImg: { width: 130, height: 130 },
  trendProductInfo: { padding: 8 },
  trendProductName: { fontSize: 12, fontWeight: '500', color: COLORS.textPrimary, lineHeight: 16 },
  trendProductStore: { fontSize: 11, color: COLORS.textTertiary, marginTop: 2 },
  countryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.borderSoft, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  countryChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },

  // ── Explorar (Lista) ──────────────────────────────────────────────────────────
  explorarHeaderTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  explorarToggleBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  explorarToggle: {
    flexDirection: 'row', backgroundColor: COLORS.borderSoft, borderRadius: 20, padding: 3, gap: 2,
  },
  explorarToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18,
  },
  explorarToggleBtnActive: { backgroundColor: COLORS.textPrimary },
  explorarToggleText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  explorarToggleTextActive: { color: COLORS.surface },
  explorarList: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 30, gap: 10 },
  explorarCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 0.5, borderColor: COLORS.border,
    borderRadius: 14, padding: 10,
  },
  explorarCardImg: { width: 76, height: 76, borderRadius: 10, backgroundColor: COLORS.borderSoft },
  explorarCardImgEmpty: { justifyContent: 'center', alignItems: 'center' },
  explorarCardBody: { flex: 1 },
  explorarStoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  explorarStoreBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  explorarTrendingBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF1E8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  explorarTrendingText: { fontSize: 11, fontWeight: '600', color: COLORS.accent },
  explorarCardTitle: { fontSize: 14, fontWeight: '500', color: COLORS.textPrimary, lineHeight: 19 },
  explorarCardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginTop: 4 },
  explorarPickBtn: { padding: 6 },

  // ── Reel (Explorar pantalla completa) ────────────────────────────────────────
  reelCard: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  reelImg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
  },
  reelGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 0 },
  reelGradientTop: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 0 },
  reelInfo: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    right: 76,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 14,
    padding: 12,
  },
  reelTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 26,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reelPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.accent,
    marginTop: 6,
  },
  reelOpenBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  reelOpenBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  reelActions: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    alignItems: 'center',
    gap: 22,
  },
  reelActionBtn: { alignItems: 'center', gap: 4 },
  reelActionLabel: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  reelExitBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10,
  },
  ghost: {
    position: 'absolute', width: 120, height: 150, borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#fff', top: 0, left: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 5,
  },
});
