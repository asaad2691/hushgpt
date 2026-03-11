function initVoiceHotkeys() {
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || !event.altKey || event.target === promptEl) return;
    event.preventDefault();
    if (!recognitionSupported) return;
    if (recognitionMode === "mic") {
      stopRecognition();
      return;
    }
    voiceChatActive = false;
    startRecognition("mic");
  });
}
