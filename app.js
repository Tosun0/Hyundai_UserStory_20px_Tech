const sequenceVideo = document.querySelector("#sequence-video");
const startOverlay = document.querySelector("#start-overlay");
const skipButton = document.querySelector("#skip-button");
const playbackButton = document.querySelector("#playback-button");
const volumeControl = document.querySelector("#volume-control");
const volumeButton = document.querySelector("#volume-button");
const volumeSlider = document.querySelector("#volume-slider");
const scenarioHeader = document.querySelector("#scenario-header");
const scenarioStage = document.querySelector("#scenario-canvas");
const scenarioTrack = document.querySelector("#scenario-canvas-track");
const scenarioDots = document.querySelectorAll("#scenario-indicator .p-dot");
const indicatorCounter = document.querySelector("#indicator-counter");
const TOTAL_CANVAS_SLIDES = 5;
const introSource = "Asset/Playbook/playbook_video_3_intro.mp4";
const VIDEO_FADE_DURATION = 700;

let state = "intro";
let canvasIndex = 0;
let previousScrollY = window.scrollY;
let scrollDirection = 0;
let scrollEndTimer;
let closeVolumeTimer;
let hidePlaybackTimer;
let suppressVideoClickUntil = 0;
let autoplaying = false;
let videoFadeFrame;
let videoExitPending = false;
let volume = 1;

function cancelVideoFade({ restore = false } = {}) {
  window.cancelAnimationFrame(videoFadeFrame);
  videoFadeFrame = undefined;
  if (restore) sequenceVideo.volume = volume;
}

function fadeOutVideo(onComplete, duration = VIDEO_FADE_DURATION) {
  cancelVideoFade();
  const startVolume = sequenceVideo.volume;
  const startedAt = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    sequenceVideo.volume = startVolume * (1 - progress);
    if (progress < 1) videoFadeFrame = window.requestAnimationFrame(step);
    else {
      videoFadeFrame = undefined;
      onComplete?.();
    }
  }

  videoFadeFrame = window.requestAnimationFrame(step);
}

function updateVolume() {
  const muted = sequenceVideo.muted;
  volumeButton.textContent = muted ? "🔇" : "🔊";
  volumeButton.setAttribute("aria-label", muted ? "소리 켜기" : "음소거");
  volumeSlider.value = String(volume);
}

function setMuted(muted) {
  sequenceVideo.defaultMuted = muted;
  sequenceVideo.muted = muted;
  sequenceVideo.toggleAttribute("muted", muted);
  updateVolume();
}

function updatePlayback({ autoplay = false } = {}) {
  window.clearTimeout(hidePlaybackTimer);
  if (state === "scenario" || sequenceVideo.hidden) {
    playbackButton.hidden = true;
    playbackButton.classList.remove("visible");
    return;
  }
  playbackButton.hidden = false;
  playbackButton.textContent = sequenceVideo.paused ? "▶" : "Ⅱ";
  playbackButton.setAttribute("aria-label", sequenceVideo.paused ? "재생" : "정지");
  playbackButton.classList.toggle("visible", !autoplay || sequenceVideo.paused);
  if (!sequenceVideo.paused && !autoplay) {
    hidePlaybackTimer = window.setTimeout(() => playbackButton.classList.remove("visible"), 1000);
  }
}

function togglePlayback() {
  if (sequenceVideo.hidden) return;
  if (sequenceVideo.paused) {
    sequenceVideo.play().catch(() => updatePlayback());
  } else {
    sequenceVideo.pause();
  }
}

async function playVideo(source, { prepared = false } = {}) {
  cancelVideoFade({ restore: true });
  videoExitPending = false;
  scenarioHeader.classList.remove("active");
  scenarioStage.classList.remove("active");
  sequenceVideo.hidden = false;
  sequenceVideo.classList.remove("leaving");
  skipButton.hidden = state !== "intro";
  volumeControl.hidden = false;
  sequenceVideo.volume = volume;
  setMuted(false);
  if (!prepared) {
    sequenceVideo.src = source;
    sequenceVideo.load();
  }
  autoplaying = true;
  updatePlayback({ autoplay: true });
  try {
    await sequenceVideo.play();
  } catch {
    setMuted(true);
    const playing = await sequenceVideo.play().then(() => true, () => false);
    if (!playing) updatePlayback();
  }
}

function renderScenario(index) {
  canvasIndex = Math.max(0, Math.min(index, TOTAL_CANVAS_SLIDES - 1));
  scenarioTrack.querySelectorAll(".canvas-slide").forEach((slide, idx) => {
    slide.classList.toggle("active", idx === canvasIndex);
  });
  scenarioDots.forEach((dot, idx) => dot.classList.toggle("active", idx === canvasIndex));
  indicatorCounter.textContent = `${String(canvasIndex + 1).padStart(2, "0")} / 05`;
}

function scrollToScenario(index = 0) {
  const maxScroll = Math.max(0, scenarioStage.offsetHeight - window.innerHeight);
  const targetY = scenarioStage.offsetTop + (index / (TOTAL_CANVAS_SLIDES - 1)) * maxScroll;
  window.scrollTo({ top: targetY, behavior: "smooth" });
}

function enterScenario() {
  state = "scenario";
  sequenceVideo.pause();
  sequenceVideo.hidden = false;
  skipButton.hidden = true;
  playbackButton.hidden = true;
  volumeControl.hidden = true;
}

function syncScenarioFromScroll() {
  const sectionTop = scenarioStage.offsetTop;
  const maxScroll = Math.max(0, scenarioStage.offsetHeight - window.innerHeight);
  const relativeScroll = window.scrollY - sectionTop;
  const inCanvas = relativeScroll >= 0 && relativeScroll <= maxScroll;

  if (inCanvas) {
    if (state !== "scenario") enterScenario();
    const progress = maxScroll > 0 ? relativeScroll / maxScroll : 0;
    const slideIndex = Math.min(
      TOTAL_CANVAS_SLIDES - 1,
      Math.floor(Math.max(0, Math.min(1, progress)) * TOTAL_CANVAS_SLIDES),
    );
    renderScenario(slideIndex);
    scenarioHeader.classList.add("active");
    return;
  }

  scenarioHeader.classList.remove("active");
  if (state === "scenario" && relativeScroll < 0) {
    state = "intro";
    renderScenario(0);
    sequenceVideo.hidden = false;
    skipButton.hidden = true;
    playbackButton.hidden = true;
    volumeControl.hidden = true;
    startOverlay.hidden = false;
    startOverlay.classList.remove("exiting");
    startOverlay.classList.add("ready");
  }
}

function hideStartGuide() {
  if (startOverlay.hidden) return;
  startOverlay.classList.remove("scroll-visible");
  startOverlay.classList.add("scroll-hidden");
}

function showStartGuide() {
  if (state !== "intro" || !sequenceVideo.paused) return;
  startOverlay.hidden = false;
  startOverlay.classList.remove("scroll-hidden");
  startOverlay.classList.add("scroll-visible");
}

function snapToSectionBoundary(direction) {
  if (!direction) return;
  const scrollY = window.scrollY;
  const threshold = Math.min(window.innerHeight, 900);
  const scenarioTop = scenarioStage.offsetTop;
  const firstCanvasPage = (scenarioStage.offsetHeight - window.innerHeight) / TOTAL_CANVAS_SLIDES;
  let target;

  if (direction < 0) {
    const relativeScroll = scrollY - scenarioTop;
    if (scrollY <= 0 || relativeScroll > firstCanvasPage * .5) return;
    target = 0;
  } else if (scrollY < scenarioTop && scenarioTop - scrollY <= threshold) {
    target = scenarioTop;
  }

  if (target === undefined || Math.abs(target - scrollY) > threshold) return;
  window.scrollTo({ top: target, behavior: "smooth" });
}

function handlePageScroll() {
  const currentScrollY = window.scrollY;
  if (currentScrollY !== previousScrollY) {
    scrollDirection = Math.sign(currentScrollY - previousScrollY);
    previousScrollY = currentScrollY;
  }
  syncScenarioFromScroll();
  if (scrollDirection > 0 && currentScrollY > 0) hideStartGuide();
  if (scrollDirection < 0 && currentScrollY <= Math.min(window.innerHeight * 0.65, 520)) showStartGuide();

  if ("onscrollend" in window) return;
  window.clearTimeout(scrollEndTimer);
  scrollEndTimer = window.setTimeout(() => snapToSectionBoundary(scrollDirection), 140);
}

function finishVideo() {
  if (state === "intro" && startOverlay.hidden) skipVideo();
}

function skipVideo() {
  if (videoExitPending) return;
  videoExitPending = true;
  skipButton.hidden = true;
  cancelVideoFade();
  sequenceVideo.pause();
  videoExitPending = false;
  scrollToScenario(0);
}

// 초기 로드용 — src 세팅 + load()로 버퍼링 시작
function resetExperience() {
  cancelVideoFade({ restore: true });
  videoExitPending = false;
  state = "intro";
  canvasIndex = 0;
  sequenceVideo.pause();
  sequenceVideo.src = introSource;
  sequenceVideo.load();
  sequenceVideo.hidden = false;
  sequenceVideo.classList.remove("leaving");
  scenarioHeader.classList.remove("active");
  scenarioStage.classList.remove("active");
  skipButton.hidden = true;
  playbackButton.hidden = true;
  playbackButton.classList.remove("visible");
  volumeControl.hidden = true;
  startOverlay.hidden = false;
  startOverlay.classList.remove("exiting", "returning", "ready");
}

sequenceVideo.addEventListener("timeupdate", () => {
  const remaining = sequenceVideo.duration - sequenceVideo.currentTime;
  if (!videoFadeFrame && Number.isFinite(remaining) && remaining > 0 && remaining <= VIDEO_FADE_DURATION / 1000) {
    fadeOutVideo(undefined, remaining * 1000);
  }
});
sequenceVideo.addEventListener("ended", finishVideo);
sequenceVideo.addEventListener("play", () => {
  updatePlayback({ autoplay: autoplaying });
  autoplaying = false;
});
sequenceVideo.addEventListener("pause", () => {
  if (videoExitPending) {
    // 스킵 페이드 진행 중 외부 원인으로 pause 발생 — 페이드 즉시 완료 처리
    window.cancelAnimationFrame(videoFadeFrame);
    videoFadeFrame = undefined;
    sequenceVideo.volume = 0;
    videoExitPending = false;
  } else if (sequenceVideo.currentTime < sequenceVideo.duration) {
    cancelVideoFade({ restore: true });
  }
  updatePlayback();
});

sequenceVideo.addEventListener("click", () => {
  if (Date.now() <= suppressVideoClickUntil) {
    suppressVideoClickUntil = 0;
    return;
  }
  togglePlayback();
});
playbackButton.addEventListener("click", togglePlayback);
skipButton.addEventListener("click", skipVideo);
scenarioDots.forEach((dot) => {
  dot.addEventListener("click", () => scrollToScenario(Number(dot.dataset.idx)));
});
window.addEventListener("scroll", handlePageScroll, { passive: true });
if ("onscrollend" in window) {
  window.addEventListener("scrollend", () => snapToSectionBoundary(scrollDirection), { passive: true });
}

function openVolume() {
  window.clearTimeout(closeVolumeTimer);
  volumeControl.classList.add("open");
}

function closeVolumeLater() {
  window.clearTimeout(closeVolumeTimer);
  closeVolumeTimer = window.setTimeout(() => volumeControl.classList.remove("open"), 1000);
}

volumeControl.addEventListener("mouseenter", openVolume);
volumeControl.addEventListener("mouseleave", closeVolumeLater);
volumeControl.addEventListener("focusin", openVolume);
volumeControl.addEventListener("focusout", closeVolumeLater);

volumeButton.addEventListener("click", () => setMuted(!sequenceVideo.muted));
volumeSlider.addEventListener("input", () => {
  volume = Number(volumeSlider.value);
  sequenceVideo.volume = volume;
  setMuted(volume === 0);
});

document.addEventListener("pointerdown", (event) => {
  if (!sequenceVideo.muted || event.target.closest?.(".media-volume-control")) return;
  setMuted(false);
  if (event.target === sequenceVideo) suppressVideoClickUntil = Date.now() + 700;
}, { capture: true });

updateVolume();
sequenceVideo.volume = volume;
resetExperience(); // 초기 로드: src 세팅 + load() → 버퍼링 시작
renderScenario(0);
handlePageScroll();

startOverlay.addEventListener("click", () => {
  startOverlay.classList.add("exiting");
  startOverlay.classList.remove("ready", "returning");
  try { sequenceVideo.currentTime = 0; } catch {}
  window.setTimeout(() => {
    startOverlay.hidden = true;
    startOverlay.classList.remove("exiting");
  }, 380);
  playVideo(introSource, { prepared: true }); // 이미 버퍼링된 소스 그대로 play()
});
