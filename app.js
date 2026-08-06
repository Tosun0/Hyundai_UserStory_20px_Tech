/**
 * Hyundai UserStory 20px-Tech
 * Wheel Input Engine — written from scratch
 *
 * 설계 원칙
 * ──────────
 * 기존 프로젝트(16/17/20px)의 wheel 처리 코드를 일절 사용하지 않는다.
 *
 * 맥 트랙패드 관성 스크롤 문제의 근본 원인:
 *   macOS는 손가락을 뗀 뒤에도 수백 ms 동안 작은 deltaY 이벤트(관성)를
 *   계속 방사한다. 기존 코드는 단순 타임아웃 락으로만 막으려 했기 때문에
 *   락이 풀린 직후 아직 남아있는 관성 이벤트가 슬라이드를 추가로
 *   넘겨버리는 현상이 반복됐다.
 *
 * 새 엔진의 해결 방식 — "Velocity Gate + Dead Zone":
 *   1. 이벤트 스트림을 누적(accumulator)으로 받아 진행 방향과 속도를 계산.
 *   2. 일정 속도 임계값(GATE)을 넘어야만 스텝을 발동. 관성 잔류는 항상
 *      속도가 임계값 아래이므로 자동으로 걸러진다.
 *   3. 스텝 발동 후에는 COOLDOWN ms 동안 입력을 완전히 차단.
 *      COOLDOWN 안에 새 제스처가 시작되더라도 속도가 기준을 넘어야 한다.
 *   4. 터치/스와이프는 거리 기반으로 별도 처리.
 */

// ── 상수 ───────────────────────────────────────────────────────────────────
const TOTAL_CANVAS_SLIDES = 4;

/**
 * 속도 임계값 (px/s 기준 환산 스코어).
 * 맥 트랙패드 한 번 스와이프의 peak deltaY는 보통 20~120.
 * 관성 잔류 이벤트는 보통 5 이하로 수렴하므로 12를 기준으로 잡는다.
 */
const VELOCITY_GATE = 12;

/**
 * 스텝 발동 후 입력을 무시하는 쿨다운 (ms).
 * 트랙패드 관성 꼬리가 완전히 사라지려면 최대 약 600ms 걸린다.
 */
const COOLDOWN_MS = 600;

/** 터치 스와이프 인식 최소 거리 (px) */
const SWIPE_THRESHOLD = 44;

// ── DOM ────────────────────────────────────────────────────────────────────
const scenarioStage  = document.querySelector("#scenario-canvas-stage");
const scenarioTrack  = document.querySelector("#scenario-canvas-track");
const indicatorCounter = document.querySelector("#indicator-counter");
const indicatorDots  = [...document.querySelectorAll("#scenario-indicator .p-dot")];

// ── 상태 ───────────────────────────────────────────────────────────────────
let activePhase  = "playbook";   // "playbook" | "scenario-canvas"
let canvasIndex  = 0;
let cooldownUntil = 0;           // performance.now() 기준 쿨다운 만료 시각

// ── 렌더 ───────────────────────────────────────────────────────────────────
function render() {
  document.body.dataset.phase = activePhase;
  scenarioStage.classList.toggle("active", activePhase === "scenario-canvas");
  scenarioTrack.style.transform = `translateX(-${canvasIndex * 100}%)`;

  scenarioTrack.querySelectorAll(".canvas-slide").forEach((slide, i) => {
    slide.classList.toggle("active", i === canvasIndex);
  });

  indicatorDots.forEach((dot, i) => {
    dot.classList.toggle("active", i === canvasIndex);
  });

  if (indicatorCounter) {
    indicatorCounter.textContent =
      `${String(canvasIndex + 1).padStart(2, "0")} / ${String(TOTAL_CANVAS_SLIDES).padStart(2, "0")}`;
  }
}

// ── 이동 로직 ──────────────────────────────────────────────────────────────
function showPlaybook() {
  activePhase = "playbook";
  canvasIndex = 0;
  render();
}

function showCanvas(index) {
  activePhase = "scenario-canvas";
  canvasIndex = Math.max(0, Math.min(index, TOTAL_CANVAS_SLIDES - 1));
  render();
}

/**
 * direction: +1 = 앞으로(다음), -1 = 뒤로(이전)
 * 반환값: 실제로 스텝이 발동됐으면 true
 */
function step(direction) {
  if (activePhase === "playbook") {
    if (direction > 0) {
      showCanvas(0);
      return true;
    }
    return false; // 이미 첫 슬라이드, 뒤로 갈 곳 없음
  }

  // scenario-canvas
  if (direction > 0 && canvasIndex < TOTAL_CANVAS_SLIDES - 1) {
    showCanvas(canvasIndex + 1);
    return true;
  }
  if (direction < 0 && canvasIndex > 0) {
    showCanvas(canvasIndex - 1);
    return true;
  }
  if (direction < 0 && canvasIndex === 0) {
    showPlaybook();
    return true;
  }
  return false;
}

// ── Velocity Gate Wheel Engine ─────────────────────────────────────────────
/**
 * handleWheel — 완전 새 구현
 *
 * deltaY를 즉시 Math.sign() 하지 않고 크기(velocity)를 먼저 확인.
 * VELOCITY_GATE 미만이면 관성 잔류 또는 너무 약한 스크롤로 판단해 무시.
 * 임계값을 넘으면 쿨다운 여부를 확인 후 스텝 발동.
 */
function handleWheel(event) {
  // 기본 스크롤 항상 차단 (body overflow: hidden 이지만 이중 보호)
  event.preventDefault();

  const delta = event.deltaY;

  // deltaMode 보정:
  // macOS = 0 (픽셀), Windows 마우스 = 1 (라인, 1라인 ≈ 30px)
  // deltaMode 2 (페이지)는 실 사용 거의 없지만 대응.
  let normalizedDelta = delta;
  if (event.deltaMode === 1) normalizedDelta = delta * 30;
  if (event.deltaMode === 2) normalizedDelta = delta * 300;

  const speed = Math.abs(normalizedDelta);

  // ── Velocity Gate: 약한 이벤트는 완전 무시 ────────────────────────────
  if (speed < VELOCITY_GATE) return;

  // ── 쿨다운 중이면 무시 ────────────────────────────────────────────────
  const now = performance.now();
  if (now < cooldownUntil) return;

  // ── 스텝 발동 ─────────────────────────────────────────────────────────
  const fired = step(Math.sign(normalizedDelta));
  if (fired) {
    cooldownUntil = now + COOLDOWN_MS;
  }
}

// ── Touch / Swipe Engine ───────────────────────────────────────────────────
let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(event) {
  const t = event.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}

function handleTouchEnd(event) {
  const t = event.changedTouches[0];
  const dx = touchStartX - t.clientX;
  const dy = touchStartY - t.clientY;

  // 이동 거리가 임계값 미만이면 탭으로 간주, 무시
  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

  // 수평/수직 중 더 큰 축의 방향으로 판단
  const direction = Math.sign(Math.abs(dx) > Math.abs(dy) ? dx : dy);
  step(direction);
}

// ── 이벤트 등록 ────────────────────────────────────────────────────────────
/**
 * wheel은 window에 passive: false로 등록.
 * document보다 window가 더 넓은 범위를 커버하고,
 * capture: true 없이도 단일 리스너로 충분히 처리 가능.
 */
window.addEventListener("wheel", handleWheel, { passive: false });

document.body.addEventListener("touchstart", handleTouchStart, { passive: true });
document.body.addEventListener("touchend",   handleTouchEnd,   { passive: true });

// ── 인디케이터 점 클릭 ─────────────────────────────────────────────────────
indicatorDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    showCanvas(Number(dot.dataset.idx ?? "0"));
  });
});

// ── 초기 렌더 ──────────────────────────────────────────────────────────────
render();
