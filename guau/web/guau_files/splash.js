/* eslint-disable prefer-template */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable func-names */
/* eslint-disable vars-on-top */
/* eslint-disable no-plusplus */
/* eslint-disable no-var */

(function () {
  /**
   * consts
   */

  var DELAY_VIDEO_SPLASH = 1000;

  var SAFE_SPLASH_DELAY = 5000;

  var SPLASH_APP_MODES = ["tv" /* , "web" */];

  /**
   * state
   */

  var SPLASH_ALREADY_PLAYED = false;

  /**
   * helpers
   */

  function executeOnLoad(fn, fallbackFn) {
    function exec(cb) {
      if (!SPLASH_ALREADY_PLAYED) {
        SPLASH_ALREADY_PLAYED = true;
        cb();
      }
    }
    if (document.readyState === "complete") {
      exec(fn);
    } else {
      window.addEventListener("load", function () {
        exec(fn);
      });
    }
    setTimeout(function () {
      exec(fallbackFn);
    }, SAFE_SPLASH_DELAY);
  }

  function releaseVideo(splash) {
    if (splash) {
      var video = splash.querySelector("video");
      if (video) {
        if (!video.paused) {
          video.pause();
        }
        video.removeAttribute("src");
        video.load();
      }
    }
  }

  function isOldHbbtv(ua) {
    const match = ua.match(/hbbtv\/(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      const [major, minor, patch] = match.slice(1).map(Number);
      const versionAsNumber = major * 10000 + minor * 100 + patch;
      return versionAsNumber < 10501; // HbbTV < 1.5.1
    }
    return true;
  }

  function isSplashVideoEnabled() {
    if (!window.config || !window.config.SPLASH_VIDEO) {
      return false;
    }
    var ua = navigator.userAgent.toLowerCase();
    if (ua.includes("hbbtv") && isOldHbbtv(ua)) {
      return false;
    }
    for (var i = 0; i < SPLASH_APP_MODES.length; i++) {
      if (SPLASH_APP_MODES[i] === window.config.APP_MODE) {
        return true;
      }
    }
    return false;
  }

  function getSearchParams(queryString) {
    var params = {};
    var queries = queryString.substring(1).split("&");
    for (var i = 0; i < queries.length; i++) {
      var pair = queries[i].split("=");
      params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
    }
    return params;
  }

  function getTizenVersion(ua) {
    var match = ua.match(/tizen[/\s]?([0-9.]+)/i);
    return match ? match[1] : null;
  }

  function isSamsungOneUI(ua) {
    var version = getTizenVersion(ua);
    if (!version) return false;
    var major = parseInt(version.split(".")[0], 10);
    return major >= 7; // One UI llegó con Tizen 7+
  }

  /**
   * splash initialization
   */

  var alreadyRemoved = false;

  var splash = document.getElementById("splash");

  var removeSplash = function () {
    if (!alreadyRemoved) {
      delete window.document.documentElement.dataset.splash;
      window.config.IS_SPLASH_PLAYING = false;
      window.dispatchEvent(new CustomEvent("splash-ended"));
      alreadyRemoved = true;
      splash.classList.remove("visible");
      splash.setAttribute("aria-hidden", "true");
      setTimeout(function () {
        if (splash) {
          splash.remove();
        }
      }, 1000);
      releaseVideo(splash);
    }
  };
  try {
    // Initialize window.config if it doesn't exist
    if (!window.config) {
      window.config = {};
    }

    // platform
    var htmlElement = document.documentElement;
    var searchParams = getSearchParams(window.location.search);
    var queryAppPlatform = searchParams.app_platform || "";
    var appPlatformString = (queryAppPlatform + " " + window.navigator.userAgent).toLowerCase();
    var ua = window.navigator.userAgent.toLowerCase();
    var tvPlatform = null;
    if (appPlatformString.indexOf("hbbtv") !== -1) {
      tvPlatform = "hbbtv";
    } else if (appPlatformString.indexOf("tizen") !== -1) {
      tvPlatform = "tizen";
    } else if (appPlatformString.indexOf("web0s") !== -1) {
      tvPlatform = "webos";
    } else if ((appPlatformString.indexOf("hisense") !== -1 || appPlatformString.indexOf("vidaa") !== -1) && !tvPlatform) {
      tvPlatform = "hisense";
    }
    window.config.APP_MODE = tvPlatform ? "tv" : "web";
    if (window.config.APP_MODE === "web") {
      var isMobile = window.matchMedia("(pointer:coarse)").matches;
      window.config.APP_PLATFORM = isMobile ? "mobile" : "desktop";
    } else {
      window.config.APP_PLATFORM = tvPlatform;
    }
    htmlElement.dataset.mode = window.config.APP_MODE;
    if (window.config.APP_PLATFORM) {
      htmlElement.dataset.platform = window.config.APP_PLATFORM;
    }
    window.config.KEY_EVENT_NAME = "keydown";
    // manufacturer
    if (ua) {
      if (ua.indexOf("samsung") !== -1) {
        window.config.DEVICE_MANUFACTURER = "samsung";
      } else if (ua.indexOf("hisense") !== -1) {
        window.config.DEVICE_MANUFACTURER = "hisense";
      } else if (ua.indexOf("sony") !== -1) {
        window.config.DEVICE_MANUFACTURER = "sony";
      } else if (ua.indexOf("philips") !== -1) {
        window.config.DEVICE_MANUFACTURER = "philips";
      } else if (ua.indexOf("lge") !== -1) {
        window.config.DEVICE_MANUFACTURER = "lg";
      }
      // hhbtv
      if (window.config.APP_PLATFORM === "hbbtv") {
        var hbbtvVersionParts = ua.match(/hbbtv\/(\d+\.\d+\.\d+)/);
        if (hbbtvVersionParts && hbbtvVersionParts[1]) {
          var hbbtvVersion = hbbtvVersionParts[1];
          if (hbbtvVersion) {
            window.config.APP_PLATFORM_VERSION = hbbtvVersion;
            if (window.config.DEVICE_MANUFACTURER === "samsung" && !isSamsungOneUI(ua) && hbbtvVersion === "1.4.1") {
              window.config.KEY_EVENT_NAME = "keypress";
            }
          }
        }
      }
    }
    // splash video
    if (isSplashVideoEnabled()) {
      window.document.documentElement.dataset.splash = "true";
      window.config.IS_SPLASH_PLAYING = true;
      executeOnLoad(function () {
        if (splash) {
          var isVideoPlaying = true;
          var isPageLoaded = window.document.readyState === "complete";
          var video = splash.appendChild(document.createElement("video"));
          video.muted = false;
          video.src = window.config.SPLASH_VIDEO;
          video.addEventListener("loadeddata", function () {
            video.classList.add("visible");
          });
          video.addEventListener("canplay", function () {
            video.classList.add("visible");
            video.addEventListener("ended", function () {
              isVideoPlaying = false;
              if (!isPageLoaded) {
                video.removeAttribute("src");
              } else {
                setTimeout(removeSplash, DELAY_VIDEO_SPLASH);
              }
            });
            setTimeout(function () {
              try {
                video.play().catch(function (e1) {
                  // eslint-disable-next-line no-console
                  console.error("error trying to play splash video, re-trying with muted: " + e1.message);
                  video.muted = true;
                  video.play().catch(function (e2) {
                    // eslint-disable-next-line no-console
                    console.error("error trying to play muted splash video: " + e2.message);
                    removeSplash();
                  });
                });
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error("exception trying to play muted splash video: " + e.message);
                removeSplash();
              }
            }, DELAY_VIDEO_SPLASH);
          });
          window.addEventListener("load", function () {
            isPageLoaded = true;
            if (!isVideoPlaying) {
              setTimeout(removeSplash, DELAY_VIDEO_SPLASH);
            }
          });
        }
      }, removeSplash);
    } else {
      window.config.IS_SPLASH_PLAYING = false;
      window.addEventListener("load", removeSplash);
    }
  } catch (e) {
    var errorMsg = "error processing splash:" + e.message;
    window.SEND_LOG("error", errorMsg);
    // eslint-disable-next-line no-console
    console.error(errorMsg);
    removeSplash();
  }
})();
