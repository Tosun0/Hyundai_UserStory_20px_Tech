export function initScrollRouter({ onWheel, onSwipe }) {
  let touchStartX = 0;
  let touchStartY = 0;

  // macOS trackpad sends many low-deltaY inertia events after the real gesture.
  // We track the peak |deltaY| of the current gesture so we can recognise and
  // skip the decaying tail (inertia / momentum phase).
  let peakDelta = 0;
  let inertiaFlushTimer;

  // 쿨다운: setTimeout 방식(이벤트마다 리셋됨) 대신 타임스탬프 방식 사용.
  // 이벤트가 아무리 많이 와도 쿨다운 종료 시각은 스텝을 취할 때 한 번만 설정된다.
  let cooldownUntil = 0;
  const COOLDOWN_MS = 500;

  function handleWheel(event) {
    const delta = event.deltaY;
    if (!delta) return;

    const absDelta = Math.abs(delta);

    // Flush peak tracker after 80 ms of silence (new gesture starting).
    window.clearTimeout(inertiaFlushTimer);
    inertiaFlushTimer = window.setTimeout(() => { peakDelta = 0; }, 80);

    // If this event is significantly smaller than the peak we saw for this
    // gesture it is a macOS inertia remnant → swallow it silently.
    // 타이머를 리셋하지 않는다.
    if (peakDelta > 0 && absDelta < peakDelta * 0.35) {
      event.preventDefault();
      return;
    }

    // Record the peak delta for this gesture.
    if (absDelta > peakDelta) peakDelta = absDelta;

    // 쿨다운 중이면 소비만 하고 리턴. 타이머를 연장하지 않는다.
    const now = performance.now();
    if (now < cooldownUntil) {
      event.preventDefault();
      return;
    }

    const result = onWheel(Math.sign(delta), absDelta);
    if (!result) return;
    event.preventDefault();
    if (result !== "accumulate") {
      cooldownUntil = now + COOLDOWN_MS;
    }
  }

  function handleTouchStart(event) {
    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
  }

  function handleTouchEnd(event) {
    const distanceX = touchStartX - event.changedTouches[0].clientX;
    const distanceY = touchStartY - event.changedTouches[0].clientY;
    if (Math.abs(distanceX) < 40 && Math.abs(distanceY) < 40) return;
    const direction = Math.sign(Math.abs(distanceX) > Math.abs(distanceY) ? distanceX : distanceY);
    onSwipe(direction);
  }

  document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  document.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
  document.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });

  function reset() {
    window.clearTimeout(inertiaFlushTimer);
    cooldownUntil = 0;
    peakDelta = 0;
  }

  return { reset, destroy: () => {
    window.clearTimeout(inertiaFlushTimer);
    document.removeEventListener("wheel", handleWheel, true);
    document.removeEventListener("touchstart", handleTouchStart, true);
    document.removeEventListener("touchend", handleTouchEnd, true);
  } };
}
