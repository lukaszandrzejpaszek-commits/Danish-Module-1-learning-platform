let currentRate = 1;
let currentPitch = 1;

export function setSpeechRate(rate) {
  currentRate = Math.min(1.5, Math.max(0.6, Number(rate) || 1));
}

export function setSpeechPitch(pitch) {
  currentPitch = Math.min(2, Math.max(0.5, Number(pitch) || 1));
}

export function speakDanish(text, slow = false) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return Promise.reject(new Error("Danish text-to-speech is not available in this browser."));
  }
  window.speechSynthesis.cancel();
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    utterance.lang = "da-DK";
    utterance.rate = slow ? Math.min(currentRate, 0.75) : currentRate;
    utterance.pitch = currentPitch;
    const danishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("da"));
    if (danishVoice) utterance.voice = danishVoice;
    utterance.onend = resolve;
    utterance.onerror = (event) => reject(new Error(`Speech playback failed: ${event.error || "unknown error"}`));
    window.speechSynthesis.speak(utterance);
  });
}
