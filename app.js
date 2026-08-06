/**
 * Hyundai UserStory 20px-Tech
 *
 * 16px_Ref 방식 그대로:
 *   - wheel 이벤트 JS 처리 없음
 *   - CSS scroll-snap이 슬라이드 이동을 처리
 *   - JS는 scroll 이벤트로 scrollY를 읽어 UI 상태(phase, 인디케이터)만 동기화
 *   - macOS 트랙패드 관성은 브라우저가 알아서 처리
 */

const TOTAL_CANVAS_SLIDES = 4;

const scrollRoot       = document.querySelector(".scroll-root");
const indicatorCounter = document.querySelector("#indicator-counter");
const indicatorDots    = [...document.querySelectorAll("#canvas-indicator .p-dot")];
const canvasSections   = [...document.querySelectorAll(".canvas-section")];

// ── 인디케이터 렌더 ────────────────────────────────────────────────────────
function renderIndicator(activeIdx) {
  indicatorDots.forEach((dot, i) => {
    dot.classList.toggle("active", i === activeIdx);
  });

  if (indicatorCounter) {
    indicatorCounter.textContent =
      `${String(activeIdx + 1).padStart(2, "0")} / ${String(TOTAL_CANVAS_SLIDES).padStart(2, "0")}`;
  }
}

// ── 스크롤 핸들러 (16px_Ref 방식) ─────────────────────────────────────────
function onScroll() {
  const scrollY = scrollRoot.scrollTop;
  const viewH   = scrollRoot.clientHeight;

  // 플레이북 섹션이 0 ~ viewH, 이후 각 캔버스 섹션이 viewH씩 차지
  const isCanvas = scrollY >= viewH * 0.6;
  document.body.dataset.phase = isCanvas ? "scenario-canvas" : "playbook";

  if (isCanvas) {
    // 어떤 캔버스 섹션이 현재 보이는지: 각 섹션의 offsetTop 기준
    let activeIdx = 0;
    canvasSections.forEach((section, i) => {
      if (scrollY >= section.offsetTop - viewH * 0.4) {
        activeIdx = i;
      }
    });
    renderIndicator(activeIdx);
  } else {
    renderIndicator(0);
  }
}

// ── 16px_Ref 그대로: scroll-root에 passive scroll 리스너 ──────────────────
scrollRoot.addEventListener("scroll", onScroll, { passive: true });

// ── 인디케이터 점 클릭 → 해당 섹션으로 스크롤 ────────────────────────────
indicatorDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const idx = Number(dot.dataset.idx ?? "0");
    const target = canvasSections[idx];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

// ── 초기화 ─────────────────────────────────────────────────────────────────
onScroll();
