!(function () {
  let init = false;

  let e = /[\?&]OVERLAY_WS=([^&]+)/.exec(location.href),
    n = null,
    r = [],
    l = 0,
    t = {},
    s = {},
    i = null,
    o = !1;
  if (e) {
    i = (e) => {
      r ? r.push(e) : n.send(JSON.stringify(e));
    };
    (function l() {
      (n = new WebSocket(e[1])),
        n.addEventListener('error', (e) => {
          console.error(e);
        }),
        n.addEventListener('open', () => {
          console.log('Connected!');
          let e = r;
          r = null;
          for (let n of e) i(n);
        }),
        n.addEventListener('message', (e) => {
          try {
            e = JSON.parse(e.data);
          } catch (n) {
            return void console.error('Invalid message received: ', e);
          }
          void 0 !== e.rseq && t[e.rseq]
            ? (t[e.rseq](e), delete t[e.rseq])
            : a(e);
        }),
        n.addEventListener('close', () => {
          (r = []),
            console.log('Trying to reconnect...'),
            setTimeout(() => {
              l();
            }, 300);
        });
    })();
  } else {
    i = (e, n) => {
      r ? r.push([e, n]) : OverlayPluginApi.callHandler(JSON.stringify(e), n);
    };
    (function e() {
      if (!window.OverlayPluginApi || !window.OverlayPluginApi.ready)
        return void setTimeout(e, 300);
      let n = r;
      (r = null), (window.__OverlayCallback = a);
      for (let [e, r] of n) i(e, r);
    })();
  }

  function a(e) {
    if (s[e.type]) for (let n of s[e.type]) n(e);
  }

  window.addOverlayListener = (e, n) => {
    o &&
      s[e] &&
      console.warn(`Listener for ${e} registered after events began.`);
    s[e] || (s[e] = []);
    s[e].push(n);
  };

  window.removeOverlayListener = (e, n) => {
    if (s[e]) {
      let r = s[e],
        l = r.indexOf(n);
      l > -1 && r.splice(l, 1);
    }
  };

  window.callOverlayHandler = (e) => {
    let r;
    return (
      n
        ? ((e.rseq = l++),
          (r = new Promise((n) => {
            t[e.rseq] = n;
          })),
          i(e))
        : (r = new Promise((n) => {
            i(e, (e) => {
              n(null == e ? null : JSON.parse(e));
            });
          })),
      r
    );
  };

  window.startOverlayEvents = () => {
    o = !1;
    i({ call: 'subscribe', events: Object.keys(s) });
  };

  function handleOverlayEvent(event) {
    const eventType = event.type;
    if (listeners[eventType]) {
      for (const cb of listeners[eventType]) {
        cb(event);
      }
    }
  }

  // Connexion à FFXIV Recorder en tant que proxy WebSocket
  let recorderSocket = null;

  function sendLogLine(event) {
    if (recorderSocket && recorderSocket.readyState === WebSocket.OPEN) {
      recorderSocket.send(JSON.stringify(event));
    }
  }

  function sendCombatData(event) {
    if (recorderSocket && recorderSocket.readyState === WebSocket.OPEN) {
      recorderSocket.send(JSON.stringify(event));
    }
  }

  function connectToRecorder() {
    recorderSocket = new WebSocket('ws://localhost:13337');

    recorderSocket.onopen = () => {
      console.log('Connected to FFXIV Recorder');

      // Transfert des événements OverlayPlugin vers FFXIV Recorder
      window.removeEventListener('LogLine', sendLogLine);
      window.addOverlayListener('LogLine', sendLogLine);

      window.removeEventListener('CombatData', sendCombatData);
      window.addOverlayListener('CombatData', sendCombatData);

      console.log("Démarrage de l'écoute des logs ACT");

      if (!init) {
        console.log("Init");
        window.startOverlayEvents();
        init = true;
      }
    };

    recorderSocket.onclose = () => {
      console.warn('Recorder disconnected, retrying in 10s...');
      setTimeout(connectToRecorder, 10000); // Reconnect
    };

    recorderSocket.onerror = (e) => {
      console.error('Recorder socket error:', e);
      recorderSocket.close(); // Force reconnect
    };
  }

  connectToRecorder();
})();
