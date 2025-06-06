// script.js

// ────────────────────────────────────────────────────────────────────────────
//                          ЗАГРУЗКА СЦЕН ИНИЦИАЛИЗАЦИЯ                       
// ────────────────────────────────────────────────────────────────────────────

let P = {};  // сюда загрузятся все сцены из текстового файла

function parseScenes(text) {
  const scenes = {};
  const lines = text.split(/\r?\n/);
  let id = null, buf = [];
  const flush = () => {
    if (id) {
      const html = buf.join('\n').trim()
        .replace(/\(([^!]+)!([^)]+)\)/g, '<span class="choice" data-n="$2">$1</span>');
      scenes[id] = { html };
      buf = [];
    }
  };
  for (const line of lines) {
    const m = line.match(/^label\s+([^:]+):\s*$/);
    if (m) {
      flush();
      id = m[1].trim();
    } else if (id) {
      buf.push(line);
    }
  }
  flush();
  return scenes;
}

fetch('scenes.json')
  .then(res => {
    if (!res.ok) throw new Error(res.statusText);
    return res.text();
  })
  .then(text => {
    P = parseScenes(text);
    initGame();    // только после загрузки сцен запускаем игру
  })
  .catch(err => {
    console.error('Не удалось загрузить scenes.json:', err);
    alert('Ошибка загрузки данных игры.');
  });

// ────────────────────────────────────────────────────────────────────────────
//                                ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ                      
// ────────────────────────────────────────────────────────────────────────────

// Ссылки на DOM
const menu   = document.getElementById('menu');
const screen = document.getElementById('screen');
const topbar = document.getElementById('topbar');

// Статические элементы
const MAIN_ITEMS = ["Новая игра", "Загрузить игру", "Помощь", "Выход"];

// Состояния
let menuMode      = null;   // 'main' | 'save' | 'load' | 'confirmSave' | 'confirmLoad' | 'help'
let currentScene  = 'start';
let pendingSlot   = null;   // номер слота для подтверждения
let gameStarted   = false;  // была ли запущена игра
let openedFromMain= false;  // открыто из главного меню
let typing        = false;  
let typerTimer    = null;   

// ────────────────────────────────────────────────────────────────────────────
//                                ИНИЦИАЛИЗАЦИЯ                               
// ────────────────────────────────────────────────────────────────────────────

function initGame() {
  // Сбросим состояния
  menuMode       = null;
  currentScene   = 'start';
  pendingSlot    = null;
  gameStarted    = false;
  openedFromMain = false;
  typing         = false;
  clearTimeout(typerTimer);

  // Скрываем экран, покажем меню
  screen.hidden           = true;
  topbar.style.visibility = 'hidden';

  // Рендер стартового меню
  renderMainMenu();

  // Навесим обработчики тулбара
  document.querySelectorAll('#topbar .btn').forEach(btn => {
    const a = btn.dataset.a;
    if (a === 'save')  btn.onclick = () => openSlotMenu('save', false);
    if (a === 'load')  btn.onclick = () => openSlotMenu('load', false);
  if (a === 'help')  btn.onclick = () => openHelp(false);
    if (a === 'exit')  btn.onclick = () => location.reload();
  });

  // Блок контекстного меню
  document.addEventListener('contextmenu', e => e.preventDefault());
}

// ────────────────────────────────────────────────────────────────────────────
//                             РЕНДЕР ГЛАВНОГО МЕНЮ                          
// ────────────────────────────────────────────────────────────────────────────

function renderMainMenu() {
  menuMode = 'main';
  screen.hidden           = true;
  topbar.style.visibility = 'hidden';

  const maxLen = Math.max(...MAIN_ITEMS.map(t => t.length)) + 2;
  document.documentElement.style.setProperty('--menu-w', `${maxLen}ch`);

  menu.innerHTML =
    `<div class="menu-title">Галистея и Астриада</div>` +
    MAIN_ITEMS.map(x => `<div class="menu-item">${x}</div>`).join('');
  menu.style.display = 'flex';
}

// ────────────────────────────────────────────────────────────────────────────
//                           ОБРАБОТКА КЛИКОВ ПО МЕНЮ                         
// ────────────────────────────────────────────────────────────────────────────

menu.onclick = e => {
  const txt = e.target.closest('.menu-item')?.textContent.trim();
  if (!txt) return;

  // Главное меню
  if (menuMode === 'main') {
    if (txt === "Новая игра")      return startGame();
    if (txt === "Загрузить игру")  return openSlotMenu('load', true);
    if (txt === "Помощь")          return openHelp(true);
    if (txt === "Выход")           return location.reload();
  }

  // Слот-меню <save> или <load>
  if (menuMode === 'save' || menuMode === 'load') {
    if (txt === "Отмена") return cancelSlotMenu();
    const slot = parseInt(txt, 10);
    if (menuMode === 'load' && !localStorage.getItem(`saveSlot${slot}`)) {
      // пустой слот — игнорируем
      return;
    }
    pendingSlot = slot;
    return renderConfirmMenu(menuMode, slot);
  }

  // Подтверждение сохранения
  if (menuMode === 'confirmSave') {
    if (txt === "Да")      { confirmSave(pendingSlot); openSlotMenu('save', openedFromMain); }
    else                   { openSlotMenu('save', openedFromMain); }
    return;
  }

  // Подтверждение загрузки
  if (menuMode === 'confirmLoad') {
    if (txt === "Да") {
      // если из главного меню — сперва стартуем игру
      if (openedFromMain && !gameStarted) startGame();
      confirmLoad(pendingSlot);
      if (!openedFromMain) cancelSlotMenu();
    } else {
      openSlotMenu('load', openedFromMain);
    }
    return;
  }

  // Окно помощи
  if (menuMode === 'help') {
    return cancelSlotMenu();
  }
};

// ────────────────────────────────────────────────────────────────────────────
//                          ЗАПУСК ИГРЫ И ОЧИСТКА ЭКРАНА                     
// ────────────────────────────────────────────────────────────────────────────

function startGame() {
  // остановим печать и сбросим флаг
  clearTimeout(typerTimer);
  typing = false;

  gameStarted = true;
  menu.style.display        = 'none';
  screen.hidden             = false;
  topbar.style.visibility   = 'visible';
  screen.innerHTML          = '';      // полная очистка экрана
  currentScene = 'start';
  appendScene('start');
}

// ────────────────────────────────────────────────────────────────────────────
//                         МЕНЮ ВЫБОРА СЛОТОВ (6)                           
// ────────────────────────────────────────────────────────────────────────────

function openSlotMenu(mode, fromMain) {
  openedFromMain = fromMain;
  menuMode       = mode;
  screen.hidden  = true;
  topbar.style.visibility = 'hidden';

  const lines = [];
  for (let i = 1; i <= 6; i++) {
    const raw = localStorage.getItem(`saveSlot${i}`);
    if (!raw) {
      lines.push(`${i}. Пустой слот`);
    } else {
      const { time } = JSON.parse(raw);
      const date = new Date(time).toLocaleString('ru-RU', {
        dateStyle: 'short', timeStyle: 'short'
      });
      lines.push(`${i}. ${date}`);
    }
  }
  lines.push("Отмена");

  const maxLen = Math.max(...lines.map(t => t.length)) + 2;
  document.documentElement.style.setProperty('--menu-w', `${maxLen}ch`);

  menu.innerHTML =
    `<div class="menu-title">${mode === 'save' ? 'Сохранить игру' : 'Загрузить игру'}</div>` +
    lines.map(x => `<div class="menu-item" style="text-align:left; padding-left:1ch;">${x}</div>`).join('');
  menu.style.display = 'flex';
}

// ────────────────────────────────────────────────────────────────────────────
//                               ОКНО ПОМОЩИ
// ────────────────────────────────────────────────────────────────────────────

function openHelp(fromMain) {
  openedFromMain = fromMain;
  menuMode       = 'help';
  screen.hidden  = true;
  topbar.style.visibility = 'hidden';

  const info = [
    'ΔОS‑Олимп — демонстрационная игра.',
    'Автор: Codex',
    'Дата: 2025',
    'Лицензия: MIT',
    'Первый год учебы в израильском Технионе подошел к концу. Взяв несколько дней каникул, главная героиня решает съездить в родной Токио и повидаться с оставшимися там друзьями детства. Прогулки по ночному городу и посиделки в кафе, наполненные разговорами о прошлом, отдаются теплыми воспоминаниями в сердце, пока не раскрывается правда о том, сколь многое успело измениться и произойти с друзьями героини всего за один год. И теперь израильские сирены воздушных атак уже не кажутся ей такими уж страшными.',
    'Для перехода к следующей сцене кликайте по подсвеченным словам.'
  ];
  const opts = ['Назад'];

  const maxLen = Math.max(...opts.map(t => t.length)) + 2;
  document.documentElement.style.setProperty('--menu-w', `${maxLen}ch`);

  menu.innerHTML =
    '<div class="menu-title">Помощь</div>' +
    info.map(x => `<div class="menu-item menu-info">${x}</div>`).join('') +
    opts.map(x => `<div class="menu-item">${x}</div>`).join('');
  menu.style.display = 'flex';
}

// ────────────────────────────────────────────────────────────────────────────
//                        МЕНЮ ПОДТВЕРЖДЕНИЯ (ДА / ОТМЕНА)                   
// ────────────────────────────────────────────────────────────────────────────

function renderConfirmMenu(mode, slot) {
  menuMode = mode === 'save' ? 'confirmSave' : 'confirmLoad';

  let title;
  if (mode === 'save') {
    title = `Сохранить в слот ${slot}?`;
  } else {
    const { time } = JSON.parse(localStorage.getItem(`saveSlot${slot}`));
    const date = new Date(time).toLocaleString('ru-RU', {
      dateStyle: 'short', timeStyle: 'short'
    });
    title = `Загрузить "${date}"?`;
  }

  const opts = ["Да", "Отмена"];
  const maxLen = Math.max(title.length, ...opts.map(o => o.length)) + 2;
  document.documentElement.style.setProperty('--menu-w', `${maxLen}ch`);

  menu.innerHTML =
    `<div class="menu-title">${title}</div>` +
    opts.map(x => `<div class="menu-item">${x}</div>`).join('');
  menu.style.display = 'flex';
}

// ────────────────────────────────────────────────────────────────────────────
//                             СОХРАНЕНИЕ СЛОТА                               
// ────────────────────────────────────────────────────────────────────────────

function confirmSave(slot) {
  const key = `saveSlot${slot}`;
  const payload = { scene: currentScene, time: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(payload));
}

// ────────────────────────────────────────────────────────────────────────────
//                             ЗАГРУЗКА СЛОТА                                 
// ────────────────────────────────────────────────────────────────────────────

function confirmLoad(slot) {
  const raw = localStorage.getItem(`saveSlot${slot}`);
  if (!raw) return;
  const { scene } = JSON.parse(raw);
  appendScene(scene);
}

// ────────────────────────────────────────────────────────────────────────────
//                             ОТМЕНА / ВОЗВРАТ                             
// ────────────────────────────────────────────────────────────────────────────

function cancelSlotMenu() {
  if (openedFromMain && !gameStarted) {
    renderMainMenu();
  } else {
    menu.style.display        = 'none';
    screen.hidden             = false;
    topbar.style.visibility   = 'visible';
    menuMode = 'main';
  }
}

// ────────────────────────────────────────────────────────────────────────────
//                         ФУНКЦИИ ТИПЕРАЙТЕРА И РЕНДЕР СЦЕН                 
// ────────────────────────────────────────────────────────────────────────────

function typeWrite(html, container, done) {
  typing = true;
  let i = 0, out = '', speed = 5;
  const scr = screen;
  function skip() {
    if (!typing) return;
    clearTimeout(typerTimer);
    container.innerHTML = html;
    scr.scrollTop = scr.scrollHeight;
    finish();
  }
  container.addEventListener('click', skip);
  function finish() {
    typing = false;
    container.removeEventListener('click', skip);
    scr.scrollTop = scr.scrollHeight;
    done();
  }
  function step() {
    if (i >= html.length) { finish(); return; }
    if (html[i] === '<') {
      const j = html.indexOf('>', i) + 1;
      out += html.slice(i, j);
      i = j;
    } else {
      out += html[i++];
    }
    container.innerHTML = out;
    scr.scrollTop = scr.scrollHeight;
    typerTimer = setTimeout(step, speed);
  }
  step();
}

function appendScene(id) {
  clearTimeout(typerTimer);
  typing = false;
  currentScene = id;

  // деактивируем прежние выборы
  screen.querySelectorAll('.choice').forEach(el => {
    el.classList.replace('choice', 'inactive');
    el.onclick = null;
  });

  // создаём блок и печатаем
  const block = document.createElement('div');
  screen.appendChild(block);
  typeWrite(P[id].html, block, () => {
    block.querySelectorAll('[data-n]').forEach(el => {
      el.classList.add('choice');
      el.onclick = () => { if (!typing) appendScene(el.dataset.n); };
    });
    block.scrollIntoView({ block: 'end' });
  });
}
