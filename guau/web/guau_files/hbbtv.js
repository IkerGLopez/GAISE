/* eslint-disable prefer-template */
/* eslint-disable prefer-const */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable func-names */
/* eslint-disable no-var */
/* eslint-disable vars-on-top */

// Polyfill LG WebOS functions EARLY to prevent errors from external scripts (e.g., Youbora)
// These functions are not available on all LG TVs, particularly older WebOS versions
(function () {
  var ua = navigator.userAgent.toLowerCase();
  var isLG = ua.indexOf("lge") !== -1 || ua.indexOf("web0s") !== -1 || ua.indexOf("webos") !== -1;

  if (isLG) {
    // Add safe no-op implementations if they don't exist
    if (typeof window.getWinOwnerAppId !== "function") {
      window.getWinOwnerAppId = function () {
        return null;
      };
    }
    if (typeof window.getPlatformInfo !== "function") {
      window.getPlatformInfo = function () {
        return {};
      };
    }
    if (typeof window.getSystemPromptStatus !== "function") {
      window.getSystemPromptStatus = function () {
        return 0;
      };
    }
  }
})();

// Initialize HbbTV
function setupHbbtv() {
  try {
    // Debug HbbTV
    if (
      navigator.userAgent.indexOf("1.2.1") !== -1 ||
      navigator.userAgent.indexOf("1.3.1") !== -1 ||
      navigator.userAgent.indexOf("1.7.1") !== -1
    ) {
      if (window.SEND_LOG) {
        window.SEND_LOG("debug", "Initializing HbbTV");
      }
      // Removed console.log for better production code
    }

    if (window.config && window.config.APP_PLATFORM === "hbbtv") {
      /**
       * consts
       */

      var KEY_MASKS = {
        MASK_CONSTANT_RED: 0x1,
        MASK_CONSTANT_GREEN: 0x2,
        MASK_CONSTANT_YELLOW: 0x4,
        MASK_CONSTANT_BLUE: 0x8,
        MASK_CONSTANT_NAVIGATION: 0x10,
        MASK_CONSTANT_PLAYBACK: 0x20,
        MASK_CONSTANT_NUMERIC: 0x100
      };

      /**
       * private methods
       */

      var getRelevantButtonsMask = function () {
        // mask includes color buttons
        var mask =
          KEY_MASKS.MASK_CONSTANT_RED + KEY_MASKS.MASK_CONSTANT_GREEN + KEY_MASKS.MASK_CONSTANT_YELLOW + KEY_MASKS.MASK_CONSTANT_BLUE;
        // and navigation
        mask += KEY_MASKS.MASK_CONSTANT_NAVIGATION;
        // add playback buttons if scene should react to them
        mask += KEY_MASKS.MASK_CONSTANT_PLAYBACK;
        // add numeric buttons if scene should react to them
        mask += KEY_MASKS.MASK_CONSTANT_NUMERIC;
        // return calculated button mask
        return mask;
      };

      var setKeyset = function (app, mask) {
        try {
          app.privateData.keyset.setValue(mask);
        } catch (e) {
          // try as per OIPF DAE v1.1
          try {
            app.private.keyset.setValue(mask);
          } catch (ee) {
            // catch the error while setting keyset value
          }
        }
      };

      var getBroadcastObject = function () {
        var broadcastObj =
          document.getElementById("broadcastVideo") ||
          document.getElementById("video") ||
          document.querySelector('object[type="video/broadcast"]');

        if (!broadcastObj) {
          try {
            broadcastObj = document.createElement("object");
            broadcastObj.id = "broadcastVideo";
            broadcastObj.type = "video/broadcast";
            broadcastObj.style.cssText = "width:0;height:0;visibility:hidden";

            // Verificar que document.body existe antes de agregar
            if (document.body) {
              document.body.appendChild(broadcastObj);
            } else {
              window.SEND_LOG("warn", "HbbTV: document.body no disponible para crear broadcastObject");
              return null;
            }
          } catch (e) {
            window.SEND_LOG("error", "HbbTV: Error creando broadcastObject - " + (e.name || "Error") + ": " + (e.message || e.toString()));
            return null;
          }
        }
        return broadcastObj;
      };

      /**
       * initailize hbbtv
       */

      // attempt to acquire the Application object
      var appManager = document.getElementById("applicationManager") || document.getElementById("appMan");
      var appObject = null;

      // Check if getOwnerApplication exists before calling it
      if (appManager && typeof appManager.getOwnerApplication === "function") {
        appObject = appManager.getOwnerApplication(document);
      }

      // check if Application object was a success
      if (!appObject) {
        // eslint-disable-next-line no-console
        throw new Error("error acquiring the Application object!");
      } else {
        appObject.show();
        setKeyset(appObject, getRelevantButtonsMask());
        window.broadcastObject = getBroadcastObject();

        if (window.broadcastObject) {
          try {
            // 1. Primero intentamos silenciar
            if (typeof window.broadcastObject.setMute === "function") {
              try {
                window.broadcastObject.setMute(true);
                window.isMutedByApp = true;
                window.SEND_LOG("debug", "HbbTV: Audio silenciado vía setMute");
              } catch (eMute) {
                // Ignore mute error
              }
            } else if (window.broadcastObject.audio && typeof window.broadcastObject.audio.volume !== "undefined") {
              // Algunas implementaciones usan un objeto audio
              window.broadcastObject.audio.volume = 0;
              window.SEND_LOG("debug", "HbbTV: Audio silenciado vía objeto audio");
            }

            // 2. Detener la transmisión usando el método estándar HbbTV/OIPF
            // bindToCurrentChannel() detiene la reproducción sin liberar el objeto
            let stopped = false;
            if (typeof window.broadcastObject.bindToCurrentChannel === "function") {
              try {
                window.broadcastObject.bindToCurrentChannel();
                stopped = true;
                window.SEND_LOG("debug", "HbbTV: Transmisión detenida con bindToCurrentChannel()");
              } catch (eBind) {
                // SecurityError es esperado en algunos dispositivos LG, el fallback a stop() funciona correctamente
                window.SEND_LOG("debug", "HbbTV: bindToCurrentChannel() no disponible, usando stop() fallback.");
              }
            }

            if (!stopped && typeof window.broadcastObject.stop === "function") {
              // Fallback para implementaciones que no soportan bindToCurrentChannel o fallaron (SecurityError)
              try {
                window.broadcastObject.stop();
                window.SEND_LOG("debug", "HbbTV: Transmisión detenida con stop() (fallback)");
              } catch (eStop) {
                window.SEND_LOG("error", "HbbTV: stop() also failed: " + (eStop.message || eStop.toString()));
              }
            }
          } catch (e) {
            // Capturar el tipo específico de error para mejor debugging
            var errorType = e.name || "Error";
            var errorMessage = e.message || e.toString();
            var errorParts = ["Error al manejar la transmisión HbbTV: ", errorType];

            // Añadir detalles adicionales si están disponibles
            if (errorMessage && errorMessage !== errorType) {
              errorParts.push(" - ", errorMessage);
            }

            if (window.SEND_LOG) {
              window.SEND_LOG("error", errorParts.join(""));
            }
          }
        }
      }
    }
  } catch (e) {
    var errorMsg = e.stack || e.message || e.toString();
    if (window.SEND_LOG) {
      window.SEND_LOG("error", errorMsg);
    }
    // this is not an HbbTV client, catch the error
  }
}

// HbbTV Radio functionality is now in hbbtv-radio.js

// Initialize HbbTV
function initializeHbbTv() {
  setupHbbtv();
}

// Cargar el script de la radio solo en plataforma HbbTV o si hay parámetros de radio
var shouldLoadRadioScript =
  window.config &&
  window.config.APP_PLATFORM === "hbbtv" &&
  window.location.search.indexOf("timer=") !== -1 &&
  window.location.search.indexOf("station=") !== -1 &&
  window.config.APP_NAME === "guau";

if (shouldLoadRadioScript) {
  var radioScript = document.createElement("script");
  // Get the base path from the current script (hbbtv.js)
  var currentScript = document.currentScript || document.querySelector('script[src*="hbbtv.js"]');
  var basePath = currentScript ? currentScript.src.replace(/hbbtv\.js.*$/, "") : "/js/";
  radioScript.src = basePath + "hbbtv-radio.js";
  radioScript.onload = function () {
    // Initialize radio functionality after the script has loaded
    if (typeof window.initHbbTvRadio === "function") {
      if (document.body) {
        window.initHbbTvRadio();
      } else {
        // Wait for DOM to be ready if body doesn't exist yet
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            window.initHbbTvRadio();
          });
        } else {
          // Fallback: try on next tick
          setTimeout(function () {
            if (document.body) {
              window.initHbbTvRadio();
            } else {
              window.SEND_LOG("error", "HbbTV Radio: document.body still not available");
            }
          }, 0);
        }
      }
    }
  };
  radioScript.onerror = function () {
    window.SEND_LOG("error", "HbbTV Radio: Failed to load hbbtv-radio.js");
  };
  document.head.appendChild(radioScript);
}

if (window.document.readyState === "complete") {
  initializeHbbTv();
} else {
  window.addEventListener("load", initializeHbbTv);
  window.addEventListener("unload", function () {
    try {
      if (window.broadcastObject) {
        // Restaurar el sonido si la aplicación lo silenció
        if (window.isMutedByApp) {
          if (typeof window.broadcastObject.setMute === "function") {
            window.broadcastObject.setMute(false);
            window.SEND_LOG("debug", "HbbTV: Audio restaurado al salir");
          } else if (window.broadcastObject.audio && typeof window.broadcastObject.audio.volume !== "undefined") {
            window.broadcastObject.audio.volume = 1.0;
          }
        }

        // Intentar restaurar el canal de broadcast explícitamente
        if (typeof window.broadcastObject.bindToCurrentChannel === "function") {
          try {
            window.broadcastObject.bindToCurrentChannel();
            window.SEND_LOG("debug", "HbbTV: Canal broadcast restaurado con bindToCurrentChannel()");
          } catch (eBind) {
            window.SEND_LOG("debug", "HbbTV: Error al restaurar canal (bindToCurrentChannel): " + (eBind.message || eBind.toString()));
          }
        }

        // Para Hisense, asegurarse de liberar recursos
        if (navigator.userAgent.toLowerCase().indexOf("hisense") !== -1) {
          if (typeof window.broadcastObject.release === "function") {
            window.broadcastObject.release();
            window.SEND_LOG("debug", "HbbTV: Recursos liberados al salir (Hisense)");
          }
        }

        // Algunos dispositivos pueden necesitar reiniciar la transmisión explicitamente con play
        // Aunque bindToCurrentChannel debería ser suficiente, play() asegura el estado 'playing'
        if (typeof window.broadcastObject.play === "function") {
          try {
            window.broadcastObject.play(1); // 1 = PL_NORMAL
            window.SEND_LOG("debug", "HbbTV: Transmisión reiniciada al salir (play)");
          } catch (ePlay) {
            // Si falla play, es posible que binToCurrentChannel ya haya tomado el control o el objeto ya no sea válido
            window.SEND_LOG("debug", "HbbTV: Error en play() al salir: " + (ePlay.message || ePlay.toString()));
          }
        }
      }
    } catch (e) {
      var errorParts = ["Error durante la limpieza HbbTV: ", e.message || e.toString()];
      if (window.SEND_LOG) {
        window.SEND_LOG("error", errorParts.join(""));
      }
    }
  });
}
