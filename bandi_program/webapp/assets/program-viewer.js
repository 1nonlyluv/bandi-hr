(function () {
  "use strict";

  var PAGE_FILES = {
    now: "./program-index.html",
    day: "./program-day.html",
    week: "./program-week.html",
    browse: "./program-browse.html",
    calendar: "./program-calendar.html"
  };
  var WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  var CALENDAR_SPECIAL_DAYS_2026 = {
    "2026-03-01": { holidayName: "삼일절" },
    "2026-03-02": { holidayName: "대체공휴일" },
    "2026-03-05": { seasonalNames: ["경칩"] },
    "2026-03-20": { seasonalNames: ["춘분"] },
    "2026-04-04": { seasonalNames: ["한식"] },
    "2026-04-05": { seasonalNames: ["청명", "식목일"] },
    "2026-04-20": { seasonalNames: ["곡우"] }
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDataUrl() {
    var params = new URLSearchParams(window.location.search);
    var version = params.get("v");
    return "./assets/program_schedule.json" + (version ? "?v=" + encodeURIComponent(version) : "");
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load " + url);
      }
      return response.json();
    });
  }

  function readListParam(params, name) {
    var value = params.get(name);
    if (!value) {
      return [];
    }
    return value.split(",").map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function makeParamsObject(params) {
    return {
      at: params.get("at") || "",
      date: params.get("date") || "",
      week: params.get("week") || "",
      q: params.get("q") || "",
      sort: params.get("sort") || "time",
      groups: readListParam(params, "groups"),
      categories: readListParam(params, "categories")
    };
  }

  function buildSearch(paramsObj) {
    var search = new URLSearchParams();
    if (paramsObj.at) {
      search.set("at", paramsObj.at);
    }
    if (paramsObj.date) {
      search.set("date", paramsObj.date);
    }
    if (paramsObj.week) {
      search.set("week", paramsObj.week);
    }
    if (paramsObj.q) {
      search.set("q", paramsObj.q);
    }
    if (paramsObj.sort && paramsObj.sort !== "time") {
      search.set("sort", paramsObj.sort);
    }
    if (paramsObj.groups && paramsObj.groups.length) {
      search.set("groups", paramsObj.groups.join(","));
    }
    if (paramsObj.categories && paramsObj.categories.length) {
      search.set("categories", paramsObj.categories.join(","));
    }
    var text = search.toString();
    return text ? "?" + text : "";
  }

  function pageHref(page, paramsObj) {
    return PAGE_FILES[page] + buildSearch(paramsObj);
  }

  function toggleListValue(list, value) {
    var next = (list || []).slice();
    var index = next.indexOf(value);
    if (index === -1) {
      next.push(value);
    } else {
      next.splice(index, 1);
    }
    return next;
  }

  function getMap(items) {
    var map = {};
    (items || []).forEach(function (item) {
      map[item.id] = item;
    });
    return map;
  }

  function formatDateLabel(date, weekday) {
    if (!date) {
      return "-";
    }
    var parts = date.split("-");
    var text = Number(parts[0]) + "년 " + Number(parts[1]) + "월 " + Number(parts[2]) + "일";
    return weekday ? text + " " + weekday + "요일" : text;
  }

  function formatAtLabel(atParts) {
    if (!atParts) {
      return "--:--";
    }
    return String(atParts.hour).padStart(2, "0") + ":" + String(atParts.minute).padStart(2, "0");
  }

  function statusLabel(status) {
    if (status === "in_block") {
      return "현재 프로그램 진행 중";
    }
    if (status === "before_open") {
      return "첫 프로그램 시작 전";
    }
    if (status === "between_blocks") {
      return "블록 사이 시간";
    }
    if (status === "after_close") {
      return "오늘 운영 종료";
    }
    return "운영 정보 없음";
  }

  function statusCopy(state) {
    if (state.status === "in_block" && state.block) {
      return "지금은 " + state.block.start + "부터 " + state.block.end + "까지의 시간 블록입니다. 남은 시간은 " + state.remainingMinutes + "분입니다.";
    }
    if (state.status === "before_open" && state.nextBlock) {
      return "아직 첫 프로그램 전입니다. 다음 블록은 " + state.nextBlock.start + "에 시작합니다.";
    }
    if (state.status === "between_blocks" && state.nextBlock) {
      return "현재는 블록 사이 시간입니다. 다음 블록까지 " + state.upcomingMinutes + "분 남았습니다.";
    }
    if (state.status === "after_close") {
      return "오늘의 마지막 시간 블록이 종료된 상태입니다.";
    }
    return "선택한 시각에 해당하는 데이터가 없습니다.";
  }

  function blockSummary(block) {
    if (!block || !Array.isArray(block.entries) || block.entries.length === 0) {
      return "일정 없음";
    }
    return block.entries.map(function (entry) {
      return entry.title;
    }).join(" / ");
  }

  function renderHeader(page, paramsObj) {
    return [
      '<header class="pv-header">',
      '  <a class="pv-brand" href="' + pageHref("now", paramsObj) + '">',
      '    <img src="./반디로고.png" alt="반디 로고" />',
      '    <span class="pv-brand-text">반디 프로그램 뷰어</span>',
      "  </a>",
      '  <nav class="pv-nav">',
      navLink("now", page, paramsObj, "Now"),
      navLink("day", page, paramsObj, "오늘"),
      navLink("week", page, paramsObj, "주간"),
      navLink("browse", page, paramsObj, "검색"),
      navLink("calendar", page, paramsObj, "달력"),
      "  </nav>",
      "</header>"
    ].join("");
  }

  function navLink(target, current, paramsObj, label) {
    var cls = target === current ? "pv-nav-link is-active" : "pv-nav-link";
    return '<a class="' + cls + '" href="' + pageHref(target, paramsObj) + '">' + escapeHtml(label) + "</a>";
  }

  function renderGroupChipRow(currentPage, paramsObj, groups, label) {
    return [
      '<section class="pv-card">',
      '  <p class="pv-eyebrow">' + escapeHtml(label) + "</p>",
      '  <div class="pv-chip-row">',
      (groups || []).map(function (group) {
        var nextParams = Object.assign({}, paramsObj, {
          groups: toggleListValue(paramsObj.groups, group.id)
        });
        var active = paramsObj.groups.indexOf(group.id) !== -1;
        var cls = active ? "pv-chip-link is-active" : "pv-chip-link";
        return '<a class="' + cls + '" href="' + pageHref(currentPage, nextParams) + '">' + escapeHtml(group.label) + "</a>";
      }).join(""),
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderCategoryChipRow(currentPage, paramsObj, categories, label) {
    return [
      '<section class="pv-card">',
      '  <p class="pv-eyebrow">' + escapeHtml(label) + "</p>",
      '  <div class="pv-chip-row">',
      (categories || []).map(function (category) {
        var nextParams = Object.assign({}, paramsObj, {
          categories: toggleListValue(paramsObj.categories, category.id)
        });
        var active = paramsObj.categories.indexOf(category.id) !== -1;
        var cls = active ? "pv-chip-link is-active" : "pv-chip-link";
        return '<a class="' + cls + '" href="' + pageHref(currentPage, nextParams) + '">' + escapeHtml(category.label) + "</a>";
      }).join(""),
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderEntryCard(entry, groupMap, categoryMap, extraMeta) {
    var groupPills = (entry.groupIds || []).map(function (groupId) {
      var group = groupMap[groupId] || { label: groupId, color: "#f1e3d3" };
      return '<span class="pv-pill" style="background:' + escapeHtml(group.color || "#f1e3d3") + ';">' + escapeHtml(group.label) + "</span>";
    }).join("");
    var category = categoryMap[entry.categoryId] || { label: entry.categoryId };
    var staffCopy = entry.staff && entry.staff.length
      ? (entry.staffRole ? entry.staffRole + ": " : "") + entry.staff.join(", ")
      : "담당자 없음";
    var extra = extraMeta ? '<div class="pv-entry-meta">' + extraMeta + "</div>" : "";

    return [
      '<article class="pv-entry-card">',
      '  <div class="pv-entry-top">',
      "    <div>",
      '      <h3 class="pv-entry-title">' + escapeHtml(entry.title) + "</h3>",
      '      <p class="pv-entry-subtitle">' + escapeHtml(entry.subtitle || "부제 없음") + "</p>",
      "    </div>",
      '    <div class="pv-pill-row">' + groupPills + '<span class="pv-pill">' + escapeHtml(category.label) + "</span></div>",
      "  </div>",
      '  <div class="pv-entry-meta"><span>' + escapeHtml(staffCopy) + "</span><span>장소: " + escapeHtml(entry.location || "-") + "</span></div>",
      extra,
      "</article>"
    ].join("");
  }

  function renderTimelineItem(item, activeBlockId, nowMinutes) {
    var cls = "pv-timeline-item";
    if (item.id === activeBlockId) {
      cls += " is-active";
    }
    var timing = "";
    if (typeof nowMinutes === "number") {
      if (item.endMin <= nowMinutes) {
        timing = "완료";
      } else if (item.startMin > nowMinutes) {
        timing = "예정";
      } else {
        timing = "진행중";
      }
    }
    return [
      '<article class="' + cls + '">',
      '  <strong class="pv-timeline-time">' + escapeHtml(item.start + " - " + item.end) + "</strong>",
      '  <span class="pv-timeline-copy">' + escapeHtml(item.section + " · " + item.count + "개 활동" + (timing ? " · " + timing : "")) + "</span>",
      "</article>"
    ].join("");
  }

  function sortBlocks(blocks) {
    return (blocks || []).slice().sort(function (a, b) {
      return (a.startMin || 0) - (b.startMin || 0);
    });
  }

  function buildGroupOrderMap(groups) {
    var order = {};
    (groups || []).forEach(function (group, index) {
      order[group.id] = index;
    });
    return order;
  }

  function findBlockIndex(blocks, targetBlock) {
    if (!targetBlock) {
      return -1;
    }
    return (blocks || []).findIndex(function (block) {
      return block.id === targetBlock.id;
    });
  }

  function getInitialNowBlockIndex(day, nowState) {
    var blocks = sortBlocks(day && day.blocks);
    if (!blocks.length) {
      return -1;
    }
    var activeIndex = findBlockIndex(blocks, nowState.block);
    if (activeIndex !== -1) {
      return activeIndex;
    }
    var nextIndex = findBlockIndex(blocks, nowState.nextBlock);
    if (nextIndex !== -1) {
      return nextIndex;
    }
    var prevIndex = findBlockIndex(blocks, nowState.prevBlock);
    if (prevIndex !== -1) {
      return prevIndex;
    }
    return 0;
  }

  function normalizeDisplayText(value) {
    return String(value || "")
      .replace(/등영서비스/g, "등원서비스")
      .replace(/등원서비스/g, "등원 서비스")
      .replace(/송영준비/g, "송영 준비")
      .replace(/송영서비스/g, "송영 서비스")
      .replace(/(담당|준비|진행)-\s*/g, "$1: ")
      .replace(/점심식사/g, "점심 식사")
      .replace(/저녁식사/g, "저녁 식사")
      .replace(/오전간식/g, "오전 간식")
      .replace(/오후간식/g, "오후 간식")
      .replace(/블록개수/g, "블록 개수")
      .replace(/그림찾기/g, "그림 찾기")
      .replace(/혈압,\s*체온체크/g, "혈압, 체온 체크")
      .replace(/체온체크/g, "체온 체크")
      .replace(/식사준비/g, "식사 준비")
      .replace(/개인위생/g, "개인 위생")
      .replace(/강당담당/g, "강당 담당")
      .replace(/재활-\s*/g, "재활: ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getWeekOfMonthLabel(dateText) {
    if (!dateText) {
      return "";
    }
    var parts = dateText.split("-").map(Number);
    var year = parts[0];
    var monthIndex = parts[1] - 1;
    var day = parts[2];
    var sundayCount = 0;
    for (var dateNum = 1; dateNum <= day; dateNum += 1) {
      if (new Date(year, monthIndex, dateNum).getDay() === 0) {
        sundayCount += 1;
      }
    }
    return parts[1] + "월 " + String(Math.max(1, sundayCount)) + "주차";
  }

  function getWeekdayNameFromDate(dateText) {
    if (!dateText) {
      return "";
    }
    var date = new Date(dateText + "T12:00:00");
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return WEEKDAY_NAMES[date.getDay()] || "";
  }

  function getCalendarSpecialInfo(dateText) {
    var info = CALENDAR_SPECIAL_DAYS_2026[dateText] || {};
    var holidayName = info.holidayName || "";
    var seasonalNames = Array.isArray(info.seasonalNames) ? info.seasonalNames.slice() : [];
    var noteParts = [];
    if (holidayName) {
      noteParts.push(holidayName);
    }
    seasonalNames.forEach(function (name) {
      if (name && noteParts.indexOf(name) === -1) {
        noteParts.push(name);
      }
    });
    return {
      isHoliday: Boolean(holidayName),
      holidayName: holidayName,
      seasonalNames: seasonalNames,
      note: noteParts.join(" · ")
    };
  }

  function formatNowDateLabel(day) {
    if (!day) {
      return "날짜 데이터가 없습니다.";
    }
    return formatDateLabel(day.date, day.weekday) + " (" + getWeekOfMonthLabel(day.date) + ")";
  }

  function formatEntryStaffSuffix(entry) {
    var names = entry && entry.staff && entry.staff.length ? entry.staff.join(", ") : "";
    if (!names) {
      return "";
    }
    if (entry.staffRole === "강사") {
      return " (" + names + " 강사)";
    }
    if (entry.staffRole === "준비") {
      return " (준비: " + names + ")";
    }
    if (entry.staffRole === "담당") {
      return " (담당: " + names + ")";
    }
    if (entry.staffRole === "진행") {
      return " (진행: " + names + ")";
    }
    return " (" + names + ")";
  }

  function stripEmbeddedStaffMarker(text, entry) {
    var value = normalizeDisplayText(text || "");
    var names = entry && entry.staff && entry.staff.length ? entry.staff.join(", ") : "";
    if (!value || !names) {
      return value;
    }
    var escapedNames = names.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (entry.staffRole === "강사") {
      return value.replace(new RegExp("\\s*" + escapedNames + "\\s*강사\\s*$"), "").trim();
    }
    if (entry.staffRole === "담당" || entry.staffRole === "준비" || entry.staffRole === "진행") {
      return value.replace(new RegExp("\\s*" + entry.staffRole + "[:：]\\s*" + escapedNames + "\\s*$"), "").trim();
    }
    return value;
  }

  function renderProgramCopyHtml(mainText, metaText, metaBlock) {
    var html = '<span class="pv-now-program-copy-main">' + escapeHtml(mainText) + "</span>";
    if (metaText) {
      html += '<span class="pv-now-program-meta' + (metaBlock ? ' is-block' : '') + '">' + escapeHtml(metaText) + "</span>";
    }
    return '<span class="pv-now-program-copy">' + html + "</span>";
  }

  function renderEntryIcon(entry) {
    var title = normalizeDisplayText(entry && entry.title ? entry.title : "");
    if (title === "건강체조1" || title === "건강체조2") {
      return "";
    }
    if (entry.categoryId === "custom") {
      return '<span class="pv-entry-token pv-entry-token-custom">맞</span>';
    }
    if (entry.categoryId === "physical") {
      return '<span class="pv-entry-token pv-entry-token-physical">신</span>';
    }
    if (entry.categoryId === "cognitive") {
      return '<span class="pv-entry-token pv-entry-token-cognitive">인</span>';
    }
    return "";
  }

  function formatCustomTrack(subtitle) {
    var text = normalizeDisplayText(subtitle || "");
    return text.indexOf("맞춤형-") === 0 ? text.slice("맞춤형-".length) : text;
  }

  function formatEntryContentHtml(entry) {
    var title = stripEmbeddedStaffMarker(entry.title || "", entry);
    var subtitle = normalizeDisplayText(entry.subtitle || "");
    var staffSuffix = formatEntryStaffSuffix(entry);
    var iconHtml = renderEntryIcon(entry);
    var bodyText = "";
    var metaText = "";

    if (entry.categoryId === "custom") {
      bodyText = formatCustomTrack(subtitle);
      if (title) {
        bodyText += (bodyText ? " - " : "") + title;
      }
      metaText = staffSuffix.replace(/^\s*\(|\)\s*$/g, "");
      return iconHtml + renderProgramCopyHtml(bodyText, metaText);
    }

    if (entry.categoryId === "physical" || entry.categoryId === "cognitive") {
      if (title === "오후 간식") {
        metaText = subtitle;
        if (staffSuffix) {
          metaText = metaText
            ? metaText + " " + staffSuffix.replace(/^\s*\(|\)\s*$/g, "")
            : staffSuffix.replace(/^\s*\(|\)\s*$/g, "");
        }
        return iconHtml + renderProgramCopyHtml(bodyText || title, metaText, true);
      }
      bodyText = title;
      if (subtitle) {
        bodyText += " - " + subtitle;
      }
      metaText = staffSuffix.replace(/^\s*\(|\)\s*$/g, "");
      return iconHtml + renderProgramCopyHtml(bodyText, metaText, false);
    }

    bodyText = title;
    if (subtitle) {
      metaText = subtitle;
    }
    if (staffSuffix) {
      metaText = metaText ? metaText + " / " + staffSuffix.replace(/^\s*\(|\)\s*$/g, "") : staffSuffix.replace(/^\s*\(|\)\s*$/g, "");
    }
    return renderProgramCopyHtml(bodyText, metaText, false);
  }

  function getEntryGroupLabel(entry, groupMap) {
    var groupIds = entry && Array.isArray(entry.groupIds) ? entry.groupIds : [];
    if (!groupIds.length || groupIds[0] === "all") {
      return "공통";
    }
    if (groupIds.length === 1) {
      return groupMap[groupIds[0]] ? groupMap[groupIds[0]].label : groupIds[0];
    }
    return groupIds.map(function (groupId) {
      return groupMap[groupId] ? groupMap[groupId].label : groupId;
    }).join(" · ");
  }

  function buildCompactProgramLines(block, selectors, filters, groupMap, groupOrder) {
    var entries = selectors.selectVisibleEntries(block, filters);
    if (!entries.length) {
      return [{
        key: (block && block.id ? block.id : "block") + "-empty",
        label: "공통",
        contentHtml: '<span class="pv-now-program-copy">표시할 프로그램이 없습니다.</span>'
      }];
    }
    return entries.map(function (entry, index) {
      return {
        key: entry.id || ((block && block.id ? block.id : "block") + "-" + index),
        label: getEntryGroupLabel(entry, groupMap),
        contentHtml: formatEntryContentHtml(entry)
      };
    });
  }

  function renderNowProgramLine(line) {
    return [
      '<p class="pv-now-program-line">',
      '  <span class="pv-now-program-group">' + escapeHtml(line.label) + "</span>",
      '  <span class="pv-now-program-text">' + line.contentHtml + "</span>",
      "</p>"
    ].join("");
  }

  function renderNowProgramList(block, selectors, filters, groupMap, groupOrder) {
    return buildCompactProgramLines(block, selectors, filters, groupMap, groupOrder)
      .map(renderNowProgramLine)
      .join("");
  }

  function getMaxCompactLineCount(blocks, selectors, filters, groupMap, groupOrder) {
    return (blocks || []).reduce(function (maxCount, block) {
      var lineCount = buildCompactProgramLines(block, selectors, filters, groupMap, groupOrder).length;
      return Math.max(maxCount, lineCount);
    }, 1);
  }

  function renderNowBlockPanel(block, selectors, filters, groupMap, groupOrder, isActive) {
    if (!block) {
      return [
        '<article class="pv-now-panel is-empty">',
        '  <p class="pv-now-panel-time">--:-- - --:--</p>',
        '  <div class="pv-now-program-list">',
        '    <p class="pv-now-program-line"><span class="pv-now-program-group">공통</span><span class="pv-now-program-text"><span class="pv-now-program-copy">표시할 블록이 없습니다.</span></span></p>',
        "  </div>",
        "</article>"
      ].join("");
    }
    var cls = isActive ? "pv-now-panel is-active" : "pv-now-panel";
    return [
      '<article class="' + cls + '" data-block-id="' + escapeHtml(block.id) + '">',
      '  <p class="pv-now-panel-time">' + escapeHtml(block.start + "-" + block.end) + "</p>",
      '  <div class="pv-now-program-list">',
      renderNowProgramList(block, selectors, filters, groupMap, groupOrder),
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderNowTrack(state) {
    if (!state.blockTrack) {
      return;
    }
    var blocks = Array.isArray(state.blocks) ? state.blocks : [];
    state.blockTrack.innerHTML = blocks.length
      ? blocks.map(function (block, index) {
          return renderNowBlockPanel(block, state.selectors, state.filters, state.groupMap, state.groupOrder, index === state.blockIndex);
        }).join("")
      : renderNowBlockPanel(null, state.selectors, state.filters, state.groupMap, state.groupOrder, true);
  }

  function syncNowViewport(state, behavior) {
    if (!state.blockViewport) {
      return;
    }
    state.blockViewport.scrollTo({
      top: Math.max(0, state.blockIndex) * state.panelStep,
      behavior: behavior || "smooth"
    });
  }

  function setNowBlockIndex(state, nextIndex, shouldScroll) {
    if (!Array.isArray(state.blocks) || !state.blocks.length) {
      state.blockIndex = -1;
      renderNowTrack(state);
      return;
    }
    var bounded = Math.max(0, Math.min(state.blocks.length - 1, nextIndex));
    if (bounded === state.blockIndex && !shouldScroll) {
      return;
    }
    state.blockIndex = bounded;
    renderNowTrack(state);
    if (shouldScroll) {
      syncNowViewport(state, "smooth");
    }
  }

  function bindNowBlockNavigation(state) {
    var viewport = state.blockViewport;
    if (!viewport) {
      return;
    }
    var scrollTimer = null;
    viewport.addEventListener("scroll", function () {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(function () {
        var index = Math.round(viewport.scrollTop / state.panelStep);
        setNowBlockIndex(state, index, false);
      }, 80);
    }, { passive: true });
  }

  function updateNowExpandedState(state) {
    if (state.stage) {
      state.stage.classList.toggle("is-expanded", state.isExpanded);
    }
    if (state.expandButton) {
      state.expandButton.classList.toggle("is-active", state.isExpanded);
      state.expandButton.textContent = state.isExpanded ? "축소 보기" : "전체 보기";
      state.expandButton.setAttribute("aria-expanded", state.isExpanded ? "true" : "false");
    }
  }

  function bindNowExpandToggle(state) {
    if (!state.expandButton) {
      return;
    }
    state.expandButton.addEventListener("click", function () {
      state.isExpanded = !state.isExpanded;
      updateNowExpandedState(state);
      window.requestAnimationFrame(function () {
        syncNowViewport(state, "auto");
      });
    });
  }

  function bindNowHome(state) {
    if (!state.homeButton) {
      return;
    }
    state.homeButton.addEventListener("click", function () {
      state.isExpanded = false;
      updateNowExpandedState(state);
      setNowBlockIndex(state, state.currentBlockIndex, true);
    });
  }

  function scheduleNowTick(state) {
    var now = new Date();
    var waitMs = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 40;
    state.clockTimer = window.setTimeout(function () {
      refreshNowLiveState(state);
      scheduleNowTick(state);
    }, waitMs);
  }

  function refreshNowLiveState(state) {
    var nextNowState = state.selectors.selectNowState(state.data, "", state.filters);
    if (!nextNowState.day || !state.selectedDay || nextNowState.day.date !== state.selectedDay.date) {
      renderNowPage(state.data, state.paramsObj, state.root);
      return;
    }
    var wasFollowingLive = state.blockIndex === state.currentBlockIndex && !state.isExpanded;
    state.nowState = nextNowState;
    state.currentBlockIndex = getInitialNowBlockIndex(state.selectedDay, nextNowState);
    if (state.clockNode) {
      state.clockNode.textContent = formatAtLabel(nextNowState.at);
    }
    if (wasFollowingLive) {
      setNowBlockIndex(state, state.currentBlockIndex, true);
    }
  }

  function renderNowPage(data, paramsObj, root) {
    if (typeof root.__pvCleanup === "function") {
      root.__pvCleanup();
      root.__pvCleanup = null;
    }

    var selectors = window.ProgramViewerSelectors;
    var filters = {
      groups: paramsObj.groups,
      categories: paramsObj.categories
    };
    var nowState = selectors.selectNowState(data, paramsObj.at, filters);
    var days = Array.isArray(data.days) ? data.days : [];
    var requestedDay = paramsObj.date ? selectors.selectDay(data, paramsObj.date) : null;
    var selectedDay = requestedDay || nowState.day || days[0] || null;
    var blocks = sortBlocks(selectedDay && selectedDay.blocks);
    var currentBlockIndex = requestedDay && (!nowState.day || requestedDay.date !== nowState.day.date)
      ? 0
      : getInitialNowBlockIndex(selectedDay, nowState);
    var blockIndex = currentBlockIndex;
    var groupMap = getMap(data.taxonomies.groups);
    var groupOrder = buildGroupOrderMap(data.taxonomies.groups);
    var maxLineCount = getMaxCompactLineCount(blocks, selectors, filters, groupMap, groupOrder);
    var panelHeight = Math.max(168, 80 + maxLineCount * 58);
    var panelGap = 16;
    var railPadding = 56;

    root.innerHTML = [
      '<section class="pv-now-shell">',
      '  <div class="pv-now-floating-bar">',
      '    <div class="pv-now-floating-actions">',
      '      <button type="button" class="pv-now-home" id="pv-now-home" aria-label="현재 시간대로 돌아가기">',
      '        <img src="./반디로고.png" alt="반디 로고" />',
      '        <span class="pv-now-home-text">반디 프로그램</span>',
      "      </button>",
      '      <a class="pv-now-link" href="' + pageHref("calendar", Object.assign({}, paramsObj, { date: selectedDay ? selectedDay.date : "" })) + '">달력</a>',
      "    </div>",
      "  </div>",
      '  <section class="pv-now-stage">',
      '    <div class="pv-now-stage-head">',
      '      <div class="pv-now-kicker-row"><p class="pv-now-kicker">now</p><p class="pv-now-clock" id="pv-now-clock">' + escapeHtml(formatAtLabel(nowState.at)) + '</p></div>',
      '      <p class="pv-now-selected-date">' + escapeHtml(formatNowDateLabel(selectedDay)) + "</p>",
      "    </div>",
      '    <section class="pv-now-card">',
      '      <div class="pv-now-viewport" id="pv-now-viewport">',
      '        <div class="pv-now-track" id="pv-now-track"></div>',
      "      </div>",
      "    </section>",
      '    <button type="button" class="pv-now-expand-button" id="pv-now-expand" aria-expanded="false">전체 보기</button>',
      "  </section>",
      "</section>"
    ].join("");

    var viewState = {
      root: root,
      data: data,
      paramsObj: paramsObj,
      selectors: selectors,
      filters: filters,
      nowState: nowState,
      selectedDay: selectedDay,
      blocks: blocks,
      blockIndex: blockIndex,
      currentBlockIndex: currentBlockIndex,
      groupMap: groupMap,
      groupOrder: groupOrder,
      panelHeight: panelHeight,
      panelGap: panelGap,
      panelStep: panelHeight + panelGap,
      railPadding: railPadding,
      stage: root.querySelector(".pv-now-stage"),
      clockNode: root.querySelector("#pv-now-clock"),
      homeButton: root.querySelector("#pv-now-home"),
      blockTrack: root.querySelector("#pv-now-track"),
      blockViewport: root.querySelector("#pv-now-viewport"),
      expandButton: root.querySelector("#pv-now-expand"),
      isExpanded: false,
      clockTimer: null
    };

    if (viewState.stage) {
      viewState.stage.style.setProperty("--pv-now-panel-height", String(viewState.panelHeight) + "px");
      viewState.stage.style.setProperty("--pv-now-panel-gap", String(viewState.panelGap) + "px");
      viewState.stage.style.setProperty("--pv-now-rail-padding", String(viewState.railPadding) + "px");
    }

    renderNowTrack(viewState);
    if (viewState.blockViewport) {
      viewState.blockViewport.scrollTop = Math.max(0, viewState.blockIndex) * viewState.panelStep;
    }
    updateNowExpandedState(viewState);
    bindNowBlockNavigation(viewState);
    bindNowExpandToggle(viewState);
    bindNowHome(viewState);
    scheduleNowTick(viewState);

    root.__pvCleanup = function () {
      if (viewState.clockTimer) {
        window.clearTimeout(viewState.clockTimer);
      }
    };
  }

  function renderJumpCard(label, block, emptyCopy) {
    return [
      '<article class="pv-jump-card">',
      '  <span class="pv-jump-label">' + escapeHtml(label) + "</span>",
      '  <strong class="pv-jump-time">' + escapeHtml(block ? block.start + " - " + block.end : label === "이전 블록" ? "이전 블록 없음" : "다음 블록 없음") + "</strong>",
      '  <span class="pv-jump-copy">' + escapeHtml(block ? blockSummary(block) : emptyCopy) + "</span>",
      "</article>"
    ].join("");
  }

  function renderDayPage(data, paramsObj, root) {
    var selectors = window.ProgramViewerSelectors;
    var groupMap = getMap(data.taxonomies.groups);
    var categoryMap = getMap(data.taxonomies.categories);
    var nowParts = selectors.resolveAtParts(paramsObj.at, data.meta.timezone);
    var date = paramsObj.date || nowParts.date;
    var day = selectors.selectDay(data, date);
    var activeBlockId = null;

    if (day && nowParts.date === day.date) {
      var nowState = selectors.selectNowState(data, paramsObj.at, {
        groups: paramsObj.groups,
        categories: paramsObj.categories
      });
      activeBlockId = nowState.block ? nowState.block.id : null;
    }

    var header = renderHeader("day", Object.assign({}, paramsObj, { date: date }));
    var content = "";
    if (!day) {
      content = '<section class="pv-card"><h2 class="pv-section-title">해당 날짜 데이터가 없습니다.</h2><p class="pv-empty">달력 화면에서 다른 날짜를 선택하세요.</p></section>';
    } else {
      content = [
        '<section class="pv-card">',
        '  <p class="pv-eyebrow">Day</p>',
        '  <h1 class="pv-title">' + escapeHtml(formatDateLabel(day.date, day.weekday)) + "</h1>",
        '  <p class="pv-subtitle">강당 담당: ' + escapeHtml(day.venueManager || "-") + "</p>",
        '  <div class="pv-actions">',
        '    <a class="pv-action-link" href="' + pageHref("now", Object.assign({}, paramsObj, { date: day.date })) + '">Now로 돌아가기</a>',
        '    <a class="pv-action-link" href="' + pageHref("calendar", Object.assign({}, paramsObj, { date: day.date })) + '">달력에서 보기</a>',
        "  </div>",
        "</section>",
        renderGroupChipRow("day", paramsObj, data.taxonomies.groups, "반 필터"),
        renderCategoryChipRow("day", paramsObj, data.taxonomies.categories, "분류 필터"),
        '<section class="pv-card">',
        '  <h2 class="pv-section-title">하루 전체 타임라인</h2>',
        '  <div class="pv-day-list">',
        day.blocks.map(function (block) {
          var blockCls = block.id === activeBlockId ? "pv-day-card is-active" : "pv-day-card";
          var visibleEntries = selectors.selectVisibleEntries(block, {
            groups: paramsObj.groups,
            categories: paramsObj.categories
          });
          return [
            '<article class="' + blockCls + '">',
            '  <div class="pv-day-card-head">',
            '    <div>',
            '      <strong class="pv-day-time">' + escapeHtml(block.start + " - " + block.end) + "</strong>",
            '      <div class="pv-day-info">' + escapeHtml(block.section) + "</div>",
            "    </div>",
            '    <span class="pv-mini-chip">' + escapeHtml(String(visibleEntries.length) + "개 표시 중") + "</span>",
            "  </div>",
            '  <div class="pv-entry-list">' + (visibleEntries.length ? visibleEntries.map(function (entry) {
              return renderEntryCard(entry, groupMap, categoryMap, "");
            }).join("") : '<p class="pv-empty">선택한 필터에 맞는 활동이 없습니다.</p>') + "</div>",
            "</article>"
          ].join("");
        }).join(""),
        "  </div>",
        "</section>"
      ].join("");
    }
    root.innerHTML = header + '<section class="pv-layout">' + content + "</section>";
  }

  function renderBrowsePage(data, paramsObj, root) {
    var selectors = window.ProgramViewerSelectors;
    var groupMap = getMap(data.taxonomies.groups);
    var categoryMap = getMap(data.taxonomies.categories);
    var entries = selectors.selectBrowseEntries(data, {
      groups: paramsObj.groups,
      categories: paramsObj.categories,
      query: paramsObj.q
    }, paramsObj.sort);
    var header = renderHeader("browse", paramsObj);

    root.innerHTML = [
      header,
      '<section class="pv-layout">',
      '  <section class="pv-card">',
      '    <p class="pv-eyebrow">Browse</p>',
      '    <h1 class="pv-title">전체 검색</h1>',
      '    <p class="pv-subtitle">시간, 반, 유형, 키워드 기준으로 프로그램을 좁힐 수 있습니다.</p>',
      '    <form class="pv-form" id="browse-form">',
      '      <div class="pv-form-row">',
      '        <input class="pv-form-input" type="search" name="q" placeholder="프로그램명, 담당자, 태그 검색" value="' + escapeHtml(paramsObj.q) + '" />',
      '        <select class="pv-form-select" name="sort">',
      renderSortOptions(paramsObj.sort),
      "        </select>",
      '        <button class="pv-action-link" type="submit">적용</button>',
      "      </div>",
      "    </form>",
      "  </section>",
      renderGroupChipRow("browse", paramsObj, data.taxonomies.groups, "반 필터"),
      renderCategoryChipRow("browse", paramsObj, data.taxonomies.categories, "분류 필터"),
      '  <section class="pv-card">',
      '    <div class="pv-toolbar">',
      '      <h2 class="pv-section-title">검색 결과</h2>',
      '      <span class="pv-count">' + escapeHtml(String(entries.length) + "건") + "</span>",
      "    </div>",
      '    <div class="pv-results-list">' + (entries.length ? entries.map(function (entry) {
        var extraMeta = '<span>' + escapeHtml(formatDateLabel(entry.date, entry.weekday)) + "</span><span>" + escapeHtml(entry.start + " - " + entry.end) + "</span>";
        return renderEntryCard(entry, groupMap, categoryMap, extraMeta);
      }).join("") : '<p class="pv-empty">조건에 맞는 결과가 없습니다.</p>') + "</div>",
      "  </section>",
      "</section>"
    ].join("");

    bindBrowseForm(paramsObj);
  }

  function deriveWeeks(data) {
    if (Array.isArray(data.weeks) && data.weeks.length) {
      return data.weeks.slice();
    }
    var weeks = [];
    var seen = {};
    (data.days || []).forEach(function (day) {
      var key = day.weekKey || day.date;
      if (!seen[key]) {
        seen[key] = true;
        weeks.push({
          key: key,
          label: day.weekLabel || key,
          startDate: key,
          endDate: day.date
        });
      } else {
        weeks[weeks.length - 1].endDate = day.date;
      }
    });
    return weeks;
  }

  function parseDateParts(dateText) {
    var parts = String(dateText || "").split("-").map(Number);
    return {
      year: parts[0] || 0,
      month: parts[1] || 0,
      day: parts[2] || 0
    };
  }

  function dateToMonthKey(dateText) {
    var parts = parseDateParts(dateText);
    if (!parts.year || !parts.month) {
      return "";
    }
    return String(parts.year) + "-" + String(parts.month).padStart(2, "0");
  }

  function monthTitleFromKey(monthKey) {
    var parts = String(monthKey || "").split("-").map(Number);
    if (!parts[0] || !parts[1]) {
      return "월 정보 없음";
    }
    return parts[0] + "년 " + parts[1] + "월";
  }

  function addMonths(monthKey, diff) {
    var parts = String(monthKey || "").split("-").map(Number);
    if (!parts[0] || !parts[1]) {
      return "";
    }
    var base = new Date(parts[0], parts[1] - 1 + diff, 1);
    return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0");
  }

  function deriveMonths(days) {
    var seen = {};
    return (days || []).reduce(function (months, day) {
      var key = dateToMonthKey(day.date);
      if (!key || seen[key]) {
        return months;
      }
      seen[key] = true;
      months.push({
        key: key,
        label: monthTitleFromKey(key)
      });
      return months;
    }, []);
  }

  function buildDayMap(days) {
    var map = {};
    (days || []).forEach(function (day) {
      map[day.date] = day;
    });
    return map;
  }

  function buildCalendarMonthDays(monthKey, dayMap) {
    var parts = String(monthKey || "").split("-").map(Number);
    if (!parts[0] || !parts[1]) {
      return [];
    }
    var year = parts[0];
    var monthIndex = parts[1] - 1;
    var totalDays = new Date(year, monthIndex + 1, 0).getDate();
    var monthDays = [];
    for (var dayNumber = 1; dayNumber <= totalDays; dayNumber += 1) {
      var date = new Date(year, monthIndex, dayNumber);
      var dateText = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
      monthDays.push({
        date: dateText,
        number: dayNumber,
        weekdayIndex: date.getDay(),
        weekdayLabel: WEEKDAY_NAMES[date.getDay()] || "",
        day: dayMap[dateText] || null
      });
    }
    return monthDays;
  }

  function buildCalendarMatrix(monthKey, dayMap) {
    var parts = String(monthKey || "").split("-").map(Number);
    if (!parts[0] || !parts[1]) {
      return [];
    }
    var year = parts[0];
    var monthIndex = parts[1] - 1;
    var firstDate = new Date(year, monthIndex, 1);
    var firstWeekday = firstDate.getDay();
    var gridStart = new Date(year, monthIndex, 1 - firstWeekday);
    var cells = [];
    for (var i = 0; i < 42; i += 1) {
      var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var dateText = cellDate.getFullYear() + "-" + String(cellDate.getMonth() + 1).padStart(2, "0") + "-" + String(cellDate.getDate()).padStart(2, "0");
      cells.push({
        date: dateText,
        number: cellDate.getDate(),
        isCurrentMonth: cellDate.getMonth() === monthIndex,
        day: dayMap[dateText] || null
      });
    }
    return cells;
  }

  function getDateLabelShort(dateText) {
    var parts = parseDateParts(dateText);
    if (!parts.month || !parts.day) {
      return "-";
    }
    return parts.month + "." + parts.day;
  }

  function summarizeDayBlocks(day) {
    return (day && Array.isArray(day.blocks) ? day.blocks : []).slice(0, 3).map(function (block) {
      var firstEntry = block.entries && block.entries[0] ? normalizeDisplayText(block.entries[0].title || "") : "일정 없음";
      return {
        id: block.id,
        time: block.start + "-" + block.end,
        summary: firstEntry
      };
    });
  }

  function renderWeekPage(data, paramsObj, root) {
    var selectors = window.ProgramViewerSelectors;
    var weeks = deriveWeeks(data);
    var nowParts = selectors.resolveAtParts(paramsObj.at, data.meta.timezone);
    var fallbackWeek = weeks.find(function (week) {
      return week.startDate <= nowParts.date && nowParts.date <= week.endDate;
    }) || weeks[0] || null;
    var activeWeekKey = paramsObj.week || (fallbackWeek ? fallbackWeek.key : "");
    var activeWeek = weeks.find(function (week) {
      return week.key === activeWeekKey;
    }) || fallbackWeek;
    var weekDays = (data.days || []).filter(function (day) {
      return activeWeek ? (day.weekKey || day.date) === activeWeek.key : false;
    });

    root.innerHTML = [
      renderHeader("week", Object.assign({}, paramsObj, { week: activeWeek ? activeWeek.key : "" })),
      '<section class="pv-layout">',
      '  <section class="pv-card">',
      '    <p class="pv-eyebrow">Week</p>',
      '    <h1 class="pv-title">' + escapeHtml(activeWeek ? activeWeek.label : "주간 데이터 없음") + "</h1>",
      '    <p class="pv-subtitle">' + escapeHtml(activeWeek ? (formatDateLabel(activeWeek.startDate) + " - " + formatDateLabel(activeWeek.endDate)) : "표시할 주간 데이터가 없습니다.") + "</p>",
      "  </section>",
      '  <section class="pv-card">',
      '    <p class="pv-eyebrow">주차 선택</p>',
      '    <div class="pv-chip-row">' + weeks.map(function (week) {
        var cls = week.key === (activeWeek && activeWeek.key) ? "pv-chip-link is-active" : "pv-chip-link";
        return '<a class="' + cls + '" href="' + pageHref("week", Object.assign({}, paramsObj, { week: week.key, date: week.startDate })) + '">' + escapeHtml(week.label) + "</a>";
      }).join("") + "</div>",
      "  </section>",
      '  <section class="pv-grid-2">' + weekDays.map(function (day) {
        return [
          '<article class="pv-day-card">',
          '  <div class="pv-day-card-head">',
          "    <div>",
          '      <h2 class="pv-day-date">' + escapeHtml(formatDateLabel(day.date, day.weekday)) + "</h2>",
          '      <div class="pv-day-info">강당 담당: ' + escapeHtml(day.venueManager || "-") + "</div>",
          "    </div>",
          '    <a class="pv-action-link" href="' + pageHref("day", Object.assign({}, paramsObj, { date: day.date, week: activeWeek ? activeWeek.key : "" })) + '">하루 보기</a>',
          "  </div>",
          '  <div class="pv-timeline-list">' + (day.blocks || []).map(function (block) {
            return renderTimelineItem({
              id: block.id,
              start: block.start,
              end: block.end,
              startMin: block.startMin,
              endMin: block.endMin,
              section: block.section,
              count: (block.entries || []).length
            }, null, null);
          }).join("") + "</div>",
          "</article>"
        ].join("");
      }).join("") + "</section>",
      "</section>"
    ].join("");
  }

  function renderSortOptions(currentSort) {
    return [
      optionTag("time", "시간순", currentSort),
      optionTag("title", "이름순", currentSort),
      optionTag("group", "반순", currentSort),
      optionTag("category", "분류순", currentSort)
    ].join("");
  }

  function optionTag(value, label, currentSort) {
    var selected = value === currentSort ? ' selected' : "";
    return '<option value="' + escapeHtml(value) + '"' + selected + ">" + escapeHtml(label) + "</option>";
  }

  function bindBrowseForm(paramsObj) {
    var form = document.getElementById("browse-form");
    if (!form) {
      return;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var formData = new FormData(form);
      var next = Object.assign({}, paramsObj, {
        q: String(formData.get("q") || "").trim(),
        sort: String(formData.get("sort") || "time")
      });
      window.location.href = pageHref("browse", next);
    });
  }

  function renderCalendarPage(data, paramsObj, root) {
    var selectors = window.ProgramViewerSelectors;
    var nowParts = selectors.resolveAtParts(paramsObj.at, data.meta.timezone);
    var days = Array.isArray(data.days) ? data.days : [];
    var dayMap = buildDayMap(days);
    var months = deriveMonths(days);
    var fallbackDate = paramsObj.date || nowParts.date || (days[0] ? days[0].date : "");
    var fallbackMonthKey = dateToMonthKey(fallbackDate);
    var activeMonth = months.find(function (month) {
      return month.key === fallbackMonthKey;
    }) || months[0] || null;
    var activeMonthKey = activeMonth ? activeMonth.key : "";
    var monthDays = buildCalendarMonthDays(activeMonthKey, dayMap);
    var selectedDate = paramsObj.date && dateToMonthKey(paramsObj.date) === activeMonthKey
      ? paramsObj.date
      : (monthDays.find(function (day) { return Boolean(day.day); }) || monthDays[0] || { date: "" }).date;
    var todayDate = nowParts.date || "";

    root.innerHTML = [
      '<div class="pv-now-floating-bar pv-calendar-floating-bar">',
      '  <div class="pv-now-floating-actions">',
      '    <a class="pv-now-home" href="' + pageHref("now", paramsObj) + '" aria-label="프로그램 홈으로 돌아가기">',
      '    <img src="./반디로고.png" alt="반디 로고" />',
      '    <span class="pv-now-home-text">반디 프로그램</span>',
      "    </a>",
      "  </div>",
      "</div>",
      '<section class="pv-calendar-layout">',
      '  <section class="pv-calendar-header-card">',
      "    <div>",
      '      <p class="pv-eyebrow">월별 프로그램 캘린더</p>',
      '      <h1 class="pv-calendar-title">' + escapeHtml(activeMonth ? activeMonth.label : "달력 데이터 없음") + "</h1>",
      "    </div>",
      '    <div class="pv-calendar-controls">',
      '      <select class="pv-calendar-month-select" id="pv-calendar-month-select">' + months.map(function (month) {
        return '<option value="' + escapeHtml(month.key) + '"' + (month.key === activeMonthKey ? " selected" : "") + ">" + escapeHtml(month.label) + "</option>";
      }).join("") + "</select>",
      "    </div>",
      "  </section>",
      '  <section class="pv-calendar-grid-shell">',
      '    <div class="pv-calendar-grid-shuttle" id="pv-calendar-grid"></div>',
      "  </section>",
      "</section>"
    ].join("");

    var monthSelect = root.querySelector("#pv-calendar-month-select");
    var calendarGrid = root.querySelector("#pv-calendar-grid");
    var state = {
      activeMonthKey: activeMonthKey,
      selectedDate: selectedDate
    };

    function syncCalendarUrl(replace) {
      var nextUrl = new URL(window.location.href);
      if (state.selectedDate) {
        nextUrl.searchParams.set("date", state.selectedDate);
      } else {
        nextUrl.searchParams.delete("date");
      }
      if (replace) {
        window.history.replaceState({ date: state.selectedDate }, "", nextUrl);
      } else {
        window.history.pushState({ date: state.selectedDate }, "", nextUrl);
      }
    }

    function renderCalendarGrid() {
      var visibleDays = buildCalendarMonthDays(state.activeMonthKey, dayMap);
      var weekdayHeader = WEEKDAY_NAMES.map(function (weekday, index) {
        return '<div class="pv-weekday-chip' + (index === 0 ? " is-sunday" : "") + '">' + escapeHtml(weekday) + "</div>";
      }).join("");
      var firstWeekday = visibleDays.length ? visibleDays[0].weekdayIndex : 0;
      var leadingSlots = Array.from({ length: firstWeekday }, function () {
        return '<div class="pv-calendar-day-card empty-slot" aria-hidden="true"></div>';
      }).join("");
      var dayCards = visibleDays.map(function (calendarDay) {
        var special = getCalendarSpecialInfo(calendarDay.date);
        var noteText = special.note || "\u00A0";
        var cardCls = "pv-calendar-day-card";
        if (calendarDay.weekdayIndex === 0) {
          cardCls += " is-sunday";
        }
        if (special.isHoliday) {
          cardCls += " is-holiday";
        }
        if (state.selectedDate === calendarDay.date) {
          cardCls += " is-selected";
        }
        if (todayDate === calendarDay.date) {
          cardCls += " is-today";
        }
        return [
          '<button type="button" class="' + cardCls + '" data-date="' + escapeHtml(calendarDay.date) + '">',
          '  <span class="pv-calendar-day-number">' + escapeHtml(String(calendarDay.number)) + ' <small>' + escapeHtml(calendarDay.weekdayLabel) + "</small></span>",
          '  <span class="pv-calendar-day-note' + (noteText.trim() ? "" : " is-empty") + '">' + escapeHtml(noteText) + "</span>",
          "</button>"
        ].join("");
      }).join("");
      calendarGrid.innerHTML = weekdayHeader + leadingSlots + dayCards;
    }

    function pickMonthDefaultDate(monthKey) {
      var visibleDays = buildCalendarMonthDays(monthKey, dayMap);
      var withPrograms = visibleDays.find(function (day) { return Boolean(day.day); });
      return (withPrograms || visibleDays[0] || { date: "" }).date;
    }

    monthSelect.addEventListener("change", function (event) {
      state.activeMonthKey = event.target.value;
      state.selectedDate = pickMonthDefaultDate(state.activeMonthKey);
      renderCalendarGrid();
      syncCalendarUrl(false);
    });

    calendarGrid.addEventListener("click", function (event) {
      var card = event.target.closest("[data-date]");
      if (!card) {
        return;
      }
      state.selectedDate = card.getAttribute("data-date") || "";
      window.location.href = pageHref("now", Object.assign({}, paramsObj, { date: state.selectedDate }));
    });

    window.addEventListener("popstate", function () {
      var nextParams = new URLSearchParams(window.location.search);
      var nextDate = nextParams.get("date") || "";
      var nextMonthKey = dateToMonthKey(nextDate) || state.activeMonthKey;
      if (months.some(function (month) { return month.key === nextMonthKey; })) {
        state.activeMonthKey = nextMonthKey;
      }
      state.selectedDate = nextDate || pickMonthDefaultDate(state.activeMonthKey);
      if (monthSelect) {
        monthSelect.value = state.activeMonthKey;
      }
      renderCalendarGrid();
    });

    renderCalendarGrid();
    syncCalendarUrl(true);
  }

  function renderError(root, message) {
    root.innerHTML = [
      '<section class="pv-shell">',
      '  <section class="pv-card">',
      '    <p class="pv-eyebrow">Error</p>',
      '    <h1 class="pv-title">데이터를 불러오지 못했습니다.</h1>',
      '    <p class="pv-subtitle">' + escapeHtml(message) + "</p>",
      "  </section>",
      "</section>"
    ].join("");
  }

  function init() {
    var root = document.getElementById("app");
    var page = document.body.getAttribute("data-page");
    var paramsObj = makeParamsObject(new URLSearchParams(window.location.search));

    fetchJson(getDataUrl())
      .then(function (data) {
        if (page === "now") {
          renderNowPage(data, paramsObj, root);
          return;
        }
        if (page === "day") {
          renderDayPage(data, paramsObj, root);
          return;
        }
        if (page === "browse") {
          renderBrowsePage(data, paramsObj, root);
          return;
        }
        if (page === "week") {
          renderWeekPage(data, paramsObj, root);
          return;
        }
        if (page === "calendar") {
          renderCalendarPage(data, paramsObj, root);
          return;
        }
        renderError(root, "알 수 없는 페이지입니다.");
      })
      .catch(function (error) {
        renderError(root, error && error.message ? error.message : "알 수 없는 오류");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
