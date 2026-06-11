import { useEffect, useMemo, useState } from "react";
import "./index.css";

const DB_NAME = "skin-photo-diary-db";
const DB_VERSION = 5;
const STORE_NAME = "skinRecords";

const PHOTO_MOMENTS = [
  { key: "morning", label: "朝" },
  { key: "afterMorningWash", label: "朝洗顔後" },
  { key: "night", label: "夜" },
  { key: "afterNightWash", label: "夜洗顔後" },
];

const COMPARE_MOMENTS = [{ key: "all", label: "すべて" }, ...PHOTO_MOMENTS];

const PHOTO_TYPES = [
  { key: "front", label: "正面" },
  { key: "right", label: "右" },
  { key: "left", label: "左" },
];

const SCORE_ITEMS = [
  { key: "dryness", label: "乾燥" },
  { key: "redness", label: "赤み" },
  { key: "itchiness", label: "かゆみ" },
  { key: "roughness", label: "ざらつき" },
  { key: "peeling", label: "皮むけ" },
  { key: "tightness", label: "つっぱり" },
];

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
    scores: {
      dryness: 0,
      redness: 0,
      itchiness: 0,
      roughness: 0,
      peeling: 0,
      tightness: 0,
    },
    skinMemo: "",
    previousDayMemo: "",
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
    scores: raw.scores || oldSlot?.scores || {
      dryness: 0,
      redness: 0,
      itchiness: 0,
      roughness: 0,
      peeling: 0,
      tightness: 0,
    },
    skinMemo: raw.skinMemo || oldSlot?.memo || "",
    previousDayMemo: raw.previousDayMemo || "",
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

function normalizeBulletMemo(value) {
  if (!value) return value;
  if (!value.startsWith("・")) return `・${value}`;
  return value;
}

function App() {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [currentMonth, setCurrentMonth] = useState(getMonthString(todayString()));
  const [record, setRecord] = useState(createEmptyRecord(todayString()));
  const [allRecords, setAllRecords] = useState([]);
  const [view, setView] = useState("record");
  const [compareType, setCompareType] = useState("front");
  const [compareMoment, setCompareMoment] = useState("all");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [viewerChromeVisible, setViewerChromeVisible] = useState(true);

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

  const previousMemoRows = useMemo(() => {
    const lineCount = (record.previousDayMemo || "").split("\n").length;
    return Math.max(5, lineCount + 1);
  }, [record.previousDayMemo]);

  const galleryPhotos = useMemo(() => {
    return currentMonthRecords
      .filter((item) => {
        if (!item.photos?.[compareType]) return false;
        if (compareMoment === "all") return true;
        return item.photoMoment === compareMoment;
      })
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
  }, [currentMonthRecords, compareMoment, compareType]);

  useEffect(() => {
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
      setRecord(saved);
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
    setRecord(nextRecord);

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
      const imageData = await compressImage(file);

      const next = {
        ...record,
        photos: {
          ...record.photos,
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
    setSelectedPhoto({ items, index, canDelete: true });
  }

  function openGalleryPhoto(index) {
    setViewerChromeVisible(true);
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

  function updateScore(key, value) {
    updateRecord({
      ...record,
      scores: {
        ...record.scores,
        [key]: Number(value),
      },
    });
  }

  function updateSkinMemo(value) {
    updateRecord({
      ...record,
      skinMemo: value,
    });
  }

  function updatePreviousDayMemo(value) {
    updateRecord({
      ...record,
      previousDayMemo: normalizeBulletMemo(value),
    });
  }

  function handlePreviousMemoFocus() {
    if (!record.previousDayMemo) {
      updatePreviousDayMemo("・");
    }
  }

  function handlePreviousMemoKeyDown(e) {
    if (e.key !== "Enter") return;

    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    e.preventDefault();

    const nextValue = `${value.slice(0, start)}\n・${value.slice(end)}`;
    updatePreviousDayMemo(nextValue);

    requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
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

  function selectDate(date) {
    if (!date) return;
    setSelectedDate(date);
    setCurrentMonth(getMonthString(date));
    setView("record");
  }

  function goToday() {
    const today = todayString();
    setSelectedDate(today);
    setCurrentMonth(getMonthString(today));
    setView("record");
  }

  function moveSelectedDate(diff) {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + diff);

    const nextDate = toDateString(d);
    setSelectedDate(nextDate);
    setCurrentMonth(getMonthString(nextDate));
    setView("record");
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

      {view === "gallery" && (
        <section className="monthBar">
          <button onClick={() => changeMonth(-1)}>‹</button>
          <strong>{monthTitle}</strong>
          <button onClick={() => changeMonth(1)}>›</button>
        </section>
      )}

      {view === "record" && (
        <>
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
            </div>

            <div className="photoMomentTabs">
              {PHOTO_MOMENTS.map((moment) => (
                <button
                  key={moment.key}
                  className={(record.photoMoment || "afterNightWash") === moment.key ? "active" : ""}
                  onClick={() => updatePhotoMoment(moment.key)}
                >
                  {moment.label}
                </button>
              ))}
            </div>

            <div className="singlePhotoRow">
              {PHOTO_TYPES.map((photo) => {
                const image = record.photos?.[photo.key];

                return (
                  <div className="photoSlot" key={photo.key}>
                    {image ? (
                      <button className="photoThumb" onClick={() => openRecordPhoto(photo.key)}>
                        <img src={image} alt={`${photo.label}の写真`} />
                      </button>
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
              <h3>肌感覚</h3>
              <p>0〜5</p>
            </div>

            <div className="tinyScores">
              {SCORE_ITEMS.map((item) => (
                <div className="tinyScore" key={item.key}>
                  <span>{item.label}</span>

                  <div className="scoreButtons">
                    {[0, 1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        className={Number(record.scores?.[item.key] ?? 0) === num ? "on" : ""}
                        onClick={() => updateScore(item.key, num)}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="memoCard">
            <label>
              <span>{selectedDate === todayString() ? "今日の肌メモ" : "この日の肌メモ"}</span>
              <textarea
                value={record.skinMemo || ""}
                onChange={(e) => updateSkinMemo(e.target.value)}
                placeholder="例：頬が粉吹いてる。口周りが乾燥。赤みは少ない。"
              />
            </label>

            <label>
              <span>前日にしたこと</span>
              <textarea
                className="bulletTextarea"
                rows={previousMemoRows}
                value={record.previousDayMemo || ""}
                onFocus={handlePreviousMemoFocus}
                onChange={(e) => updatePreviousDayMemo(e.target.value)}
                onKeyDown={handlePreviousMemoKeyDown}
                placeholder={"・睡眠6時間\n・筋トレした\n・甘いもの食べた\n・枕カバー交換"}
              />
            </label>
          </section>

          <button className="deleteDayButton subtle" onClick={removeDayRecord}>
            この日の記録を削除
          </button>
        </>
      )}

      {view === "gallery" && (
        <section className="galleryPage">
          <div className="galleryHead">
            <div>
              <h2>{monthTitle}の写真比較</h2>
            </div>
            <span>{currentMonthRecords.filter(hasAnyPhoto).length}日分</span>
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

          <div className="momentTabs">
            {COMPARE_MOMENTS.map((moment) => (
              <button
                key={moment.key}
                className={compareMoment === moment.key ? "active" : ""}
                onClick={() => setCompareMoment(moment.key)}
              >
                {moment.label}
              </button>
            ))}
          </div>

          {galleryPhotos.length === 0 ? (
            <div className="emptyGallery">
              <p>この条件の写真はまだありません。</p>
            </div>
          ) : (
            <div className="photoMonthGrid">
              {galleryPhotos.map((item, index) => (
                <button
                  className="photoMonthItem"
                  key={`${item.date}-${compareMoment}-${compareType}-${index}`}
                  onClick={() => openGalleryPhoto(index)}
                >
                  <img src={item.src} alt={`${item.date}の写真`} />
                  <span>{Number(item.date.slice(-2))}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <nav className="bottomNav">
        <button className={view === "record" ? "active" : ""} onClick={() => setView("record")}>
          記録
        </button>

        <button className={view === "gallery" ? "active" : ""} onClick={() => setView("gallery")}>
          月写真
        </button>
      </nav>

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
            <button className="viewerClose" onClick={() => setSelectedPhoto(null)}>
              戻る
            </button>

            <div className="viewerCount">
              {selectedPhoto.index + 1} / {selectedPhoto.items.length}
            </div>

            {selectedPhoto.canDelete ? (
              <button className="viewerTrash" onClick={removePhotoFromModal}>
                削除
              </button>
            ) : (
              <span />
            )}
          </div>

          <button
            className="viewerTapArea"
            onClick={() => setViewerChromeVisible((prev) => !prev)}
          >
            <img
              className="viewerImage"
              src={currentModalPhoto.src}
              alt="拡大写真"
              draggable="false"
            />
          </button>

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
    </main>
  );
}

export default App;