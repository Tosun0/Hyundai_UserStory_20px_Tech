history.scrollRestoration = "manual";

const resetScrollPosition = () => {
  const reset = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  reset();
  window.requestAnimationFrame(reset);
  window.setTimeout(reset, 100);
};

const resetTimers = [0, 50, 150, 300, 600, 1200, 2400].map((delay) => window.setTimeout(resetScrollPosition, delay));
const cancelResetGuard = () => resetTimers.forEach((timer) => window.clearTimeout(timer));

["wheel", "touchstart", "pointerdown", "keydown"].forEach((eventName) => {
  window.addEventListener(eventName, cancelResetGuard, { once: true, capture: true, passive: true });
});

window.addEventListener("beforeunload", resetScrollPosition);
window.addEventListener("pagehide", resetScrollPosition);
window.addEventListener("pageshow", resetScrollPosition);
window.addEventListener("load", resetScrollPosition, { once: true });
