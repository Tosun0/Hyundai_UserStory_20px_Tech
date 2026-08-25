(function () {
  const stylesheetHref = new URL("participation-panel.css", document.currentScript?.src || window.location.href).href;
  const defaultConfig = {
    user: { name: "토순", avatar: "토" },
    sections: {
      playbook: {
        title: "Playbook",
        subtitle: "Playbook · 참여 도구",
        tabs: ["poll"],
        defaultTab: "poll",
        poll: {
          question: "워킹맘인 나를 가장 지치게 만드는 순간은 언제인가요?",
          hint: "가장 가까운 순간 하나를 선택해 주세요.",
          options: ["아이와 충분히 함께하지 못했다고 느낄 때", "업무와 육아를 동시에 신경 써야 할 때", "퇴근해도 집안일과 육아가 계속될 때", "나를 위한 시간이 전혀 없다고 느낄 때"],
          fills: [31, 29, 24, 16],
          participants: "워킹맘 응답 결과"
        }
      },
      "scenario-canvas": {
        title: "Scenario Canvas",
        subtitle: "Scenario Canvas · 참여 도구",
        tabs: ["ab", "comments"],
        defaultTab: "ab",
        ab: { question: "바쁜 하루 속, 지금 나에게 더 필요한 것은?", hint: "본인에게 더 가까운 기준을 선택해 주세요.", options: [{ id: "a", label: "안심", detail: "아이의 상황을 바로 알 수 있는 안심" }, { id: "b", label: "여유", detail: "복잡한 일정을 정리해 주는 여유" }], fills: [57, 43], participants: "워킹맘 응답 결과" },
        comments: { question: "워킹맘을 위한 자동차에 대한 생각을 남겨주세요.", hint: "자동차 선택 경험이나 중요하게 보는 기준을 입력해 주세요.", placeholder: "의견을 남겨주세요…" }
      }
    }
  };

  function createParticipationPanel(host, config = {}) {
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    const settings = { ...defaultConfig, ...config, user: { ...defaultConfig.user, ...(config.user || {}) }, sections: config.sections || defaultConfig.sections };
    root.innerHTML = `<link rel="stylesheet" href="${stylesheetHref}"><section class="participation-panel" data-panel><header class="participation-panel__header"><div class="participation-panel__title"><strong data-title></strong><small data-subtitle></small></div><span class="participation-panel__status" data-status></span><button class="participation-panel__control" data-action="collapse" type="button" aria-label="패널 최소화">⌄</button><button class="participation-panel__control" data-action="close" type="button" aria-label="패널 닫기">×</button></header><div class="participation-panel__body"><nav class="participation-panel__tabs" data-tabs><button class="participation-panel__tab" data-tab="poll" type="button"><strong>투표</strong><span data-count="poll">● 미응답</span></button><button class="participation-panel__tab" data-tab="ab" type="button"><strong>A/B 선택</strong><span data-count="ab">● 미응답</span></button><button class="participation-panel__tab" data-tab="comments" type="button"><strong>댓글</strong><span data-count="comments">0</span></button></nav><div class="participation-panel__content" data-content></div></div></section><button class="participation-panel__launcher is-hidden" data-action="open" type="button" aria-label="패널 열기">⌃</button>`;
    const panel = root.querySelector("[data-panel]");
    const content = root.querySelector("[data-content]");
    const title = root.querySelector("[data-title]");
    const subtitle = root.querySelector("[data-subtitle]");
    const status = root.querySelector("[data-status]");
    const tabs = [...root.querySelectorAll("[data-tab]")];
    const state = { sectionId: config.initialSectionId || "playbook", tab: "poll", pollSelections: new Set(), pollSubmitted: false, abSelection: "", abSubmitted: false, comments: [], collapsed: false };
    let meterFrame = 0;

    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]);
    const getDefinition = () => settings.sections[state.sectionId] || settings.sections.playbook;
    const setMeters = () => { window.cancelAnimationFrame(meterFrame); meterFrame = window.requestAnimationFrame(() => root.querySelectorAll("[data-meter]").forEach((meter) => meter.classList.add("is-visible"))); };
    const renderResultRow = (participants, resetAction) => `<div class="participation-panel__result"><span>${participants || "응답 결과"}</span><span class="participation-panel__spacer"></span><button class="participation-panel__link" data-action="${resetAction}" type="button">다시 선택</button><span class="participation-panel__link">결과 보기</span></div>`;

    function renderPoll(definition) {
      const poll = definition.poll;
      if (state.pollSubmitted) return `<div class="participation-panel__question">${poll.question}</div><div class="participation-panel__stack">${poll.options.map((option, index) => `<div class="participation-panel__meter" data-meter style="--fill:${poll.fills?.[index] || 0}%"><span>${option} · <b>${poll.fills?.[index] || 0}%</b>${state.pollSelections.has(index) ? " ✓ 내 선택" : ""}</span></div>`).join("")}</div>${renderResultRow(poll.participants, "reset-poll")}`;
      return `<div class="participation-panel__question">${poll.question}</div><div class="participation-panel__hint">${poll.hint}</div><div class="participation-panel__stack">${poll.options.map((option, index) => `<button class="participation-panel__choice ${state.pollSelections.has(index) ? "is-selected" : ""}" data-poll="${index}" type="button"><span class="participation-panel__mark">${state.pollSelections.has(index) ? "✓" : ""}</span><span>${option}</span></button>`).join("")}</div><div class="participation-panel__button-row"><span class="participation-panel__spacer"></span><button class="participation-panel__submit" data-action="submit-poll" type="button" ${state.pollSelections.size === 0 ? "disabled" : ""}>응답</button></div>`;
    }

    function renderAb(definition) {
      const ab = definition.ab;
      if (state.abSubmitted) return `<div class="participation-panel__question">${ab.question}</div><div class="participation-panel__stack">${ab.options.map((option, index) => `<div class="participation-panel__meter" data-meter style="--fill:${ab.fills[index] || 0}%"><span>${option.label} · <b>${ab.fills[index] || 0}%</b>${state.abSelection === option.id ? " ✓ 내 선택" : ""}</span></div>`).join("")}</div>${renderResultRow(ab.participants, "reset-ab")}<div class="participation-panel__completion-note">회차가 진행 중인 동안에는 언제든 바꿀 수 있습니다.</div>`;
      return `<div class="participation-panel__question">${ab.question}</div><div class="participation-panel__hint">${ab.hint}</div><div class="participation-panel__ab">${ab.options.map((option) => `<button class="participation-panel__ab-card ${state.abSelection === option.id ? "is-selected" : ""}" data-ab="${option.id}" type="button"><strong>${option.label}</strong><span>${option.detail}</span></button>`).join("")}</div><div class="participation-panel__button-row"><span class="participation-panel__spacer"></span><button class="participation-panel__submit" data-action="submit-ab" type="button" ${state.abSelection ? "" : "disabled"}>응답</button></div>`;
    }

    function renderComments(definition) { const comments = definition.comments; return `<div class="participation-panel__question">${comments.question}</div><div class="participation-panel__hint">${comments.hint}</div><textarea class="participation-panel__textarea" data-comment-input maxlength="1000" placeholder="${comments.placeholder}"></textarea><div class="participation-panel__button-row"><span class="participation-panel__spacer"></span><button class="participation-panel__submit" data-action="add-comment" type="button">댓글 등록</button></div><div class="participation-panel__comments">${state.comments.length ? state.comments.map((comment) => `<article class="participation-panel__comment"><div class="participation-panel__comment-head"><span class="participation-panel__avatar">${settings.user.avatar}</span><strong>${settings.user.name}</strong><small>방금 전</small></div><p>${escapeHtml(comment)}</p></article>`).join("") : "<p class=\"participation-panel__empty\">아직 등록된 댓글이 없습니다. 첫 의견을 남겨보세요.</p>"}</div>`; }

    function render(animate = false) { const definition = getDefinition(); const enabledTabs = definition.tabs; if (!enabledTabs.includes(state.tab)) state.tab = definition.defaultTab; const pollComplete = Boolean(state.pollSubmitted); const abComplete = Boolean(state.abSubmitted); const currentComplete = state.tab === "poll" ? pollComplete : state.tab === "ab" ? abComplete : false; title.textContent = definition.title; subtitle.textContent = definition.subtitle; status.classList.toggle("is-complete", currentComplete); status.textContent = state.tab === "comments" ? String(state.comments.length) : currentComplete ? "✓ 응답 완료" : "● 미응답"; tabs.forEach((tab) => { const tabName = tab.dataset.tab; const counter = tab.querySelector(`[data-count="${tabName}"]`); const tabComplete = tabName === "poll" ? pollComplete : tabName === "ab" ? abComplete : false; if (counter) counter.textContent = tabName === "comments" ? String(state.comments.length) : tabComplete ? "✓ 응답 완료" : "● 미응답"; tab.hidden = !enabledTabs.includes(tabName); tab.classList.toggle("is-active", tabName === state.tab); }); content.innerHTML = state.tab === "poll" ? renderPoll(definition) : state.tab === "ab" ? renderAb(definition) : renderComments(definition); if (animate) setMeters(); }
    function activateSection(sectionId) { if (!settings.sections[sectionId] || state.sectionId === sectionId) return; state.sectionId = sectionId; state.tab = settings.sections[sectionId].defaultTab; render(); }
    tabs.forEach((tab) => tab.addEventListener("click", () => { if (getDefinition().tabs.includes(tab.dataset.tab)) { state.tab = tab.dataset.tab; render(); } }));
    content.addEventListener("click", (event) => { const target = event.target.closest("button"); if (!target) return; if (target.dataset.poll !== undefined) { const index = Number(target.dataset.poll); const maxSelections = getDefinition().poll.maxSelections || 1; if (state.pollSelections.has(index)) state.pollSelections.delete(index); else if (state.pollSelections.size < maxSelections) { if (maxSelections === 1) state.pollSelections.clear(); state.pollSelections.add(index); } render(); return; } if (target.dataset.ab) { state.abSelection = target.dataset.ab; render(); return; } if (target.dataset.action === "submit-poll") { state.pollSubmitted = true; render(true); return; } if (target.dataset.action === "reset-poll") { state.pollSubmitted = false; state.pollSelections.clear(); render(); return; } if (target.dataset.action === "submit-ab") { state.abSubmitted = true; render(true); return; } if (target.dataset.action === "reset-ab") { state.abSubmitted = false; render(); return; } if (target.dataset.action === "add-comment") { const input = root.querySelector("[data-comment-input]"); const value = input.value.trim(); if (!value) return; state.comments.unshift(value); render(); } });
    const collapseButton = root.querySelector('[data-action="collapse"]');
    collapseButton.addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      panel.classList.toggle("is-collapsed", state.collapsed);
      collapseButton.textContent = state.collapsed ? "⌃" : "⌄";
      collapseButton.setAttribute("aria-label", state.collapsed ? "패널 최대화" : "패널 최소화");
    });
    root.querySelector('[data-action="close"]').addEventListener("click", () => { panel.classList.add("is-hidden"); root.querySelector('[data-action="open"]').classList.remove("is-hidden"); });
    root.querySelector('[data-action="open"]').addEventListener("click", () => { panel.classList.remove("is-hidden"); root.querySelector('[data-action="open"]').classList.add("is-hidden"); });
    render();
    return Object.freeze({ activateSection, config: settings });
  }

  function bootstrap() {
    const roots = [...document.querySelectorAll("[data-userstory-participation]")];
    const instances = roots.map((root) => createParticipationPanel(root, window.USERSTORY_PARTICIPATION_CONFIG || {}));
    const instance = instances[0];
    const sections = [...document.querySelectorAll("main .page-section[id]")];
    if (instance && "IntersectionObserver" in window) {
      const visibleSections = new Set();
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleSections.add(entry.target);
          else visibleSections.delete(entry.target);
        });
        const visible = [...visibleSections].sort((left, right) => {
          const leftDistance = Math.abs(left.getBoundingClientRect().top + left.offsetHeight / 2 - window.innerHeight / 2);
          const rightDistance = Math.abs(right.getBoundingClientRect().top + right.offsetHeight / 2 - window.innerHeight / 2);
          return leftDistance - rightDistance;
        })[0];
        if (visible) instance.activateSection(visible.id);
      }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
      sections.forEach((section) => observer.observe(section));
    }
    window.UserStoryParticipation = Object.freeze({ instances, mount: createParticipationPanel });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  else bootstrap();
})();
