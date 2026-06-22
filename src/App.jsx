import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

const DB_NAME = "skin-photo-diary-db";
const DB_VERSION = 7;
const STORE_NAME = "skinRecords";

const PHOTO_MOMENTS = [{ key: "afterNightWash", label: "夜洗顔後" }];

const COMPARE_MOMENTS = [{ key: "all", label: "すべて" }, ...PHOTO_MOMENTS];

const PHOTO_TYPES = [
  { key: "front", label: "正面" },
  { key: "right", label: "右" },
  { key: "left", label: "左" },
];

const CHECK_ITEMS = [
  { key: "sleepHours", label: "睡眠時間", type: "number", unit: "時間" },
  { key: "morningWash", label: "朝洗顔", type: "check" },
  { key: "sunscreen", label: "日焼け止め", type: "check" },
];

const CONDITION_LABELS = {
  1: "かなり悪い",
  2: "悪い",
  3: "普通",
  4: "良い",
  5: "かなり良い",
};

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
    conditionScore: 3,
    checks: { sleepStart: "", sleepEnd: "", wakeupSkinGood: false, medicineApplied: false, morningWash: false, sunscreen: false, betterThanYesterday: false },
    skinMemo: "",
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

  let conditionScore = raw.conditionScore;

  if (!conditionScore && raw.scores) {
    const values = Object.values(raw.scores).map(Number);
    const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 3;
    conditionScore = Math.max(1, Math.min(5, Math.round(6 - avg)));
  }

  return {
    date: raw.date || date,
    photoMoment,
    photos: normalizePhotos(raw.photos, oldSlot),
    conditionScore: Number(conditionScore || 3),
    checks: { sleepStart: raw.checks?.sleepStart || "", sleepEnd: raw.checks?.sleepEnd || "", wakeupSkinGood: Boolean(raw.checks?.wakeupSkinGood), medicineApplied: Boolean(raw.checks?.medicineApplied), morningWash: Boolean(raw.checks?.morningWash), sunscreen: Boolean(raw.checks?.sunscreen), betterThanYesterday: Boolean(raw.checks?.betterThanYesterday) },
    skinMemo: raw.skinMemo || oldSlot?.memo || "",
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

function compressImage(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
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
      img.src = reader.result;
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
    record.skinMemo ||
    record.previousDayMemo ||
    record.conditionScore ||
    record.checks?.sleepHours ||
    record.checks?.morningWash ||
    record.checks?.sunscreen
  );
}



function getDateDiff(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function App() {
    const [selectedDate, setSelectedDate] = useState(todayString());
    const [currentMonth, setCurrentMonth] = useState(getMonthString(todayString()));
    const [view, setView] = useState("record");
  const [freeMemo, setFreeMemo] = useState(() => localStorage.getItem("skin-free-memo") || "");
  const [memoPhoto, setMemoPhoto] = useState(() => localStorage.getItem("skin-free-memo-photo") || "");
    const [record, setRecord] = useState(createEmptyRecord(todayString()));
  const [allRecords, setAllRecords] = useState([]);
  const [compareType, setCompareType] = useState("front");
  const [compareMoment, setCompareMoment] = useState("all");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [viewerChromeVisible, setViewerChromeVisible] = useState(true);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPosition, setViewerPosition] = useState({ x: 0, y: 0 });
  const [pageTouchStart, setPageTouchStart] = useState(null);
  const [pageAnimation, setPageAnimation] = useState("");
  const [cropTarget, setCropTarget] = useState(null);
  const [cropSettings, setCropSettings] = useState({ zoom: 1.2, x: 0, y: 0 });
  const activeDateRef = useRef(selectedDate);
  const cropDragRef = useRef(null);
  const cropPointersRef = useRef(new Map());
  const cropPinchRef = useRef(null);
  const viewerPointersRef = useRef(new Map());
  const viewerPinchRef = useRef(null);
  const viewerDragRef = useRef(null);

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
      .filter((item) => {
        if (!item.photos?.[compareType]) return false;
        if (compareMoment === "all") return true;
        return item.photoMoment === compareMoment;
      })
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
  }, [allRecords, compareMoment, compareType]);
  const galleryPhotosByMonth = useMemo(() => {
    const groups = new Map();
    galleryPhotos.forEach((photo) => {
      const month = photo.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(photo);
    });
    return [...groups.entries()];
  }, [galleryPhotos]);

  const monthSummaryStats = useMemo(() => {
    const recordsWithSomething = currentMonthRecords.filter(hasAnyContent);

    const conditionRecords = recordsWithSomething.filter((item) => item.conditionScore);
    const avgCondition =
      conditionRecords.length > 0
        ? conditionRecords.reduce((sum, item) => sum + Number(item.conditionScore || 0), 0) /
        conditionRecords.length
        : 0;

    const washCount = recordsWithSomething.filter((item) => item.checks?.morningWash).length;
    const sunscreenCount = recordsWithSomething.filter((item) => item.checks?.sunscreen).length;

    const sleepValues = recordsWithSomething
      .map((item) => Number(item.checks?.sleepHours))
      .filter((value) => value > 0);

    const avgSleep =
      sleepValues.length > 0
        ? sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length
        : 0;

    return {
      totalDays: recordsWithSomething.length,
      photoDays: recordsWithSomething.filter(hasAnyPhoto).length,
      avgCondition,
      avgSleep,
      washCount,
      sunscreenCount,
    };
  }, [currentMonthRecords]);

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

  async function handlePhotoChange(photoKey, file) {
    if (!file) return;

    try {
      const imageData = await compressImage(file);      const targetDate = selectedDate;
      const targetRecord = await getRecord(targetDate);
      const next = {
        ...targetRecord,
        date: targetDate,
        photoMoment: "afterNightWash",
        photos: {
          ...targetRecord.photos,
          [photoKey]: imageData,
        },
      };

      await updateRecord(next);
    } catch (error) {
      console.error(error);
      alert("写真の保存に失敗しました");
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
    setViewerChromeVisible(true);
    setViewerZoom(1);
    setViewerPosition({ x: 0, y: 0 });
    setSelectedPhoto({ items, index, canDelete: true });
  }

  function openGalleryPhoto(index) {
    setViewerChromeVisible(true);
    setViewerZoom(1);
    setViewerPosition({ x: 0, y: 0 });
    setSelectedPhoto({
      items: galleryPhotos,
      index,
      canDelete: false,
    });
  }

  async function removePhotoFromModal() {
    if (!selectedPhoto?.canDelete) return;

    const current = selectedPhoto.items[selectedPhoto.index];
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

  function movePhoto(diff) {
    if (!selectedPhoto) return;

    const total = selectedPhoto.items.length;
    if (total <= 1) return;

    const nextIndex = (selectedPhoto.index + diff + total) % total;

    setViewerZoom(1);
    setViewerPosition({ x: 0, y: 0 });
    setSelectedPhoto({
      ...selectedPhoto,
      index: nextIndex,
    });
  }

  function handleModalTouchStart(e) {
    setTouchStartX(e.touches[0].clientX);
  }

  function handleModalTouchEnd(e) {
    if (touchStartX === null) return;

    const endX = e.changedTouches[0].clientX;
    const diff = endX - touchStartX;

    if (Math.abs(diff) > 45) {
      if (diff < 0) {
        movePhoto(1);
      } else {
        movePhoto(-1);
      }
    }

    setTouchStartX(null);
  }

  function updatePhotoMoment(momentKey) {
    updateRecord({
      ...record,
      photoMoment: momentKey,
    });
  }

  function updateConditionScore(value) {
    updateRecord({
      ...record,
      conditionScore: Number(value),
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
      setMemoPhoto(photo);
      localStorage.setItem("skin-free-memo-photo", photo);
    } catch (error) {
      console.error(error);
      alert("写真の保存に失敗しました");
    }
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
  function startViewerPinch(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pointers = viewerPointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && viewerZoom > 1) {
      viewerDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, position: viewerPosition };
    }
    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const rect = event.currentTarget.getBoundingClientRect();
      viewerPinchRef.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: viewerZoom, position: viewerPosition, centerX: (first.x + second.x) / 2 - rect.left - rect.width / 2, centerY: (first.y + second.y) / 2 - rect.top - rect.height / 2 };
      viewerDragRef.current = null;
    }
  }

  function moveViewerPinch(event) {
    const pointers = viewerPointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && viewerPinchRef.current) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const pinch = viewerPinchRef.current;
      const zoom = Math.max(1, Math.min(4, pinch.zoom * Math.pow(distance / pinch.distance, 1.45)));
      const ratio = zoom / pinch.zoom;
      setViewerZoom(zoom);
      setViewerPosition({ x: pinch.position.x - pinch.centerX * (ratio - 1), y: pinch.position.y - pinch.centerY * (ratio - 1) });
      return;
    }
    const drag = viewerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewerPosition({ x: drag.position.x + event.clientX - drag.x, y: drag.position.y + event.clientY - drag.y });
  }

  function endViewerPinch(event) {
    viewerPointersRef.current.delete(event.pointerId);
    viewerPinchRef.current = null;
    viewerDragRef.current = null;
  }

  function openCrop(photoKey) {
    setCropTarget(photoKey);
    setCropSettings({ zoom: 1.2, x: 0, y: 0 });
  }

  function saveCroppedPhoto() {
    if (!cropTarget) return;

    const src = record.photos?.[cropTarget];
    if (!src) return;

    const img = new Image();

    img.onload = async () => {
      const size = 1000;
      const canvas = document.createElement("canvas");

      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      const coverScale = Math.max(size / img.width, size / img.height);
      const scale = coverScale * cropSettings.zoom;

      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;

      const moveX = (cropSettings.x / 100) * size;
      const moveY = (cropSettings.y / 100) * size;

      const dx = (size - drawWidth) / 2 + moveX;
      const dy = (size - drawHeight) / 2 + moveY;

      ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

      const cropped = canvas.toDataURL("image/jpeg", 0.9);

      const next = {
        ...record,
        photos: {
          ...record.photos,
          [cropTarget]: cropped,
        },
      };

      await updateRecord(next);
      setCropTarget(null);
    };

    img.src = src;
  }
  function startCropDrag(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pointers = cropPointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      cropDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: cropSettings.x, y: cropSettings.y };
    }

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      cropPinchRef.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: cropSettings.zoom };
      cropDragRef.current = null;
    }
  }

  function moveCropDrag(event) {
    const pointers = cropPointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && cropPinchRef.current) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const zoom = Math.max(1, Math.min(3, cropPinchRef.current.zoom * (distance / cropPinchRef.current.distance)));
      setCropSettings((prev) => ({ ...prev, zoom }));
      return;
    }

    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-40, Math.min(40, drag.x + ((event.clientX - drag.startX) / rect.width) * 100));
    const y = Math.max(-40, Math.min(40, drag.y + ((event.clientY - drag.startY) / rect.height) * 100));
    setCropSettings((prev) => ({ ...prev, x, y }));
  }

  function endCropDrag(event) {
    const pointers = cropPointersRef.current;
    pointers.delete(event.pointerId);
    cropPinchRef.current = null;
    cropDragRef.current = null;
    if (pointers.size === 1) {
      const [pointerId, point] = [...pointers.entries()][0];
      cropDragRef.current = { pointerId, startX: point.x, startY: point.y, x: cropSettings.x, y: cropSettings.y };
    }
  }

  const currentModalPhoto = selectedPhoto?.items?.[selectedPhoto.index];

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
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="compactCard">
            <div className="cardHead">
              <h3>今日の肌の調子</h3>
              <p>1〜5</p>
            </div>

            <div className="conditionBlock">
              <div className="conditionButtons">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    className={Number(record.conditionScore || 3) === num ? "on" : ""}
                    onClick={() => updateConditionScore(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <p>{CONDITION_LABELS[record.conditionScore || 3]}</p>
            </div>
          </section>

          <section className="compactCard">
            <div className="cardHead">
              <h3>チェック</h3>
            </div>

            <div className="checkList">
              <label className="sleepInputRow"><span>睡眠時間</span><div className="sleepTimeInputs"><input type="text" inputMode="numeric" maxLength="2" placeholder="23" value={record.checks?.sleepStart || ""} onChange={(e) => updateCheck("sleepStart", e.target.value)} /><small>時</small><b>〜</b><input type="text" inputMode="numeric" maxLength="2" placeholder="7" value={record.checks?.sleepEnd || ""} onChange={(e) => updateCheck("sleepEnd", e.target.value)} /><small>時</small></div></label>
              {[["wakeupSkinGood", "起床後の肌の調子が良い"], ["medicineApplied", "薬を塗った"], ["morningWash", "朝洗顔をした"], ["sunscreen", "日焼け止めを塗った"], ["betterThanYesterday", "前日と比べて肌の調子が良い"]].map(([key, label]) => <label className="checkRow" key={key}><span>{label}</span><input type="checkbox" checked={Boolean(record.checks?.[key])} onChange={(e) => updateCheck(key, e.target.checked)} /></label>)}
            </div></section>

          <section className="memoCard">
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
            <div className="memoPhotoHead"><span>理想の肌・参考写真</span>{memoPhoto && <button onClick={() => { setMemoPhoto(""); localStorage.removeItem("skin-free-memo-photo"); }}>削除</button>}</div>
            {memoPhoto ? <img className="memoPhoto" src={memoPhoto} alt="理想の肌の参考写真" /> : <label className="memoPhotoAdd"><input type="file" accept="image/*" onChange={(e) => { handleMemoPhotoChange(e.target.files?.[0]); e.target.value = ""; }} /><b>＋</b><span>写真を追加</span></label>}
            <small>入力内容はこの端末に自動保存されます</small>
          </section>
        </section>
      )}

      {selectedPhoto && currentModalPhoto && (
        <div
          className="photoViewer"
          onTouchStart={handleModalTouchStart}
          onTouchEnd={handleModalTouchEnd}
        >
          <div
            className={`viewerTop ${viewerChromeVisible ? "" : "hidden"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="viewerClose" aria-label="閉じる" onClick={() => setSelectedPhoto(null)}>
              ‹
            </button>

            <div className="viewerCount">
              {selectedPhoto.index + 1} / {selectedPhoto.items.length}
            </div>

            {selectedPhoto.canDelete ? (
              <button className="viewerTrash" aria-label="この写真を削除" onClick={removePhotoFromModal}>
                🗑
              </button>
            ) : (
              <span />
            )}
          </div>

          <button
            className="viewerTapArea"
            onPointerDown={startViewerPinch}
            onPointerMove={moveViewerPinch}
            onPointerUp={endViewerPinch}
            onPointerCancel={endViewerPinch}
            onClick={() => setViewerChromeVisible((prev) => !prev)}
          >
            <img
              className="viewerImage"
              src={currentModalPhoto.src}
              alt="拡大写真"
              draggable="false"
              style={{ transform: `translate(${viewerPosition.x}px, ${viewerPosition.y}px) scale(${viewerZoom})` }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setViewerZoom((prev) => (prev === 1 ? 2 : 1));
                setViewerPosition({ x: 0, y: 0 });
              }}
            />
          </button>

          <div className="viewerZoomTools" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewerZoom((prev) => Math.max(1, prev - 0.25))}>−</button>
            <button onClick={() => { setViewerZoom(1); setViewerPosition({ x: 0, y: 0 }); }}>等倍</button>
            <button onClick={() => setViewerZoom((prev) => Math.min(3, prev + 0.25))}>＋</button>
          </div>

          <button
            className="viewerNav left"
            onClick={(e) => {
              e.stopPropagation();
              movePhoto(-1);
            }}
          >
            ‹
          </button>

          <button
            className="viewerNav right"
            onClick={(e) => {
              e.stopPropagation();
              movePhoto(1);
            }}
          >
            ›
          </button>

          <div
            className={`viewerBottom ${viewerChromeVisible ? "" : "hidden"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <p>{currentModalPhoto.title}</p>
          </div>
        </div>
      )}

      {cropTarget && record.photos?.[cropTarget] && (
        <div className="cropModal">
          <div className="cropTop">
            <button onClick={() => setCropTarget(null)}>キャンセル</button>
            <strong>トリミング</strong>
            <button onClick={saveCroppedPhoto}>保存</button>
          </div>

          <div className="cropStage">
            <div className="cropFrame" onPointerDown={startCropDrag} onPointerMove={moveCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag}>
              <img
                src={record.photos[cropTarget]}
                alt="トリミング中"
                style={{
                  transform: `translate(${cropSettings.x}%, ${cropSettings.y}%) scale(${cropSettings.zoom})`,
                }}
              />
            </div>
          </div>

          <div className="cropControls">
            <p className="cropHint">写真を拡大して、矢印で位置を合わせます</p>
            <div className="cropZoomRow">
              <span>ズーム</span>
              <button aria-label="縮小" onClick={() => setCropSettings((prev) => ({ ...prev, zoom: Math.max(1, Number((prev.zoom - 0.1).toFixed(2)))}))}>−</button>
              <input type="range" min="1" max="3" step="0.05" value={cropSettings.zoom} onChange={(e) => setCropSettings((prev) => ({ ...prev, zoom: Number(e.target.value) }))} />
              <button aria-label="拡大" onClick={() => setCropSettings((prev) => ({ ...prev, zoom: Math.min(3, Number((prev.zoom + 0.1).toFixed(2)))}))}>＋</button>
            </div>
            <p className="cropDragHint">写真は指1本で移動・指2本で拡大縮小できます</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
















