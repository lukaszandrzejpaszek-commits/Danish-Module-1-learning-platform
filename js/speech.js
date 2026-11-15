const PIPER_MODULE_URL = "https://esm.sh/piper-tts-web@1.1.2?bundle";
const PIPER_ASSETS_URL = "https://unpkg.com/piper-tts-web@1.1.2/dist/";
const PIPER_MODEL_BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/";
const PIPER_VOICE = "da_DK-talesyntese-medium";
const PIPER_MODEL_CACHE = "danish-module-1-piper-da-dk-talesyntese-medium-v1";
const PIPER_MODEL_SIZE = 63201294;

let currentMode = "browser";
let currentRate = 1;
let currentPitch = 1;
let piperEnginePromise = null;
let piperVoiceReady = false;
let speechRequest = 0;
let activeAudio = null;
let activeAudioUrl = null;
let activeAudioDone = null;
let activeBrowserCancel = null;
let activeStatusHandler = null;
let voiceCacheWarning = null;

export function setSpeechMode(mode) {
  currentMode = mode === "piper" ? "piper" : "browser";
  cancelSpeech();
}

export function setSpeechRate(rate) {
  currentRate = Math.min(1.5, Math.max(0.6, Number(rate) || 1));
}

export function setSpeechPitch(pitch) {
  currentPitch = Math.min(2, Math.max(0.5, Number(pitch) || 1));
}

function updateSpeechStatus(key, values = {}, request = speechRequest) {
  if (request === speechRequest && typeof activeStatusHandler === "function") {
    activeStatusHandler(key, values);
  }
}

function reportCacheIssue(key, error, request) {
  voiceCacheWarning = key;
  console.warn("Could not persist the Danish Piper voice in this browser.", error);
  updateSpeechStatus(key, {}, request);
}

function createPersistentVoiceProvider() {
  let cachePromise;
  let cacheChecked = false;
  const metadata = new Map();
  const modelUrls = new Map();

  async function getCache(request) {
    if (!cacheChecked) {
      cacheChecked = true;
      if (!("caches" in window)) {
        reportCacheIssue("voiceCacheUnavailable", new Error("Cache API is unavailable"), request);
        return null;
      }
      cachePromise = caches.open(PIPER_MODEL_CACHE).catch((error) => {
        reportCacheIssue("voiceCacheUnavailable", error, request);
        return null;
      });
    }
    return cachePromise;
  }

  async function cacheResponse(cache, url, response, request) {
    if (!cache) return;
    try {
      await cache.put(url, response);
    } catch (error) {
      reportCacheIssue("voiceCacheFailed", error, request);
    }
  }

  function makeModelUrl(url, blob) {
    const modelUrl = URL.createObjectURL(blob);
    modelUrls.set(url, modelUrl);
    return modelUrl;
  }

  return {
    async fetch(url) {
      const request = speechRequest;
      if (metadata.has(url)) return metadata.get(url);
      if (modelUrls.has(url)) return modelUrls.get(url);

      const cache = await getCache(request);
      let cachedResponse = null;
      if (cache) {
        try {
          cachedResponse = await cache.match(url);
        } catch (error) {
          reportCacheIssue("voiceCacheUnavailable", error, request);
        }
      }

      if (cachedResponse) {
        if (url.endsWith(".json")) {
          const value = await cachedResponse.json();
          metadata.set(url, value);
          return value;
        }
        updateSpeechStatus("voiceCached", {}, request);
        return makeModelUrl(url, await cachedResponse.blob());
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not download the Danish Piper voice (${response.status}).`);
      }

      if (url.endsWith(".json")) {
        const value = await response.json();
        metadata.set(url, value);
        await cacheResponse(cache, url, new Response(JSON.stringify(value), {
          headers: { "Content-Type": "application/json" }
        }), request);
        return value;
      }

      const total = Number(response.headers.get("content-length")) || PIPER_MODEL_SIZE;
      const reader = response.body?.getReader();
      let blob;
      if (reader) {
        const chunks = [];
        let loaded = 0;
        let reportedPercent = -1;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          const percent = Math.min(100, Math.floor((loaded * 100) / total));
          if (percent !== reportedPercent && (percent % 5 === 0 || percent === 100)) {
            updateSpeechStatus("voiceDownloading", {
              percent,
              downloaded: (loaded / 1000000).toFixed(1),
              total: (total / 1000000).toFixed(1)
            }, request);
            reportedPercent = percent;
          }
        }
        blob = new Blob(chunks, {
          type: response.headers.get("content-type") || "application/octet-stream"
        });
      } else {
        blob = await response.blob();
        updateSpeechStatus("voiceDownloading", {
          percent: 100,
          downloaded: (blob.size / 1000000).toFixed(1),
          total: (total / 1000000).toFixed(1)
        }, request);
      }

      await cacheResponse(cache, url, new Response(blob, {
        headers: { "Content-Type": blob.type || "application/octet-stream" }
      }), request);
      return makeModelUrl(url, blob);
    },
    destroy() {
      modelUrls.forEach((url) => URL.revokeObjectURL(url));
      modelUrls.clear();
      metadata.clear();
    }
  };
}

function getPiperEngine() {
  if (!piperEnginePromise) {
    piperEnginePromise = import(PIPER_MODULE_URL)
      .then(({ PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime, HuggingFaceVoiceProvider }) => {
        return new PiperWebEngine({
          onnxRuntime: new OnnxWebRuntime({
            basePath: `${PIPER_ASSETS_URL}onnx/`,
            numThreads: 1
          }),
          phonemizeRuntime: new PhonemizeWebRuntime({
            basePath: `${PIPER_ASSETS_URL}piper/`
          }),
          voiceProvider: new HuggingFaceVoiceProvider({
            baseUrl: PIPER_MODEL_BASE_URL,
            provider: createPersistentVoiceProvider()
          })
        });
      })
      .catch((error) => {
        piperEnginePromise = null;
        throw error;
      });
  }
  return piperEnginePromise;
}

function speakWithBrowser(text, slow, language = "da") {
  const isEnglish = language === "en";
  const unavailable = isEnglish
    ? "English text-to-speech is not available in this browser."
    : "Danish text-to-speech is not available in this browser.";
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return Promise.reject(new Error(unavailable));
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const voice = isEnglish
      ? voices.find((item) => /^en-us$/i.test(item.lang)) || voices.find((item) => /^en(?:-|$)/i.test(item.lang))
      : voices.find((item) => /^da-dk$/i.test(item.lang)) || voices.find((item) => /^da(?:-|$)/i.test(item.lang));
    if (isEnglish && voices.length && !voice) {
      reject(new Error(unavailable));
      return;
    }
    utterance.lang = voice?.lang || (isEnglish ? "en-US" : "da-DK");
    utterance.rate = slow ? Math.min(currentRate, 0.75) : currentRate;
    utterance.pitch = currentPitch;
    if (voice) utterance.voice = voice;

    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (activeBrowserCancel === cancel) activeBrowserCancel = null;
      callback(value);
    };
    const cancel = () => settle(resolve);
    activeBrowserCancel = cancel;
    utterance.onend = () => settle(resolve);
    utterance.onerror = (event) => {
      settle(reject, new Error(`Speech playback failed: ${event.error || "unknown error"}.`));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function releaseActiveAudio() {
  const finish = activeAudioDone;
  activeAudioDone = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
  if (finish) finish();
}

function playPiperAudio(file, speed) {
  const url = URL.createObjectURL(file);
  const audio = new Audio(url);
  audio.playbackRate = speed;
  activeAudio = audio;
  activeAudioUrl = url;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (activeAudio === audio) {
        activeAudio = null;
        activeAudioUrl = null;
        activeAudioDone = null;
      }
      URL.revokeObjectURL(url);
      callback(value);
    };
    activeAudioDone = () => settle(resolve);
    audio.addEventListener("ended", () => settle(resolve), { once: true });
    audio.addEventListener("error", () => {
      settle(reject, new Error("The generated Piper audio could not be played."));
    }, { once: true });
    audio.play().catch((error) => settle(reject, error));
  });
}

export function cancelSpeech() {
  speechRequest += 1;
  activeStatusHandler = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const cancelBrowserSpeech = activeBrowserCancel;
  activeBrowserCancel = null;
  if (cancelBrowserSpeech) cancelBrowserSpeech();
  releaseActiveAudio();
}

export async function speakDanish(text, slow = false, onStatus = null) {
  if (!text) return;

  cancelSpeech();
  const currentRequest = speechRequest;
  activeStatusHandler = onStatus;

  if (currentMode === "browser") {
    try {
      await speakWithBrowser(text, slow);
    } finally {
      if (currentRequest === speechRequest) activeStatusHandler = null;
    }

    return;
  }

  updateSpeechStatus(voiceCacheWarning || (piperVoiceReady ? "voiceGenerating" : "voicePreparing"), {}, currentRequest);
  try {
    const engine = await getPiperEngine();
    if (currentRequest !== speechRequest) return;
    const result = await engine.generate(text, PIPER_VOICE);
    if (currentRequest !== speechRequest) return;

    piperVoiceReady = true;
    updateSpeechStatus("voicePlaying", {}, currentRequest);
    await playPiperAudio(result.file, slow ? Math.min(currentRate, 0.75) : currentRate);
  } catch (error) {
    if (currentRequest !== speechRequest) return;
    console.error("Local Danish speech failed; using browser speech instead.", error);
    releaseActiveAudio();
    updateSpeechStatus("voiceFallback", {}, currentRequest);
    try {
      await speakWithBrowser(text, slow);
    } catch (fallbackError) {
      console.error("Browser speech fallback failed.", fallbackError);
      updateSpeechStatus("voiceUnavailable", {}, currentRequest);
      throw fallbackError;
    }
  } finally {
    if (currentRequest === speechRequest) activeStatusHandler = null;
  }
}

export async function speakEnglish(text) {
  if (!text) return;
  cancelSpeech();
  await speakWithBrowser(text, false, "en");
}
