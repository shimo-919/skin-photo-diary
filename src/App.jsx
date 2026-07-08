import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

const DB_NAME = "skin-photo-diary-db";
const DB_VERSION = 7;
const STORE_NAME = "skinRecords";

const PHOTO_MOMENTS = [{ key: "afterNightWash", label: "夜洗顔後" }];

const PHOTO_TYPES = [
  { key: "front", label: "正面" },
  { key: "right", label: "右" },
  { key: "left", label: "左" },
];

const SKIN_TAGS = ["乾燥", "赤み", "ニキビ", "かゆみ", "テカリ", "調子いい"];

const WEEK_DAYS = ["日", "月", "火", "水", "木", "金", "土"];

function todayString() {
  return toDateString(new Date());
}

function toDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthString(dateString) {
  return dateString.slice(0, 7);
}

function createEmptyPhotos() {
  return {
    front: null,
    right: null,
    left: null,
  };
}

function createEmptyRecord(date) {
  return {
    date,
    photoMoment: "afterNightWash",
    photos: createEmptyPhotos(),
    checks: { sleepStart: "", sleepEnd: "", medicineApplied: false, morningWash: false, sunscreen: false },
    skinTags: [],
    skinMemo: "",
    foodMemo: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizePhotos(rawPhotos, oldSlot) {
  const nestedMoment = PHOTO_MOMENTS.find((moment) => {
    return rawPhotos?.[moment.key]?.front || rawPhotos?.[moment.key]?.right || rawPhotos?.[moment.key]?.left;
  });

  if (nestedMoment) {
    return {
      front: rawPhotos[nestedMoment.key].front || null,
      right: rawPhotos[nestedMoment.key].right || null,
      left: rawPhotos[nestedMoment.key].left || null,
    };
  }

  if (rawPhotos?.front || rawPhotos?.right || rawPhotos?.left) {
    return {
      front: rawPhotos.front || null,
      right: rawPhotos.right || null,
      left: rawPhotos.left || null,
    };
  }

  if (oldSlot?.photos) {
    return {
      front: oldSlot.photos.front || null,
      right: oldSlot.photos.right || null,
      left: oldSlot.photos.left || null,
    };
  }

  return createEmptyPhotos();
}

function normalizeRecord(raw, date) {
  if (!raw) return createEmptyRecord(date);

  const oldSlot = raw.morning || raw.noon || raw.night || null;
  let photoMoment = raw.photoMoment || "afterNightWash";

  const nestedMoment = PHOTO_MOMENTS.find((moment) => {
    return raw.photos?.[moment.key]?.front || raw.photos?.[moment.key]?.right || raw.photos?.[moment.key]?.left;
  });

  if (!raw.photoMoment && nestedMoment) {
    photoMoment = nestedMoment.key;
  }

  return {
    date: raw.date || date,
    photoMoment,
    photos: normalizePhotos(raw.photos, oldSlot),
    checks: { sleepStart: raw.checks?.sleepStart || "", sleepEnd: raw.checks?.sleepEnd || "", medicineApplied: Boolean(raw.checks?.medicineApplied), morningWash: Boolean(raw.checks?.morningWash), sunscreen: Boolean(raw.checks?.sunscreen) },
    skinTags: Array.isArray(raw.skinTags) ? raw.skinTags : [],
    skinMemo: raw.skinMemo || oldSlot?.memo || "",
    foodMemo: raw.foodMemo || "",
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "date" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getRecord(date) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(date);

    request.onsuccess = () => resolve(normalizeRecord(request.result, date));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveRecord(record) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put({
      ...record,
      updatedAt: new Date().toISOString(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => reject(tx.error);
  });
}

async function getAllRecords() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result || [];
      resolve(records.map((record) => normalizeRecord(record, record.date)));
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function deleteRecord(date) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.delete(date);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => reject(tx.error);
  });
}

function compressDataUrl(dataUrl, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = dataUrl;
  });
}

function compressImage(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      compressDataUrl(reader.result, maxWidth, quality).then(resolve, reject);
    };

    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

function formatDateLabel(dateString) {
  const d = new Date(`${dateString}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK_DAYS[d.getDay()]}）`;
}

function getRecordTitle(dateString) {
  if (dateString === todayString()) return "今日の肌記録";

  const d = new Date(`${dateString}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}の肌記録`;
}

function getCalendarDays(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);

  const cells = [];

  for (let i = 0; i < first.getDay(); i++) {
    cells.push(null);
  }

  for (let day = 1; day <= last.getDate(); day++) {
    cells.push(toDateString(new Date(year, month - 1, day)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function getDateStripDays(centerDateString, range = 30) {
  const center = new Date(`${centerDateString}T00:00:00`);
  const days = [];

  for (let i = -range; i <= range; i++) {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    days.push(toDateString(d));
  }

  return days;
}

function hasAnyPhoto(record) {
  return PHOTO_TYPES.some((type) => record.photos?.[type.key]);
}

function hasAnyContent(record) {
  return (
    hasAnyPhoto(record) ||
    (record.skinTags && record.skinTags.length > 0) ||
    record.skinMemo ||
    record.foodMemo ||
    record.previousDayMemo ||
    record.checks?.sleepStart ||
    record.checks?.sleepEnd ||
    record.checks?.medicineApplied ||
    record.checks?.morningWash ||
    record.checks?.sunscreen
  );
}



function getDateDiff(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

const VIEWER_MAX_ZOOM = 4;
const VIEWER_SLIDE_GAP = 24;

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* 睡眠バーの左端の時刻（18時スタートで深夜をまたいでも連続して扱える） */
const SLEEP_AXIS_START = 18;

function sleepHourToAxis(hour) {
  return (hour - SLEEP_AXIS_START + 24) % 24;
}

function sleepAxisToHour(axis) {
  return (axis + SLEEP_AXIS_START) % 24;
}

function formatSleepTime(hour) {
  return `${Math.floor(hour) % 24}時${hour % 1 ? "半" : ""}`;
}

function formatSleepDuration(hours) {
  const whole = Math.floor(hours);
  return hours % 1 ? `${whole}時間半` : `${whole}時間`;
}

function SleepRangeBar({ start, end, onChange }) {
  const startHour = Number.parseFloat(start);
  const endHour = Number.parseFloat(end);
  const hasValue = Number.isFinite(startHour) && Number.isFinite(endHour);

  const [drag, setDrag] = useState(null);
  const trackRef = useRef(null);
  const dragHandleRef = useRef(null);

  const baseStart = hasValue ? sleepHourToAxis(startHour) : sleepHourToAxis(23);
  let baseEnd = hasValue ? sleepHourToAxis(endHour) : sleepHourToAxis(7);
  if (baseEnd <= baseStart) baseEnd = Math.min(24, baseStart + 8);

  const shown = drag || { start: baseStart, end: baseEnd };
  const duration = shown.end - shown.start;

  function axisFromEvent(event) {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * 24);
  }

  function moveHandle(which, axis, current) {
    if (which === "start") {
      return { ...current, start: clampValue(axis, 0, current.end - 1) };
    }
    return { ...current, end: clampValue(axis, current.start + 1, 23) };
  }

  function handlePointerDown(event) {
    if (!trackRef.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const axis = axisFromEvent(event);
    const which = Math.abs(axis - shown.start) <= Math.abs(axis - shown.end) ? "start" : "end";
    dragHandleRef.current = which;
    setDrag(moveHandle(which, axis, shown));
  }

  function handlePointerMove(event) {
    const which = dragHandleRef.current;
    if (!which) return;
    setDrag((current) => moveHandle(which, axisFromEvent(event), current || shown));
  }

  function handlePointerUp() {
    const which = dragHandleRef.current;
    if (!which) return;
    dragHandleRef.current = null;

    setDrag((current) => {
      const finalRange = current || shown;
      onChange(String(sleepAxisToHour(finalRange.start)), String(sleepAxisToHour(finalRange.end)));
      return null;
    });
  }

  const startLabel = formatSleepTime(sleepAxisToHour(shown.start));
  const endLabel = formatSleepTime(sleepAxisToHour(shown.end));

  return (
    <div className="sleepBarBlock">
      <div className="sleepBarHead">
        <span>睡眠時間</span>
        <strong>
          {hasValue || drag ? `${startLabel}〜${endLabel}・${formatSleepDuration(duration)}` : "バーを動かして設定"}
        </strong>
      </div>

      <div
        className={`sleepBar ${hasValue || drag ? "" : "empty"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="sleepBarTrack" ref={trackRef}>
          <div
            className="sleepBarFill"
            style={{ left: `${(shown.start / 24) * 100}%`, width: `${(duration / 24) * 100}%` }}
          />
          <span className="sleepHandle" style={{ left: `${(shown.start / 24) * 100}%` }} />
          <span className="sleepHandle" style={{ left: `${(shown.end / 24) * 100}%` }} />
        </div>
      </div>

      <div className="sleepBarScale" aria-hidden="true">
        <span>18時</span>
        <span>0時</span>
        <span>6時</span>
        <span>12時</span>
        <span>18時</span>
      </div>
    </div>
  );
}

function PhotoViewer({ items, index, canDelete, onIndexChange, onClose, onDelete }) {
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragX, setDragX] = useState(0);
  const [dismiss, setDismiss] = useState({ x: 0, y: 0 });
  const [animated, setAnimated] = useState(true);

  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const tapTimerRef = useRef(null);

  const total = items.length;
  const current = items[index];

  useEffect(() => {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDismiss({ x: 0, y: 0 });
  }, [index, items]);

  useEffect(() => {
    return () => window.clearTimeout(tapTimerRef.current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function applyZoom(nextZoom, nextOffset) {
    zoomRef.current = nextZoom;
    offsetRef.current = nextOffset;
    setZoom(nextZoom);
    setOffset(nextOffset);
  }

  function getPanLimit(targetZoom) {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return { x: 0, y: 0 };

    return {
      x: Math.max(0, (image.offsetWidth * targetZoom - stage.clientWidth) / 2),
      y: Math.max(0, (image.offsetHeight * targetZoom - stage.clientHeight) / 2),
    };
  }

  function clampPan(target, targetZoom, soft = false) {
    const limit = getPanLimit(targetZoom);

    const clampAxis = (value, max) => {
      if (!soft) return clampValue(value, -max, max);
      if (value > max) return max + (value - max) / 3;
      if (value < -max) return -max + (value + max) / 3;
      return value;
    };

    return { x: clampAxis(target.x, limit.x), y: clampAxis(target.y, limit.y) };
  }

  function goTo(nextIndex) {
    if (nextIndex < 0 || nextIndex >= total || nextIndex === index) return;
    setAnimated(true);
    setDragX(0);
    onIndexChange(nextIndex);
  }

  function stageCenterPoint(clientX, clientY) {
    const rect = stageRef.current.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  function recordMove(gesture, event) {
    gesture.moves.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
    while (gesture.moves.length > 1 && event.timeStamp - gesture.moves[0].time > 110) {
      gesture.moves.shift();
    }
  }

  function swipeVelocity(gesture, event) {
    const first = gesture.moves[0];
    if (!first || event.timeStamp - first.time < 1) return 0;
    return (event.clientX - first.x) / (event.timeStamp - first.time);
  }

  function handlePointerDown(event) {
    stageRef.current?.setPointerCapture?.(event.pointerId);
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      setAnimated(false);
      gestureRef.current = {
        mode: "press",
        startX: event.clientX,
        startY: event.clientY,
        startOffset: offsetRef.current,
        moves: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }],
      };
      return;
    }

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      gestureRef.current = {
        mode: "pinch",
        startZoom: zoomRef.current,
        startOffset: offsetRef.current,
        startDistance: Math.hypot(second.x - first.x, second.y - first.y),
        center: stageCenterPoint((first.x + second.x) / 2, (first.y + second.y) / 2),
      };
      setAnimated(false);
      setDragX(0);
      setDismiss({ x: 0, y: 0 });
    }
  }

  function handlePointerMove(event) {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch") {
      if (pointers.size < 2) return;
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);

      let nextZoom = gesture.startZoom * (distance / gesture.startDistance);
      if (nextZoom < 1) nextZoom = 1 - (1 - nextZoom) / 2.4;
      if (nextZoom > VIEWER_MAX_ZOOM) nextZoom = VIEWER_MAX_ZOOM + (nextZoom - VIEWER_MAX_ZOOM) / 3;

      const ratio = nextZoom / gesture.startZoom;
      applyZoom(
        nextZoom,
        clampPan(
          {
            x: gesture.center.x - (gesture.center.x - gesture.startOffset.x) * ratio,
            y: gesture.center.y - (gesture.center.y - gesture.startOffset.y) * ratio,
          },
          nextZoom,
          true
        )
      );
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    recordMove(gesture, event);

    if (gesture.mode === "press") {
      if (Math.hypot(dx, dy) < 7) return;
      if (zoomRef.current > 1.01) {
        gesture.mode = "pan";
      } else if (dy > Math.abs(dx) * 1.2) {
        gesture.mode = "dismiss";
      } else {
        gesture.mode = "swipe";
      }
    }

    if (gesture.mode === "pan") {
      applyZoom(
        zoomRef.current,
        clampPan({ x: gesture.startOffset.x + dx, y: gesture.startOffset.y + dy }, zoomRef.current, true)
      );
    } else if (gesture.mode === "swipe") {
      const resist = (index === 0 && dx > 0) || (index === total - 1 && dx < 0);
      setDragX(resist ? dx / 3 : dx);
    } else if (gesture.mode === "dismiss") {
      setDismiss({ x: dx * 0.82, y: Math.max(0, dy) });
    }
  }

  function handlePointerUp(event) {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch") {
      setAnimated(true);
      const settledZoom = clampValue(zoomRef.current, 1, VIEWER_MAX_ZOOM);
      applyZoom(settledZoom, settledZoom === 1 ? { x: 0, y: 0 } : clampPan(offsetRef.current, settledZoom));

      if (pointers.size === 1 && settledZoom > 1) {
        const [point] = [...pointers.values()];
        setAnimated(false);
        gestureRef.current = {
          mode: "pan",
          startX: point.x,
          startY: point.y,
          startOffset: offsetRef.current,
          moves: [{ x: point.x, y: point.y, time: event.timeStamp }],
        };
      } else {
        gestureRef.current = null;
      }
      return;
    }

    if (pointers.size > 0) return;
    gestureRef.current = null;
    setAnimated(true);

    if (gesture.mode === "pan") {
      applyZoom(zoomRef.current, clampPan(offsetRef.current, zoomRef.current));
      return;
    }

    if (gesture.mode === "swipe") {
      const width = stageRef.current?.clientWidth || 1;
      const dx = event.clientX - gesture.startX;
      const velocity = swipeVelocity(gesture, event);

      let nextIndex = index;
      if ((dx < -width * 0.28 || velocity < -0.55) && index < total - 1) nextIndex = index + 1;
      if ((dx > width * 0.28 || velocity > 0.55) && index > 0) nextIndex = index - 1;

      setDragX(0);
      if (nextIndex !== index) onIndexChange(nextIndex);
      return;
    }

    if (gesture.mode === "dismiss") {
      if (event.clientY - gesture.startY > 130) {
        onClose();
      } else {
        setDismiss({ x: 0, y: 0 });
      }
      return;
    }

    handleTap(event);
  }

  function handleTap(event) {
    const lastTap = lastTapRef.current;
    const isDoubleTap =
      event.timeStamp - lastTap.time < 300 &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40;

    if (isDoubleTap) {
      window.clearTimeout(tapTimerRef.current);
      lastTapRef.current = { time: 0, x: 0, y: 0 };

      if (zoomRef.current > 1.01) {
        applyZoom(1, { x: 0, y: 0 });
      } else {
        const point = stageCenterPoint(event.clientX, event.clientY);
        const nextZoom = 2.4;
        applyZoom(nextZoom, clampPan({ x: point.x * (1 - nextZoom), y: point.y * (1 - nextZoom) }, nextZoom));
      }
      return;
    }

    lastTapRef.current = { time: event.timeStamp, x: event.clientX, y: event.clientY };
    window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      setChromeVisible((prev) => !prev);
    }, 280);
  }

  function handleWheel(event) {
    if (!stageRef.current) return;

    const nextZoom = clampValue(zoomRef.current * Math.exp(-event.deltaY * 0.0022), 1, VIEWER_MAX_ZOOM);
    if (nextZoom === zoomRef.current) return;

    const point = stageCenterPoint(event.clientX, event.clientY);
    const ratio = nextZoom / zoomRef.current;
    setAnimated(false);
    applyZoom(
      nextZoom,
      clampPan(
        {
          x: point.x - (point.x - offsetRef.current.x) * ratio,
          y: point.y - (point.y - offsetRef.current.y) * ratio,
        },
        nextZoom
      )
    );
  }

  const dismissProgress = clampValue(dismiss.y / 260, 0, 1);
  const chromeShown = chromeVisible && dismiss.y === 0;
  const viewerTransition = animated ? "transform 0.32s cubic-bezier(0.22, 0.9, 0.3, 1)" : "none";

  return (
    <div className="photoViewer" style={{ backgroundColor: `rgba(0, 0, 0, ${1 - dismissProgress * 0.85})` }}>
      <div
        className="viewerStage"
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          className="viewerStrip"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX - index * VIEWER_SLIDE_GAP}px), 0, 0)`,
            transition: viewerTransition,
          }}
        >
          {items.map((item, itemIndex) => {
            if (Math.abs(itemIndex - index) > 1) return null;
            const isCurrent = itemIndex === index;

            return (
              <div
                className="viewerSlide"
                key={itemIndex}
                style={{ left: `calc(${itemIndex * 100}% + ${itemIndex * VIEWER_SLIDE_GAP}px)` }}
              >
                <img
                  ref={isCurrent ? imageRef : undefined}
                  className="viewerImage"
                  src={item.src}
                  alt={item.title || "拡大写真"}
                  draggable={false}
                  style={
                    isCurrent
                      ? {
                          transform: `translate3d(${offset.x + dismiss.x}px, ${offset.y + dismiss.y}px, 0) scale(${zoom * (1 - dismissProgress * 0.35)})`,
                          transition: viewerTransition,
                        }
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className={`viewerTop ${chromeShown ? "" : "hidden"}`}>
        <button className="viewerClose" aria-label="閉じる" onClick={onClose}>
          ‹
        </button>

        <div className="viewerCount">
          {index + 1} / {total}
        </div>

        {canDelete ? (
          <button className="viewerTrash" aria-label="この写真を削除" onClick={onDelete}>
            🗑
          </button>
        ) : (
          <span />
        )}
      </div>

      <button className="viewerNav left" aria-label="前の写真" onClick={() => goTo(index - 1)} disabled={index === 0}>
        ‹
      </button>

      <button className="viewerNav right" aria-label="次の写真" onClick={() => goTo(index + 1)} disabled={index === total - 1}>
        ›
      </button>

      <div className={`viewerBottom ${chromeShown ? "" : "hidden"}`}>
        <p>{current?.title}</p>
      </div>
    </div>
  );
}

const CROP_MAX_ZOOM = 4;

function CropModal({ src, onCancel, onSave }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [animated, setAnimated] = useState(false);
  const [imageSize, setImageSize] = useState(null);
  const [frameSize, setFrameSize] = useState(0);
  const [saving, setSaving] = useState(false);

  const frameRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = src;
  }, [src]);

  useEffect(() => {
    function measure() {
      if (frameRef.current) setFrameSize(frameRef.current.clientWidth);
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* 枠を必ず覆うサイズ（cover）を基準に拡大・移動する */
  const cover = useMemo(() => {
    if (!imageSize || !frameSize) return null;
    const scale = Math.max(frameSize / imageSize.width, frameSize / imageSize.height);
    return { width: imageSize.width * scale, height: imageSize.height * scale };
  }, [imageSize, frameSize]);

  function applyTransform(nextZoom, nextOffset) {
    zoomRef.current = nextZoom;
    offsetRef.current = nextOffset;
    setZoom(nextZoom);
    setOffset(nextOffset);
  }

  function clampOffset(target, targetZoom, soft = false) {
    if (!cover) return target;
    const maxX = (cover.width * targetZoom - frameSize) / 2;
    const maxY = (cover.height * targetZoom - frameSize) / 2;

    const clampAxis = (value, max) => {
      if (!soft) return clampValue(value, -max, max);
      if (value > max) return max + (value - max) / 3;
      if (value < -max) return -max + (value + max) / 3;
      return value;
    };

    return { x: clampAxis(target.x, maxX), y: clampAxis(target.y, maxY) };
  }

  function frameCenterPoint(clientX, clientY) {
    const rect = frameRef.current.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setAnimated(false);

    if (pointers.size === 1) {
      gestureRef.current = {
        mode: "pan",
        startX: event.clientX,
        startY: event.clientY,
        startOffset: offsetRef.current,
      };
      return;
    }

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      gestureRef.current = {
        mode: "pinch",
        startZoom: zoomRef.current,
        startOffset: offsetRef.current,
        startDistance: Math.hypot(second.x - first.x, second.y - first.y),
        center: frameCenterPoint((first.x + second.x) / 2, (first.y + second.y) / 2),
      };
    }
  }

  function handlePointerMove(event) {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch") {
      if (pointers.size < 2) return;
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);

      let nextZoom = gesture.startZoom * (distance / gesture.startDistance);
      if (nextZoom < 1) nextZoom = 1 - (1 - nextZoom) / 2.4;
      if (nextZoom > CROP_MAX_ZOOM) nextZoom = CROP_MAX_ZOOM + (nextZoom - CROP_MAX_ZOOM) / 3;

      const ratio = nextZoom / gesture.startZoom;
      applyTransform(
        nextZoom,
        clampOffset(
          {
            x: gesture.center.x - (gesture.center.x - gesture.startOffset.x) * ratio,
            y: gesture.center.y - (gesture.center.y - gesture.startOffset.y) * ratio,
          },
          nextZoom,
          true
        )
      );
      return;
    }

    applyTransform(
      zoomRef.current,
      clampOffset(
        {
          x: gesture.startOffset.x + event.clientX - gesture.startX,
          y: gesture.startOffset.y + event.clientY - gesture.startY,
        },
        zoomRef.current,
        true
      )
    );
  }

  function handlePointerUp(event) {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);

    if (pointers.size === 1) {
      const [point] = [...pointers.values()];
      gestureRef.current = {
        mode: "pan",
        startX: point.x,
        startY: point.y,
        startOffset: offsetRef.current,
      };
      return;
    }

    if (pointers.size > 0) return;
    gestureRef.current = null;
    setAnimated(true);

    const settledZoom = clampValue(zoomRef.current, 1, CROP_MAX_ZOOM);
    applyTransform(settledZoom, clampOffset(offsetRef.current, settledZoom));
  }

  function handleWheel(event) {
    if (!frameRef.current) return;

    const nextZoom = clampValue(zoomRef.current * Math.exp(-event.deltaY * 0.0022), 1, CROP_MAX_ZOOM);
    if (nextZoom === zoomRef.current) return;

    const point = frameCenterPoint(event.clientX, event.clientY);
    const ratio = nextZoom / zoomRef.current;
    setAnimated(false);
    applyTransform(
      nextZoom,
      clampOffset(
        {
          x: point.x - (point.x - offsetRef.current.x) * ratio,
          y: point.y - (point.y - offsetRef.current.y) * ratio,
        },
        nextZoom
      )
    );
  }

  function resetTransform() {
    setAnimated(true);
    applyTransform(1, { x: 0, y: 0 });
  }

  function handleSave() {
    if (!imageSize || !cover || saving) return;
    setSaving(true);

    const image = new Image();

    image.onload = () => {
      const size = 1000;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      const toCanvas = size / frameSize;

      const drawWidth = cover.width * zoomRef.current * toCanvas;
      const drawHeight = cover.height * zoomRef.current * toCanvas;
      const dx = size / 2 - drawWidth / 2 + offsetRef.current.x * toCanvas;
      const dy = size / 2 - drawHeight / 2 + offsetRef.current.y * toCanvas;

      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
      onSave(canvas.toDataURL("image/jpeg", 0.9));
    };

    image.src = src;
  }

  return (
    <div className="cropModal">
      <div className="cropTop">
        <button onClick={onCancel}>キャンセル</button>
        <strong>トリミング</strong>
        <button className="cropSaveButton" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>

      <div
        className="cropStage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="cropFrame" ref={frameRef}>
          {cover && (
            <img
              src={src}
              alt="トリミング中"
              draggable={false}
              style={{
                width: `${cover.width}px`,
                height: `${cover.height}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transition: animated ? "transform 0.28s cubic-bezier(0.22, 0.9, 0.3, 1)" : "none",
              }}
            />
          )}
          <div className="cropGrid" aria-hidden="true" />
        </div>
      </div>

      <div className="cropControls">
        <p className="cropHint">ドラッグで位置調整・ピンチで拡大縮小</p>
        <button className="cropResetButton" onClick={resetTransform}>
          リセット
        </button>
      </div>
    </div>
  );
}

function CompareModal({ photos, typeLabel, onClose }) {
  const [aIndex, setAIndex] = useState(0);
  const [bIndex, setBIndex] = useState(photos.length - 1);
  const [mode, setMode] = useState("side");
  const [sliderPos, setSliderPos] = useState(50);

  const overlayRef = useRef(null);
  const draggingRef = useRef(false);

  const before = photos[aIndex];
  const after = photos[bIndex];
  const dayDiff = Math.abs(getDateDiff(before.date, after.date));

  function sliderFromEvent(event) {
    const rect = overlayRef.current.getBoundingClientRect();
    return clampValue(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  }

  return (
    <div className="compareModal">
      <div className="compareTop">
        <button onClick={onClose}>閉じる</button>
        <strong>比較（{typeLabel}）</strong>
        <span className="compareDiff">{dayDiff > 0 ? `${dayDiff}日間の変化` : "同じ日"}</span>
      </div>

      <div className="compareSelects">
        <label>
          <span>前</span>
          <select value={aIndex} onChange={(e) => setAIndex(Number(e.target.value))}>
            {photos.map((photo, index) => (
              <option key={photo.date} value={index}>
                {formatDateLabel(photo.date)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>後</span>
          <select value={bIndex} onChange={(e) => setBIndex(Number(e.target.value))}>
            {photos.map((photo, index) => (
              <option key={photo.date} value={index}>
                {formatDateLabel(photo.date)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="compareModes">
        <button className={mode === "side" ? "active" : ""} onClick={() => setMode("side")}>
          並べて
        </button>
        <button className={mode === "overlay" ? "active" : ""} onClick={() => setMode("overlay")}>
          重ねて
        </button>
      </div>

      {mode === "side" ? (
        <div className="compareSide">
          <figure>
            <img src={before.src} alt={`${before.date}の写真`} />
            <figcaption>{formatDateLabel(before.date)}</figcaption>
          </figure>
          <figure>
            <img src={after.src} alt={`${after.date}の写真`} />
            <figcaption>{formatDateLabel(after.date)}</figcaption>
          </figure>
        </div>
      ) : (
        <div
          className="compareOverlay"
          ref={overlayRef}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setSliderPos(sliderFromEvent(e));
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) setSliderPos(sliderFromEvent(e));
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          <img src={before.src} alt={`${before.date}の写真`} draggable={false} />
          <img
            src={after.src}
            alt={`${after.date}の写真`}
            draggable={false}
            style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
          />
          <div className="compareDivider" style={{ left: `${sliderPos}%` }}>
            <i>⇔</i>
          </div>
          <span className="compareBadge left">{formatDateLabel(before.date)}</span>
          <span className="compareBadge right">{formatDateLabel(after.date)}</span>
        </div>
      )}
    </div>
  );
}

function TimelapseModal({ photos, onClose }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return undefined;

    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % photos.length);
    }, 550);

    return () => window.clearInterval(timer);
  }, [playing, photos.length]);

  const current = photos[index];

  return (
    <div className="timelapseModal">
      <div className="compareTop">
        <button onClick={onClose}>閉じる</button>
        <strong>タイムラプス</strong>
        <span className="compareDiff">
          {index + 1} / {photos.length}
        </span>
      </div>

      <div className="timelapseStage">
        <img src={current.src} alt={`${current.date}の写真`} />
        <span className="timelapseDate">{formatDateLabel(current.date)}</span>
      </div>

      <div className="timelapseControls">
        <button className="timelapsePlay" onClick={() => setPlaying((prev) => !prev)}>
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min="0"
          max={photos.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
      </div>
    </div>
  );
}

function CameraModal({ overlaySrc, onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [facing, setFacing] = useState("user");
  const [ghostOpacity, setGhostOpacity] = useState(0.4);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setReady(false);
      setError("");

      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        console.error(err);
        setError("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。");
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    /* インカメラはプレビューと同じ左右反転で保存する */
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    onCapture(canvas.toDataURL("image/jpeg", 0.9));
  }

  return (
    <div className="cameraModal">
      <div className="compareTop">
        <button onClick={onClose}>キャンセル</button>
        <strong>撮影</strong>
        <button onClick={() => setFacing((prev) => (prev === "user" ? "environment" : "user"))}>
          切替
        </button>
      </div>

      <div className="cameraStage">
        <video ref={videoRef} className={facing === "user" ? "mirrored" : ""} playsInline muted autoPlay />
        {overlaySrc && ready && (
          <img className="cameraGhost" src={overlaySrc} alt="前回の写真" style={{ opacity: ghostOpacity }} />
        )}
        {error && <p className="cameraError">{error}</p>}
      </div>

      <div className="cameraControls">
        {overlaySrc ? (
          <label className="ghostOpacityRow">
            <span>前回の写真の濃さ</span>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.05"
              value={ghostOpacity}
              onChange={(e) => setGhostOpacity(Number(e.target.value))}
            />
          </label>
        ) : (
          <p className="cameraHint">前回の写真がまだない部位なので、そのまま撮影します</p>
        )}

        <button className="shutterButton" aria-label="撮影する" onClick={capture} disabled={!ready} />
      </div>
    </div>
  );
}

function App() {
    const [selectedDate, setSelectedDate] = useState(todayString());
    const [currentMonth, setCurrentMonth] = useState(getMonthString(todayString()));
    const [view, setView] = useState("record");
  const [freeMemo, setFreeMemo] = useState(() => localStorage.getItem("skin-free-memo") || "");
  const [memoPhotos, setMemoPhotos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("skin-free-memo-photos") || "[]");
      if (Array.isArray(saved)) return saved;
    } catch { /* 以前の保存形式も読み込む */ }
    const oldPhoto = localStorage.getItem("skin-free-memo-photo");
    return oldPhoto ? [oldPhoto] : [];
  });
    const [record, setRecord] = useState(createEmptyRecord(todayString()));
  const [allRecords, setAllRecords] = useState([]);
  const [compareType, setCompareType] = useState("front");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [pageTouchStart, setPageTouchStart] = useState(null);
  const [pageAnimation, setPageAnimation] = useState("");
  const [cropTarget, setCropTarget] = useState(null);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  const [showTimelapse, setShowTimelapse] = useState(false);
  const activeDateRef = useRef(selectedDate);

  const savedDateSet = useMemo(() => {
    return new Set(allRecords.map((item) => item.date));
  }, [allRecords]);

  const currentMonthRecords = useMemo(() => {
    return allRecords
      .filter((item) => item.date?.startsWith(currentMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allRecords, currentMonth]);

  const calendarDays = useMemo(() => {
    return getCalendarDays(currentMonth);
  }, [currentMonth]);

  const dateStripDays = useMemo(() => {
    return getDateStripDays(selectedDate, 30);
  }, [selectedDate]);

  const monthTitle = useMemo(() => {
    const [year, month] = currentMonth.split("-");
    return `${year}年${Number(month)}月`;
  }, [currentMonth]);

  const skinMemoRows = useMemo(() => {
    const lineCount = (record.skinMemo || "").split("\n").length;
    return Math.max(4, lineCount + 1);
  }, [record.skinMemo]);



  const galleryPhotos = useMemo(() => {
    return allRecords
      .filter((item) => item.photos?.[compareType])
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((item) => {
        const momentLabel = PHOTO_MOMENTS.find((m) => m.key === item.photoMoment)?.label;
        const typeLabel = PHOTO_TYPES.find((t) => t.key === compareType)?.label;

        return {
          src: item.photos[compareType],
          title: `${formatDateLabel(item.date)} / ${momentLabel} / ${typeLabel}`,
          date: item.date,
          canDelete: false,
        };
      });
  }, [allRecords, compareType]);
  const galleryPhotosByMonth = useMemo(() => {
    const groups = new Map();
    galleryPhotos.forEach((photo) => {
      const month = photo.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(photo);
    });
    return [...groups.entries()];
  }, [galleryPhotos]);

  const chronoPhotos = useMemo(() => {
    return [...galleryPhotos].reverse();
  }, [galleryPhotos]);

  useEffect(() => {
    activeDateRef.current = selectedDate;
    loadRecord(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    loadAllRecords();
  }, []);

  useEffect(() => {
    const selected = document.querySelector(".stripDay.selected");
    selected?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDate, dateStripDays]);

  async function loadRecord(date) {
    try {
      const saved = await getRecord(date);
      if (activeDateRef.current === date) setRecord(saved);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadAllRecords() {
    try {
      const records = await getAllRecords();
      setAllRecords(records.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error(error);
    }
  }

  async function updateRecord(nextRecord) {
    if (activeDateRef.current === nextRecord.date) setRecord(nextRecord);

    try {
      await saveRecord(nextRecord);
      await loadAllRecords();
    } catch (error) {
      console.error(error);
    }
  }

  async function savePhotoData(photoKey, imageData) {
    const targetDate = selectedDate;
    const targetRecord = await getRecord(targetDate);

    await updateRecord({
      ...targetRecord,
      date: targetDate,
      photoMoment: "afterNightWash",
      photos: {
        ...targetRecord.photos,
        [photoKey]: imageData,
      },
    });
  }

  async function handlePhotoChange(photoKey, file) {
    if (!file) return;

    try {
      const imageData = await compressImage(file);
      await savePhotoData(photoKey, imageData);
    } catch (error) {
      console.error(error);
      alert("写真の保存に失敗しました");
    }
  }

  async function handleCameraCapture(dataUrl) {
    const target = cameraTarget;
    setCameraTarget(null);
    if (!target) return;

    try {
      const imageData = await compressDataUrl(dataUrl, 1200, 0.85);
      await savePhotoData(target, imageData);
    } catch (error) {
      console.error(error);
      alert("写真の保存に失敗しました");
    }
  }

  function ghostPhotoFor(photoKey) {
    const previous = allRecords.find((item) => item.date < selectedDate && item.photos?.[photoKey]);
    return previous?.photos?.[photoKey] || null;
  }

  function toggleSkinTag(tag) {
    const current = record.skinTags || [];
    const next = current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag];
    updateRecord({ ...record, skinTags: next });
  }

  async function exportAllData() {
    try {
      const records = await getAllRecords();
      const payload = {
        app: "skin-photo-diary",
        version: 1,
        exportedAt: new Date().toISOString(),
        records,
        freeMemo,
        memoPhotos,
      };

      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skin-diary-backup-${todayString()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) {
      console.error(error);
      alert("エクスポートに失敗しました");
    }
  }

  async function importAllData(file) {
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());

      if (payload?.app !== "skin-photo-diary" || !Array.isArray(payload.records)) {
        alert("バックアップファイルの形式が違います");
        return;
      }

      const ok = window.confirm(
        `${payload.records.length}日分の記録を読み込みます。同じ日付の記録は上書きされます。よろしいですか？`
      );
      if (!ok) return;

      for (const raw of payload.records) {
        if (!raw?.date) continue;
        await saveRecord(normalizeRecord(raw, raw.date));
      }

      if (typeof payload.freeMemo === "string" && payload.freeMemo) {
        setFreeMemo(payload.freeMemo);
        localStorage.setItem("skin-free-memo", payload.freeMemo);
      }

      if (Array.isArray(payload.memoPhotos) && payload.memoPhotos.length) {
        setMemoPhotos(payload.memoPhotos);
        localStorage.setItem("skin-free-memo-photos", JSON.stringify(payload.memoPhotos));
      }

      await loadAllRecords();
      await loadRecord(selectedDate);
      alert(`${payload.records.length}日分の記録を読み込みました`);
    } catch (error) {
      console.error(error);
      alert("インポートに失敗しました");
    }
  }

  function getRecordPhotoItems(photoKey) {
    const existingPhotos = PHOTO_TYPES.filter((type) => record.photos?.[type.key]);

    const index = existingPhotos.findIndex((type) => type.key === photoKey);

    const items = existingPhotos.map((type) => ({
      src: record.photos[type.key],
      title: `${formatDateLabel(selectedDate)} / ${PHOTO_MOMENTS.find((m) => m.key === record.photoMoment)?.label
        } / ${type.label}`,
      photoKey: type.key,
      canDelete: true,
    }));

    return { items, index: Math.max(0, index) };
  }

  function openRecordPhoto(photoKey) {
    const { items, index } = getRecordPhotoItems(photoKey);
    setSelectedPhoto({ items, index, canDelete: true });
  }

  function openGalleryPhoto(index) {
    setSelectedPhoto({
      items: galleryPhotos,
      index,
      canDelete: false,
    });
  }

  function openMemoPhoto(index) {
    setSelectedPhoto({
      items: memoPhotos.map((src, memoIndex) => ({
        src,
        title: `理想の肌・参考写真 ${memoIndex + 1}`,
        memoIndex,
      })),
      index,
      canDelete: true,
      source: "memo",
    });
  }

  async function removePhotoFromModal() {
    if (!selectedPhoto?.canDelete) return;

    const current = selectedPhoto.items[selectedPhoto.index];
    if (selectedPhoto.source === "memo") {
      const ok = window.confirm("この写真を削除する？");
      if (!ok) return;
      const nextPhotos = memoPhotos.filter((_, index) => index !== current.memoIndex);
      localStorage.setItem("skin-free-memo-photos", JSON.stringify(nextPhotos));
      setMemoPhotos(nextPhotos);
      if (!nextPhotos.length) {
        setSelectedPhoto(null);
        return;
      }
      setSelectedPhoto({
        ...selectedPhoto,
        items: nextPhotos.map((src, memoIndex) => ({ src, title: `理想の肌・参考写真 ${memoIndex + 1}`, memoIndex })),
        index: Math.min(selectedPhoto.index, nextPhotos.length - 1),
      });
      return;
    }
    if (!current?.photoKey) return;

    const ok = window.confirm("この写真を削除する？");
    if (!ok) return;

    const next = {
      ...record,
      photos: {
        ...record.photos,
        [current.photoKey]: null,
      },
    };

    await updateRecord(next);

    const nextItems = selectedPhoto.items.filter((_, i) => i !== selectedPhoto.index);

    if (nextItems.length === 0) {
      setSelectedPhoto(null);
      return;
    }

    setSelectedPhoto({
      ...selectedPhoto,
      items: nextItems,
      index: Math.min(selectedPhoto.index, nextItems.length - 1),
    });
  }

  function updatePhotoMoment(momentKey) {
    updateRecord({
      ...record,
      photoMoment: momentKey,
    });
  }

  function updateCheck(key, value) {
    updateRecord({
      ...record,
      checks: {
        ...record.checks,
        [key]: value,
      },
    });
  }
  async function handleMemoPhotoChange(file) {
    if (!file) return;
    try {
      const photo = await compressImage(file, 1000, 0.75);
      setMemoPhotos((current) => {
        const next = [...current, photo];
        localStorage.setItem("skin-free-memo-photos", JSON.stringify(next));
        return next;
      });
    } catch (error) {
      console.error(error);
      alert("写真の保存に失敗しました");
    }
  }

  function removeMemoPhoto(index) {
    setMemoPhotos((current) => {
      const next = current.filter((_, photoIndex) => photoIndex !== index);
      localStorage.setItem("skin-free-memo-photos", JSON.stringify(next));
      return next;
    });
  }

  function updateSkinMemo(value) {
    updateRecord({
      ...record,
      skinMemo: value,
    });
  }

  function updateFoodMemo(value) {
    updateRecord({
      ...record,
      foodMemo: value,
    });
  }



  async function removeDayRecord() {
    const ok = window.confirm(`${formatDateLabel(selectedDate)} の記録を全部削除する？`);
    if (!ok) return;

    try {
      await deleteRecord(selectedDate);
      setRecord(createEmptyRecord(selectedDate));
      await loadAllRecords();
    } catch (error) {
      console.error(error);
    }
  }

  function changeMonth(diff) {
    const [year, month] = currentMonth.split("-").map(Number);
    const d = new Date(year, month - 1 + diff, 1);
    const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setCurrentMonth(nextMonth);
  }

  function moveToDate(nextDate) {
    if (!nextDate) return;

    const diff = getDateDiff(selectedDate, nextDate);
    const shouldAnimate = Math.abs(diff) > 0 && Math.abs(diff) <= 31;

    if (shouldAnimate) {
      setPageAnimation(diff > 0 ? "slideNext" : "slidePrev");

      window.setTimeout(() => {
        setPageAnimation("");
      }, 260);
    }

    setSelectedDate(nextDate);
    setCurrentMonth(getMonthString(nextDate));
    setView("record");
  }

  function selectDate(date) {
    moveToDate(date);
  }

  function goToday() {
    moveToDate(todayString());
  }

  function moveSelectedDate(diff) {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + diff);

    moveToDate(toDateString(d));
  }

  function handlePageTouchStart(e) {
    const tagName = e.target.tagName;

    if (["TEXTAREA", "INPUT", "BUTTON", "SELECT", "LABEL"].includes(tagName)) {
      return;
    }

    if (e.target.closest?.(".sleepBarBlock")) {
      return;
    }

    setPageTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
  }

  function handlePageTouchEnd(e) {
    if (!pageTouchStart) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;

    const diffX = endX - pageTouchStart.x;
    const diffY = endY - pageTouchStart.y;

    if (Math.abs(diffX) > 70 && Math.abs(diffX) > Math.abs(diffY) * 1.35) {
      if (diffX < 0) {
        moveSelectedDate(1);
      } else {
        moveSelectedDate(-1);
      }
    }

    setPageTouchStart(null);
  }
  function openCrop(photoKey) {
    setCropTarget(photoKey);
  }

  async function saveCroppedPhoto(croppedDataUrl) {
    if (!cropTarget) return;

    await updateRecord({
      ...record,
      photos: {
        ...record.photos,
        [cropTarget]: croppedDataUrl,
      },
    });

    setCropTarget(null);
  }

  return (
    <main className="app">
      <header className="topHero">
        <div>
          <p className="miniTitle">Skin Log</p>
          <h1>肌の変化を写真で見る</h1>
        </div>

        <button className="todayButton" onClick={goToday}>
          今日
        </button>
      </header>

      {view === "record" && (
        <section className="dateNavigator">
          <div className="dateNavTop">
            <div>
              <strong>{monthTitle}</strong>
            </div>

            <button onClick={() => setShowCalendar((prev) => !prev)}>
              {showCalendar ? "閉じる" : "カレンダー"}
            </button>
          </div>

          <div className="dateStrip">
            {dateStripDays.map((date) => {
              const d = new Date(`${date}T00:00:00`);
              const isSelected = date === selectedDate;
              const isToday = date === todayString();
              const isSaved = savedDateSet.has(date);

              return (
                <button
                  key={date}
                  className={[
                    "stripDay",
                    isSelected ? "selected" : "",
                    isToday ? "today" : "",
                    isSaved ? "saved" : "",
                  ].join(" ")}
                  onClick={() => selectDate(date)}
                >
                  <small>{WEEK_DAYS[d.getDay()]}</small>
                  <span>{d.getDate()}</span>
                  {isSaved && <i />}
                </button>
              );
            })}
          </div>

          {showCalendar && (
            <div className="miniCalendarWrap">
              <div className="calendarMonthControl">
                <button onClick={() => changeMonth(-1)}>‹</button>
                <strong>{monthTitle}</strong>
                <button onClick={() => changeMonth(1)}>›</button>
              </div>

              <section className="calendarCard compact">
                <div className="weekRow">
                  {WEEK_DAYS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="calendarGrid">
                  {calendarDays.map((date, index) => {
                    const isSelected = date === selectedDate;
                    const isToday = date === todayString();
                    const isSaved = date && savedDateSet.has(date);
                    const dayNumber = date ? Number(date.slice(-2)) : "";

                    return (
                      <button
                        key={`${date || "empty"}-${index}`}
                        className={[
                          "dayCell",
                          !date ? "empty" : "",
                          isSelected ? "selected" : "",
                          isToday ? "today" : "",
                          isSaved ? "saved" : "",
                        ].join(" ")}
                        onClick={() => selectDate(date)}
                        disabled={!date}
                      >
                        <span>{dayNumber}</span>
                        {isSaved && <i />}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </section>
      )}



      {view === "record" && (
        <div
          className={`recordSwipeArea ${pageAnimation}`}
          onTouchStart={handlePageTouchStart}
          onTouchEnd={handlePageTouchEnd}
        >
          <section className="dateSummary">
            <div>
              {selectedDate === todayString() && <p>{formatDateLabel(selectedDate)}</p>}
              <h2>{getRecordTitle(selectedDate)}</h2>
            </div>

            <div className="dateActions">
              <button onClick={() => moveSelectedDate(-1)}>前日</button>
              <button onClick={() => moveSelectedDate(1)}>翌日</button>
            </div>
          </section>

          <section className="photoDiaryCard">
            <div className="cardHead simple">
              <h3>写真</h3>
              <p>夜洗顔後</p>
            </div>

            <div className="singlePhotoRow">
              {PHOTO_TYPES.map((photo) => {
                const image = record.photos?.[photo.key];

                return (
                  <div className="photoSlot" key={photo.key}>
                    {image ? (
                      <div className="photoFilled">
                        <button className="photoThumb" onClick={() => openRecordPhoto(photo.key)}>
                          <img src={image} alt={`${photo.label}の写真`} />
                        </button>

                        <button className="cropButton" onClick={() => openCrop(photo.key)}>
                          トリミング
                        </button>
                      </div>
                    ) : (
                      <label className="photoAdd">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handlePhotoChange(photo.key, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />

                        <span>＋</span>
                        <small>{photo.label}</small>

                        <button
                          type="button"
                          className="ghostCamButton"
                          onClick={(e) => {
                            e.preventDefault();
                            setCameraTarget(photo.key);
                          }}
                        >
                          📷 重ねて撮る
                        </button>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="compactCard">
            <div className="cardHead">
              <h3>チェック</h3>
            </div>

            <div className="checkList">
              <SleepRangeBar
                start={record.checks?.sleepStart}
                end={record.checks?.sleepEnd}
                onChange={(sleepStart, sleepEnd) =>
                  updateRecord({
                    ...record,
                    checks: { ...record.checks, sleepStart, sleepEnd },
                  })
                }
              />
              {[["medicineApplied", "薬を塗った"], ["morningWash", "朝洗顔をした"], ["sunscreen", "日焼け止めを塗った"]].map(([key, label]) => <label className="checkRow" key={key}><span>{label}</span><input type="checkbox" checked={Boolean(record.checks?.[key])} onChange={(e) => updateCheck(key, e.target.checked)} /></label>)}
            </div></section>

          <section className="memoCard">
            <div className="tagBlock">
              <span>{selectedDate === todayString() ? "今日の肌の状態" : "この日の肌の状態"}</span>
              <div className="tagChips">
                {SKIN_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={record.skinTags?.includes(tag) ? "active" : ""}
                    onClick={() => toggleSkinTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <label>
              <span>{selectedDate === todayString() ? "今日の肌メモ" : "この日の肌メモ"}</span>
              <textarea
                rows={skinMemoRows}
                value={record.skinMemo || ""}
                onChange={(e) => updateSkinMemo(e.target.value)}
                placeholder="例：頬が粉吹いてる。口周りが乾燥。赤みは少ない。"
              />
            </label>
            <label>
              <span>今日食べた食べ物</span>
              <textarea
                rows="3"
                value={record.foodMemo || ""}
                onChange={(e) => updateFoodMemo(e.target.value)}
                placeholder="例：ごはん、味噌汁、チョコ、コーヒー"
              />
            </label>


          </section>

          <button className="deleteDayButton subtle" onClick={removeDayRecord}>
            この日の記録を削除
          </button>
        </div>
      )}

      {view === "gallery" && (
        <section className="galleryPage">
          <div className="galleryHead">
            <div>
              <h2>写真一覧</h2>
            </div>
            <span>{galleryPhotos.length}枚</span>
          </div>

          <div className="compareTabs">
            {PHOTO_TYPES.map((type) => (
              <button
                key={type.key}
                className={compareType === type.key ? "active" : ""}
                onClick={() => setCompareType(type.key)}
              >
                {type.label}
              </button>
            ))}
          </div>

          {galleryPhotos.length >= 2 && (
            <div className="galleryActions">
              <button onClick={() => setShowCompare(true)}>◧ 比較</button>
              <button onClick={() => setShowTimelapse(true)}>▶ タイムラプス</button>
            </div>
          )}

          {galleryPhotos.length === 0 ? (
            <div className="emptyGallery">
              <p>この条件の写真はまだありません。</p>
            </div>
          ) : (
            <div className="monthPhotoGroups">
              {galleryPhotosByMonth.map(([month, photos]) => (
                <section className="monthPhotoGroup" key={month}>
                  <h3>{month.replace("-", "年")}月</h3>
                  <div className="photoMonthGrid">
                    {photos.map((item) => {
                      const index = galleryPhotos.indexOf(item);
                      return (
                        <button className="photoMonthItem" key={`${item.date}-${index}`} onClick={() => openGalleryPhoto(index)}>
                          <img src={item.src} alt={`${item.date}の写真`} />
                          <span>{Number(item.date.slice(-2))}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}



      <nav className="bottomNav">
        <button className={view === "record" ? "active" : ""} onClick={() => setView("record")}>記録</button>
        <button className={view === "gallery" ? "active" : ""} onClick={() => setView("gallery")}>写真一覧</button>
        <button className={view === "memo" ? "active" : ""} onClick={() => setView("memo")}>メモ</button>
      </nav>
      {view === "memo" && (
        <section className="freeMemoPage">
          <div className="galleryHead"><div><h2>メモ</h2></div></div>
          <section className="freeMemoCard">
            <textarea value={freeMemo} onChange={(e) => { const value = e.target.value; setFreeMemo(value); localStorage.setItem("skin-free-memo", value); }} placeholder="例：目指したい肌、参考にしたいこと、買いたいスキンケアなど" />
            <div className="memoPhotoHead"><span>理想の肌・参考写真</span></div>
            <div className={`memoPhotoGrid memoPhotoGrid-${Math.min(4, Math.max(2, memoPhotos.length + 1))}`}>
              {memoPhotos.map((photo, index) => <div className="memoPhotoItem" key={`${photo.slice(0, 24)}-${index}`}><button className="memoPhotoOpen" onClick={() => openMemoPhoto(index)}><img className="memoPhoto" src={photo} alt={`理想の肌の参考写真 ${index + 1}`} /></button><button className="memoPhotoDelete" aria-label="写真を削除" onClick={() => removeMemoPhoto(index)}>×</button></div>)}
              <label className="memoPhotoAdd"><input type="file" accept="image/*" onChange={(e) => { handleMemoPhotoChange(e.target.files?.[0]); e.target.value = ""; }} /><b>＋</b><span>写真を追加</span></label>
            </div>
            <small>入力内容はこの端末に自動保存されます</small>
          </section>

          <section className="dataCard">
            <h3>データのバックアップ</h3>
            <p>
              記録と写真はこの端末のブラウザ内にだけ保存されています。機種変更やデータ消去に備えて、ときどきファイルに書き出して保存してください。
            </p>
            <div className="dataButtons">
              <button onClick={exportAllData}>書き出す</button>
              <label className="importButton">
                読み込む
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    importAllData(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>
        </section>
      )}

      {selectedPhoto && selectedPhoto.items.length > 0 && (
        <PhotoViewer
          items={selectedPhoto.items}
          index={selectedPhoto.index}
          canDelete={Boolean(selectedPhoto.canDelete)}
          onIndexChange={(nextIndex) =>
            setSelectedPhoto((prev) => (prev ? { ...prev, index: nextIndex } : prev))
          }
          onClose={() => setSelectedPhoto(null)}
          onDelete={removePhotoFromModal}
        />
      )}

      {cropTarget && record.photos?.[cropTarget] && (
        <CropModal
          src={record.photos[cropTarget]}
          onCancel={() => setCropTarget(null)}
          onSave={saveCroppedPhoto}
        />
      )}

      {showCompare && chronoPhotos.length >= 2 && (
        <CompareModal
          photos={chronoPhotos}
          typeLabel={PHOTO_TYPES.find((type) => type.key === compareType)?.label}
          onClose={() => setShowCompare(false)}
        />
      )}

      {showTimelapse && chronoPhotos.length >= 2 && (
        <TimelapseModal photos={chronoPhotos} onClose={() => setShowTimelapse(false)} />
      )}

      {cameraTarget && (
        <CameraModal
          overlaySrc={ghostPhotoFor(cameraTarget)}
          onCapture={handleCameraCapture}
          onClose={() => setCameraTarget(null)}
        />
      )}
    </main>
  );
}

export default App;








