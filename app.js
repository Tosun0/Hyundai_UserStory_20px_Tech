import { initScrollRouter } from "./scroll-router.js";

const sequenceVideo = document.querySelector("#sequence-video");
const startOverlay = document.querySelector("#start-overlay");
const skipButton = document.querySelector("#skip-button");
const playbackButton = document.querySelector("#playback-button");
const volumeControl = document.querySelector("#volume-control");
const volumeButton = document.querySelector("#volume-button");
const volumeSlider = document.querySelector("#volume-slider");
const scenarioHeader = document.querySelector("#scenario-header");
const scenarioStage = document.querySelector("#scenario-canvas-stage");
const scenarioTrack = document.querySelector("#scenario-canvas-track");
const scenarioDots = document.querySelectorAll("#scenario-indicator .p-dot");
const indicatorCounter = document.querySelector("#indicator-counter");
const backButton = document.querySelector("#back-button");
const storedVolume = Number(sessionStorage.getItem("media-volume") ?? "1");
const TOTAL_CANVAS_SLIDES = 5;

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
let volume = Number.isFinite(storedVolume) && storedVolume > 0 ? Math.min(1, storedVolume) : 1;

function updateVolume() {
  const muted = sequenceVideo.muted;
  volumeButton.textContent = muted ? "🔇" : "🔊";
  volumeButton.setAttribute("aria-label", muted ? "소리 켜기" : "음소거");
  volumeSlider.value = String(volume);
}

function setMuted(muted) {
  [sequenceVideo].forEach((media) => {
    media.defaultMuted = muted;
    media.muted = muted;
    media.toggleAttribute("muted", muted);
  });
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
  scenarioHeader.classList.remove("active");
  scenarioStage.classList.remove("active");
  backButton.hidden = true;
  sequenceVideo.hidden = false;
  sequenceVideo.classList.remove("leaving");
  skipButton.hidden = !(state === "intro");
  volumeControl.hidden = false;
  sequenceVideo.volume = volume;
  setMuted(false);
  if (!prepared) {
    if (sequenceVideo.getAttribute("src") !== source) {
      sequenceVideo.src = source;
      sequenceVideo.load();
    }
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

function showScenario(index = 0) {
  state = "scenario";
  canvasIndex = Math.max(0, Math.min(index, TOTAL_CANVAS_SLIDES - 1));
  sequenceVideo.pause();
  sequenceVideo.hidden = false;
  skipButton.hidden = true;
  playbackButton.hidden = true;
  volumeControl.hidden = true;
  scenarioHeader.classList.add("active");
  scenarioStage.classList.add("active");
  backButton.hidden = false;
  scenarioTrack.style.transform = `translateX(-${canvasIndex * 100}%)`;
  scenarioTrack.querySelectorAll(".canvas-slide").forEach((slide, idx) => {
    slide.classList.toggle("active", idx === canvasIndex);
  });
  scenarioDots.forEach((dot, idx) => dot.classList.toggle("active", idx === canvasIndex));
  indicatorCounter.textContent = `${String(canvasIndex + 1).padStart(2, "0")} / 05`;
}

function moveScenario(direction) {
  if (state !== "scenario") return;
  if (direction > 0 && canvasIndex < TOTAL_CANVAS_SLIDES - 1) showScenario(canvasIndex + 1);
  if (direction < 0 && canvasIndex > 0) showScenario(canvasIndex - 1);
}

function resetExperience() {
  scrollRouter?.reset();
  state = "intro";
  canvasIndex = 0;
  closeAccum = 0;
  sequenceVideo.pause();
  try {
    sequenceVideo.currentTime = 0;
  } catch {}
  sequenceVideo.hidden = false;
  sequenceVideo.classList.remove("leaving");
  scenarioHeader.classList.remove("active");
  scenarioStage.classList.remove("active");
  backButton.hidden = true;
  skipButton.hidden = true;
  playbackButton.hidden = true;
  playbackButton.classList.remove("visible");
  volumeControl.hidden = true;
  startOverlay.hidden = false;
  startOverlay.classList.remove("exiting");
}

function exitScenarioToPlaybook() {
  // 1. 시나리오 캔버스를 먼저 부드럽게 페이드아웃 (active 클래스 제거)
  scenarioHeader.classList.remove("active");
  scenarioStage.classList.remove("active");
  backButton.hidden = true;

  // 2. 닫히는 560ms 동안 휠 스크롤 차단
  const exitBlocker = (e) => e.preventDefault();
  document.addEventListener("wheel", exitBlocker, { capture: true, passive: false });
  window.setTimeout(() => document.removeEventListener("wheel", exitBlocker, true), 560);

  // 3. 캔버스가 스무스하게 페이드아웃된 후(360ms) currentTime = 0 및 startOverlay 등장 (video.load() 제거로 검은 프레임 튀는 깜빡임 제거)
  window.setTimeout(() => {
    resetExperience();
  }, 360);
}

sequenceVideo.addEventListener("ended", () => {
  if (state === "intro" && startOverlay.hidden) showScenario(0);
});
sequenceVideo.addEventListener("play", () => {
  updatePlayback({ autoplay: autoplaying });
  autoplaying = false;
});
sequenceVideo.addEventListener("pause", () => updatePlayback());

sequenceVideo.addEventListener("click", () => {
  if (Date.now() <= suppressVideoClickUntil) {
    suppressVideoClickUntil = 0;
    return;
  }
  togglePlayback();
});
playbackButton.addEventListener("click", togglePlayback);
skipButton.addEventListener("click", () => {
  showScenario(0);
});
scenarioDots.forEach((dot) => {
  dot.addEventListener("click", () => showScenario(Number(dot.dataset.idx)));
});
backButton.addEventListener("click", exitScenarioToPlaybook);

function handleScenarioStep(direction, absDelta = 0) {
  if (state !== "scenario") return false;

  if (direction > 0) {
    closeAccum = 0;
    if (canvasIndex < TOTAL_CANVAS_SLIDES - 1) {
      showScenario(canvasIndex + 1);
    }
  } else if (direction < 0) {
    if (canvasIndex > 0) {
      closeAccum = 0;
      showScenario(canvasIndex - 1);
    } else {
      // 0번 슬라이드에서 위로 스크롤 시 백버튼과 동일한 닫기 이벤트 실행 (300px 가상 스페이서 누적)
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

scrollRouter = initScrollRouter({
  onWheel: handleScenarioStep,
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

volumeButton.addEventListener("click", () => {
  setMuted(!sequenceVideo.muted);
});
volumeSlider.addEventListener("input", () => {
  volume = Number(volumeSlider.value);
  sequenceVideo.volume = volume;
  sessionStorage.setItem("media-volume", String(volume));
  setMuted(volume === 0);
});

document.addEventListener("pointerdown", (event) => {
  if (!sequenceVideo.muted || event.target.closest?.(".media-volume-control")) return;
  setMuted(false);
  if (event.target === sequenceVideo) suppressVideoClickUntil = Date.now() + 700;
}, { capture: true });

updateVolume();
const introSource = "Asset/Playbook/playbook_3_intro.mp4";
sequenceVideo.volume = volume;
resetExperience();

startOverlay.addEventListener("click", () => {
  startOverlay.classList.add("exiting");
  window.setTimeout(() => {
    startOverlay.hidden = true;
  }, 380);
  playVideo(introSource, { prepared: true });
});
