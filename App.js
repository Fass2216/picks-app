import { useState, useRef, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
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
  Image,
  Dimensions,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
 
// ============ ANALYTICS (PostHog vía REST API + DEBUG) ============
const POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_KEY = 'phc_nKmex7vEsBpDfpePezdS8HHDXsFMea9ubQemfdfY8deC';
const DEBUG_ANALYTICS = false;

// ============ BACKEND DE NOTIFICACIONES ============
const BACKEND_URL = 'https://picks-backend-30ur.onrender.com';

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
  { name: 'Austera', domain: 'austera.com.uy', url: 'https://www.austera.com.uy', bg: '#1A1A1A', fg: '#FFFFFF', short: 'AU' },
  { name: 'Caro Criado', domain: 'carocriado.com', url: 'https://www.carocriado.com', bg: '#D4A4A4', fg: '#FFFFFF', short: 'CC' },
  { name: 'Lolita', domain: 'lolita.com.uy', url: 'https://www.lolita.com.uy', bg: '#DB6B8A', fg: '#FFFFFF', short: 'LO' },
  { name: 'Decathlon', domain: 'decathlon.com.uy', url: 'https://www.decathlon.com.uy', bg: '#0082C3', fg: '#FFFFFF', short: 'DC' },
  { name: 'Kiabi', domain: 'kiabi.es', url: 'https://www.kiabi.es', bg: '#FF5B5C', fg: '#FFFFFF', short: 'KI' },
  { name: 'La Cancha', domain: 'lacancha.uy', url: 'https://www.lacancha.uy', bg: '#007F3E', fg: '#FFFFFF', short: 'LC' },
  { name: 'Tienda Inglesa', domain: 'tiendainglesa.com.uy', url: 'https://www.tiendainglesa.com.uy', bg: '#0033A0', fg: '#FFFFFF', short: 'TI' },
  { name: 'Multiahorro', domain: 'multiahorrohogar.com.uy', url: 'https://www.multiahorrohogar.com.uy', bg: '#E2231A', fg: '#FFFFFF', short: 'MA' },
];
 
const SCREEN = Dimensions.get('window');
const URL_BAR_OFFSET = 90;
 
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
  setInterval(removeAppMeta, 1500);
 
  // Forzar todo a _self y bloquear que se abra la app nativa
  function fixTargets() {
    var links = document.querySelectorAll('a[target="_blank"]');
    for (var i = 0; i < links.length; i++) links[i].target = '_self';
    var forms = document.querySelectorAll('form[target="_blank"]');
    for (var i = 0; i < forms.length; i++) forms[i].target = '_self';
  }
  fixTargets();
  setInterval(fixTargets, 1000);
 
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
 
  function findProductInfo(img) {
    var src = getImageSrc(img);
    var title = img.alt || '';
    var price = '';
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
 
    if (!link) link = window.location.href;
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
 
  // Cargar picks y tiendas custom guardados al arrancar
  useEffect(() => {
    (async () => {
      try {
        const sp = await AsyncStorage.getItem('picks-v1');
        if (sp) setPicks(JSON.parse(sp));
        const sc = await AsyncStorage.getItem('customStores-v1');
        if (sc) setCustomStores(JSON.parse(sc));
      } catch (e) {}
      setLoaded(true);
      // Registrar dispositivo para notificaciones (sin bloquear la UI)
      registerForNotifications();
    })();
    track('app_opened');
  }, []);
 
  // Persistir picks cuando cambian
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('picks-v1', JSON.stringify(picks)).catch(() => {});
  }, [picks, loaded]);
 
  // Persistir tiendas custom cuando cambian
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('customStores-v1', JSON.stringify(customStores)).catch(() => {});
  }, [customStores, loaded]);
 
  const ghostAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ghostScale = useRef(new Animated.Value(1)).current;
  const ghostOpacity = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
 
  function openUrl(url) {
    setCurrentPageTitle('');
    setCurrentBrowserUrl(url);
    setBrowserUrl(url);
  }
  function closeBrowser() {
    setBrowserUrl(null);
    setCurrentBrowserUrl(null);
  }
  function changeTab(tab) {
    setBrowserUrl(null);
    setCurrentBrowserUrl(null);
    setActiveTab(tab);
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
      return STORES.some(s => s.domain === reg) || customStores.some(s => s.domain === reg);
    } catch (e) { return false; }
  }
 
  function addCurrentToFavorites() {
    const url = getActiveBrowserUrl();
    if (!url) return;
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return; }
    const reg = getRegisteredDomain(domain);
    if (STORES.some(s => s.domain === reg) || customStores.some(s => s.domain === reg)) {
      showToast('Ya está en tus tiendas');
      return;
    }
    const titleSource = currentPageTitle || reg.split('.')[0];
    const cleanName = titleSource.split(/[|·\-–—]/)[0].trim().slice(0, 25) || reg.split('.')[0];
    const color = CUSTOM_COLORS[customStores.length % CUSTOM_COLORS.length];
    // Guardar la URL ACTUAL del WebView, no la inicial (asi conserva el path de pais, locale, etc.)
    const newStore = {
      name: cleanName,
      domain: reg,
      url: url.split('#')[0],
      bg: color.bg,
      fg: color.fg,
      short: getInitials(cleanName),
      custom: true,
    };
    setCustomStores(prev => [...prev, newStore]);
    track('custom_store_added', { store: newStore.name, domain: newStore.domain });
    showToast('Agregada a destacadas');
  }
 
  function removeCustomStore(domain) {
    const removed = customStores.find(s => s.domain === domain);
    if (removed) track('custom_store_removed', { store: removed.name, domain: removed.domain });
    setCustomStores(prev => prev.filter(s => s.domain !== domain));
    showToast('Tienda eliminada');
  }
 
  function showToast(msg) {
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(''));
  }
 
  async function registerForNotifications() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const push_token = tokenData.data;
      const device_id = await getOrCreateDeviceId();
      await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, push_token }),
      });
    } catch (e) {
      // Silencioso — las notificaciones son opcionales
    }
  }

  async function syncPickToBackend(pick) {
    try {
      const device_id = await getOrCreateDeviceId();
      await fetch(`${BACKEND_URL}/api/picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, pick }),
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
        showToast('Ya estaba en tus picks');
        return prev;
      }
      track('pick_saved', { store: getStoreDisplayName(domain), domain: domain, has_price: !!data.price });
      showToast('Guardado en Mis picks');
      syncPickToBackend(pick); // registrar en backend para monitoreo
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
 
      <View style={styles.content}>
        {browserUrl ? (
          <BrowserView
            url={browserUrl}
            onClose={closeBrowser}
            onMessage={handleWebMessage}
            isFavorite={isCurrentFavorite()}
            onToggleFavorite={addCurrentToFavorites}
            onUrlChange={setCurrentBrowserUrl}
          />
        ) : activeTab === 'home' ? (
          <HomeView
            onOpenUrl={openUrl}
            customStores={customStores}
            onRemoveCustom={removeCustomStore}
          />
        ) : (
          <PicksView
            picks={picks}
            onRemove={(id) => {
              const removed = picks.find(p => p.id === id);
              if (removed) track('pick_removed', { store: getStoreDisplayName(removed.domain), domain: removed.domain });
              setPicks(prev => prev.filter(p => p.id !== id));
              removePickFromBackend(id);
            }}
            onOpen={(url) => {
              const opened = picks.find(p => p.url === url);
              if (opened) track('pick_opened', { store: getStoreDisplayName(opened.domain), domain: opened.domain });
              setActiveTab('home');
              openUrl(url);
            }}
          />
        )}
      </View>
 
      <TabBar
        activeTab={browserUrl ? 'home' : activeTab}
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
    </SafeAreaView>
  );
}
 
function HomeView({ onOpenUrl, customStores, onRemoveCustom }) {
  const [input, setInput] = useState('');
 
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
 
  function go() {
    const raw = input.trim();
    if (!raw) return;
    Keyboard.dismiss();
    let url;
    let searchType = 'url';
    if (/^https?:\/\//.test(raw)) {
      url = raw;
      searchType = 'direct_url';
    } else if (/\.[a-z]{2,}/i.test(raw) && !raw.includes(' ')) {
      url = 'https://' + raw;
      searchType = 'domain';
    } else {
      url = 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(raw);
      searchType = 'google_shopping';
      track('search_performed', { query: raw.toLowerCase(), query_length: raw.length });
    }
    if (searchType !== 'google_shopping') {
      track('search_url_entered', { type: searchType });
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
      <View style={styles.brandHeader}>
        <Text style={styles.brandName}>Picks</Text>
        <Text style={styles.brandTagline}>Tu wishlist universal</Text>
      </View>
 
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
            onPress={() => { track('store_opened', { store: store.name, type: 'predefined' }); onOpenUrl(store.url); }}
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
 
      {customStores && customStores.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Mis tiendas</Text>
          <View style={{ gap: 10 }}>
            {customStores.map((store) => (
              <TouchableOpacity
                key={store.domain}
                style={styles.storeCard}
                onPress={() => { track('store_opened', { store: store.name, type: 'custom' }); onOpenUrl(store.url); }}
                onLongPress={() => confirmRemove(store)}
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
          <Text style={[styles.picksHint, { marginTop: 8 }]}>Mantené presionada una tienda tuya para eliminarla</Text>
        </>
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
          en Mis picks. Tocá la estrella arriba en cualquier web para agregarla
          a tus tiendas destacadas.
        </Text>
      </View>
    </ScrollView>
  );
}
 
function BrowserView({ url, onClose, onMessage, isFavorite, onToggleFavorite, onUrlChange }) {
  const [currentUrl, setCurrentUrl] = useState(url);
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
        <TouchableOpacity onPress={onToggleFavorite} hitSlop={8}>
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={20}
            color={isFavorite ? COLORS.accent : COLORS.textPrimary}
          />
        </TouchableOpacity>
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
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
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
 
function PicksView({ picks, onRemove, onOpen }) {
  const [query, setQuery] = useState('');
  const [activeStore, setActiveStore] = useState(null);
 
  // Auto-generar chips agrupando por nombre comercial (no por dominio raw)
  const storeMap = {};
  picks.forEach(p => {
    const key = getRegisteredDomain(p.domain);
    const name = getStoreDisplayName(p.domain);
    if (!storeMap[key]) storeMap[key] = { key, name, count: 0 };
    storeMap[key].count += 1;
  });
  const stores = Object.values(storeMap).sort((a, b) => b.count - a.count);
 
  const filtered = picks.filter(p => {
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
 
      {picks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyTitle}>Acá van tus picks</Text>
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
                        <Text style={styles.pickDomain} numberOfLines={1}>{getStoreDisplayName(p.domain)}</Text>
                        {p.price ? <Text style={styles.pickPrice} numberOfLines={1}>{p.price}</Text> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.picksHint}>Tocá para abrir en la tienda · Mantené presionado para eliminar</Text>
            </ScrollView>
          )}
        </>
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
  container: { flex: 1, backgroundColor: COLORS.background },
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
  tabBarWrap: { backgroundColor: COLORS.background, borderTopWidth: 0.5, borderTopColor: COLORS.border },
  tabBar: { flexDirection: 'row', paddingTop: 8, paddingHorizontal: 12, paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabIconWrap: { position: 'relative' },
  tabLabel: { fontSize: 11, marginTop: 2 },
  badge: {
    position: 'absolute', top: -4, right: -10, backgroundColor: COLORS.accent,
    borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
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
  ghost: {
    position: 'absolute', width: 120, height: 150, borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#fff', top: 0, left: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 12, zIndex: 100,
  },
  ghostImg: { width: '100%', height: '100%' },
  toast: {
    position: 'absolute', bottom: 120, alignSelf: 'center',
    backgroundColor: '#2A2826', paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 200,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
 