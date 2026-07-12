"use strict";

const initialState = {
  gold: 500,
  wave: 1,

  inventory: {
    slime: 3
  },

  placedMonsters: []
};

const monsterData = {
  slime: {
    name: "スライム",
    icon: "🟢",
    maxHp: 18,
    attack: 4
  }
};

let gameState = cloneData(initialState);
let selectedMonster = "slime";

let battleRunning = false;
let heroBattleState = null;
let monsterBattleStates = {};

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

/*
  勇者が通る道。
  上段を右へ進み、次の段を左へ進む蛇行ルート。
*/
const heroRoute = [
  0, 1, 2, 3, 4,
  9, 8, 7, 6, 5,
  10, 11, 12, 13, 14,
  19, 18, 17, 16, 15,
  20, 21, 22, 23, 24
];

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function wait(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

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

    cell.addEventListener("click", () => {
      handleCellClick(index);
    });

    dungeonGrid.appendChild(cell);
  }

  renderDungeon();
}

function handleCellClick(index) {
  if (battleRunning) {
    showToast("戦闘中は配置を変えられない！");
    return;
  }

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
    id: `${Date.now()}-${Math.random()}`,
    type: "slime",
    cellIndex: index
  });

  gameState.inventory.slime -= 1;

  battleMessage.textContent =
    "配置完了！勇者を呼び込んでみよう。";

  renderDungeon();
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

  renderDungeon();
  updateUI();
}

function clearAllMonsters() {
  if (battleRunning) {
    showToast("戦闘中は解除できない！");
    return;
  }

  gameState.placedMonsters.forEach(monster => {
    if (monster.type === "slime") {
      gameState.inventory.slime += 1;
    }
  });

  gameState.placedMonsters = [];

  battleMessage.textContent =
    "配置をすべて解除した。";

  renderDungeon();
  updateUI();
}

function createMonsterBattleStates() {
  monsterBattleStates = {};

  gameState.placedMonsters.forEach(monster => {
    const data = monsterData[monster.type];

    monsterBattleStates[monster.id] = {
      hp: data.maxHp,
      maxHp: data.maxHp,
      defeated: false
    };
  });
}

function renderDungeon() {
  const cells = document.querySelectorAll(".dungeon-cell");

  cells.forEach((cell, index) => {
    cell.className = "dungeon-cell";
    cell.innerHTML = "";

    if (index === 0) {
      cell.classList.add("entrance");
      cell.innerHTML =
        '<span class="cell-landmark">🚪</span>';
    }

    if (index === 24) {
      cell.classList.add("goal");
      cell.innerHTML =
        '<span class="cell-landmark">👑</span>';
    }
  });

  gameState.placedMonsters.forEach(monster => {
    const cell = cells[monster.cellIndex];

    if (!cell) {
      return;
    }

    const battleState =
      monsterBattleStates[monster.id];

    const defeated =
      battleState?.defeated === true;

    cell.classList.add("occupied");

    if (defeated) {
      cell.classList.add("monster-defeated");
    }

    const hp =
      battleState?.hp ??
      monsterData[monster.type].maxHp;

    const maxHp =
      battleState?.maxHp ??
      monsterData[monster.type].maxHp;

    const hpPercent =
      Math.max(0, (hp / maxHp) * 100);

    cell.innerHTML = `
      <span class="cell-monster">
        ${defeated ? "💫" : monsterData[monster.type].icon}
      </span>

      ${
        battleRunning
          ? `
            <div class="unit-hp monster-hp">
              <div
                class="unit-hp-fill"
                style="width:${hpPercent}%"
              ></div>
            </div>
          `
          : ""
      }
    `;
  });

  if (heroBattleState) {
    const heroCell =
      cells[heroBattleState.cellIndex];

    if (heroCell) {
      const heroHpPercent =
        Math.max(
          0,
          (
            heroBattleState.hp /
            heroBattleState.maxHp
          ) * 100
        );

      const heroElement =
        document.createElement("div");

      heroElement.className = "hero-unit";

      heroElement.innerHTML = `
        <span class="hero-icon">🧑‍⚔️</span>

        <div class="unit-hp hero-hp">
          <div
            class="unit-hp-fill hero-hp-fill"
            style="width:${heroHpPercent}%"
          ></div>
        </div>
      `;

      heroCell.appendChild(heroElement);
      heroCell.classList.add("hero-present");
    }
  }
}

async function startBattle() {
  if (battleRunning) {
    return;
  }

  if (gameState.placedMonsters.length === 0) {
    showToast("まずは魔物を配置しよう！");
    return;
  }

  battleRunning = true;
  battleButton.disabled = true;
  clearButton.disabled = true;

  createMonsterBattleStates();

  const heroMaxHp =
    24 + gameState.wave * 8;

  heroBattleState = {
    hp: heroMaxHp,
    maxHp: heroMaxHp,
    attack: 5 + Math.floor(gameState.wave * 1.5),
    cellIndex: 0
  };

  renderDungeon();

  for (
    let countdown = 3;
    countdown >= 1;
    countdown -= 1
  ) {
    battleMessage.textContent =
      `勇者侵入まで ${countdown}…`;

    await wait(650);
  }

  battleMessage.textContent =
    "勇者がダンジョンへ侵入した！";

  await wait(500);

  for (
    let routeIndex = 0;
    routeIndex < heroRoute.length;
    routeIndex += 1
  ) {
    heroBattleState.cellIndex =
      heroRoute[routeIndex];

    renderDungeon();

    await wait(420);

    if (heroBattleState.cellIndex === 24) {
      await handleHeroReachedGoal();
      return;
    }

    const monster =
      gameState.placedMonsters.find(item => {
        return (
          item.cellIndex === heroBattleState.cellIndex &&
          !monsterBattleStates[item.id]?.defeated
        );
      });

    if (monster) {
      const heroWon =
        await fightMonster(monster);

      if (!heroWon) {
        await handleHeroDefeated();
        return;
      }
    }
  }
}

async function fightMonster(monster) {
  const monsterInfo =
    monsterData[monster.type];

  const monsterState =
    monsterBattleStates[monster.id];

  battleMessage.textContent =
    `勇者と${monsterInfo.name}が戦闘開始！`;

  await wait(400);

  while (
    heroBattleState.hp > 0 &&
    monsterState.hp > 0
  ) {
    /*
      勇者の攻撃
    */
    const heroDamage =
      Math.max(
        1,
        heroBattleState.attack +
        Math.floor(Math.random() * 5) - 2
      );

    monsterState.hp -= heroDamage;

    showDamage(
      monster.cellIndex,
      heroDamage,
      "hero-attack"
    );

    shakeCell(monster.cellIndex);

    renderDungeon();

    await wait(550);

    if (monsterState.hp <= 0) {
      monsterState.hp = 0;
      monsterState.defeated = true;

      renderDungeon();

      battleMessage.textContent =
        `${monsterInfo.name}が倒された！勇者は先へ進む。`;

      await wait(700);

      return true;
    }

    /*
      モンスターの攻撃
    */
    const monsterDamage =
      Math.max(
        1,
        monsterInfo.attack +
        Math.floor(Math.random() * 4) - 1
      );

    heroBattleState.hp -= monsterDamage;

    showDamage(
      monster.cellIndex,
      monsterDamage,
      "monster-attack"
    );

    shakeHero();

    renderDungeon();

    battleMessage.textContent =
      `${monsterInfo.name}の体当たり！ 勇者に${monsterDamage}ダメージ！`;

    await wait(550);

    if (heroBattleState.hp <= 0) {
      heroBattleState.hp = 0;

      renderDungeon();

      return false;
    }
  }

  return heroBattleState.hp > 0;
}

function showDamage(
  cellIndex,
  damage,
  attackType
) {
  const cells =
    document.querySelectorAll(".dungeon-cell");

  const cell = cells[cellIndex];

  if (!cell) {
    return;
  }

  const damageElement =
    document.createElement("span");

  damageElement.className =
    `damage-number ${attackType}`;

  damageElement.textContent =
    `-${damage}`;

  cell.appendChild(damageElement);

  setTimeout(() => {
    damageElement.remove();
  }, 800);
}

function shakeCell(cellIndex) {
  const cells =
    document.querySelectorAll(".dungeon-cell");

  const cell = cells[cellIndex];

  if (!cell) {
    return;
  }

  cell.classList.remove("cell-hit");

  void cell.offsetWidth;

  cell.classList.add("cell-hit");

  setTimeout(() => {
    cell.classList.remove("cell-hit");
  }, 350);
}

function shakeHero() {
  const hero =
    document.querySelector(".hero-unit");

  if (!hero) {
    return;
  }

  hero.classList.remove("hero-hit");

  void hero.offsetWidth;

  hero.classList.add("hero-hit");
}

async function handleHeroDefeated() {
  const reward =
    45 + gameState.wave * 15;

  battleMessage.textContent =
    `勇者撃退成功！ +${reward}G`;

  showToast(`勇者撃退！ +${reward}G`);

  await wait(600);

  gameState.gold += reward;
  gameState.wave += 1;

  heroBattleState = null;

  finishBattle();
}

async function handleHeroReachedGoal() {
  const penalty =
    Math.min(
      gameState.gold,
      30 + gameState.wave * 5
    );

  gameState.gold -= penalty;

  battleMessage.textContent =
    `勇者が魔王の間へ到達！ -${penalty}G`;

  showToast(`防衛失敗… -${penalty}G`);

  await wait(900);

  heroBattleState = null;

  finishBattle();
}

function finishBattle() {
  battleRunning = false;
  battleButton.disabled = false;
  clearButton.disabled = false;

  monsterBattleStates = {};

  renderDungeon();
  updateUI();
}

function updateUI() {
  goldDisplay.textContent =
    `${gameState.gold.toLocaleString()} G`;

  waveDisplay.textContent =
    String(gameState.wave);

  slimeCount.textContent =
    String(gameState.inventory.slime);

  const battleButtonText =
    battleButton.querySelector("small");

  if (battleButtonText) {
    battleButtonText.textContent =
      `WAVE ${gameState.wave} START`;
  }
}

function startNewGame() {
  gameState = cloneData(initialState);

  battleRunning = false;
  heroBattleState = null;
  monsterBattleStates = {};

  titleScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  createDungeonGrid();
  updateUI();

  battleMessage.textContent =
    "スライムをマスに配置しよう。";
}

function saveGame() {
  if (battleRunning) {
    showToast("戦闘終了後にセーブしてね！");
    return;
  }

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

    battleRunning = false;
    heroBattleState = null;
    monsterBattleStates = {};

    titleScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    createDungeonGrid();
    updateUI();

    battleMessage.textContent =
      "セーブデータを読み込んだ。";
  } catch (error) {
    console.error(error);

    showToast(
      "セーブデータの読み込みに失敗した"
    );
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
  if (battleRunning) {
    showToast("戦闘中はタイトルへ戻れない！");
    return;
  }

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