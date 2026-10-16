/**
 * KeyoAPI Analytics & Geo Tracker (Client SDK)
 * Lightweight (~2KB), zero dependencies, non-blocking.
 * Tracks: Visitor ID, Session ID, Country (Geo), UTM/Referrer, Pageviews, Exit Pages, and Custom Events.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  var STORAGE_VISITOR_KEY = 'keyo_vid';
  var STORAGE_SESSION_KEY = 'keyo_sid';
  var STORAGE_COUNTRY_KEY = 'keyo_country';
  var STORAGE_UTM_KEY = 'keyo_utm';

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // 1. Visitor ID (persistent across visits)
  var visitorId = '';
  try {
    visitorId = localStorage.getItem(STORAGE_VISITOR_KEY);
    if (!visitorId) {
      visitorId = 'v_' + uuid();
      localStorage.setItem(STORAGE_VISITOR_KEY, visitorId);
    }
  } catch (e) {
    visitorId = 'v_' + uuid();
  }

  // 2. Session ID (per browser tab / session)
  var sessionId = '';
  try {
    sessionId = sessionStorage.getItem(STORAGE_SESSION_KEY);
    if (!sessionId) {
      sessionId = 's_' + uuid();
      sessionStorage.setItem(STORAGE_SESSION_KEY, sessionId);
    }
  } catch (e) {
    sessionId = 's_' + uuid();
  }

  // 3. UTM & Referrer Attribution (First touch per session)
  var utm = {};
  try {
    var storedUtm = sessionStorage.getItem(STORAGE_UTM_KEY);
    if (storedUtm) {
      utm = JSON.parse(storedUtm);
    } else {
      var params = new URLSearchParams(window.location.search);
      utm = {
        source: params.get('utm_source') || params.get('ref') || '',
        medium: params.get('utm_medium') || '',
        campaign: params.get('utm_campaign') || '',
        content: params.get('utm_content') || '',
        referrer: document.referrer || '',
      };
      sessionStorage.setItem(STORAGE_UTM_KEY, JSON.stringify(utm));
    }
  } catch (e) {
    utm = { source: '', medium: '', campaign: '', content: '', referrer: document.referrer || '' };
  }

  // 4. Country Detection (Cached in session, resolved via fast free geo-API since server is on Aliyun)
  var country = 'UNKNOWN';
  try {
    country = sessionStorage.getItem(STORAGE_COUNTRY_KEY) || 'UNKNOWN';
  } catch (e) {}

  function resolveCountry(cb) {
    if (country && country !== 'UNKNOWN') {
      if (cb) cb(country);
      return;
    }
    // High-speed, public, CORS-enabled IP-country resolver
    fetch('https://api.country.is')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.country) {
          country = data.country.toUpperCase();
          try { sessionStorage.setItem(STORAGE_COUNTRY_KEY, country); } catch (e) {}
          if (cb) cb(country);
        }
      })
      .catch(function () {
        // Fallback service
        fetch('https://ipapi.co/country/')
          .then(function (r) { return r.text(); })
          .then(function (c) {
            c = (c || '').trim().toUpperCase();
            if (c && c.length === 2) {
              country = c;
              try { sessionStorage.setItem(STORAGE_COUNTRY_KEY, country); } catch (e) {}
              if (cb) cb(country);
            }
          })
          .catch(function () {
            if (cb) cb('UNKNOWN');
          });
      });
  }

  // 5. Send tracking event
  function sendEvent(eventName, eventData) {
    var payload = {
      visitor_id: visitorId,
      session_id: sessionId,
      country: country,
      path: window.location.pathname || '/',
      title: document.title || '',
      referrer: utm.referrer || '',
      utm_source: utm.source || '',
      utm_medium: utm.medium || '',
      utm_campaign: utm.campaign || '',
      event_name: eventName,
      event_data: eventData ? (typeof eventData === 'string' ? eventData : JSON.stringify(eventData)) : '',
      timestamp: Math.floor(Date.now() / 1000)
    };

    var endpoint = '/api/track';
    var jsonStr = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([jsonStr], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        keepalive: true
      }).catch(function () {});
    }
  }

  // Expose to global window
  window.keyoTrack = function (eventName, eventData) {
    if (country === 'UNKNOWN') {
      resolveCountry(function () {
        sendEvent(eventName, eventData);
      });
    } else {
      sendEvent(eventName, eventData);
    }
  };

  // 6. Track Page View
  var pageEnterTime = Date.now();
  resolveCountry(function () {
    sendEvent('page_view', {
      url: window.location.href,
      screen: window.innerWidth + 'x' + window.innerHeight,
      lang: navigator.language || ''
    });
  });

  // 7. Track Page Leave & Exit Page (Dwell time)
  var hasLeft = false;
  function trackLeave() {
    if (hasLeft) return;
    hasLeft = true;
    var duration = Math.max(1, Math.round((Date.now() - pageEnterTime) / 1000));
    sendEvent('page_leave', {
      duration_seconds: duration,
      is_exit: true
    });
  }

  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      trackLeave();
    }
  });
  window.addEventListener('pagehide', trackLeave);
  window.addEventListener('beforeunload', trackLeave);

  // 8. Auto-track High-Intent Clicks
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target) return;

    // Check link clicks
    var link = target.closest('a');
    if (link) {
      var href = link.getAttribute('href') || '';
      var text = (link.textContent || '').trim().substring(0, 50);

      if (href.includes('/sign-in') || href.includes('/register') || href.includes('/login')) {
        window.keyoTrack('click_nav_signin', { href: href, text: text });
      } else if (href.includes('/free-models')) {
        window.keyoTrack('click_free_models', { href: href, text: text });
      } else if (href.includes('/pricing') || href.includes('pricing-list')) {
        window.keyoTrack('click_pricing_cta', { href: href, text: text });
      } else if (href.startsWith('http') && !href.includes('keyoapi.xyz')) {
        window.keyoTrack('click_outbound_link', { href: href, text: text });
      }
      return;
    }

    // Check code copy button clicks
    var btn = target.closest('button');
    if (btn) {
      var btnText = (btn.textContent || '').trim().toLowerCase();
      if (btnText.includes('copy') || btnText.includes('复制')) {
        window.keyoTrack('click_copy_code', { button: btnText });
      }
    }
  }, true);

})();
