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
const introSource = "Asset/Playbook/playbook_3_intro.mp4";

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
  sequenceVideo.defaultMuted = muted;
  sequenceVideo.muted = muted;
  sequenceVideo.toggleAttribute("muted", muted);
  updateVolume();
}

function updatePlayback({ autoplay = false } = {}) {
  window.clearTimeout(hidePlaybackTimer);
  if (sequenceVideo.hidden || state === "scenario") {
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
  if (sequenceVideo.hidden || state === "scenario") return;
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
  sequenceVideo.pause();
  sequenceVideo.src = introSource;
  sequenceVideo.load();
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

sequenceVideo.addEventListener("ended", () => {
  if (state === "intro") {
    showScenario(0);
  }
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
backButton.addEventListener("click", () => {
  resetExperience();
  // 닫힘 트랜지션(520ms) 동안 wheel 차단
  const exitBlocker = (e) => e.preventDefault();
  document.addEventListener("wheel", exitBlocker, { capture: true, passive: false });
  window.setTimeout(() => document.removeEventListener("wheel", exitBlocker, true), 560);
});

function handleScenarioStep(direction) {
  if (state !== "scenario") return false;
  moveScenario(direction);
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
sequenceVideo.volume = volume;
resetExperience();

startOverlay.addEventListener("click", () => {
  startOverlay.classList.add("exiting");
  window.setTimeout(() => {
    startOverlay.hidden = true;
  }, 380);
  playVideo(introSource, { prepared: true });
});
