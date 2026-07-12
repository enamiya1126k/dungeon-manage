"use strict";


const initialState = {
  gold: 500,
  wave: 1,

  inventory: {
    slime: 3
  },

  placedMonsters: []
};


let gameState = structuredClone(initialState);
let selectedMonster = "slime";
let toastTimer = null;


const titleScreen = document.getElementById("titleScreen");
const gameScreen = document.getElementById("gameScreen");

const startButton = document.getElementById("startButton");
const continueButton = document.getElementById("continueButton");

const dungeonGrid = document.getElementById("dungeonGrid");

const goldDisplay = document.getElementById("goldDisplay");
const waveDisplay = document.getElementById("waveDisplay");
const slimeCount = document.getElementById("slimeCount");

const battleButton = document.getElementById("battleButton");
const battleMessage = document.getElementById("battleMessage");

const clearButton = document.getElementById("clearButton");

const menuButton = document.getElementById("menuButton");
const menuModal = document.getElementById("menuModal");

const saveButton = document.getElementById("saveButton");
const returnTitleButton = document.getElementById("returnTitleButton");
const closeMenuButton = document.getElementById("closeMenuButton");

const toast = document.getElementById("toast");


function initializeGame() {
  createDungeonGrid();
  updateUI();
  checkSaveData();
}


function createDungeonGrid() {
  dungeonGrid.innerHTML = "";

  for (let index = 0; index < 25; index += 1) {
    const cell = document.createElement("button");

    cell.className = "dungeon-cell";
    cell.dataset.index = String(index);

    if (index === 0) {
      cell.classList.add("entrance");
      cell.innerHTML = "<span>🚪</span>";
    }

    if (index === 24) {
      cell.classList.add("goal");
      cell.innerHTML = "<span>👑</span>";
    }

    cell.addEventListener("click", () => {
      handleCellClick(index);
    });

    dungeonGrid.appendChild(cell);
  }

  renderPlacedMonsters();
}


function handleCellClick(index) {
  if (index === 0 || index === 24) {
    showToast("入口と魔王の間には配置できない！");
    return;
  }

  const existingMonster = gameState.placedMonsters.find(
    monster => monster.cellIndex === index
  );

  if (existingMonster) {
    removeMonster(index);
    return;
  }

  if (selectedMonster !== "slime") {
    return;
  }

  if (gameState.inventory.slime <= 0) {
    showToast("配置できるスライムがいない！");
    return;
  }

  gameState.placedMonsters.push({
    id: crypto.randomUUID(),
    type: "slime",
    cellIndex: index
  });

  gameState.inventory.slime -= 1;

  battleMessage.textContent =
    "配置完了！さらに置くか、勇者を呼び込もう。";

  renderPlacedMonsters();
  updateUI();
}


function removeMonster(index) {
  const monsterIndex = gameState.placedMonsters.findIndex(
    monster => monster.cellIndex === index
  );

  if (monsterIndex === -1) {
    return;
  }

  const removedMonster =
    gameState.placedMonsters.splice(monsterIndex, 1)[0];

  if (removedMonster.type === "slime") {
    gameState.inventory.slime += 1;
  }

  battleMessage.textContent =
    "スライムを配置から戻した。";

  renderPlacedMonsters();
  updateUI();
}


function clearAllMonsters() {
  gameState.placedMonsters.forEach(monster => {
    if (monster.type === "slime") {
      gameState.inventory.slime += 1;
    }
  });

  gameState.placedMonsters = [];

  battleMessage.textContent =
    "配置をすべて解除した。";

  renderPlacedMonsters();
  updateUI();
}


function renderPlacedMonsters() {
  const cells = document.querySelectorAll(".dungeon-cell");

  cells.forEach((cell, index) => {
    if (index === 0) {
      cell.className = "dungeon-cell entrance";
      cell.innerHTML = "<span>🚪</span>";
      return;
    }

    if (index === 24) {
      cell.className = "dungeon-cell goal";
      cell.innerHTML = "<span>👑</span>";
      return;
    }

    cell.className = "dungeon-cell";
    cell.innerHTML = "";
  });

  gameState.placedMonsters.forEach(monster => {
    const cell = cells[monster.cellIndex];

    if (!cell) {
      return;
    }

    cell.classList.add("occupied");
    cell.innerHTML =
      '<span class="cell-monster">🟢</span>';
  });
}


function startBattle() {
  const monsterCount = gameState.placedMonsters.length;

  if (monsterCount === 0) {
    showToast("まずは魔物を配置しよう！");
    return;
  }

  battleButton.disabled = true;

  let countdown = 3;

  battleMessage.textContent =
    `勇者侵入まで ${countdown}…`;

  const countdownTimer = setInterval(() => {
    countdown -= 1;

    if (countdown > 0) {
      battleMessage.textContent =
        `勇者侵入まで ${countdown}…`;

      return;
    }

    clearInterval(countdownTimer);

    resolveBattle();
  }, 650);
}


function resolveBattle() {
  const defensePower =
    gameState.placedMonsters.length * 18;

  const heroPower =
    14 + gameState.wave * 8;

  const randomBonus =
    Math.floor(Math.random() * 21);

  const finalDefense =
    defensePower + randomBonus;

  if (finalDefense >= heroPower) {
    handleVictory(finalDefense, heroPower);
  } else {
    handleDefeat(finalDefense, heroPower);
  }
}


function handleVictory(defensePower, heroPower) {
  const reward =
    45 + gameState.wave * 15;

  gameState.gold += reward;
  gameState.wave += 1;

  battleMessage.textContent =
    `勇者撃退！ 防衛力${defensePower} VS 勇者${heroPower}　+${reward}G`;

  showToast(`勇者撃退！ +${reward}G`);

  updateUI();

  battleButton.disabled = false;
}


function handleDefeat(defensePower, heroPower) {
  const penalty =
    Math.min(gameState.gold, 30);

  gameState.gold -= penalty;

  battleMessage.textContent =
    `侵入を許した…。防衛力${defensePower} VS 勇者${heroPower}　-${penalty}G`;

  showToast(`防衛失敗… -${penalty}G`);

  updateUI();

  battleButton.disabled = false;
}


function updateUI() {
  goldDisplay.textContent =
    `${gameState.gold.toLocaleString()} G`;

  waveDisplay.textContent =
    String(gameState.wave);

  slimeCount.textContent =
    String(gameState.inventory.slime);

  battleButton.querySelector("small").textContent =
    `WAVE ${gameState.wave} START`;
}


function startNewGame() {
  gameState = structuredClone(initialState);

  titleScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  createDungeonGrid();
  updateUI();

  battleMessage.textContent =
    "スライムをマスに配置しよう。";
}


function saveGame() {
  localStorage.setItem(
    "dungeonManagerSave",
    JSON.stringify(gameState)
  );

  showToast("セーブした！");
  closeMenu();
  checkSaveData();
}


function loadGame() {
  const saveData =
    localStorage.getItem("dungeonManagerSave");

  if (!saveData) {
    return;
  }

  try {
    gameState = JSON.parse(saveData);

    titleScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    createDungeonGrid();
    updateUI();

    battleMessage.textContent =
      "セーブデータを読み込んだ。";
  } catch (error) {
    console.error(error);

    showToast("セーブデータの読み込みに失敗した");
  }
}


function checkSaveData() {
  const saveData =
    localStorage.getItem("dungeonManagerSave");

  continueButton.classList.toggle(
    "hidden",
    !saveData
  );
}


function openMenu() {
  menuModal.classList.remove("hidden");
}


function closeMenu() {
  menuModal.classList.add("hidden");
}


function returnToTitle() {
  closeMenu();

  gameScreen.classList.add("hidden");
  titleScreen.classList.remove("hidden");

  checkSaveData();
}


function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 1900);
}


startButton.addEventListener(
  "click",
  startNewGame
);

continueButton.addEventListener(
  "click",
  loadGame
);

battleButton.addEventListener(
  "click",
  startBattle
);

clearButton.addEventListener(
  "click",
  clearAllMonsters
);

menuButton.addEventListener(
  "click",
  openMenu
);

closeMenuButton.addEventListener(
  "click",
  closeMenu
);

saveButton.addEventListener(
  "click",
  saveGame
);

returnTitleButton.addEventListener(
  "click",
  returnToTitle
);

menuModal.addEventListener(
  "click",
  event => {
    if (event.target === menuModal) {
      closeMenu();
    }
  }
);


initializeGame();