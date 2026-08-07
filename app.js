import { initScrollRouter } from "./scroll-router.js";

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

let closeAccum = 0;
let closeResetTimer;
const CLOSE_THRESHOLD = 300;

let state = "intro";
let canvasIndex = 0;
let scrollRouter;
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

function showScenario(index = 0, { keepVideoPlaying = false } = {}) {
  state = "scenario";
  canvasIndex = Math.max(0, Math.min(index, TOTAL_CANVAS_SLIDES - 1));
  if (!keepVideoPlaying) sequenceVideo.pause();
  sequenceVideo.hidden = false;
  skipButton.hidden = true;
  playbackButton.hidden = true;
  volumeControl.hidden = true;
  scenarioHeader.classList.add("active");
  scenarioStage.classList.add("active");
  scenarioTrack.style.transform = `translateX(-${canvasIndex * 100}%)`;
  scenarioTrack.querySelectorAll(".canvas-slide").forEach((slide, idx) => {
    slide.classList.toggle("active", idx === canvasIndex);
  });
  scenarioDots.forEach((dot, idx) => dot.classList.toggle("active", idx === canvasIndex));
  indicatorCounter.textContent = `${String(canvasIndex + 1).padStart(2, "0")} / 05`;
}

function finishVideo() {
  if (state === "intro" && startOverlay.hidden) showScenario(0);
}

function skipVideo() {
  if (videoExitPending) return;
  videoExitPending = true;
  skipButton.hidden = true;
  showScenario(0, { keepVideoPlaying: true });
  fadeOutVideo(() => {
    videoExitPending = false;
    sequenceVideo.pause();
  }, VIDEO_FADE_DURATION);
}

function moveScenario(direction) {
  if (state !== "scenario") return;
  if (direction > 0 && canvasIndex < TOTAL_CANVAS_SLIDES - 1) showScenario(canvasIndex + 1);
  if (direction < 0 && canvasIndex > 0) showScenario(canvasIndex - 1);
}

// 초기 로드용 — src 세팅 + load()로 버퍼링 시작
function resetExperience() {
  cancelVideoFade({ restore: true });
  videoExitPending = false;
  scrollRouter?.reset();
  state = "intro";
  canvasIndex = 0;
  closeAccum = 0;
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

// 캔버스 닫기용 — src/load 없이 UI만 리셋 (깜빡임 방지)
function finishScenarioExit() {
  scrollRouter?.reset();
  state = "intro";
  canvasIndex = 0;
  closeAccum = 0;
  if (sequenceVideo.paused) {
    // 정상 플로우: exit 중 playVideo 호출 없음 → 초기 UI 리셋
    sequenceVideo.hidden = false;
    sequenceVideo.classList.remove("leaving");
    skipButton.hidden = true;
    playbackButton.hidden = true;
    playbackButton.classList.remove("visible");
    volumeControl.hidden = true;
    startOverlay.classList.add("ready");
  } else {
    // exit 중 playVideo가 이미 실행됨 → 영상 재생 유지, skip 버튼만 노출
    skipButton.hidden = false;
  }
}

function exitScenarioToPlaybook() {
  state = "returning";
  // 1. 시나리오 캔버스 페이드아웃 시작
  scenarioHeader.classList.remove("active");
  scenarioStage.classList.remove("active");
  sequenceVideo.pause();
  startOverlay.classList.remove("exiting", "ready");
  startOverlay.classList.add("returning");
  startOverlay.hidden = false;

  // 2. 캔버스 CSS transition 520ms 동안 휠 차단
  const exitBlocker = (e) => e.preventDefault();
  document.addEventListener("wheel", exitBlocker, { capture: true, passive: false });
  window.setTimeout(() => document.removeEventListener("wheel", exitBlocker, true), 600);
  window.setTimeout(finishScenarioExit, 540);
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
  dot.addEventListener("click", () => showScenario(Number(dot.dataset.idx)));
});
function handleScenarioStep(direction, absDelta = 0) {
  if (state !== "scenario") return false;
  if (videoExitPending) return true; // 스킵 페이드 중 캔버스 조작 차단 — exitScenarioToPlaybook 실행 방지

  if (direction > 0) {
    closeAccum = 0;
    if (canvasIndex < TOTAL_CANVAS_SLIDES - 1) showScenario(canvasIndex + 1);
  } else if (direction < 0) {
    if (canvasIndex > 0) {
      closeAccum = 0;
      showScenario(canvasIndex - 1);
    } else {
      closeAccum += absDelta;
      window.clearTimeout(closeResetTimer);
      closeResetTimer = window.setTimeout(() => { closeAccum = 0; }, 400);
      if (closeAccum >= CLOSE_THRESHOLD) {
        exitScenarioToPlaybook();
        return true;
      }
      return "accumulate";
    }
  }
  return true;
}

function handleWheel(direction, absDelta) {
  if (state === "intro" && !sequenceVideo.paused && direction > 0) {
    skipVideo();
    return true;
  }
  return handleScenarioStep(direction, absDelta);
}

scrollRouter = initScrollRouter({
  onWheel: handleWheel,
  onSwipe: handleScenarioStep,
});

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
