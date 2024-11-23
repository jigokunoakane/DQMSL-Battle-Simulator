//初期処理とglobal変数群
const allParties = Array(10)
  .fill(null)
  .map(() => Array(5).fill([]));
const parties = [];

let selectingPartyNum = 0;
let selectingParty = allParties[0];
let currentPlayer = "A";
//モンスター装備変更用
let selectingMonsterNum = 0;
let selectingGearNum = 0;
let currentTab = 0;

//コマンド選択
let currentMonsterIndex = 0;
let currentTeamIndex = 0;

//戦闘中に使用
let fieldState = {};
let turnOrder = [];
// 死亡時発動能力のキュー
let deathActionQueue = [];
// processDeathActionの実行中かどうかを示すフラグ
let isProcessingDeathAction = false;

const imageCache = {};
// 各モンスターのバフ表示を管理するオブジェクト
let buffDisplayTimers = {};
//あとはmonster dataとskill dataと装備data および各種特性関数

// 元のsleep関数を保存
const originalSleep = sleep;

function switchParty() {
  // selectingPartyNumを選択値に更新して、パテ切り替え
  //switchPartyに変更
  selectingPartyNum = Number(document.getElementById("switchParty").value);
  selectingParty = allParties[selectingPartyNum];

  //頭モンスターを選択状態に
  //これで、icon2種、ステ、種増分、種選択、特技の表示更新も兼ねる
  switchTab(0);

  // selectingPartyの中身からアイコンを展開
  for (let i = 0; i <= 4; i++) {
    updatePartyIcon(i);
  }
}

// selectingPartyのうちn番目のpartyIconを更新する関数
function updatePartyIcon(number) {
  const monster = selectingParty[number];
  const iconSrc = monster.length !== 0 ? "images/icons/" + monster.id + ".jpeg" : "images/icons/unselected.jpeg";
  const gearSrc = monster.length !== 0 && monster.gear ? "images/gear/" + monster.gear?.id + ".jpeg" : "images/gear/unGeared.jpeg";
  document.getElementById(`partyIcon${number}`).src = iconSrc;
  document.getElementById(`partyGear${number}`).src = gearSrc;
}

//どちらのプレイヤーがパテ選択中かの関数定義
function decideParty() {
  const switchPartyElement = document.getElementById("switchParty");
  if (currentPlayer === "A") {
    // playerBの選択に移行
    currentPlayer = "B";
    document.getElementById("playerAorB").textContent = "プレイヤーB";
    // selectのoptionを変更
    for (let i = 6; i <= 10; i++) {
      switchPartyElement.innerHTML += `<option value="${i - 1}">パーティ${i - 5}</option>`;
    }
    switchPartyElement.querySelectorAll('option[value="0"], option[value="1"], option[value="2"], option[value="3"], option[value="4"]').forEach((option) => option.remove());
    //現在の仮partyを対戦用partiesにcopy 空monsterは削除
    parties[0] = structuredClone(selectingParty).filter((element) => element.length !== 0);
    // switchPartyElementを5にして敵を表示状態にした上で、switchPartyで展開
    document.getElementById("switchParty").value = 5;
    switchParty();
  } else {
    // playerAの選択に戻す
    currentPlayer = "A";
    document.getElementById("playerAorB").textContent = "プレイヤーA";
    // selectのoptionを変更
    for (let i = 1; i <= 5; i++) {
      switchPartyElement.innerHTML += `<option value="${i - 1}">パーティ${i}</option>`;
    }
    switchPartyElement.querySelectorAll('option[value="5"], option[value="6"], option[value="7"], option[value="8"], option[value="9"]').forEach((option) => option.remove());
    // 対戦用partiesにcopy 空monsterは削除
    parties[1] = structuredClone(selectingParty).filter((element) => element.length !== 0);
    // switchPartyElementを0にして味方を表示状態にした上で、switchPartyで展開
    document.getElementById("switchParty").value = 0;
    switchParty();

    //displayで全体切り替え、battle画面へ
    document.getElementById("pageHeader").style.display = "none";
    document.getElementById("adjustPartyPage").style.display = "none";
    document.getElementById("battlePage").style.display = "block";
    prepareBattle();
    preloadImages();
  }
}

//パテ設定画面の確定で起動
async function prepareBattle() {
  // 初期化
  fieldState = { turnNum: 0, deathCount: { 0: 0, 1: 0 }, completeDeathCount: { 0: 0, 1: 0 } };
  currentTeamIndex = 0;
  currentMonsterIndex = 0;

  // 初期生成
  for (let i = 0; i < parties.length; i++) {
    const party = parties[i];
    // 要素ID用のprefix
    const prefix = i === 0 ? "ally" : "enemy";
    const reversedPrefix = i === 1 ? "ally" : "enemy";

    // リーダースキルの取得
    const leaderSkill = party[0].ls;
    const lsTarget = party[0].lsTarget;

    for (let j = 0; j < party.length; j++) {
      const monster = party[j];

      // 敵味方識別子を追加
      monster.teamID = i;
      monster.enemyTeamID = i === 0 ? 1 : 0;

      // 各要素のIDを作成
      monster.index = j;
      monster.monsterId = `parties[${i}][${j}]`;
      monster.iconElementId = `${prefix}BattleIcon${j}`;
      monster.reversedIconElementId = `${reversedPrefix}BattleIcon${j}`;
      monster.iconSrc = "images/icons/" + monster.id + ".jpeg";

      // skill生成
      monster.skill = [...monster.defaultSkill];

      // ステータス処理
      monster.defaultStatus = {};
      for (const key in monster.displayStatus) {
        // リーダースキル適用
        let statusValue = monster.displayStatus[key];
        let lsMultiplier = 1;
        if ((lsTarget === "all" || monster.race === lsTarget) && leaderSkill[key]) {
          lsMultiplier = leaderSkill[key];
        }
        if (monster.gear?.alchemy && !["超魔王", "超伝説", "???", "スライム", "悪魔", "自然"].includes(monster.race)) {
          lsMultiplier += 0.05;
        }
        // HPまたはMPの場合、乗数を0.04加算
        if (key === "HP" || key === "MP") {
          lsMultiplier += 0.04;
        }
        monster.defaultStatus[key] = Math.ceil(statusValue * lsMultiplier);
      }
      monster.currentStatus = { ...monster.defaultStatus };

      // 初期化
      monster.commandInput = "";
      monster.commandTargetInput = "";
      monster.buffs = {};
      monster.flags = { unavailableSkills: [], executedAbilities: [], thisTurn: {} };
      monster.attribute.additionalPermanentBuffs = {};
      // monsterAbilitiesの内容をmonsterDataにコピー
      monster.abilities = getMonsterAbilities(monster.id);
      //supportAbilitiesまたはattackAbilitiesオブジェクトを生成、additionalPermanentとnextTurn配列を初期化
      monster.abilities.supportAbilities = monster.abilities.supportAbilities || {};
      monster.abilities.supportAbilities.additionalPermanentAbilities = [];
      monster.abilities.supportAbilities.nextTurnAbilities = [];
      monster.abilities.attackAbilities = monster.abilities.attackAbilities || {};
      monster.abilities.attackAbilities.additionalPermanentAbilities = [];
      monster.abilities.attackAbilities.nextTurnAbilities = [];
      // 死亡時abilityを生成
      monster.abilities.deathAbilities = monster.abilities.deathAbilities || [];
      monster.abilities.additionalDeathAbilities = [];
      // 行動後abilityを生成
      monster.abilities.afterActionAbilities = monster.abilities.afterActionAbilities || [];
      monster.abilities.additionalAfterActionAbilities = [];
      // 反撃abilityを生成
      monster.abilities.counterAbilities = monster.abilities.counterAbilities || [];
      monster.abilities.additionalCounterAbilities = [];
    }
  }

  //数が不均衡な場合に備えて存在しないbarを削除しつつ全体のbarを更新
  setMonsterBarDisplay();
  //戦闘画面の10のimgのsrcを設定
  //partyの中身のidとgearIdから、適切な画像を設定
  prepareBattlePageIcons();
  //最初に全てのpopupを閉じる
  closeAllPopupContents();
  //コマンドボタン無効化 特性演出終了後に有効化
  disableCommandBtn(true);
  removeAllStickOut();
  //field管理用変数の導入はglobalで
  await startTurn();
}
//finish prepareBattle 開始時処理終了

//死亡処理で起動、死亡時や亡者化のicon変化処理、prepareBattlePageIconsでも起動して敵skill選択時の反転にそれを反映する
//状態を変化させてから配列を渡せば、状態に合わせて自動的に更新
function updateBattleIcons(monster, reverseDisplay = false) {
  const upperTeamId = reverseDisplay ? 0 : 1;
  const targetElementId = reverseDisplay ? monster.reversedIconElementId : monster.iconElementId;
  const targetElement = document.getElementById(targetElementId);
  targetElement.src = monster.iconSrc;
  // 対面monsterが存在しないとき、対面のアイコンを非表示に
  if (!parties[monster.enemyTeamID][monster.index]) {
    const enemyTargetElementId = reverseDisplay ? monster.iconElementId : monster.reversedIconElementId;
    //buffContainerを削除
    document
      .getElementById(enemyTargetElementId)
      .parentNode.querySelectorAll(".buffContainer")
      .forEach((buffContainer) => {
        buffContainer.remove();
      });
    document.getElementById(enemyTargetElementId).src = "";
    document.getElementById(enemyTargetElementId).style.display = "none";
  }

  targetElement.style.display = "flex";
  //上側表示かつ死亡は非表示、下かつ死亡は暗転、亡者は全て中間
  if (monster.teamID === upperTeamId && monster.flags?.isDead) {
    targetElement.style.display = "none";
  } else {
    if (monster.flags?.isZombie) {
      targetElement.style.filter = "brightness(80%)"; //todo:不要か？
    } else if (!monster.flags?.isZombie && monster.teamID !== upperTeamId && monster.flags?.isDead) {
      targetElement.style.filter = "brightness(25%)";
    } else {
      targetElement.style.filter = "brightness(100%)";
    }
  }
}

//敵コマンド入力時に引数にtrueを渡して一時的に反転 反転戻す時と初期処理では引数なしで通常表示
function prepareBattlePageIcons(reverseDisplay = false) {
  for (const party of parties) {
    for (const monster of party) {
      updateBattleIcons(monster, reverseDisplay);
    }
  }
}

//HP,MPのテキスト表示とバーを更新する これは戦闘開始時と毎ダメージ処理後applyDamage内で起動
function updateMonsterBar(monster, displayRedBar = false, isReversed = false) {
  // IDのプレフィックスを切り替える
  let prefix = monster.teamID === 0 ? "ally" : "enemy";
  if (isReversed) {
    prefix = prefix === "ally" ? "enemy" : "ally"; // 逆転フラグがtrueならプレフィックスを反転
  }

  // IDを生成
  const hpBarElementId = `${prefix}HpBar${monster.index}`;
  const mpBarElementId = `${prefix}MpBar${monster.index}`;
  const hpBarInnerId = `${prefix}HpBarInner${monster.index}`;
  const mpBarInnerId = `${prefix}MpBarInner${monster.index}`;
  const hpBarTextElementId = `${prefix}HpBarText${monster.index}`;
  const mpBarTextElementId = `${prefix}MpBarText${monster.index}`;

  // 表示対象の要素を取得
  const hpBarElement = document.getElementById(hpBarElementId);
  const mpBarElement = document.getElementById(mpBarElementId);
  const hpBarInner = document.getElementById(hpBarInnerId);
  const mpBarInner = document.getElementById(mpBarInnerId);
  const hpBarTextElement = document.getElementById(hpBarTextElementId);
  const mpBarTextElement = document.getElementById(mpBarTextElementId);

  // prefixが敵かつ死亡(亡者化)している場合は非表示化
  if (prefix === "enemy" && (monster.flags.isDead || monster.flags.isZombie)) {
    hpBarElement.style.visibility = "hidden";
  } else {
    // prefixが味方の場合、または敵かつ生存しているときに、HP表示化処理と更新処理
    hpBarElement.style.visibility = "visible"; //表示化

    // HPバーの更新
    const currentHpPercentage = parseFloat(hpBarInner.style.width); // 現在の幅を取得
    const hpPercentage = (monster.currentStatus.HP / monster.defaultStatus.HP) * 100;
    hpBarInner.style.width = `${hpPercentage}%`; // 即座に幅を更新

    // ダメージ表示
    const damageDisplayId = `${prefix}DamageDisplay${monster.index}`;
    const damageDisplay = document.getElementById(damageDisplayId);

    if (displayRedBar && damageDisplay) {
      // ダメージがある場合
      damageDisplay.style.width = `${currentHpPercentage}%`; // 赤いバーを現在のHPの長さに設定
      damageDisplay.style.transition = "none"; // 一旦トランジションを無効化
      damageDisplay.offsetWidth; // ブラウザにスタイルの適用を強制
      damageDisplay.style.transition = "width 0.2s ease-in-out"; // トランジションを有効化
      damageDisplay.style.width = `${hpPercentage}%`; // 0.2秒かけて新しいHPの長さまで縮める

      // 0.2秒後に赤いバーを非表示にする
      setTimeout(() => {
        damageDisplay.style.width = "0%";
      }, 200);
    } else {
      // ダメージがない場合
      damageDisplay.style.width = "0%"; // 赤いバーを非表示にする
      damageDisplay.style.transition = "none"; // トランジションを無効化
    }

    // テキストの更新 敵monsterはtext存在しないのでnullならば操作しない
    if (hpBarTextElement) {
      hpBarTextElement.textContent = monster.currentStatus.HP;
    }
  }

  // prefixが味方の場合のみ、MP表示化処理と更新処理
  if (prefix === "ally") {
    mpBarElement.style.visibility = "visible"; //表示化
    const mpPercentage = (monster.currentStatus.MP / monster.defaultStatus.MP) * 100;
    mpBarInner.style.width = `${mpPercentage}%`;
    mpBarTextElement.textContent = monster.currentStatus.MP;
  }
}

//敵skill選択時や戻す時に起動
function setMonsterBarDisplay(isReverse = false) {
  document.querySelectorAll(".bar").forEach((bar) => {
    bar.style.visibility = "hidden";
  });
  for (const party of parties) {
    for (const monster of party) {
      updateMonsterBar(monster, false, isReverse);
      updateMonsterBuffsDisplay(monster, isReverse);
    }
  }
}

//////////////////////////////////////////////////////////////コマンド選択フロー
//////////////通常攻撃
document.getElementById("commandNormalAttackBtn").addEventListener("click", function () {
  disableCommandBtn(true);
  parties[currentTeamIndex][currentMonsterIndex].commandInput = getNormalAttackName(parties[currentTeamIndex][currentMonsterIndex]);
  document.getElementById("commandPopupWindowText").textContent = "たたかう敵モンスターをタッチしてください。";
  document.getElementById("commandPopupWindowText").style.visibility = "visible";
  selectSkillTargetToggler(currentTeamIndex === 0 ? 1 : 0, "single", "enemy", findSkillByName("通常攻撃")); //味方画像
  document.getElementById("selectSkillTargetContainer").style.visibility = "visible";
  document.getElementById("commandPopupWindow").style.visibility = "visible";
});

/////////////ぼうぎょ
document.getElementById("commandGuardBtn").addEventListener("click", function () {
  parties[currentTeamIndex][currentMonsterIndex].commandInput = "ぼうぎょ";
  finishSelectingEachMonstersCommand();
});

////////////AI
document.getElementById("commandAIBtn").addEventListener("click", function () {
  // 最後に戻すため、コマンド可能な最後のmonsterのcurrentMonsterIndexを保持 コマンド可能なときのみ増やす 最初は確定でコマンド可能なので、-1してから+1
  let tempSelectingMonsterIndex = currentMonsterIndex - 1;

  while (currentMonsterIndex < parties[currentTeamIndex].length) {
    const skillUser = parties[currentTeamIndex][currentMonsterIndex];
    if (!isDead(skillUser) && !skillUser.flags.isZombie && !hasAbnormality(skillUser)) {
      skillUser.commandInput = "normalAICommand";
      tempSelectingMonsterIndex += 1;
    }
    currentMonsterIndex += 1;
  }

  // すべてのモンスターについて処理終了時
  if (currentMonsterIndex === parties[currentTeamIndex].length) {
    // すべてのモンスターの選択が終了した場合 currentMonsterIndex を最後に選択されたモンスターに戻す
    currentMonsterIndex = tempSelectingMonsterIndex;
    adjustMonsterIconStickOut();
    askFinishCommand();
  }
});

// startSelectingCommand() とくぎ選択開始
document.getElementById("commandSelectSkillBtn").addEventListener("click", function () {
  disableCommandBtn(true);
  //party内該当monsterのskillのn番目要素をそのまま表示
  const skillUser = parties[currentTeamIndex][currentMonsterIndex];
  for (let i = 0; i < 4; i++) {
    const selectSkillBtn = document.getElementById(`selectSkillBtn${i}`);
    selectSkillBtn.textContent = skillUser.skill[i];
    // スキル情報を取得
    const skillInfo = findSkillByName(skillUser.skill[i]);
    const MPcost = calculateMPcost(skillUser, skillInfo);
    if (
      skillUser.flags.unavailableSkills.includes(skillUser.skill[i]) ||
      skillUser.currentStatus.MP < MPcost ||
      (skillInfo.unavailableIf && skillInfo.unavailableIf(skillUser)) ||
      skillUser.buffs[skillInfo.type + "Seal"]
    ) {
      selectSkillBtn.disabled = true;
      selectSkillBtn.style.opacity = "0.4";
    } else {
      selectSkillBtn.disabled = false;
      selectSkillBtn.style.opacity = "";
    }
  }
  document.getElementById("selectSkillBtnContainer").style.visibility = "visible";
  document.getElementById("commandPopupWindowText").textContent = skillUser.name;
  document.getElementById("commandPopupWindowText").style.visibility = "visible";
  document.getElementById("commandPopupWindow").style.visibility = "visible";
  //monster名表示に戻す
  //todo:inline?block?
  displayMessage("とくぎをえらんでください。");
});

function selectCommand(selectedSkillNum) {
  document.getElementById("selectSkillBtnContainer").style.visibility = "hidden";
  const skillUser = parties[currentTeamIndex][currentMonsterIndex];
  const selectedSkillName = skillUser.skill[selectedSkillNum];
  //commandInputに格納
  skillUser.commandInput = selectedSkillName;
  const selectedSkill = findSkillByName(selectedSkillName);
  const selectedSkillTargetType = selectedSkill.targetType;
  const selectedSkillTargetTeam = selectedSkill.targetTeam;
  const MPcost = calculateMPcost(skillUser, selectedSkill);
  //nameからskill配列を検索、targetTypeとtargetTeamを引いてくる
  if (selectedSkillTargetType === "random" || selectedSkillTargetType === "single" || selectedSkillTargetType === "dead") {
    displayMessage(`${selectedSkillName}＋3【消費MP：${MPcost}】`);
    //randomもしくはsingleのときはtextをmonster名から指示に変更、target選択画面を表示
    document.getElementById("commandPopupWindowText").textContent = "たたかう敵モンスターをタッチしてください。";
    if (selectedSkillTargetTeam === "ally") {
      document.getElementById("commandPopupWindowText").textContent = "モンスターをタッチしてください。";
    } else if (selectedSkillTargetType === "dead") {
      document.getElementById("commandPopupWindowText").textContent = "回復するモンスターをタッチしてください。";
    }

    //味方選択中かつskillのtargetTeamがenemyのとき、または敵選択中かつskillのtargetTeamがallyのとき、敵画像を代入
    //逆に味方選択中かつtargetTeamがallyのとき、または敵選択中かつtargetTeamがenemyのとき、味方画像を代入
    if ((currentTeamIndex === 0 && selectedSkillTargetTeam === "enemy") || (currentTeamIndex === 1 && selectedSkillTargetTeam === "ally")) {
      selectSkillTargetToggler(1, selectedSkillTargetType, selectedSkillTargetTeam, selectedSkill); //敵画像
    } else {
      selectSkillTargetToggler(0, selectedSkillTargetType, selectedSkillTargetTeam, selectedSkill); //味方画像
    }
    document.getElementById("selectSkillTargetContainer").style.visibility = "visible";
  } else if (selectedSkillTargetType === "all" || selectedSkillTargetType === "field") {
    displayMessage(`${selectedSkillName}＋3【消費MP：${MPcost}】`);
    //targetがallのとき、all(yes,no)画面を起動
    document.getElementById("commandPopupWindowText").style.visibility = "hidden";
    //allならmonster名は隠すのみ
    document.getElementById("selectSkillTargetAllText").textContent = selectedSkillName + "+3を使用しますか？";
    document.getElementById("selectSkillTargetAll").style.visibility = "visible";
  } else {
    //targetがmeのとき、そのまま終了
    document.getElementById("commandPopupWindowText").style.visibility = "hidden";
    finishSelectingEachMonstersCommand();
  }
}

function selectSkillTargetToggler(targetTeamNum, selectedSkillTargetType, selectedSkillTargetTeam, selectedSkill) {
  const excludeTarget = selectedSkill.excludeTarget || null;
  //target選択、敵画像か味方画像か 通常攻撃かsingle, randomで起動
  for (let i = 0; i < 5; i++) {
    const targetMonsterElement = document.getElementById(`selectSkillTarget${i}`);
    const targetMonsterWrapper = targetMonsterElement.parentNode; // wrapper要素を取得

    // モンスター情報が存在しない場合、枠を非表示にしてcontinue
    if (parties[targetTeamNum][i]) {
      targetMonsterElement.src = parties[targetTeamNum][i].iconSrc;
      targetMonsterElement.style.display = "inline";
      targetMonsterWrapper.style.display = "flex";
    } else {
      targetMonsterElement.style.display = "none";
      targetMonsterWrapper.style.display = "none";
      continue; // 次のモンスターの処理へ
    }
    const targetMonster = parties[targetTeamNum][i];

    //モンスター情報が存在する場合、初期化で暗転&無効化解除
    toggleDarkenAndClick(targetMonsterElement, false);

    if (selectedSkillTargetType === "dead") {
      // 蘇生などdead対象のskillの場合、死亡monsterのみ表示 対象外の生存モンスターを非表示化
      if (!targetMonster.flags.isDead) {
        targetMonsterElement.style.display = "none";
        targetMonsterWrapper.style.display = "none";
      }
    } else {
      // dead以外の通常スキルで、敵対象skillの場合、死亡している敵は非表示化
      if (targetMonster.flags.isDead) {
        if (selectedSkillTargetTeam === "enemy") {
          targetMonsterElement.style.display = "none";
          targetMonsterWrapper.style.display = "none";
        } else if (selectedSkillTargetTeam === "ally") {
          // 味方対象skillは死亡していても非表示ではなく暗転無効化(みがわり等)
          toggleDarkenAndClick(targetMonsterElement, true);
        }
      }
    }

    // スキルが自分を対象外にする場合、自分の画像を暗転&無効化
    if (excludeTarget && excludeTarget === "self" && currentMonsterIndex === i) {
      toggleDarkenAndClick(targetMonsterElement, true);
    }
    //みがわりの場合、覆う中の対象を暗転&無効化
    if (selectedSkill.name === "みがわり" && (targetMonster.flags.isSubstituting || targetMonster.flags.hasSubstitute)) {
      toggleDarkenAndClick(targetMonsterElement, true);
    }
  }
}

//all-yesBtnの場合、そのmonsterのコマンド選択終了
document.getElementById("selectSkillTargetBtnYes").addEventListener("click", finishSelectingEachMonstersCommand);

//all-noBtn処理
document.getElementById("selectSkillTargetBtnNo").addEventListener("click", function () {
  document.getElementById("selectSkillTargetAll").style.visibility = "hidden";
  document.getElementById("commandPopupWindow").style.visibility = "hidden";
  disableCommandBtn(false);
  //yes,no画面とpopup全体を閉じる、選択済のcommandInputとtarget:allは後で新規選択されたら上書き
  displayMessage(`${parties[currentTeamIndex][currentMonsterIndex].name}のこうどう`, "コマンド？");
});

//skillTarget選択画面
document.querySelectorAll(".selectSkillTarget").forEach((img) => {
  img.addEventListener("click", () => {
    const imgId = img.getAttribute("id");
    parties[currentTeamIndex][currentMonsterIndex].commandTargetInput = imgId.replace("selectSkillTarget", "");
    document.getElementById("selectSkillTargetContainer").style.visibility = "hidden";
    document.getElementById("commandPopupWindowText").style.visibility = "hidden";
    //テキストとtarget選択iconを閉じる
    finishSelectingEachMonstersCommand();
  });
});

//allでyes選択時、skillTarget選択後、ぼうぎょ選択、target:me選択後に起動。次のmonsterのskill選択に移行する
function finishSelectingEachMonstersCommand() {
  document.getElementById("selectSkillTargetAll").style.visibility = "hidden";

  // 一時的にcurrentMonsterIndexを保持
  let tempSelectingMonsterIndex = currentMonsterIndex;

  // 次のモンスターの選択処理に移動
  currentMonsterIndex += 1;

  // 次の行動可能なモンスターが見つかるまでループ
  while (
    currentMonsterIndex < parties[currentTeamIndex].length &&
    (isDead(parties[currentTeamIndex][currentMonsterIndex]) || parties[currentTeamIndex][currentMonsterIndex].flags.isZombie || hasAbnormality(parties[currentTeamIndex][currentMonsterIndex]))
  ) {
    // 行動不能なモンスターのcommandInputは設定済なので単純に増加
    currentMonsterIndex += 1;
  }

  // 一瞬5になった場合も終了判定をして最後に戻す
  if (currentMonsterIndex === parties[currentTeamIndex].length) {
    // すべてのモンスターの選択が終了した場合
    // currentMonsterIndex を最後に選択されたモンスターに戻す
    currentMonsterIndex = tempSelectingMonsterIndex;
    askFinishCommand();
  } else {
    // 行動可能なモンスターが見つかった場合
    adjustMonsterIconStickOut();
    displayMessage(`${parties[currentTeamIndex][currentMonsterIndex].name}のこうどう`, "コマンド？");
    // スキル選択ポップアップを閉じる
    document.getElementById("commandPopupWindow").style.visibility = "hidden";
    // コマンドボタンを有効化
    disableCommandBtn(false);
  }
}

// コマンド選択開始関数
function startSelectingCommandForFirstMonster(teamNum) {
  //初期化して行動不能monsterのコマンドを入れる
  for (const monster of parties[teamNum]) {
    monster.commandInput = "";
    monster.commandTargetInput = "";
    if (isDead(monster)) {
      monster.commandInput = "skipThisTurn";
    } else if (hasAbnormality(monster) || monster.flags.isZombie) {
      monster.commandInput = "normalAICommand";
    }
  }

  //isPartyIncapacitated  skipAllMonsterCommandSelection  adjustMonsterIconStickOutにdisplayMessage

  // parties[teamNum]の先頭から、行動可能なモンスターを探す
  currentTeamIndex = teamNum;
  currentMonsterIndex = 0;
  while (
    currentMonsterIndex < parties[teamNum].length &&
    (isDead(parties[teamNum][currentMonsterIndex]) || parties[currentTeamIndex][currentMonsterIndex].flags.isZombie || hasAbnormality(parties[teamNum][currentMonsterIndex]))
  ) {
    currentMonsterIndex++;
  }

  // 敵が全員行動不能な場合 (一瞬5になった場合も終了判定をして最後に戻す 戻してはいない)
  if (currentMonsterIndex === parties[teamNum].length) {
    if (teamNum === 1) {
      //敵コマンド選択でplayerを選んだ場合用
      document.getElementById("howToCommandEnemy").style.visibility = "hidden";
      //アイコン反転
      prepareBattlePageIcons(true);
      //barとバフ反転
      setMonsterBarDisplay(true);
    }
    // パーティーが全員行動不能の場合の処理
    removeAllStickOut(); //adjustではない
    askFinishCommand();
    disableCommandBtn(true);
    document.getElementById("askFinishCommandBtnNo").disabled = true;
    document.getElementById("closeCommandPopupWindowBtn").style.display = "none";
  } else {
    // 行動可能なモンスターが見つかった場合、コマンド選択画面を表示
    adjustMonsterIconStickOut();
    displayMessage(`${parties[currentTeamIndex][currentMonsterIndex].name}のこうどう`, "コマンド？");
    // コマンドボタンを有効化
    disableCommandBtn(false);
    if (teamNum === 1) {
      //敵コマンド選択でplayerを選んだ場合用
      document.getElementById("howToCommandEnemy").style.visibility = "hidden";
      document.getElementById("commandPopupWindow").style.visibility = "hidden";
      //アイコン反転
      prepareBattlePageIcons(true);
      adjustMonsterIconStickOut();
      //barとバフ反転
      setMonsterBarDisplay(true);
    }
  }
}

//allのyes btnと、skillTarget選択後に起動する場合、+=1された次のモンスターをstickOut
//backBtnとprepareBattleで起動する場合、-1された相手もしくは0の状態でstickOut
//一旦全削除用function、コマンド選択終了時にも起動
function removeAllStickOut() {
  const allMonsterIconsToStickOut = document.querySelectorAll(".battleIconWrapper");
  allMonsterIconsToStickOut.forEach((monsterIcon) => {
    monsterIcon.classList.remove("stickOut");
  });
}
//防御の引っ込みを消す ターン終了時に起動 死亡時は個別に削除
function removeAllRecede() {
  const allMonsterIconsToRecede = document.querySelectorAll(".battleIconWrapper");
  allMonsterIconsToRecede.forEach((monsterIcon) => {
    monsterIcon.classList.remove("recede");
  });
}
//現在選択中のmonster imgにclass:stickOutを付与
function adjustMonsterIconStickOut() {
  removeAllStickOut();
  const targetBattleIconToStickOut = document.getElementById(`allyBattleIcon${currentMonsterIndex}`);
  targetBattleIconToStickOut.parentNode.classList.add("stickOut");
}

document.getElementById("commandBackBtn").addEventListener("click", function () {
  // 現在選択中のモンスターより前に行動可能なモンスターがいるか確認
  let previousActionableMonsterIndex = currentMonsterIndex - 1;
  while (previousActionableMonsterIndex >= 0) {
    if (
      !isDead(parties[currentTeamIndex][previousActionableMonsterIndex]) &&
      !parties[currentTeamIndex][previousActionableMonsterIndex].flags.isZombie &&
      !hasAbnormality(parties[currentTeamIndex][previousActionableMonsterIndex])
    ) {
      // 行動可能なモンスターが見つかった場合、そのモンスターを選択
      currentMonsterIndex = previousActionableMonsterIndex;
      adjustMonsterIconStickOut();
      displayMessage(`${parties[currentTeamIndex][currentMonsterIndex].name}のこうどう`, "コマンド？");
      return;
    }
    previousActionableMonsterIndex--;
  }
});

function closeAllPopupContents() {
  document.getElementById("selectSkillTargetContainer").style.visibility = "hidden";
  document.getElementById("selectSkillTargetAll").style.visibility = "hidden";
  document.getElementById("selectSkillBtnContainer").style.visibility = "hidden";
  document.getElementById("commandPopupWindow").style.visibility = "hidden";
  document.getElementById("commandPopupWindowText").style.visibility = "hidden";
  document.getElementById("askFinishCommand").style.visibility = "hidden";
  document.getElementById("howToCommandEnemy").style.visibility = "hidden";
}

//全て閉じてcommandBtnを有効化する関数
function closeSelectCommandPopupWindowContents() {
  closeAllPopupContents();
  disableCommandBtn(false);
  displayMessage(`${parties[currentTeamIndex][currentMonsterIndex].name}のこうどう`, "コマンド？");
}

// 閉じるボタンにイベントリスナー追加
document.getElementById("closeCommandPopupWindowBtn").addEventListener("click", function () {
  closeSelectCommandPopupWindowContents();
});

function disableCommandBtn(boolean) {
  document.querySelectorAll(".commandBtn").forEach((button) => {
    button.disabled = boolean;
    if (boolean) {
      button.style.opacity = "0.2";
    } else {
      button.style.opacity = "";
    }
  });
}

//コマンド選択を終了しますか
function askFinishCommand() {
  document.getElementById("askFinishCommand").style.visibility = "visible";
  document.getElementById("commandPopupWindow").style.visibility = "visible"; //最後が防御の場合に枠を新規表示
  displayMessage("モンスターたちはやる気だ！");
}

//コマンド選択終了画面でno選択時、yes,no選択画面とpopup全体を閉じて5体目コマンド選択前に戻す
document.getElementById("askFinishCommandBtnNo").addEventListener("click", function () {
  document.getElementById("askFinishCommand").style.visibility = "hidden";
  document.getElementById("commandPopupWindow").style.visibility = "hidden";
  disableCommandBtn(false);

  // 最後尾の行動可能なモンスターのインデックスを取得
  currentMonsterIndex = parties[currentTeamIndex].length - 1;
  while (
    currentMonsterIndex >= 0 &&
    (isDead(parties[currentTeamIndex][currentMonsterIndex]) || parties[currentTeamIndex][currentMonsterIndex].flags.isZombie || hasAbnormality(parties[currentTeamIndex][currentMonsterIndex]))
  ) {
    currentMonsterIndex--;
  }

  // 選択中のモンスターを強調表示
  adjustMonsterIconStickOut();
  displayMessage(`${parties[currentTeamIndex][currentMonsterIndex].name}のこうどう`, "コマンド？");
});

//コマンド選択終了画面でyes選択時、コマンド選択を終了
document.getElementById("askFinishCommandBtnYes").addEventListener("click", function () {
  document.getElementById("askFinishCommandBtnNo").disabled = false;
  document.getElementById("askFinishCommand").style.visibility = "hidden";
  if (currentTeamIndex === 1) {
    //敵も選択終了後は、startBattleへ
    currentMonsterIndex = 0;
    currentTeamIndex = 0;
    //全員選択不能の場合の非表示解除 味方選択のみ終了時は非表示のまま、敵のコマンド選択方法選択時に再表示
    document.getElementById("closeCommandPopupWindowBtn").style.display = "block";
    //初期化
    document.getElementById("commandPopupWindow").style.visibility = "hidden";
    disableCommandBtn(true);
    //popupを閉じ、commandBtnを無効化
    prepareBattlePageIcons();
    //barとバフの反転を戻す
    setMonsterBarDisplay(false);
    removeAllStickOut();
    startBattle();
  } else {
    //味方選択のみ終了時はyes,no選択画面を閉じ、敵のコマンド選択方法選択画面を表示
    document.getElementById("howToCommandEnemy").style.visibility = "visible";
  }
});

//敵のコマンド選択方法-player
document.getElementById("howToCommandEnemyBtnPlayer").addEventListener("click", function () {
  //全員選択不能の場合の非表示解除 敵のコマンド選択方法選択時に再表示
  document.getElementById("closeCommandPopupWindowBtn").style.display = "block";
  startSelectingCommandForFirstMonster(1);
});

//敵のコマンド選択方法-improvedAI
document.getElementById("howToCommandEnemyBtnImprovedAI").addEventListener("click", function () {
  //全員選択不能の場合の非表示解除 敵のコマンド選択方法選択時に再表示
  document.getElementById("closeCommandPopupWindowBtn").style.display = "block";
  currentMonsterIndex = 0;
  currentTeamIndex = 1;
  document.getElementById("howToCommandEnemy").style.visibility = "hidden";
  document.getElementById("commandPopupWindow").style.visibility = "hidden";
});
//敵のコマンド選択方法-fixedAI
document.getElementById("howToCommandEnemyBtnFixedAI").addEventListener("click", function () {
  //全員選択不能の場合の非表示解除 敵のコマンド選択方法選択時に再表示
  document.getElementById("closeCommandPopupWindowBtn").style.display = "block";
  currentMonsterIndex = 0;
  currentTeamIndex = 1;
  document.getElementById("howToCommandEnemy").style.visibility = "hidden";
  document.getElementById("commandPopupWindow").style.visibility = "hidden";
});
//ここは最大ダメージ検知AIなども含めて統合処理

//ターン開始時処理、毎ラウンド移行時とprepareBattleから起動
async function startTurn() {
  // ターン終了時loop
  for (const party of parties) {
    for (const monster of party) {
      // 亡者解除
      if (monster.flags.isZombie) {
        ascension(monster);
      }
    }
  }
  fieldState.turnNum++;
  console.log(`ラウンド${fieldState.turnNum}`);
  const turnNum = fieldState.turnNum;
  fieldState.cooperation = {
    lastTeamID: null,
    lastSkillType: null,
    count: 1,
    isValid: false,
  };
  if (!fieldState.isPermanentReverse) {
    delete fieldState.isReverse;
  }
  if (!fieldState.isPermanentDistorted) {
    delete fieldState.isDistorted;
  }
  adjustFieldStateDisplay();
  removeAllStickOut();

  //ターン開始時loop
  for (const party of parties) {
    for (const monster of party) {
      //calculateModifiedSpeed ラウンド開始時に毎ターン起動 行動順生成はコマンド選択後
      monster.modifiedSpeed = monster.currentStatus.spd * (0.975 + Math.random() * 0.05);
      //flag削除 ぼうぎょ・覆い隠す以外の身代わり
      delete monster.flags.guard;
      //ターン限定flagsを初期化
      monster.flags.thisTurn = {};
      if (monster.flags.isSubstituting && !monster.flags.isSubstituting.cover) {
        delete monster.flags.isSubstituting;
      }
      if (monster.flags.hasSubstitute && !monster.flags.hasSubstitute.cover) {
        delete monster.flags.hasSubstitute;
      }
      // ターン開始時時点のnextTurnAbilitiesを移管して初期化 これ以降にattackAbilities等の影響でnextTurnAbilitiesに追加されたものは次ターン実行
      monster.abilities.supportAbilities.nextTurnAbilitiesToExecute = [...monster.abilities.supportAbilities.nextTurnAbilities];
      monster.abilities.attackAbilities.nextTurnAbilitiesToExecute = [...monster.abilities.attackAbilities.nextTurnAbilities];
      monster.abilities.supportAbilities.nextTurnAbilities = [];
      monster.abilities.attackAbilities.nextTurnAbilities = [];
      // ラザマ等
      if (monster.flags.isDead && monster.flags.reviveNextTurn) {
        await sleep(300);
        delete monster.flags.reviveNextTurn;
        await reviveMonster(monster, 1, true);
      }
    }
  }
  // ぼうぎょタグを削除
  removeAllRecede();

  //ターン経過で一律にデクリメントタイプの実行 バフ付与前に
  decreaseAllBuffDurations();
  //durationが0になったバフを消去 ターン開始時に削除(帝王の構えや予測等、removeAtTurnStart指定)
  removeExpiredBuffsAtTurnStart();

  if (turnNum === 1) {
    displayMessage(`${parties[1][0].name}たちが あらわれた！`);
    await sleep(600);
    displayMessage("モンスターの特性が発動した！");
    // 戦闘開始時にバフを付与するapplyInitialBuffs
    for (const party of parties) {
      for (const monster of party) {
        // 戦闘開始時に付与するバフ
        const initialBuffs = Object.assign(
          {}, // 空のオブジェクトから始める
          monster.gear?.initialBuffs || {}, // monster.gear?.initialBuffs を先にマージ
          monster.attribute.initialBuffs || {} // monster.attribute.initialBuffs を後でマージ（上書き）
        );
        // バフを適用 (間隔なし、skipMessageとskipSleep: trueを渡すことで付与時messageと付与間隔を削除)
        await applyBuffsAsync(monster, initialBuffs, true, true);

        // 戦闘開始時装備特性
        if (monster.gear?.initialAbilities) {
          await gearAbilities[monster.gear.id].initialAbilities(monster);
        }
        // 戦闘開始時発動特性
        const allInitialAbilities = [...(monster.abilities?.initialAbilities || [])];
        for (const ability of allInitialAbilities) {
          await ability.act(monster);
        }
      }
    }
    for (const party of parties) {
      for (const monster of party) {
        // 戦闘開始時発動特性 天使のしるしなど敵に付与するもの
        const allInitialAttackAbilities = [...(monster.abilities?.initialAttackAbilities || [])];
        for (const ability of allInitialAttackAbilities) {
          await ability.act(monster);
        }
      }
    }
    await sleep(600);
  }
  displayMessage(`ラウンド${turnNum}`, null, true);
  document.getElementById("turnNumDisplay").textContent = `残りラウンド ${11 - turnNum}`;

  // 非同期処理でバフを適用
  async function applyBuffsAsync(monster, buffs, skipMessage = false, skipSleep = false) {
    // バフ対象の種類
    const BuffTargetType = {
      Self: "self",
      Ally: "ally",
      Enemy: "enemy",
      All: "all",
      Random: "random",
    };
    for (const buffName in buffs) {
      const buffData = buffs[buffName];
      // バフ対象の取得
      const targetType = buffData.targetType || BuffTargetType.Self; // デフォルトは自分自身
      const aliveAllys = parties[monster.teamID].filter((monster) => !monster.flags.isDead);
      const aliveEnemies = parties[monster.enemyTeamID].filter((monster) => !monster.flags.isDead);
      // バフ対象に応じた処理
      switch (targetType) {
        case BuffTargetType.Self:
          applyBuff(monster, { [buffName]: structuredClone(buffData) }, null, false, skipMessage);
          break;
        case BuffTargetType.Ally:
          for (const ally of aliveAllys) {
            // 自分除外時はally !== monster
            applyBuff(ally, { [buffName]: structuredClone(buffData) }, null, false, skipMessage);
            if (!skipSleep) await sleep(150); // skipSleep が false の場合のみ150ms待機
          }
          break;
        case BuffTargetType.Enemy:
          for (const enemy of aliveEnemies) {
            applyBuff(enemy, { [buffName]: structuredClone(buffData) }, null, false, skipMessage);
            if (!skipSleep) await sleep(150);
          }
          break;
        case BuffTargetType.All:
          //allyとenemyを両方実行
          for (const ally of aliveAllys) {
            applyBuff(ally, { [buffName]: structuredClone(buffData) }, null, false, skipMessage);
            if (!skipSleep) await sleep(150);
          }
          for (const enemy of aliveEnemies) {
            applyBuff(enemy, { [buffName]: structuredClone(buffData) }, null, false, skipMessage);
            if (!skipSleep) await sleep(150);
          }
          break;
        case BuffTargetType.Random:
          const aliveMonsters = buffData.targetTeam ? (buffData.targetTeam === "ally" ? aliveAllys : aliveEnemies) : aliveAllys;
          //未指定時はランダムな味方を対象
          const targetNum = buffData.targetNum || 1; // targetNumが指定されていない場合は1回

          for (let i = 0; i < targetNum; i++) {
            if (aliveMonsters.length > 0) {
              const randomIndex = Math.floor(Math.random() * aliveMonsters.length);
              const randomTarget = aliveMonsters[randomIndex];
              applyBuff(randomTarget, { [buffName]: structuredClone(buffData) });
              // 重複は許可
              //aliveMonsters.splice(randomIndex, 1);
              if (!skipSleep) await sleep(150);
            }
          }
          break;
      }
      if (!skipSleep) await sleep(150); //バフ適用ごとの間隔
    }
  }

  // バフ適用処理
  const applyBuffsForMonster = async (monster) => {
    if (monster.flags.isDead || monster.flags.isZombie) {
      return;
    }

    // すべてのバフをまとめる
    const allBuffs = {
      ...(monster.attribute[turnNum] || {}),
      ...(monster.attribute.permanentBuffs || {}),
      ...(monster.attribute.additionalPermanentBuffs || {}),
      ...(turnNum % 2 === 0 && monster.attribute.evenTurnBuffs ? monster.attribute.evenTurnBuffs : {}),
      ...(turnNum % 2 !== 0 && monster.attribute.oddTurnBuffs ? monster.attribute.oddTurnBuffs : {}),
      ...(turnNum >= 2 && monster.attribute.buffsFromTurn2 ? monster.attribute.buffsFromTurn2 : {}),
      ...(turnNum === 1 && monster.gear?.turn1buffs ? monster.gear.turn1buffs : {}),
    };

    // バフを適用
    await applyBuffsAsync(monster, allBuffs);
  };

  // 1モンスターのabilityを連続的に実行する関数
  async function executeAbility(monster, isSupportOrAttack) {
    //他attackAbilitiesで死亡した場合もreturnしない
    if (monster.flags.isDead || monster.flags.isZombie || !monster.abilities || !monster.abilities[isSupportOrAttack]) {
      return;
    }

    const currentAbilities = monster.abilities?.[isSupportOrAttack];
    const allAbilities = [];

    // 各ability配列が存在し、かつ空でない場合のみ追加
    if (currentAbilities?.[turnNum]?.length) {
      allAbilities.push(...currentAbilities[turnNum]);
    }
    if (currentAbilities?.additionalPermanentAbilities?.length) {
      allAbilities.push(...currentAbilities.additionalPermanentAbilities);
    }
    if (currentAbilities?.permanentAbilities?.length) {
      allAbilities.push(...currentAbilities.permanentAbilities);
    }
    if (currentAbilities?.[turnNum % 2 === 0 ? "evenTurnAbilities" : "oddTurnAbilities"]?.length) {
      allAbilities.push(...currentAbilities[turnNum % 2 === 0 ? "evenTurnAbilities" : "oddTurnAbilities"]);
    }
    if (turnNum >= 2 && currentAbilities?.abilitiesFromTurn2?.length) {
      allAbilities.push(...currentAbilities.abilitiesFromTurn2);
    }
    if (currentAbilities?.nextTurnAbilitiesToExecute?.length) {
      allAbilities.push(...currentAbilities.nextTurnAbilitiesToExecute);
    }

    for (const ability of allAbilities) {
      // 発動不可能条件に当てはまった場合次のabilityへ
      if (monster.flags.executedAbilities.includes(ability.name) || (ability.unavailableIf && ability.unavailableIf(monster))) {
        continue;
      }
      await sleep(300);
      if (!ability.disableMessage) {
        if (ability.hasOwnProperty("message")) {
          ability.message(monster);
          await sleep(200);
        } else if (ability.hasOwnProperty("name")) {
          displayMessage(`${monster.name}の特性 ${ability.name}が発動！`);
          await sleep(200);
        }
      }
      await ability.act(monster);
      //実行後の記録
      if (ability.isOneTimeUse) {
        monster.flags.executedAbilities.push(ability.name);
      }
    }
    await sleep(150);
  }

  // partiesに順番にバフ適用・supportAbilities発動
  await sleep(700);
  for (const party of parties) {
    for (const monster of party) {
      await applyBuffsForMonster(monster);
      await executeAbility(monster, "supportAbilities");
      await executeContinuousHealing(monster);
    }
  }

  // 行動早い含めた順番で、attackAbilitiesを実行
  function decideAbilityOrder() {
    let abilityOrder = [];
    // 全てのモンスターを1つの配列にまとめる
    let allMonsters = parties.flat();

    // 各行動順のモンスターを格納する配列を定義
    let preemptiveActionMonsters = [];
    let anchorActionMonsters = [];
    let normalMonsters = [];

    // 各モンスターの行動順を分類
    allMonsters.forEach((monster) => {
      if (monster.buffs.preemptiveAction) {
        preemptiveActionMonsters.push(monster);
      } else if (monster.buffs.anchorAction) {
        anchorActionMonsters.push(monster);
      } else {
        normalMonsters.push(monster);
      }
    });

    // currentStatus.spd で遅い順にソートし、同速の場合はランダムに並び替える関数
    const sortBySpeedAndRandomize = (a, b) => {
      const speedDiff = (a?.currentStatus?.spd || 0) - (b?.currentStatus?.spd || 0);
      return speedDiff !== 0 ? speedDiff : Math.random() - 0.5;
    };

    // isReverseの状態に応じて行動順を決定
    if (fieldState.isReverse) {
      // リバース状態
      abilityOrder = [...preemptiveActionMonsters.sort(sortBySpeedAndRandomize), ...normalMonsters.sort(sortBySpeedAndRandomize), ...anchorActionMonsters.sort(sortBySpeedAndRandomize)];
    } else {
      // 通常状態は反転
      abilityOrder = [
        ...preemptiveActionMonsters.sort(sortBySpeedAndRandomize).reverse(),
        ...normalMonsters.sort(sortBySpeedAndRandomize).reverse(),
        ...anchorActionMonsters.sort(sortBySpeedAndRandomize).reverse(),
      ];
    }
    return abilityOrder;
  }
  const abilityOrder = decideAbilityOrder();
  for (const monster of abilityOrder) {
    await executeAbility(monster, "attackAbilities");
  }

  // supportとattack実行後にnextTurnAbilitiesToExecuteをすべて削除
  for (const party of parties) {
    for (const monster of party) {
      delete monster.abilities.supportAbilities.nextTurnAbilitiesToExecute;
      delete monster.abilities.attackAbilities.nextTurnAbilitiesToExecute;
    }
  }

  //popupを全て閉じてコマンドボタンを有効化、メッセージ表示
  closeSelectCommandPopupWindowContents();
  startSelectingCommandForFirstMonster(0);
}

//毎ラウンドコマンド選択後処理
async function startBattle() {
  await sleep(1000);
  //1round目なら戦闘開始時flagを持つ特性等を発動
  //ラウンド開始時flagを持つ特性を発動 多分awaitする
  decideTurnOrder(parties, skill);
  //monsterの行動を順次実行
  for (const monster of turnOrder) {
    if (isBattleOver()) {
      break;
    }
    await processMonsterAction(monster);
    await sleep(600);
  }
  await startTurn();
}

// バフ追加用関数
function applyBuff(buffTarget, newBuff, skillUser = null, isReflection = false, skipMessage = false) {
  if (buffTarget.flags.isDead) {
    return;
  }
  // 重ねがけ可能なバフ
  const stackableBuffs = {
    baiki: { max: 2, min: -2 },
    defUp: { max: 2, min: -2 },
    spdUp: { max: 2, min: -2 },
    intUp: { max: 2, min: -2 },
    spellBarrier: { max: 2, min: -2 },
    slashBarrier: { max: 2, min: -2 },
    martialBarrier: { max: 2, min: -2 },
    breathBarrier: { max: 2, min: -2 },
    fireResistance: { max: 3, min: -3 },
    iceResistance: { max: 3, min: -3 },
    thunderResistance: { max: 3, min: -3 },
    windResistance: { max: 3, min: -3 },
    ioResistance: { max: 3, min: -3 },
    lightResistance: { max: 3, min: -3 },
    darkResistance: { max: 3, min: -3 },
  };

  // Resistance 系バフの場合の属性名
  const resistanceBuffElementMap = {
    fireResistance: "fire",
    iceResistance: "ice",
    thunderResistance: "thunder",
    windResistance: "wind",
    ioResistance: "io",
    lightResistance: "light",
    darkResistance: "dark",
  };

  //状態異常系のうち、耐性判定やバリア判定を行うもの (継続ダメ・回復封じ・マソ以外)
  const abnormalityBuffs = ["spellSeal", "breathSeal", "slashSeal", "martialSeal", "fear", "tempted", "sealed", "confused", "paralyzed", "asleep", "poisoned", "dazzle", "reviveBlock", "stoned"];
  //hasAbnormalityのfear以外
  const removeGuardAbnormalities = ["tempted", "sealed", "confused", "paralyzed", "asleep", "stoned"];
  //封印とstoned以外
  const dispellableByRadiantWaveAbnormalities = [
    "spellSeal",
    "breathSeal",
    "slashSeal",
    "martialSeal",
    "fear",
    "tempted",
    "confused",
    "paralyzed",
    "asleep",
    "poisoned",
    "dazzle",
    "reviveBlock",
    "dotDamage",
    "healBlock",
    "manaReduction",
    "powerWeaken",
  ];
  const mindAndSealBarrierTargets = ["spellSeal", "breathSeal", "slashSeal", "martialSeal", "fear", "tempted"];

  const reflectionMap = ["spellReflection", "slashReflection", "martialReflection", "breathReflection", "danceReflection", "ritualReflection"];

  const breakBoosts = ["fireBreakBoost", "iceBreakBoost", "thunderBreakBoost", "windBreakBoost", "ioBreakBoost", "lightBreakBoost", "darkBreakBoost"];

  const familyBuffs = ["goragoAtk", "goragoSpd"];

  for (const buffName in newBuff) {
    // 0. 新規バフと既存バフを定義
    const currentBuff = buffTarget.buffs[buffName];
    const buffData = { ...newBuff[buffName] };

    // 1. バフ非上書き条件の処理
    // 1-1. 石化には付与しない
    if (buffTarget.buffs.stoned) {
      continue;
    }
    // 1-2. 亡者の場合 封印以外は付与しない
    if (buffTarget.flags.isZombie && buffName !== "sealed") {
      continue;
    }
    // 1-3. statusLock が存在する場合は stackableBuffs と familyBuffs を付与しない
    if (buffTarget.buffs.hasOwnProperty("statusLock") && (stackableBuffs.hasOwnProperty(buffName) || familyBuffs.hasOwnProperty(buffName))) {
      continue;
    }
    // 1-4. 解除不可状態異常を上書きしない
    //上位毒・上位回復封じ等以外の、解除不可が設定されていない新規状態異常系バフに対して、光の波動で解除可能なフラグを下処理として付与
    if (dispellableByRadiantWaveAbnormalities.includes(buffName) && !buffData.unDispellableByRadiantWave) {
      buffData.dispellableByRadiantWave = true;
    }
    //封印と石化はデフォルトで解除不可
    if (buffName === "sealed" || buffName === "stoned") {
      buffData.unDispellableByRadiantWave = true;
    }
    //もし同種状態異常が既存で、かつ既存unDispellableByRadiantWave > 新規付与dispellableByRadiantWave の場合は上書きしない
    if (currentBuff && currentBuff.unDispellableByRadiantWave && buffData.dispellableByRadiantWave) {
      continue;
    }

    // 1-5. 順位付け処理の前に自動付与
    //removeAtTurnStartの反射にはあらかじめunDispellableを自動付与
    if (reflectionMap.includes(buffName) && buffData.removeAtTurnStart) {
      buffData.unDispellable = true;
    }
    //蘇生封じをkeepOnDeath化
    if (buffName === "reviveBlock") {
      buffData.keepOnDeath = true;
    }
    //breakBoostの追加付与を可能に
    if (breakBoosts.includes(buffName)) {
      buffData.divineDispellable = true;
    }
    // 1-6. keepOnDeath > unDispellable > divineDispellable > else の順位付けで負けてるときはcontinue (イブール上位リザオ、黄泉の封印vs普通、つねバイキ、トリリオン、ネル行動前バフ)
    if (currentBuff) {
      function getBuffPriority(buff) {
        if (buff.keepOnDeath) return 3;
        if (buff.unDispellable) return 2;
        if (buff.divineDispellable) return 1;
        return 0;
      }
      const currentBuffPriority = getBuffPriority(currentBuff);
      const newBuffPriority = getBuffPriority(buffData);
      // currentBuffの方が優先度が高い場合は付与失敗　同格以上ならば上書き
      if (currentBuffPriority > newBuffPriority) {
        continue;
      }
    }
    // 1-7. その他個別の付与不可能条件
    //力ため魔力覚醒所持時に侵食は付与しない
    if ((buffName === "powerWeaken" && buffTarget.buffs.powerCharge) || (buffName === "manaReduction" && buffTarget.buffs.manaBoost)) {
      continue;
    }

    // buffData 内に probability が存在するかチェックして用意
    const probability = buffData.probability ?? 10;
    delete buffData.probability;

    // 2. 耐性バフ、状態異常、その他の順で独立して確率判定・耐性・バリアバフによる無効化処理、付与失敗時はcontinueで次へ飛ばす
    // 2-1. 耐性ダウンの場合のみ耐性をかけて処理
    if (resistanceBuffElementMap.hasOwnProperty(buffName) && buffData.strength < 0) {
      const buffElement = resistanceBuffElementMap[buffName];
      const resistance = calculateResistance(null, buffElement, buffTarget, fieldState.isDistorted);

      if (resistance > 0) {
        // 現在の耐性が無効未満の場合のみ耐性ダウンを適用
        const adjustedProbability = probability * resistance;
        // 確率に基づいてバフ適用を判定
        if (Math.random() > adjustedProbability) {
          continue; // 確率でバフ適用しない場合は次のバフへ
        }
      } else {
        // 現在の耐性が無効吸収の場合は適用しない
        continue; // 次のバフへ
      }
    } else if (abnormalityBuffs.includes(buffName)) {
      // 2-2. //状態異常系のうち、耐性判定 バリア判定 上書き不可能判定を行うもの (継続ダメ・回復封じ・マソ・侵食以外)
      const barrierMap = {
        fear: "mindBarrier",
        tempted: "mindBarrier",
        asleep: "sleepBarrier",
        confused: "confusionBarrier",
        paralyzed: "paralyzeBarrier",
        sealed: "sealBarrier",
        stoned: "stonedBlock",
        reviveBlock: "reviveBlockBarrier",
      };
      // 防壁や魔王バリアで防ぐ
      if ((buffTarget.buffs.sacredBarrier || buffTarget.buffs.demonKingBarrier) && buffName !== "sealed" && buffName !== "stoned" && buffName !== "reviveBlock") {
        continue;
      }
      // マインド封じ無効
      if (buffTarget.buffs.mindAndSealBarrier && mindAndSealBarrierTargets.includes(buffName)) {
        continue;
      }
      // バリアによる無効化
      if (barrierMap[buffName] && buffTarget.buffs[barrierMap[buffName]]) {
        continue;
      }
      //既にほかの行動停止系状態異常にかかっているかつ新規バフがfear, tempted, sealedのときは付与しない ただし封印によるマインド上書きは例外
      if (!(buffTarget.buffs.fear && buffName === "sealed") && (buffName === "fear" || buffName === "tempted" || buffName === "sealed") && hasAbnormality(buffTarget)) {
        continue;
      }
      //耐性を参照して確率判定
      let abnormalityResistance = 1;
      //氷の王国・フロスペ等属性処理
      if (buffData.element) {
        abnormalityResistance = calculateResistance(skillUser, buffData.element, buffTarget, fieldState.isDistorted);
        if (buffName === "sealed" && abnormalityResistance < 0.6) {
          // 氷の王国のみ、使い手込でも半減以上は確定失敗
          abnormalityResistance = -1;
        }
      } else {
        //氷の王国以外の状態異常系の耐性処理については、反射有無で分岐
        //反射時は逆転 反射によって逆転されているのを戻し、元々の使用者と使い手およびtargetの耐性で判定 (状態異常バリアなどは通常と同じく実施済)
        //このため追加効果の反射時は、process内で全ての場合で予測ではなくカンタ系のように、完全に反転させてapplyBuffに渡す (skillUserForAppliedEffectを使用)
        //予測のとき、自分で自分に打つので反射者の情報が欠落してしまい、反転耐性計算ができなくなるのを防止
        if (isReflection) {
          abnormalityResistance = calculateResistance(buffTarget, buffName, skillUser);
        } else {
          abnormalityResistance = calculateResistance(skillUser, buffName, buffTarget);
        }
      }
      //耐性と確率処理で失敗したら次へ
      if (Math.random() > probability * abnormalityResistance) {
        continue;
      }
    } else {
      // 2-3. Resistance系バフと状態異常以外の場合の確率判定
      if (Math.random() > probability) {
        continue;
      }
    }

    // 3. 確率判定成功時にバフ適用処理 バフ付与に付随する効果の処理もここで durationやstrengthによる比較で弾く処理も
    if (stackableBuffs.hasOwnProperty(buffName)) {
      // 3-1. 重ねがけ可能バフ
      if (currentBuff && !buffData.keepOnDeath && !buffData.unDispellable) {
        // 負けている場合はcontinue済、同格の場合は重ねがけだが、勝っている(keepOnDeathやunDispellable)場合は重ねがけせず上書き
        // 重ねがけ可能かつ既にバフが存在する場合はstrength を加算 (上限と下限をチェック)
        const newStrength = Math.max(stackableBuffs[buffName].min, Math.min(currentBuff.strength + buffData.strength, stackableBuffs[buffName].max));
        if (newStrength === 0) {
          // strength が 0 になったらバフを削除
          delete buffTarget.buffs[buffName];
          continue;
        } else {
          // 0以外の場合はstrengthだけ加算して新しいバフで上書き
          buffTarget.buffs[buffName] = { ...currentBuff, strength: newStrength };
        }
      } else {
        // 重ねがけ可能かつ既に存在しない場合はそのまま適用
        buffTarget.buffs[buffName] = { ...buffData };
      }
      //重ねがけ可能バフの付与成功時処理
    } else if (breakBoosts.includes(buffName)) {
      // 3-2. 重ねがけ可能なうち特殊
      if (currentBuff) {
        const newStrength = Math.min(currentBuff.strength + buffData.strength, buffData.maxStrength);
        buffTarget.buffs[buffName] = { ...currentBuff, strength: newStrength };
      } else {
        buffTarget.buffs[buffName] = { ...buffData };
      }
    } else {
      // 3-3. 重ねがけ不可バフの場合、基本は上書き 競合によって上書きしない場合のみ以下のcontinueで弾く
      if (currentBuff) {
        //// 3-2-1. currentBuffにremoveAtTurnStartがあり、newBuffにないときはcontinue (予測系は上書きしない)
        //if (currentBuff.removeAtTurnStart && !buffData.removeAtTurnStart) {
        //  continue;
        //}
        // 3-2-2. currentBuffにdurationが存在せず、かつbuffDataにdurationが存在するときはcontinue (常にマホカンは上書きしない) やるならduration付与後に
        //keepOnDeathで代替、keepOnDeathではなくかつ持続時間無制限のものがあれば実行
        //if (!currentBuff.duration && buffData.duration) {
        //  continue;
        //}
        // 3-2-3. strengthが両方存在し、かつ負けてるときはcontinue (strengthで比較する系：力ため、系統バフ、反射、prot、使い手付与で負けてたら上書きしない)
        if (currentBuff.strength && buffData.strength && currentBuff.strength > buffData.strength) {
          continue;
        }
      }
      buffTarget.buffs[buffName] = { ...buffData };
      // 重ねがけ不可の付与成功時処理
      // statusLockを付与時、既存のstackableBuffsとfamilyBuffsを削除
      if (buffName === "statusLock") {
        const buffNames = Object.keys(buffTarget.buffs);
        for (const existingBuffName of buffNames) {
          if (stackableBuffs.hasOwnProperty(existingBuffName) || familyBuffs.hasOwnProperty(existingBuffName)) {
            delete buffTarget.buffs[existingBuffName];
          }
        }
      }
      //状態異常の付与時発動効果(上書き等)
      //封印によるマインドの上書き 確率成功時にマインドを削除
      if (buffTarget.buffs.fear && buffName === "sealed") {
        delete buffTarget.buffs.fear;
      }
      //他状態異常によるマインド魅了封印の上書き 確率成功時にマインド魅了封印削除
      if (buffName === "confused" || buffName === "paralyzed" || buffName === "asleep") {
        delete buffTarget.buffs.fear;
        delete buffTarget.buffs.tempted;
        delete buffTarget.buffs.sealed;
      }
      //ぼうぎょ解除
      if (removeGuardAbnormalities.includes(buffName) && buffTarget.flags.guard) {
        delete buffTarget.flags.guard;
      }
      //魅了による防御バフ解除
      if (buffName === "tempted") {
        delete buffTarget.buffs.defUp;
      }
      //みがわり解除 みがわられは解除しない
      if ((removeGuardAbnormalities.includes(buffName) || buffName === "fear") && buffTarget.flags.isSubstituting && !buffTarget.flags.isSubstituting.cover) {
        for (const eachMonster of parties.flat()) {
          if (eachMonster.flags.hasSubstitute && eachMonster.flags.hasSubstitute.targetMonsterId === buffTarget.monsterId) {
            delete eachMonster.flags.hasSubstitute;
          }
        }
        delete buffTarget.flags.isSubstituting;
      }
      //石化処理
      if (buffName === "stoned") {
        const buffNames = Object.keys(buffTarget.buffs);
        for (const existingBuffName of buffNames) {
          const existingBuff = buffTarget.buffs[existingBuffName];
          //stackableBuffs, keepOnDeath, unDispellableByRadiantWave, unDispellable, divineDispellableは残す
          if (
            !(
              stackableBuffs.hasOwnProperty(existingBuffName) ||
              existingBuff.keepOnDeath ||
              existingBuff.unDispellableByRadiantWave ||
              existingBuff.unDispellable ||
              existingBuff.divineDispellable ||
              existingBuffName === "stoned"
            )
          ) {
            delete existingBuff;
          }
        }
        //reviveは問答無用で削除
        delete buffTarget.buffs.revive;
        // 防御は解除済なのでみがわりだけ解除
        deleteSubstitute(buffTarget);
      }
      //マホカンは自動でカンタに
      if (buffName === "spellReflection") {
        buffTarget.buffs.spellReflection.isKanta = true;
      }
      //防壁魔王バリア付与時の状態異常解除
      if (buffName === "sacredBarrier" || buffName === "demonKingBarrier") {
        executeRadiantWave(buffTarget);
      }
      //封じマインドバリア付与時の状態異常解除
      if (buffName === "mindAndSealBarrier") {
        for (const type of mindAndSealBarrierTargets) {
          delete buffTarget.buffs[type];
        }
      }
      //力ため魔力覚醒付与時の侵食解除
      if (buffName === "powerCharge") {
        delete buffTarget.buffs.powerWeaken;
      }
      if (buffName === "manaBoost") {
        delete buffTarget.buffs.manaReduction;
      }
    }
    //付与成功時処理 duration設定
    const buffDurations = {
      //decreaseTurnEnd 行動前後がデクリメントに寄与しないタイプ stackableと反射系
      baiki: {
        16: 3,
        48: 4,
        78: 5,
        100: 6,
      },
      defUp: {
        63: 3,
        88: 4,
        98: 5,
        100: 6,
      },
      spdUp: {
        63: 3,
        88: 4,
        98: 5,
        100: 6,
      },
      intUp: {
        63: 3,
        88: 4,
        98: 5,
        100: 6,
      },
      spellBarrier: {
        69: 4,
        94: 5,
        99: 6,
        100: 7,
      },
      slashBarrier: {
        69: 4,
        94: 5,
        99: 6,
        100: 7,
      },
      martialBarrier: {
        69: 4,
        94: 5,
        99: 6,
        100: 7,
      },
      breathBarrier: {
        63: 4,
        93: 5,
        99: 6,
        100: 7,
      },
      preemptiveAction: {
        100: 1,
      },
      anchorAction: {
        100: 1,
      },
      dodgeBuff: {
        100: 1,
      },
      //decreaseBeforeAction 行動前にデクリメントして消える
      manaBoost: {
        100: 2,
      },
      powerCharge: {
        100: 2,
      },
      breathCharge: {
        100: 2,
      },
      nonElementalResistance: {
        100: 3,
      },
      demonKingBarrier: {
        100: 3,
      },
      fear: {
        100: 2,
      },
      tempted: {
        100: 2,
      },
      sealed: {
        100: 2,
      },
      confused: {
        55: 2,
        87: 3,
        99: 4,
        100: 5,
      },
      paralyzed: {
        55: 2,
        87: 3,
        99: 4,
        100: 5,
      },
      asleep: {
        68: 2,
        88: 3,
        97: 4,
        100: 5,
      },
      poisoned: {
        41: 4,
        78: 5,
        97: 6,
        100: 7,
      },
      dazzle: {
        16: 3,
        49: 4,
        83: 5,
        100: 6,
      },
      spellSeal: {
        41: 4,
        78: 5,
        97: 6,
        100: 7,
      },
      breathSeal: {
        41: 4,
        78: 5,
        97: 6,
        100: 7,
      },
      slashSeal: {
        41: 4,
        78: 5,
        97: 6,
        100: 7,
      },
      martialSeal: {
        41: 4,
        78: 5,
        97: 6,
        100: 7,
      },
    };

    const getDuration = (buffName) => {
      const durations = buffDurations[buffName];
      const randomValue = Math.random() * 100;
      for (const threshold in durations) {
        if (randomValue < threshold) {
          return durations[threshold];
        }
      }
    };
    //duration表に含まれるバフかつduration未指定の場合のみduration更新 (力ため等は自動設定だが、帝王の構えなどduration設定時は自動設定しない) さらに上位蘇生封じや常バイキ等の場合も設定しない
    if (buffName in buffDurations && !buffData.hasOwnProperty("duration") && !buffData.hasOwnProperty("keepOnDeath")) {
      buffTarget.buffs[buffName].duration = getDuration(buffName);
    }

    //継続時間指定されている場合に、デクリメントのタイプを設定
    if (buffTarget.buffs[buffName].hasOwnProperty("duration")) {
      //decreaseTurnEnd: ターン経過で一律にデクリメント 行動前後はデクリメントに寄与しない
      //うち、removeAtTurnStartなし： 各monster行動前に削除  付与されたnターン後の行動前に切れる
      const decreaseTurnEndBuffs = ["skillTurn", "hogeReflection"];
      //うち、removeAtTurnStart付与： ターン最初に削除  付与されたnターン後のターン最初に切れる
      const removeAtTurnStartBuffs = ["reviveBlock", "preemptiveAction", "anchorAction", "stoned", "damageLimit", "dodgeBuff"];
      if (removeAtTurnStartBuffs.includes(buffName)) {
        buffTarget.buffs[buffName].removeAtTurnStart = true;
      }
      //stackableBuffs または decreaseTurnEndBuffs内 または removeAtTurnStartを所持 (初期設定or removeAtTurnStartBuffsによる自動付与)
      if (buffName in stackableBuffs || decreaseTurnEndBuffs.includes(buffName) || buffTarget.buffs[buffName].removeAtTurnStart) {
        buffTarget.buffs[buffName].decreaseTurnEnd = true;
      } else {
        //decreaseBeforeAction: 行動前にデクリメント 発動してからn回目の行動直前に削除 それ以外にはこれを自動付与
        //removeAtTurnStartなし：行動前のデクリメント後にそのまま削除
        buffTarget.buffs[buffName].decreaseBeforeAction = true;
      }
    }

    //状態異常によるduration1・removeAtTurnStartの構え予測系解除
    if (removeGuardAbnormalities.includes(buffName) || buffName === "fear") {
      for (const reflection of reflectionMap) {
        if (buffTarget.buffs[reflection] && !buffTarget.buffs[reflection].keepOnDeath && buffTarget.buffs[reflection].removeAtTurnStart && buffTarget.buffs[reflection].duration === 1) {
          delete buffTarget.buffs[reflection];
        }
      }
      // 反撃も解除
      if (buffTarget.buffs.counterAttack) {
        delete buffTarget.buffs.counterAttack;
      }
    }
    //反射の場合にエフェクト追加
    if (reflectionMap.includes(buffName) && buffTarget.buffs[buffName].name !== "幻獣のタッグ反射") {
      addMirrorEffect(buffTarget.iconElementId);
    }
    if (!skipMessage) {
      displayBuffMessage(buffTarget, buffName, buffData);
    }
  }
  updateCurrentStatus(buffTarget); // バフ全て追加後に該当monsterのcurrentStatusを更新
  updateMonsterBuffsDisplay(buffTarget);
}

// ターン経過でデクリメントするタイプ decreaseTurnEnd
function decreaseAllBuffDurations() {
  for (const party of parties) {
    for (const monster of party) {
      // ターン経過で減少するバフの持続時間を減少
      for (const buffName in monster.buffs) {
        const buff = monster.buffs[buffName];
        // duration プロパティが存在し、decreaseTurnEndがtrueの場合のみデクリメント
        if (buff.duration !== undefined && buff.decreaseTurnEnd) {
          buff.duration--;
        }
      }
    }
  }
}

// 行動直前に持続時間を減少させる decreaseBeforeAction
function decreaseBuffDurationBeforeAction(monster) {
  for (const buffName in monster.buffs) {
    const buff = monster.buffs[buffName];
    // duration プロパティが存在し、decreaseBeforeActionがtrueの場合のみデクリメント
    if (buff.duration !== undefined && buff.decreaseBeforeAction) {
      buff.duration--;
    }
  }
}

// durationが0になったバフを消去 行動直前に削除(通常タイプ)
function removeExpiredBuffs(monster) {
  for (const buffName of Object.keys(monster.buffs)) {
    const buff = monster.buffs[buffName];
    // duration プロパティが存在し、かつ 0 以下で、removeAtTurnStartがfalseの場合に削除
    if (buff.hasOwnProperty("duration") && buff.duration <= 0 && !buff.removeAtTurnStart) {
      console.log(`${fieldState.turnNum}R:${monster.name}の${buffName}の効果が行動前に切れた!`);
      delete monster.buffs[buffName];
    }
  }
  updateCurrentStatus(monster);
  updateMonsterBuffsDisplay(monster);
}

// durationが0になったバフを消去 ターン開始時(帝王の構えや予測等、removeAtTurnStart指定)
function removeExpiredBuffsAtTurnStart() {
  for (const party of parties) {
    for (const monster of party) {
      for (const buffName of Object.keys(monster.buffs)) {
        const buff = monster.buffs[buffName];
        // duration プロパティが存在し、かつ 0 以下で、removeAtTurnStartがtrueの場合に削除
        if (buff.hasOwnProperty("duration") && buff.duration <= 0 && buff.removeAtTurnStart) {
          console.log(`${fieldState.turnNum}R:${monster.name}の${buffName}の効果が切れた!`);
          delete monster.buffs[buffName];
        }
      }
      updateCurrentStatus(monster);
      updateMonsterBuffsDisplay(monster);
    }
  }
}

// currentStatusを更新する関数
// applyBuffの追加時および持続時間切れ、解除時に起動
function updateCurrentStatus(monster) {
  // currentStatus を defaultStatus の値で初期化
  monster.currentStatus.atk = monster.defaultStatus.atk;
  monster.currentStatus.def = monster.defaultStatus.def;
  monster.currentStatus.spd = monster.defaultStatus.spd;
  monster.currentStatus.int = monster.defaultStatus.int;

  const strengthMultipliersForDef = {
    0: 0.6, // -2 + 2
    1: 0.8, // -1 + 2
    3: 1.2, //  1 + 2
    4: 1.4, //  2 + 2
  };
  const strengthMultipliersForSpdInt = {
    0: 0.25, // -2 + 2
    1: 0.5, // -1 + 2
    3: 1.5, //  1 + 2
    4: 2, //  2 + 2
  };

  // 通常バフ バイキ除く
  if (monster.buffs.defUp) {
    const strengthKey = monster.buffs.defUp.strength + 2;
    const Multiplier = strengthMultipliersForDef[strengthKey];
    monster.currentStatus.def *= Multiplier;
  }
  if (monster.buffs.spdUp) {
    const strengthKey = monster.buffs.spdUp.strength + 2;
    const Multiplier = strengthMultipliersForSpdInt[strengthKey];
    monster.currentStatus.spd *= Multiplier;
  }
  if (monster.buffs.intUp) {
    const strengthKey = monster.buffs.intUp.strength + 2;
    const Multiplier = strengthMultipliersForSpdInt[strengthKey];
    monster.currentStatus.int *= Multiplier;
  }

  //内部バフと系統バフ 1.5ではなく0.5等と指定することに注意
  let atkMultiplier = 1;
  if (monster.buffs.internalAtkUp) {
    atkMultiplier += monster.buffs.internalAtkUp.strength;
  }
  // ゴラゴ
  if (monster.buffs.goragoAtk) {
    atkMultiplier += monster.buffs.goragoAtk.strength;
  }
  monster.currentStatus.atk *= atkMultiplier;

  let defMultiplier = 1;
  if (monster.buffs.internalDefUp) {
    defMultiplier += monster.buffs.internalDefUp.strength;
  }
  monster.currentStatus.def *= defMultiplier;

  let spdMultiplier = 1;
  if (monster.buffs.internalSpdUp) {
    spdMultiplier += monster.buffs.internalSpdUp.strength;
    if (monster.buffs.tabooSeal) {
      spdMultiplier -= 0.5;
    }
  }
  // ゴラゴ
  if (monster.buffs.goragoSpd) {
    spdMultiplier += monster.buffs.goragoSpd.strength;
  }
  monster.currentStatus.spd *= spdMultiplier;

  let intMultiplier = 1;
  if (monster.buffs.internalIntUp) {
    intMultiplier += monster.buffs.internalIntUp.strength;
  }
  monster.currentStatus.int *= intMultiplier;
}

// 行動順を決定する関数 コマンド決定後にstartBattleで起動
function decideTurnOrder(parties, skills) {
  // 全てのモンスターを1つの配列にまとめる
  let allMonsters = parties.flat();

  // 各行動順のモンスターを格納する配列を定義
  let preemptiveMonsters = [];
  let preemptiveActionMonsters = [];
  let anchorMonsters = [];
  let anchorActionMonsters = [];
  let normalMonsters = [];

  // 各モンスターの行動順を分類 (skillのorderと特性の複数所持時はskillのorder優先で分類)
  allMonsters.forEach((monster) => {
    const selectedSkillInfo = skills.find((skill) => skill.name === monster.commandInput);

    if (selectedSkillInfo?.order === "preemptive") {
      preemptiveMonsters.push(monster);
    } else if (selectedSkillInfo?.order === "anchor") {
      anchorMonsters.push(monster);
    } else if (monster.buffs.preemptiveAction) {
      preemptiveActionMonsters.push(monster);
    } else if (monster.buffs.anchorAction) {
      anchorActionMonsters.push(monster);
    } else {
      normalMonsters.push(monster);
    }
  });
  //死亡もしくはAIのモンスターはpreemptiveActionMonsters, anchorActionMonsters, normalMonstersのいずれかに格納される

  // 行動順を決定
  turnOrder = [];
  //初期化

  if ("isReverse" in fieldState && fieldState.isReverse === true) {
    // --- リバース状態の処理 ---
    // 各グループのソート処理を関数化
    const sortByPreemptiveGroupAndSpeed = (a, b) => {
      const skillA = skills.find((skill) => skill.name === a.commandInput);
      const skillB = skills.find((skill) => skill.name === b.commandInput);
      if (skillA?.preemptiveGroup !== skillB?.preemptiveGroup) {
        return skillA?.preemptiveGroup - skillB?.preemptiveGroup;
      } else {
        return a.modifiedSpeed - b.modifiedSpeed;
      }
    };

    // 1. preemptiveGroup 1-6 を追加 (preemptiveGroupの小さい順、modifiedSpeedの遅い順)
    turnOrder.push(
      ...allMonsters
        .filter((monster) => {
          const skill = skills.find((s) => s.name === monster.commandInput);
          return skill && skill.preemptiveGroup >= 1 && skill.preemptiveGroup <= 6;
        })
        .sort(sortByPreemptiveGroupAndSpeed)
    );

    // 2. アンカー技を使うモンスターを追加 (anchorAction所持, 特性未所持, preemptiveAction所持の順、
    //    各グループ内ではmodifiedSpeedの遅い順)
    turnOrder.push(
      ...anchorMonsters.filter((monster) => monster.buffs.anchorAction).sort((a, b) => (a?.currentStatus?.spd || 0) - (b?.currentStatus?.spd || 0)),
      ...anchorMonsters.filter((monster) => !monster.buffs.anchorAction && !monster.buffs.preemptiveAction).sort((a, b) => a.modifiedSpeed - b.modifiedSpeed),
      ...anchorMonsters.filter((monster) => monster.buffs.preemptiveAction).sort((a, b) => (a?.currentStatus?.spd || 0) - (b?.currentStatus?.spd || 0))
    );

    // 3. anchorActionを持つモンスターを追加 (currentStatus.spdの遅い順)
    turnOrder.push(...anchorActionMonsters.sort((a, b) => (a?.currentStatus?.spd || 0) - (b?.currentStatus?.spd || 0)));

    // 4. 通常の行動順のモンスターを追加 (modifiedSpeedの遅い順)
    turnOrder.push(...normalMonsters.sort((a, b) => a.modifiedSpeed - b.modifiedSpeed));

    // 5. preemptiveActionを持つモンスターを追加 (currentStatus.spdの遅い順)
    turnOrder.push(...preemptiveActionMonsters.sort((a, b) => (a?.currentStatus?.spd || 0) - (b?.currentStatus?.spd || 0)));

    // 6. preemptiveGroup 7-8 を追加 (preemptiveGroupの小さい順、modifiedSpeedの遅い順)
    turnOrder.push(
      ...allMonsters
        .filter((monster) => {
          const skill = skills.find((s) => s.name === monster.commandInput);
          return skill && skill.preemptiveGroup >= 7 && skill.preemptiveGroup <= 8;
        })
        .sort(sortByPreemptiveGroupAndSpeed)
    );
  } else {
    // --- 通常状態の処理 ---
    // 各グループのソート処理を関数化
    const sortByPreemptiveGroupAndReverseSpeed = (a, b) => {
      const skillA = skills.find((skill) => skill.name === a.commandInput);
      const skillB = skills.find((skill) => skill.name === b.commandInput);
      if (skillA?.preemptiveGroup !== skillB?.preemptiveGroup) {
        return skillA?.preemptiveGroup - skillB?.preemptiveGroup;
      } else {
        return b.modifiedSpeed - a.modifiedSpeed;
      }
    };

    // 1. preemptiveGroup 1-5 を追加 (preemptiveGroupの小さい順、modifiedSpeedの遅い順)
    turnOrder.push(
      ...allMonsters
        .filter((monster) => {
          const skill = skills.find((s) => s.name === monster.commandInput);
          return skill && skill.preemptiveGroup >= 1 && skill.preemptiveGroup <= 6;
        })
        .sort(sortByPreemptiveGroupAndReverseSpeed)
    );

    // 2. preemptiveGroup 7-8 を追加 (preemptiveGroupの小さい順、modifiedSpeedの遅い順)
    turnOrder.push(
      ...allMonsters
        .filter((monster) => {
          const skill = skills.find((s) => s.name === monster.commandInput);
          return skill && skill.preemptiveGroup >= 7 && skill.preemptiveGroup <= 8;
        })
        .sort(sortByPreemptiveGroupAndReverseSpeed)
    );

    // 3. preemptiveActionを持つモンスターを追加 (currentStatus.spdの遅い順)
    turnOrder.push(...preemptiveActionMonsters.sort((a, b) => (b?.currentStatus?.spd || 0) - (a?.currentStatus?.spd || 0)));

    // 4. 通常の行動順のモンスターを追加 (modifiedSpeedの遅い順)
    turnOrder.push(...normalMonsters.sort((a, b) => b.modifiedSpeed - a.modifiedSpeed));

    // 5. anchorActionを持つモンスターを追加 (currentStatus.spdの遅い順)
    turnOrder.push(...anchorActionMonsters.sort((a, b) => (b?.currentStatus?.spd || 0) - (a?.currentStatus?.spd || 0)));

    // 6. アンカー技を使うモンスターを追加 (preemptiveAction持ち-> 通常行動 -> anchorAction持ち)
    turnOrder.push(
      ...anchorMonsters.filter((monster) => monster.buffs.preemptiveAction).sort((a, b) => (b?.currentStatus?.spd || 0) - (a?.currentStatus?.spd || 0)),
      ...anchorMonsters.filter((monster) => !monster.buffs.anchorAction && !monster.buffs.preemptiveAction).sort((a, b) => b.modifiedSpeed - a.modifiedSpeed),
      ...anchorMonsters.filter((monster) => monster.buffs.anchorAction).sort((a, b) => (b?.currentStatus?.spd || 0) - (a?.currentStatus?.spd || 0))
    );
  }

  console.log(turnOrder);
  return turnOrder;
}

// 各monsterの行動を実行する関数
async function processMonsterAction(skillUser) {
  // damagedMonstersを用意
  const damagedMonsters = [];
  // 1. バフ状態異常継続時間確認
  // 行動直前に持続時間を減少させる decreaseBeforeAction
  decreaseBuffDurationBeforeAction(skillUser);
  // durationが0になったバフを消去 行動直前に削除(通常タイプ)
  removeExpiredBuffs(skillUser);

  removeAllStickOut();

  // 2. 死亡確認
  if (skillUser.commandInput === "skipThisTurn") {
    return; // 行動前に一回でも死んでいたら処理をスキップ
  }

  // 状態異常確認
  if (hasAbnormality(skillUser)) {
    // 状態異常の場合は7. 行動後処理にスキップ
    const abnormalityMessage = hasAbnormality(skillUser);
    console.log(`${skillUser.name}は${abnormalityMessage}`);
    displayMessage(`${skillUser.name}は`, `${abnormalityMessage}`);
    await postActionProcess(skillUser, null, null, damagedMonsters);
    return;
  }

  // AIの場合変更されるのでここで定義
  let executingSkill = findSkillByName(skillUser.commandInput);

  function decideNormalAICommand(skillUser) {
    const availableSkills = [];
    const unavailableSkillsOnAI = ["黄泉の封印", "超魔滅光", "神獣の封印", "エンドブレス", "涼風一陣", "昇天斬り", "誇りのつるぎ", "狂気のいあつ", "メゾラゴン", "メラゾロス"];
    for (const skillName of skillUser.skill) {
      const skillInfo = findSkillByName(skillName);
      const MPcost = calculateMPcost(skillUser, skillInfo);

      // 除外条件のいずれかを満たすとき次へ送る
      if (
        unavailableSkillsOnAI.includes(skillName) ||
        skillInfo.order !== undefined ||
        skillInfo.followingSkill ||
        (skillUser.buffs[skillInfo.type + "Seal"] && !skillInfo.skipSkillSealCheck) ||
        skillUser.flags.unavailableSkills.includes(skillName) ||
        // unavailableIfは様子見
        skillUser.currentStatus.MP < MPcost ||
        skillInfo.howToCalculate === "none" ||
        //仮で敵対象skillのみ
        skillInfo.targetTeam !== "enemy" ||
        //反射が存在
        (skillInfo.targetTeam === "enemy" &&
          (skillInfo.targetType === "all" || skillInfo.targetType === "random") &&
          !skillInfo.ignoreReflection &&
          parties[skillUser.enemyTeamID].some((monster) => {
            return monster.buffs[skillInfo.type + "Reflection"] || (monster.buffs.slashReflection && monster.buffs.slashReflection.isKanta && skillInfo.type === "notskill");
          }))
      ) {
        continue;
      }
      // 条件を満たさない場合は、availableSkillsに追加
      availableSkills.push(skillInfo);
      //全部だめなら通常攻撃;
    }
  }

  function decideReviveAICommand(skillUser) {
    const availableReviveSkills = [];
    const availableAllHealSkills = [];
    const availableSingleHealSkills = [];
    for (const skillName of skillUser.skill) {
      const skillInfo = findSkillByName(skillName);
      const MPcost = calculateMPcost(skillUser, skillInfo);
      // 除外条件のいずれかを満たすとき次へ送る 蘇生か回復技のみに選定
      if (
        skillInfo.order !== undefined ||
        skillInfo.followingSkill ||
        (skillUser.buffs[skillInfo.type + "Seal"] && !skillInfo.skipSkillSealCheck) ||
        skillUser.flags.unavailableSkills.includes(skillName) ||
        // unavailableIfは様子見
        skillUser.currentStatus.MP < MPcost
      ) {
        continue;
      }
      // 分けて格納
      if (skillInfo.targetType === "dead") {
        availableReviveSkills.push(skillInfo);
      } else if (skillInfo.healSkill && skillInfo.targetType === "all") {
        availableAllHealSkills.push(skillInfo);
      } else if (skillInfo.healSkill) {
        availableSingleHealSkills.push(skillInfo); //randomも可能性はある
      }
    }
    // 蘇生技所持時 かつ 蘇生target存在時に蘇生を指定
    if (availableReviveSkills.length > 0) {
      const validTargets = parties[skillUser.teamID].filter((monster) => monster.flags.isDead && !monster.flags.isZombie && !monster.buffs.reviveBlock);
      let fastestTarget = null;
      if (validTargets.length > 0) {
        fastestTarget = validTargets[0];
        for (let i = 1; i < validTargets.length; i++) {
          // ランクが高い または 同ランクかつ素早さが高い場合更新
          if (validTargets[i].rank > fastestTarget.rank) {
            fastestTarget = validTargets[i];
          } else if (validTargets[i].rank === fastestTarget.rank && validTargets[i].modifiedSpeed > fastestTarget.modifiedSpeed) {
            fastestTarget = validTargets[i];
          }
        }
      }
      // target存在時 そのtargetに蘇生技を撃つ commandInputはそのまま
      if (fastestTarget) {
        executingSkill = availableReviveSkills[0];
        skillUser.commandTargetInput = fastestTarget.index;
        return;
      }
    }
    // 全体回復技所持時
    if (availableAllHealSkills.length > 0) {
      executingSkill = availableAllHealSkills[0];
      return;
    }
    // 単体乱打回復技所持時
    if (availableSingleHealSkills.length > 0) {
      const validTargets = parties[skillUser.teamID].filter((monster) => !monster.flags.isDead && !monster.flags.isZombie);
      let lowestTarget = null;
      if (validTargets.length > 0) {
        lowestTarget = validTargets[0];
        for (let i = 1; i < validTargets.length; i++) {
          const currentTarget = validTargets[i];
          // 最低値のmonsterに更新
          if (currentTarget.currentStatus.HP / currentTarget.defaultStatus.HP < lowestTarget.currentStatus.HP / lowestTarget.defaultStatus.HP) {
            lowestTarget = currentTarget;
          }
        }
      }
      // target存在時 そのtargetに回復技を撃つ commandInputはそのまま
      if (lowestTarget) {
        executingSkill = availableSingleHealSkills[0];
        skillUser.commandTargetInput = lowestTarget.index;
        return;
      }
    }
    // 全部だめなら通常攻撃
    // todo: targetがランダム 反射にうつ可能性を排除する
    executingSkill = findSkillByName(getNormalAttackName(skillUser));
  }

  // 状態異常判定をクリア後、AI行動特技設定
  // 仮で通常攻撃に
  if (skillUser.commandInput === "normalAICommand") {
    executingSkill = findSkillByName(getNormalAttackName(skillUser));
  }

  if (skillUser.commandInput === "reviveAICommand") {
    //decideReviveAICommand(skillUser);
  } else if (skillUser.commandInput === "normalAICommand") {
    //decideNormalAICommand(skillUser);
  }

  if (executingSkill.name === "ぼうぎょ") {
    document.getElementById(skillUser.iconElementId).parentNode.classList.add("recede");
  } else {
    document.getElementById(skillUser.iconElementId).parentNode.classList.add("stickOut");
  }

  // 4. 特技封じ確認
  if (skillUser.buffs[executingSkill.type + "Seal"] && !executingSkill.skipSkillSealCheck) {
    // 特技封じされている場合は7. 行動後処理にスキップ
    const skillTypes = {
      spell: "呪文",
      slash: "斬撃",
      martial: "体技",
      breath: "息",
    };
    console.log(`${skillTypes[executingSkill.type]}はふうじこめられている！`);
    displayMessage(`${skillTypes[executingSkill.type]}はふうじこめられている！`);
    await postActionProcess(skillUser, null, null, damagedMonsters);
    return;
  }

  // 5. 消費MP確認
  const calcMPcost = calculateMPcost(skillUser, executingSkill);
  if (skillUser.currentStatus.MP >= calcMPcost) {
    skillUser.currentStatus.MP -= calcMPcost;
    updateMonsterBar(skillUser);
  } else {
    console.log("しかし、MPが足りなかった！");
    displayMessage("しかし、MPが足りなかった！");
    // MP不足の場合は7. 行動後処理にスキップ
    await postActionProcess(skillUser, null, null, damagedMonsters);
    return;
  }

  // 6. スキル実行処理の前に連携状態を確認
  const currentTeamID = skillUser.teamID;
  const previousTeamID = fieldState.cooperation.lastTeamID;
  const previousSkillType = fieldState.cooperation.lastSkillType;
  const isCooperationValid = fieldState.cooperation.isValid;
  // 前回の行動と同じチームID・typeかつ、通常攻撃やダメージ無しではないときに連携
  if (isCooperationValid && currentTeamID === previousTeamID && executingSkill.type === previousSkillType && executingSkill.type !== "notskill" && executingSkill.howToCalculate !== "none") {
    // 100%連携継続
    fieldState.cooperation.count++;
    console.log("100%の連携継続が発生");
    console.log(`${fieldState.cooperation.count}連携!`);
    showCooperationEffect(currentTeamID, fieldState.cooperation.count);
  } else if (isCooperationValid && currentTeamID === previousTeamID && executingSkill.type !== "notskill" && executingSkill.howToCalculate !== "none" && Math.random() < 0.33) {
    // 33%の確率で連携継続
    fieldState.cooperation.count++;
    console.log("33%の連携継続が発生");
    console.log(`${fieldState.cooperation.count}連携!`);
    showCooperationEffect(currentTeamID, fieldState.cooperation.count);
  } else {
    // 連携リセット
    fieldState.cooperation.count = 1;
    console.log("連携reset");
  }
  // スキル実行前に連携情報を更新
  fieldState.cooperation.lastTeamID = currentTeamID;
  fieldState.cooperation.lastSkillType = executingSkill.type;
  // ダメージなしやskill以外のときはfalseに設定し、ダメージなし等から連携が継続しないように
  if (executingSkill.type === "notskill" || executingSkill.howToCalculate === "none") {
    fieldState.cooperation.isValid = false;
  } else {
    fieldState.cooperation.isValid = true;
  }

  // 6. スキル実行処理
  console.log(`${skillUser.name}は${executingSkill.name}を使った！`);
  if (executingSkill.specialMessage) {
    executingSkill.specialMessage(skillUser.name, executingSkill.name);
  } else if (executingSkill.type === "spell") {
    displayMessage(`${skillUser.name}は`, `${executingSkill.name}を となえた！`);
  } else if (executingSkill.type === "slash") {
    displayMessage(`${skillUser.name}は`, `${executingSkill.name}を はなった！`);
  } else if (executingSkill.name === "ぼうぎょ") {
    displayMessage(`${skillUser.name}は身を守っている！`);
  } else if (executingSkill.type === "notskill") {
    displayMessage(`${skillUser.name}のこうげき！`);
  } else {
    displayMessage(`${skillUser.name}の`, `${executingSkill.name}！`);
  }
  const skillTargetTeam = executingSkill.targetTeam === "enemy" ? parties[skillUser.enemyTeamID] : parties[skillUser.teamID];
  await sleep(40); // スキル実行前に待機時間を設ける
  let executedSkills = [];
  const commandTarget = skillUser.commandTargetInput === "" ? null : skillTargetTeam[parseInt(skillUser.commandTargetInput)];
  executedSkills = await executeSkill(skillUser, executingSkill, commandTarget, true, damagedMonsters, false);

  // 7. 行動後処理 かつ状態異常や特技封じ、MP確認で離脱せず正常に特技を実行した時のみ実行する処理
  if (executingSkill.isOneTimeUse) {
    skillUser.flags.unavailableSkills.push(executingSkill.name);
  }
  // オムド処理 特技実行後、全てのmonsterのwillTransformを削除
  for (const party of parties) {
    for (const monster of party) {
      delete monster.flags.willTransformOmudo;
    }
  }
  if (skillUser.name === "超オムド" && executingSkill.type !== "notskill") {
    skillUser.flags.willTransformOmudo = true;
  }
  if (isBattleOver()) {
    return;
  }

  await postActionProcess(skillUser, executingSkill, executedSkills, damagedMonsters);
}

// 行動後処理  正常実行後だけでなく 状態異常 特技封じ MP不足等executingSkill未実行でnullの時にerrorにならないよう注意 特にunavailableIf
async function postActionProcess(skillUser, executingSkill = null, executedSkills = null, damagedMonsters) {
  // 各処理の前にskipThisTurn所持確認を行う
  if (skillUser.commandInput === "skipThisTurn") {
    return;
  }
  // 7-2. flag付与

  // 7-3. AI追撃処理
  if (skillUser.commandInput !== "skipThisTurn" && skillUser.AINormalAttack && !hasAbnormality(skillUser)) {
    const noAIskills = ["黄泉の封印", "神獣の封印"];
    if (!executingSkill || (!noAIskills.includes(executingSkill.name) && !(executingSkill.howToCalculate === "none" && (executingSkill.order === "preemptive" || executingSkill.order === "anchor")))) {
      await sleep(300);
      let attackTimes =
        skillUser.AINormalAttack.length === 1
          ? skillUser.AINormalAttack[0] - 1
          : Math.floor(Math.random() * (skillUser.AINormalAttack[1] - skillUser.AINormalAttack[0] + 1)) + skillUser.AINormalAttack[0] - 1;
      if (skillUser.buffs.aiExtraAttacks) {
        attackTimes += skillUser.buffs.aiExtraAttacks.strength;
      }
      for (let i = 0; i < attackTimes; i++) {
        await sleep(500); // 追撃ごとに待機時間
        console.log(`${skillUser.name}は通常攻撃で追撃！`);
        displayMessage(`${skillUser.name}の攻撃！`);
        // 追撃の種類を決定
        let NormalAttackName = getNormalAttackName(skillUser);
        // 通常攻撃を実行
        await executeSkill(skillUser, findSkillByName(NormalAttackName), decideNormalAttackTarget(skillUser), false, damagedMonsters, true);
      }
    }
  }

  // 7-4. 行動後発動特性の処理
  async function executeAfterActionAbilities(monster) {
    const abilitiesToExecute = [];
    // 各ability配列の中身を展開して追加
    abilitiesToExecute.push(...(monster.abilities.afterActionAbilities ?? []));
    abilitiesToExecute.push(...(monster.abilities.additionalAfterActionAbilities ?? []));
    for (const ability of abilitiesToExecute) {
      // oneTimeUseで実行済 または発動不可能条件に当てはまった場合次のabilityへ
      if (monster.flags.executedAbilities.includes(ability.name) || (ability.unavailableIf && ability.unavailableIf(monster, executingSkill, executedSkills))) {
        continue;
      }
      if (!ability.disableMessage) {
        if (ability.hasOwnProperty("message")) {
          ability.message(monster);
          await sleep(150);
        } else if (ability.hasOwnProperty("name")) {
          displayMessage(`${monster.name}の特性 ${ability.name}が発動！`);
          await sleep(150);
        }
      }
      await sleep(150);
      //実行済skillを渡して実行 最初の要素が選択したskill
      await ability.act(monster, executingSkill, executedSkills);
      //実行後の記録
      if (ability.isOneTimeUse) {
        monster.flags.executedAbilities.push(ability.name);
      }
      await sleep(200);
    }
  }
  // 行動後特性実行
  if (skillUser.commandInput !== "skipThisTurn") {
    await executeAfterActionAbilities(skillUser);
  }

  // 刻印・毒・継続で死亡時に、recentlyKilledを回収して死亡時発動を実行するcheckRecentlyKilledFlag
  // 7-5. 属性断罪の刻印処理
  if (skillUser.commandInput !== "skipThisTurn" && skillUser.buffs.elementalRetributionMark && executedSkills.some((skill) => skill && skill.element !== "none")) {
    await sleep(400);
    const damage = Math.floor(skillUser.defaultStatus.HP * 0.7);
    console.log(`${skillUser.name}は属性断罪の刻印で${damage}のダメージを受けた！`);
    applyDamage(skillUser, damage);
    await checkRecentlyKilledFlag(skillUser);
  }

  // 7-6. 毒・継続ダメージ処理
  if (skillUser.commandInput !== "skipThisTurn" && skillUser.buffs.poisoned) {
    await sleep(400);
    const poisonDepth = skillUser.buffs.poisonDepth?.strength ?? 1;
    const damage = Math.floor(skillUser.defaultStatus.HP * skillUser.buffs.poisoned.strength * poisonDepth);
    console.log(`${skillUser.name}は毒で${damage}のダメージを受けた！`);
    displayMessage(`${skillUser.name}は`, "もうどくにおかされている！");
    applyDamage(skillUser, damage);
    await checkRecentlyKilledFlag(skillUser);
  }
  if (skillUser.commandInput !== "skipThisTurn" && skillUser.buffs.dotDamage) {
    await sleep(400);
    const damage = Math.floor(skillUser.defaultStatus.HP * skillUser.buffs.dotDamage.strength);
    console.log(`${skillUser.name}は継続ダメージで${damage}のダメージを受けた！`);
    displayMessage(`${skillUser.name}は`, "HPダメージを 受けている！");
    applyDamage(skillUser, damage);
    await checkRecentlyKilledFlag(skillUser);
  }

  // 7-7. 被ダメージ時発動skill処理 反撃はリザオ等で蘇生しても発動するし、反射や死亡時で死んでも他に飛んでいくので制限はなし
  for (const monster of parties[skillUser.enemyTeamID]) {
    if (damagedMonsters.includes(monster.monsterId)) {
      await executeCounterAbilities(monster);
    }
  }
  async function executeCounterAbilities(monster) {
    // 反撃者が死亡時はまたは亡者は反撃しない リザオなどで蘇生してたら反撃  被反撃者の生死は考慮しない(リザオ等で蘇生しても発動,反射や死亡時で死んでも他に飛んでいくので制限なし)
    if (monster.flags.isDead || monster.flags.isZombie) {
      return;
    }
    await sleep(300);
    const abilitiesToExecute = [];
    // 各ability配列の中身を展開して追加
    abilitiesToExecute.push(...(monster.abilities.counterAbilities ?? []));
    abilitiesToExecute.push(...(monster.abilities.additionalCounterAbilities ?? []));
    for (const ability of abilitiesToExecute.reverse()) {
      // oneTimeUseで実行済 または発動不可能条件に当てはまった場合次のabilityへ
      if (monster.flags.executedAbilities.includes(ability.name) || (ability.unavailableIf && ability.unavailableIf(monster))) {
        continue;
      }
      if (!ability.disableMessage) {
        if (ability.hasOwnProperty("message")) {
          ability.message(monster);
          await sleep(150);
        } else if (ability.hasOwnProperty("name")) {
          displayMessage(`${monster.name}の特性 ${ability.name}が発動！`);
          await sleep(150);
        }
      }
      await sleep(150);
      //実行済skillを渡して実行 最初の要素が選択したskill  反撃先としてskillUserを渡す
      await ability.act(monster, skillUser);
      //実行後の記録
      if (ability.isOneTimeUse) {
        monster.flags.executedAbilities.push(ability.name);
      }
      await sleep(200); //多め
      return; // 1つだけ実行
    }
  }
}

// 刻印・毒・継続で死亡時に、recentlyKilledを回収して死亡時発動を実行する
async function checkRecentlyKilledFlag(monster) {
  if (monster.flags.recentlyKilled) {
    delete monster.flags.recentlyKilled;
    const killedThisSkill = new Set();
    killedThisSkill.add(monster);
    await processDeathAction(monster, killedThisSkill);
  }
}

// 死亡判定を行う関数
function isDead(monster) {
  return monster.flags.isDead === true;
}

// 状態異常判定を行う関数
function hasAbnormality(monster) {
  const abnormalityMessages = {
    stoned: "鉄のようになり みがまえている！",
    paralyzed: "からだがしびれて動けない！",
    asleep: "ねむっている！",
    confused: "こんらんしている！",
    fear: "動きを ふうじられている！",
    tempted: "動きを ふうじられている！",
    sealed: "動きを ふうじられている！",
  };

  for (const key in abnormalityMessages) {
    if (monster.buffs[key]) {
      return abnormalityMessages[key];
    }
  }
  return false;
}

//吸収以外の錬金が乗る回復
function applyHeal(target, healAmount, isMPheal = false) {
  let calculatedHealAmount = healAmount;
  if (target.gear && target.gear.healBoost) {
    calculatedHealAmount *= target.gear.healBoost;
  }
  applyDamage(target, calculatedHealAmount, -1, isMPheal);
}

// ダメージを適用する関数
function applyDamage(target, damage, resistance = 1, isMPdamage = false, reducedByElementalShield = false) {
  if (resistance === -1) {
    // 回復処理 基礎値を用意
    let healAmount = Math.floor(Math.abs(damage)); // 小数点以下切り捨て＆絶対値
    // 亡者はミス表示して終了
    if (target.flags.isZombie) {
      displayMiss(target);
      return;
    }
    // 回復封じ処理
    if (target.buffs.healBlock) {
      displayDamage(target, 0, -1, isMPdamage);
      return;
    }
    if (isMPdamage) {
      // MP回復
      healAmount = Math.min(healAmount, target.defaultStatus.MP - target.currentStatus.MP);
      target.currentStatus.MP += healAmount;
      console.log(`${target.name}のMPが${healAmount}回復！`);
      displayMessage(`${target.name}の`, `MPが ${healAmount}回復した！`);
      displayDamage(target, -healAmount, -1, true); // MP回復は負の数で表示
    } else {
      // HP回復
      healAmount = Math.min(healAmount, target.defaultStatus.HP - target.currentStatus.HP);
      target.currentStatus.HP += healAmount;
      console.log(`${target.name}のHPが${healAmount}回復！`);
      displayMessage(`${target.name}の`, `HPが ${healAmount}回復した！`);
      displayDamage(target, -healAmount, -1); // HP回復は負の数で表示
    }

    updateMonsterBar(target);
    return;
  } else {
    // ダメージ処理
    if (isMPdamage) {
      // 亡者はミス表示して終了
      if (target.flags.isZombie) {
        displayMiss(target);
        return;
      }
      // MPダメージ 現状値が最大ダメージ
      let mpDamage = Math.min(target.currentStatus.MP, Math.floor(damage));
      target.currentStatus.MP -= mpDamage;
      console.log(`${target.name}はMPダメージを受けている！`);
      displayMessage(`${target.name}は MPダメージを受けている！`);
      displayDamage(target, mpDamage, resistance, true);
      updateMonsterBar(target);
      return;
    } else {
      // HPダメージ 表示はオーバーフロー可
      const hpDamage = Math.floor(damage); // 小数点以下切り捨て
      target.currentStatus.HP = Math.max(target.currentStatus.HP - hpDamage, 0);
      console.log(`${target.name}に${hpDamage}のダメージ！`);
      if (hpDamage === 0 && !reducedByElementalShield) {
        displayMessage(`ミス！ダメージをあたえられない！`);
      } else {
        displayMessage(`${target.name}に`, `${hpDamage}のダメージ！！`);
      }
      // HPかつダメージのときのみ、reducedByElementalShieldを渡して0ダメ表示対応
      displayDamage(target, hpDamage, resistance, false, reducedByElementalShield);

      // 亡者はダメージ表示(と無意味なcurrentの更新)のみ updateMonsterBarやくじけぬは実行せず終了
      if (target.flags.isZombie) {
        return;
      }
      //updateMonsterBarはくじけぬ未所持判定後か、くじけぬ処理の分岐内で実行
      if (target.currentStatus.HP === 0 && !target.flags.isDead) {
        // くじけぬ処理
        if (target.buffs.isUnbreakable) {
          if (target.buffs.isUnbreakable.isToukon) {
            if (Math.random() < 0.75) {
              target.buffs.isUnbreakable.left--;
              handleUnbreakable(target);
              //とうこんの場合のみ、確定枠を消費したら削除
              if (target.buffs.isUnbreakable.left <= 0) {
                delete target.buffs.isUnbreakable;
              }
            } else {
              handleDeath(target);
            }
          } else {
            if (target.buffs.isUnbreakable.left > 0 && !target.buffs.revive) {
              //確定枠がありかつリザオがない場合、確定枠を消費して耐える
              target.buffs.isUnbreakable.left--;
              handleUnbreakable(target);
            } else {
              //確定枠がないまたはリザオありの場合、確定枠は無視
              if (Math.random() < 0.75) {
                handleUnbreakable(target);
              } else {
                handleDeath(target);
              }
            }
          }
        } else {
          // くじけぬなしは確定死亡
          handleDeath(target);
        }
      } else {
        updateMonsterBar(target, true); //赤いバー表示
        return;
      }
    }
  }
}

function handleUnbreakable(target) {
  target.currentStatus.HP = 1;
  updateMonsterBar(target, true); //赤いバー表示
  console.log(`${target.name}の特性、${target.buffs.isUnbreakable.name}が発動！`);
  displayMessage(`${target.name}の特性 ${target.buffs.isUnbreakable.name}が発動！`);
  if (target.buffs.isUnbreakable.left > 0) {
    console.log(`残り${target.buffs.isUnbreakable.left}回`);
    displayMessage(`残り${target.buffs.isUnbreakable.left}回`);
  }
}

function handleDeath(target, hideDeathMessage = false, applySkipDeathAbility = false) {
  if (target.flags.isZombie) {
    return;
  }
  target.currentStatus.HP = 0;
  target.flags.isDead = true;
  target.flags.recentlyKilled = true;
  target.flags.beforeDeathActionCheck = true;
  // 供物2種はskipDeathAbilityを付与して死亡時発動を行わない
  if (applySkipDeathAbility) {
    target.flags.skipDeathAbility = true;
  }

  ++fieldState.deathCount[target.teamID];
  // 蘇生予定がない場合、完全死亡カウントを増加
  if (!target.buffs.tagTransformation && !(target.buffs.revive && !target.buffs.reviveBlock)) {
    ++fieldState.completeDeathCount[target.teamID];
  }
  console.log(`party${target.teamID}の${target.name}の死亡でカウントが${fieldState.deathCount[target.teamID]}になった`);
  console.log(fieldState.deathCount);

  //供物を戻す
  if (target.skill[3] === "供物をささげる") {
    target.skill[3] = target.defaultSkill[3];
  }

  deleteSubstitute(target);

  // リザオ蘇生もtag変化もリザオ蘇生もしない かつ亡者化予定の場合flagを付与 applySkipDeathAbilityがtrue指定(毒等と供物)の場合は付与しない
  if (
    !target.buffs.tagTransformation &&
    (!target.buffs.revive || target.buffs.reviveBlock) &&
    !target.buffs.zombifyBlock &&
    (!applySkipDeathAbility || target.name === "非道兵器超魔ゾンビ") &&
    ((target.flags.zombieProbability && Math.random() < target.flags.zombieProbability) ||
      (target.race === "ゾンビ" && target.name !== "ラザマナス" && parties[target.teamID].some((target) => target.name === "ラザマナス")))
  ) {
    target.flags.willZombify = true;
  }

  // tag変化もゾンビ化もしない場合のみ、コマンドスキップ
  if (!target.buffs.tagTransformation && !target.flags.willZombify) {
    target.commandInput = "skipThisTurn";
    //次のhitSequenceも実行しない
  }

  // keepOnDeathを持たないバフと異常を削除 (zombifyBlockの消滅を防ぐため亡者判定後に)
  const newBuffs = {};
  for (const buffKey in target.buffs) {
    if (target.buffs[buffKey].keepOnDeath) {
      newBuffs[buffKey] = target.buffs[buffKey];
    }
  }
  target.buffs = newBuffs;

  updateMonsterBar(target, true); //isDead付与後にupdateでbar非表示化
  updateBattleIcons(target);
  updateCurrentStatus(target);
  // TODO:仮置き ここで明示的に buffContainer を削除する
  let wrapper = document.getElementById(target.iconElementId).parentElement;
  const buffContainer = wrapper.querySelector(".buffContainer");
  if (buffContainer) {
    buffContainer.remove();
  }
  updateMonsterBuffsDisplay(target);
  document.getElementById(target.iconElementId).parentNode.classList.remove("stickOut");
  document.getElementById(target.iconElementId).parentNode.classList.remove("recede");
  if (!hideDeathMessage) {
    if (target.teamID === 0) {
      console.log(`${target.name}はちからつきた！`);
      displayMessage(`${target.name}は ちからつきた！`);
    } else {
      console.log(`${target.name}をたおした！`);
      displayMessage(`${target.name}を たおした！`);
    }
  }
}

async function executeSkill(skillUser, executingSkill, assignedTarget = null, isProcessMonsterAction = false, damagedMonsters = null, isAIattack = false) {
  let currentSkill = executingSkill;
  // 実行済skillを格納
  let executedSkills = [];
  let isFollowingSkill = false;
  let executedSingleSkillTarget = [];
  let hasExecutedFollowingAbilities = false;
  // このターンに死んでない場合常に実行 死亡時能力は常に実行 反撃で死んでない このいずれかを満たす場合に実行
  while (
    currentSkill &&
    (skillUser.commandInput !== "skipThisTurn" || currentSkill.skipDeathCheck || (currentSkill.isCounterSkill && !skillUser.flags.isDead)) &&
    (currentSkill.skipAbnormalityCheck || !hasAbnormality(skillUser))
  ) {
    // 6. スキル実行処理
    // executedSingleSkillTargetの中身=親skillの最終的なskillTargetがisDeadで、かつsingleのfollowingSkillならばreturn
    if (isFollowingSkill && currentSkill.targetType === "single" && executedSingleSkillTarget[0].flags.isDead) {
      break;
    }

    // 実行済みスキルを配列末尾に追加
    executedSkills.push(currentSkill);

    // スキル実行中に死亡したモンスターを追跡
    const killedThisSkill = new Set();
    // スキル開始時に死亡しているモンスターを記録
    for (const party of parties) {
      for (const monster of party) {
        if (monster.flags.isDead) {
          killedThisSkill.add(monster);
        }
      }
    }

    let skillTarget = assignedTarget;
    // randomのfollowingSkillのみtargetをnull化してランダムにする(暫定的)
    if (isFollowingSkill && currentSkill.targetType === "random") {
      skillTarget = null;
    }

    // ヒット処理の実行
    console.log(`${skillUser.name}が${currentSkill.name}を実行`);
    await processHitSequence(skillUser, currentSkill, skillTarget, killedThisSkill, 0, null, executedSingleSkillTarget, isProcessMonsterAction, damagedMonsters, isAIattack);

    //currentSkill実行後、生存にかかわらず実行するact
    if (currentSkill.afterActionAct) {
      await currentSkill.afterActionAct(skillUser);
    }
    // 全滅判定後はafterActionAct実行後にexecuteSkillごと終了
    if (isBattleOver()) {
      return;
    }
    //currentSkill実行後、生存している場合はselfAppliedEffect付与
    if (currentSkill.selfAppliedEffect && (skillUser.commandInput !== "skipThisTurn" || currentSkill.skipDeathCheck || (currentSkill.isCounterSkill && !skillUser.flags.isDead))) {
      await currentSkill.selfAppliedEffect(skillUser);
    }

    // followingSkillが存在する場合、次のスキルを代入してループ
    if (currentSkill.followingSkill) {
      currentSkill = findSkillByName(currentSkill.followingSkill);
      isFollowingSkill = true;
      await sleep(350);
    } else if (
      skillUser.abilities.followingAbilities &&
      !hasExecutedFollowingAbilities &&
      executingSkill.howToCalculate !== "none" &&
      skillUser.abilities.followingAbilities.availableIf(executingSkill)
    ) {
      // followingSkillがないかつ追撃特性所持時にそれを実行
      // todo: isProcessMonsterActionの時に限定 反撃や死亡時skillで発動しないように
      // executingSkillを渡してskillNameを返り値でもらう
      currentSkill = findSkillByName(skillUser.abilities.followingAbilities.followingSkillName(executingSkill));
      isFollowingSkill = true;
      // 次のloopに入ってability実行後は、ここには入らずnull指定されて終了
      hasExecutedFollowingAbilities = true;
      await sleep(350);
    } else {
      currentSkill = null; // ループを抜けるためにnullを設定
    }
  }
  return executedSkills;
}

// ヒットシーケンスを処理する関数
async function processHitSequence(
  skillUser,
  executingSkill,
  assignedTarget,
  killedThisSkill,
  currentHit,
  singleSkillTarget = null,
  executedSingleSkillTarget = null,
  isProcessMonsterAction = false,
  damagedMonsters = null,
  isAIattack = false
) {
  if (currentHit >= (executingSkill.hitNum ?? 1)) {
    return; // ヒット数が上限に達したら終了
  }
  if (isBattleOver()) {
    return;
  }
  //毎回deathActionはしているので、停止時はreturnかけてOK
  //停止条件: all: aliveが空、random: determineの返り値がnull、single: 敵が一度でも死亡
  //hitSequenceごとに、途中で死亡時発動によってskillUserが死亡していたらreturnする
  if (!(skillUser.commandInput !== "skipThisTurn" || executingSkill.skipDeathCheck || (executingSkill.isCounterSkill && !skillUser.flags.isDead))) {
    return;
  }

  let skillTarget;

  // ターゲットタイプに応じたターゲット決定処理
  switch (executingSkill.targetType) {
    case "all":
      // 全体攻撃
      // 生きているモンスターかつkilledThisSkill対象外をtargetとする
      const aliveMonsters = (executingSkill.targetTeam === "ally" ? parties[skillUser.teamID] : parties[skillUser.enemyTeamID]).filter(
        (monster) => !monster.flags.isDead && !killedThisSkill.has(monster)
      );
      if (aliveMonsters.length === 0) {
        return;
      }
      for (const target of aliveMonsters) {
        let eachTarget = target;
        // みがわり処理 味方補助でないかつみがわり無視でないときに変更
        if (eachTarget.flags.hasSubstitute && !executingSkill.ignoreSubstitute && !(executingSkill.howToCalculate === "none" && executingSkill.targetTeam === "ally")) {
          eachTarget = parties.flat().find((monster) => monster.monsterId === eachTarget.flags.hasSubstitute.targetMonsterId);
        }
        await processHit(skillUser, executingSkill, eachTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack);
      }
      break;
    case "single":
      // 単体攻撃
      if (currentHit === 0) {
        // 最初のヒット時のみターゲットを決定
        skillTarget = determineSingleTarget(assignedTarget, skillUser, executingSkill, killedThisSkill);
        // ターゲットが存在しない場合は処理を中断
        if (!skillTarget) {
          return;
        }
        // みがわり処理 味方補助でないかつみがわり無視でないときに変更
        if (skillTarget.flags.hasSubstitute && !executingSkill.ignoreSubstitute && !(executingSkill.howToCalculate === "none" && executingSkill.targetTeam === "ally")) {
          skillTarget = parties.flat().find((monster) => monster.monsterId === skillTarget.flags.hasSubstitute.targetMonsterId);
        }
        // 初回hitのみ実行 singleのみ、最終的なみがわり処理後のskillTargetをexecutedSingleSkillTargetに格納
        executedSingleSkillTarget.push(skillTarget);
      } else {
        // 2回目以降のヒットの場合、最初のヒットで決定したターゲットを引き継ぐ
        skillTarget = singleSkillTarget;
        // ターゲットが死亡しているかリザオ等した場合に処理を中断
        if (skillTarget.flags.isDead || killedThisSkill.has(skillTarget)) {
          return;
        }
      }
      await processHit(skillUser, executingSkill, skillTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack);
      break;
    case "random":
      // ランダム攻撃
      skillTarget = determineRandomTarget(assignedTarget, skillUser, executingSkill, killedThisSkill, currentHit);
      // ターゲットが存在しない場合は処理を中断
      if (!skillTarget) {
        return;
      }
      // みがわり処理 味方補助でないかつみがわり無視でないときに変更
      if (skillTarget.flags.hasSubstitute && !executingSkill.ignoreSubstitute && !(executingSkill.howToCalculate === "none" && executingSkill.targetTeam === "ally")) {
        skillTarget = parties.flat().find((monster) => monster.monsterId === skillTarget.flags.hasSubstitute.targetMonsterId);
      }
      await processHit(skillUser, executingSkill, skillTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack);
      break;
    case "self":
      // 自分自身をターゲット
      skillTarget = skillUser;
      await processHit(skillUser, executingSkill, skillTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack);
      break;
    case "field":
      // meと同様
      skillTarget = skillUser;
      await processHit(skillUser, executingSkill, skillTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack);
      break;
    case "dead":
      // 蘇生特技
      skillTarget = assignedTarget;
      await processHit(skillUser, executingSkill, skillTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack);
      break;
    default:
      console.error("無効なターゲットタイプ:", executingSkill.targetType);
  }

  // 死亡時発動前なので、リザオ処理やゾンビ処理がまだ行われていないタイミング
  //エルギ変身判定
  for (const party of parties) {
    const targetErugi = party.find((monster) => monster.name === "超エルギ");
    if (targetErugi && !targetErugi.flags.isDead && fieldState.deathCount[targetErugi.teamID] > 1 && !targetErugi.flags.hasTransformed) {
      await transformTyoma(targetErugi);
    }
  }
  // シンリ解除
  // 全体特技ではskillTargetを毎hit変更していない(eachTarget)上に、反射なども反映されない なので、skillUserやskillTargetで判定するよりかは両方について判定
  for (let i = 0; i < 2; i++) {
    if (fieldState.completeDeathCount[i] > 0) {
      for (const monster of parties[i]) {
        // 生存している敵のみから削除
        if (!monster.flags.isDead && monster.buffs.reviveBlock && monster.buffs.reviveBlock.name === "竜衆の鎮魂") {
          delete monster.buffs.reviveBlock;
          updateMonsterBuffsDisplay(monster);
        }
      }
    }
  }

  // 死亡時発動能力の処理
  await processDeathAction(skillUser, killedThisSkill);

  // もしkilledThisSkillにskillUserが含まれていたら、反射死と判定して次のヒットを実行せず終了
  // skillTargetの死亡等は逐次判定してDeathActionも行わずにreturn
  if (killedThisSkill.has(skillUser)) {
    return;
  } else {
    // 次のヒット処理
    currentHit++;
    await sleep(70);
    await processHitSequence(skillUser, executingSkill, assignedTarget, killedThisSkill, currentHit, skillTarget, null, isProcessMonsterAction, damagedMonsters, isAIattack);
  }
}

// 単体攻撃のターゲットを決定する関数
function determineSingleTarget(target, skillUser, executingSkill, killedThisSkill) {
  const aliveMonsters = (executingSkill.targetTeam === "ally" ? parties[skillUser.teamID] : parties[skillUser.enemyTeamID]).filter((monster) => !monster.flags.isDead);
  if (target && !killedThisSkill.has(target) && aliveMonsters.includes(target)) {
    // 指定されたターゲットが生きていて、killedThisSkillに含まれていない場合は、そのターゲットを返す
    return target;
  } else {
    const validTargets = aliveMonsters.filter((monster) => !killedThisSkill.has(monster));
    // validTargets が空の場合の処理を追加
    if (validTargets.length > 0) {
      return validTargets[Math.floor(Math.random() * validTargets.length)];
    } else {
      return null; // ターゲットが存在しない場合は null を返す
    }
  }
}

function determineRandomTarget(target, skillUser, executingSkill, killedThisSkill, currentHit) {
  if (currentHit === 0) {
    return determineSingleTarget(target, skillUser, executingSkill, killedThisSkill);
  } else {
    const aliveMonsters = (executingSkill.targetTeam === "ally" ? parties[skillUser.teamID] : parties[skillUser.enemyTeamID]).filter((monster) => !monster.flags.isDead);
    const validTargets = aliveMonsters.filter((monster) => !killedThisSkill.has(monster));
    if (validTargets.length > 0) {
      return validTargets[Math.floor(Math.random() * validTargets.length)];
    } else {
      return null;
    }
  }
}

// ヒット処理を実行する関数
async function processHit(assignedSkillUser, executingSkill, assignedSkillTarget, killedThisSkill, isProcessMonsterAction, damagedMonsters, isAIattack) {
  let skillTarget = assignedSkillTarget;
  let skillUser = assignedSkillUser;
  let isReflection = false;
  let reflectionType = "yosoku";

  // 対象が石化かつダメージなしいてはでなければ無効化
  if (skillTarget.buffs.stoned && !(executingSkill.howToCalculate === "none" && (executingSkill.appliedEffect === "divineWave" || executingSkill.appliedEffect === "disruptiveWave"))) {
    applyDamage(skillTarget, 0);
    return;
  }

  //ザキ処理
  if (executingSkill.hasOwnProperty("zakiProbability")) {
    const zakiResistance = calculateResistance(assignedSkillUser, "zaki", assignedSkillTarget);
    let zakiTarget = assignedSkillTarget;
    let isZakiReflection = false;
    //反射処理
    if (
      executingSkill.targetTeam === "enemy" &&
      !executingSkill.ignoreReflection &&
      (skillTarget.buffs[executingSkill.type + "Reflection"] || (skillTarget.buffs.slashReflection && skillTarget.buffs.slashReflection.isKanta && executingSkill.type === "notskill"))
    ) {
      zakiTarget = assignedSkillUser;
      isZakiReflection = true;
    }
    //ザキ成功時、死亡処理とフラグ格納をして終了 失敗時は普通に継続
    //反射は成功時かつ反射時にエフェクト表示のみ実行、失敗時には何事もなかったように再度通常の処理で反射化
    if (Math.random() < zakiResistance * executingSkill.zakiProbability) {
      if (isZakiReflection) addMirrorEffect(assignedSkillTarget.iconElementId);
      handleDeath(zakiTarget);
      if (!isZakiReflection) displayMessage(`${zakiTarget.name}の`, "いきのねをとめた!!");
      if (!killedThisSkill.has(zakiTarget)) {
        killedThisSkill.add(zakiTarget);
        // 反射かつ死亡時は、handleDeath内で予約された亡者化を解除する
        if (isZakiReflection && zakiTarget.flags.willZombify) {
          delete zakiTarget.flags.willZombify;
          zakiTarget.commandInput = "skipThisTurn";
        }
      }
      delete zakiTarget.flags.recentlyKilled;
      return;
    }
  }

  // ダメージなし特技は、みがわり処理後に種別無効処理・反射処理を行ってprocessAppliedEffectに送る
  if (executingSkill.howToCalculate === "none") {
    // 種別無効かつ無効貫通でない かつ味方対象ではないときには種別無効処理 ミス表示後にreturn
    if (!executingSkill.ignoreTypeEvasion && skillTarget.buffs[executingSkill.type + "Evasion"] && executingSkill.targetTeam !== "ally") {
      applyDamage(skillTarget, 0);
      return;
    }
    // 反射持ちかつ反射無視でない、かつ敵対象で、かつ波動系ではないならば反射化
    if (
      executingSkill.targetTeam === "enemy" &&
      !executingSkill.ignoreReflection &&
      (skillTarget.buffs[executingSkill.type + "Reflection"] || (skillTarget.buffs.slashReflection && skillTarget.buffs.slashReflection.isKanta && executingSkill.type === "notskill")) &&
      executingSkill.appliedEffect !== "divineWave" &&
      executingSkill.appliedEffect !== "disruptiveWave"
    ) {
      isReflection = true;
      //反射演出
      addMirrorEffect(skillTarget.iconElementId);
      //全ての場合でカンタと同様に、skillUserとskillTargetを入れ替え (applyBuff内での耐性処理のため)
      skillUser = skillTarget;
      skillTarget = assignedSkillUser;
    }
    // isDamageExistingはfalseで送る
    await processAppliedEffectWave(skillTarget, executingSkill);
    await processAppliedEffect(skillTarget, executingSkill, skillUser, false, isReflection);
    // actで死亡時も死亡時発動等を実行するため
    // 追加効果付与直後にrecentlyを持っている敵を、渡されてきたkilledThisSkillに追加
    if (skillTarget.flags.recentlyKilled) {
      if (!killedThisSkill.has(skillTarget)) {
        killedThisSkill.add(skillTarget);
        // 反射かつ死亡時は、handleDeath内で予約された亡者化を解除する
        if (isReflection && skillTarget.flags.willZombify) {
          delete skillTarget.flags.willZombify;
          skillTarget.commandInput = "skipThisTurn";
        }
      }
      delete skillTarget.flags.recentlyKilled;
    }
    return;
  }

  // AppliedEffect指定のうち、規定値による波動処理を定義
  async function processAppliedEffectWave(buffTarget, executingSkill) {
    if (executingSkill.appliedEffect) {
      if (executingSkill.appliedEffect === "radiantWave") {
        executeRadiantWave(buffTarget);
      } else if (executingSkill.appliedEffect === "divineWave") {
        executeWave(buffTarget, true);
      } else if (executingSkill.appliedEffect === "disruptiveWave") {
        executeWave(buffTarget);
      }
    }
  }
  // AppliedEffect指定のうち、applyBuffおよびactを定義
  async function processAppliedEffect(buffTarget, executingSkill, skillUser, isDamageExisting, isReflection) {
    if (executingSkill.appliedEffect && executingSkill.appliedEffect !== "radiantWave" && executingSkill.appliedEffect !== "divineWave" && executingSkill.appliedEffect !== "disruptiveWave") {
      applyBuff(buffTarget, structuredClone(executingSkill.appliedEffect), skillUser, isReflection);
    }
    //act処理と、barおよびバフ表示更新
    if (executingSkill.act) {
      await executingSkill.act(skillUser, buffTarget);
      updateCurrentStatus(skillUser);
      updateMonsterBuffsDisplay(skillUser);
      updateCurrentStatus(buffTarget);
      updateMonsterBuffsDisplay(buffTarget);
    }
  }

  // みかわし・マヌーサ処理
  if (["atk", "def", "spd"].includes(executingSkill.howToCalculate)) {
    const isMissed = checkEvasionAndDazzle(assignedSkillUser, executingSkill, skillTarget);
    if (isMissed === "miss") {
      applyDamage(skillTarget, 0);
      return;
    }
  }

  //耐性処理
  let resistance = calculateResistance(assignedSkillUser, executingSkill.element, skillTarget, fieldState.isDistorted);

  // 吸収以外の場合に、種別無効処理と反射処理
  let skillUserForAppliedEffect = skillUser;
  if (resistance !== -1) {
    // 種別無効かつ無効貫通でない かつ味方対象ではないときには種別無効処理 ミス表示後にreturn
    if (!executingSkill.ignoreTypeEvasion && skillTarget.buffs[executingSkill.type + "Evasion"] && executingSkill.targetTeam !== "ally") {
      applyDamage(skillTarget, 0);
      return;
    }
    //反射持ちかつ反射無視でない かつ敵対象ならば反射化し、耐性も変更
    if (
      executingSkill.targetTeam === "enemy" &&
      !executingSkill.ignoreReflection &&
      (skillTarget.buffs[executingSkill.type + "Reflection"] || (skillTarget.buffs.slashReflection && skillTarget.buffs.slashReflection.isKanta && executingSkill.type === "notskill"))
    ) {
      isReflection = true;
      resistance = 1;
      //反射演出
      addMirrorEffect(skillTarget.iconElementId);
      //予測のとき: skillUserはそのまま カンタのとき: skillUserをskillTargetに変更 target自身が打ち返す
      const skillType = executingSkill.type === "notskill" ? "slash" : executingSkill.type;
      if (skillTarget.buffs[skillType + "Reflection"].isKanta) {
        skillUser = skillTarget;
        reflectionType = "kanta";
      }
      //バフは予測カンタにかかわらず反転
      skillUserForAppliedEffect = skillTarget;
      //反射化、skillTargetをskillUserに変更
      skillTarget = assignedSkillUser;
      //反射のときは反射のstrengthを乗算
    }
  }

  // ダメージ計算
  let baseDamage = 0;
  let isCriticalHit = false;
  if (executingSkill.howToCalculate === "fix") {
    if (executingSkill.damageByLevel) {
      const randomMultiplier = Math.floor(Math.random() * 21) * 0.01 + 0.9;
      baseDamage = Math.floor(executingSkill.damage * randomMultiplier);
    } else {
      const randomMultiplier = Math.floor(Math.random() * 11) * 0.005 + 0.975;
      baseDamage = Math.floor(executingSkill.damage * randomMultiplier);
    }
  } else if (executingSkill.ratio) {
    const status = {
      atk: skillUser.currentStatus.atk,
      def: skillUser.currentStatus.def,
      spd: skillUser.currentStatus.spd,
      int: skillUser.currentStatus.int,
    }[executingSkill.howToCalculate];

    //魅了判定と超ドレアム判定 以下targetDefを用いる
    let targetDef = skillTarget.currentStatus.def;
    if (skillTarget.buffs.tempted) {
      targetDef = 1;
    } else if (skillUser.name === "超ドレアム") {
      targetDef *= 0.5;
    }

    // 会心の一撃判定
    let criticalHitProbability = executingSkill.criticalHitProbability;
    if (criticalHitProbability !== undefined) {
      // criticalHitProbabilityが存在する場合
      isCriticalHit = Math.random() < criticalHitProbability;
    } else if (executingSkill.howToCalculate !== "int") {
      // criticalHitProbabilityが存在せず、howToCalculateがintではない場合
      isCriticalHit = Math.random() < 0.009;
    }

    if (isCriticalHit) {
      // 会心の一撃成功時 (呪文暴走は別処理)
      const criticalHitMultiplier = 0.95 + 0.01 * Math.floor(Math.random() * 11);
      baseDamage = Math.floor(status * criticalHitMultiplier);
      if (skillUser.gear?.name === "魔神のかなづち") {
        baseDamage *= 2;
      }
    } else {
      // 会心の一撃が発生しない場合
      const statusRatio = targetDef / status;

      if (statusRatio >= 0 && statusRatio < 1.75) {
        // 割った値が0以上1.75未満の場合
        baseDamage = status / 2 - targetDef / 4;
        const randomOffset = (Math.random() * baseDamage) / 8 - baseDamage / 16 + Math.random() * 2 - 1;
        baseDamage = Math.floor(baseDamage + randomOffset);
      } else if (statusRatio >= 1.75 && statusRatio < 2) {
        // 割った値が1.75以上2未満の場合
        if (Math.random() < 0.75) {
          baseDamage = Math.floor(Math.random() * (status / 16));
        }
      } else {
        // 割った値が2以上の場合
        if (Math.random() < 0.5) {
          baseDamage = 1;
        }
      }
    }
    baseDamage *= executingSkill.ratio;
  } else if (executingSkill.howToCalculate === "int") {
    const { minInt, maxInt, minIntDamage, maxIntDamage } = executingSkill;
    const int = skillUser.currentStatus.int;
    if (int <= minInt) {
      baseDamage = minIntDamage;
    } else if (int >= maxInt) {
      baseDamage = maxIntDamage;
    } else {
      baseDamage = Math.floor(((int - minInt) * (maxIntDamage - minIntDamage)) / (maxInt - minInt)) + Number(minIntDamage);
    }
    // 特技プラスと賢さ差ボーナスを乗算
    const intDiff = skillUser.currentStatus.int - skillTarget.currentStatus.int;
    const intBonus =
      intDiff >= 150
        ? 1.25
        : intDiff >= 140
        ? 1.24
        : intDiff >= 130
        ? 1.23
        : intDiff >= 120
        ? 1.22
        : intDiff >= 110
        ? 1.21
        : intDiff >= 100
        ? 1.2
        : intDiff >= 90
        ? 1.19
        : intDiff >= 80
        ? 1.18
        : intDiff >= 70
        ? 1.17
        : intDiff >= 60
        ? 1.16
        : intDiff >= 50
        ? 1.15
        : intDiff >= 40
        ? 1.14
        : intDiff >= 30
        ? 1.13
        : intDiff >= 20
        ? 1.12
        : intDiff >= 10
        ? 1.11
        : intDiff >= 1
        ? 1.1
        : 1;
    const randomMultiplier = Math.floor(Math.random() * 11) * 0.005 + 0.975;
    baseDamage = Math.floor(baseDamage * randomMultiplier);
    baseDamage *= executingSkill.skillPlus * intBonus;
    //呪文会心
    const noSpellSurgeList = [
      "カオスストーム",
      "クラックストーム",
      "滅びの呪文",
      "サイコストーム",
      "メラゾストーム",
      "陰惨な暗闇",
      "メラゾスペル",
      "メテオ",
      "マヒャドストーム",
      "メドローア",
      "ハザードウェポン",
    ];
    if (executingSkill.type === "spell" && !noSpellSurgeList.includes(executingSkill.name)) {
      isCriticalHit = Math.random() < 0.009;
      if (isCriticalHit) {
        // 暴走成功時
        baseDamage *= 1.6;
      }
    }
  }
  let damage = baseDamage;

  //会心完全ガード

  //弱点1.8倍処理
  if (resistance === 1.5 && executingSkill.weakness18) {
    damage *= 1.2;
  }

  //耐性処理
  damage *= resistance;

  //ぼうぎょ
  if (!executingSkill.ignoreGuard && skillTarget.flags.guard) {
    damage *= 0.5;
  }

  //連携
  if (isProcessMonsterAction && executingSkill.howToCalculate !== "MP") {
    const cooperationDamageMultiplier = {
      1: 1,
      2: 1.2,
      3: 1.3,
      4: 1.4,
      5: 1.5,
      6: 1.5,
    };
    const multiplier = cooperationDamageMultiplier[fieldState.cooperation.count] || 1;
    damage *= multiplier;
  }

  //乗算バフ

  //バイキ
  if (skillUser.buffs.baiki && executingSkill.howToCalculate === "atk" && !executingSkill.ignoreBaiki) {
    // strengthの値に応じた倍率を定義 (strength + 2 をkey)
    const strengthMultipliersForBaiki = {
      0: 0.6, // -2 + 2
      1: 0.8, // -1 + 2
      3: 1.2, //  1 + 2
      4: 1.4, //  2 + 2
    };
    // strengthの値に対応する倍率を取得する
    const strengthKey = skillUser.buffs.baiki.strength + 2;
    const BaikiMultiplier = strengthMultipliersForBaiki[strengthKey];
    if (BaikiMultiplier) {
      damage *= BaikiMultiplier;
    }
  }

  //力溜め系 カンタ系で反射して撃っているとき無効化
  if (!(isReflection && reflectionType === "kanta")) {
    //魔力覚醒 int依存以外も増加
    if (!executingSkill.ignoreManaBoost && executingSkill.type === "spell") {
      if (skillUser.buffs.manaBoost) {
        damage *= skillUser.buffs.manaBoost.strength;
      } else if (skillUser.buffs.manaReduction) {
        damage *= skillUser.buffs.manaBoost.strength;
      }
    }
    //力ため 斬撃体技踊りまたはatk依存(通常攻撃)
    if (!executingSkill.ignorePowerCharge && (executingSkill.howToCalculate === "atk" || executingSkill.type === "slash" || executingSkill.type === "martial" || executingSkill.type === "dance")) {
      if (skillUser.buffs.powerCharge) {
        damage *= skillUser.buffs.powerCharge.strength;
      } else if (skillUser.buffs.powerWeaken) {
        damage *= skillUser.buffs.powerWeaken.strength;
      }
    }
    //息を吸い込む
    if (skillUser.buffs.breathCharge && executingSkill.type === "breath") {
      damage *= skillUser.buffs.breathCharge.strength;
    }
  }

  //コツ系
  if (skillUser.buffs.breathEnhancement && executingSkill.type === "breath") {
    damage *= 1.15;
  }
  //属性コツ
  if (skillUser.buffs.elementEnhancement && executingSkill.type === "spell" && skillUser.buffs.elementEnhancement.element === executingSkill.element) {
    damage *= 1.15;
  }

  //乗算デバフ
  //魔防・斬撃・体技・息防御
  const barrierTypes = {
    spell: "spellBarrier",
    slash: "slashBarrier",
    martial: "martialBarrier",
    breath: "breathBarrier",
  };
  const barrierType = barrierTypes[executingSkill.type];
  if (skillTarget.buffs[barrierType] && !(executingSkill.criticalHitProbability && isCriticalHit)) {
    // 確定会心系で会心が出た場合は防御バフ無視
    // strengthの値に応じた倍率を定義
    const strengthMultipliers = {
      0: 2, // -2
      1: 1.5, // -1
      3: 0.5, // 1
      4: 0.25, // 2
    };
    // strengthの値に対応する倍率を取得する
    const strengthKey = skillTarget.buffs[barrierType].strength + 2;
    const BarrierMultiplier = strengthMultipliers[strengthKey];
    damage *= BarrierMultiplier;
  }

  //反射以外の場合にメタル処理
  if (!isReflection && skillTarget.buffs.metal) {
    damage *= skillTarget.buffs.metal.strength;
    //メタルキラー処理
    if (skillUser.buffs.metalKiller && skillTarget.buffs.metal.isMetal) {
      damage *= skillUser.buffs.metalKiller.strength;
    }
  }

  //ダメージ軽減
  if (!executingSkill.ignoreProtection && skillTarget.buffs.protection) {
    damage *= 1 - skillTarget.buffs.protection.strength;
  }

  //特技の種族特効 反射には乗らない
  if (!isReflection && executingSkill.RaceBane && executingSkill.RaceBane.includes(skillTarget.race)) {
    damage *= executingSkill.RaceBaneValue;
  }
  //みがわり特効
  if (executingSkill.SubstituteBreaker && skillTarget.flags.isSubstituting) {
    damage *= executingSkill.SubstituteBreaker;
  }

  // anchorBonus
  if (executingSkill.anchorBonus) {
    const skillUserIndex = turnOrder.indexOf(skillUser);
    // skillUserIndexより後の要素を取得
    const laterMonsters = turnOrder.slice(skillUserIndex + 1);

    // 後の要素が存在しない、または存在したとしても全てが行動予定にないとき
    if (laterMonsters.length === 0 || laterMonsters.every((element) => element.commandInput === "skipThisTurn")) {
      damage *= executingSkill.anchorBonus;
    }
  }

  // HP割合依存
  if (executingSkill.damageByHpPercent) {
    damage *= skillUser.currentStatus.HP / skillUser.defaultStatus.HP;
  }
  // 体砕き
  if (executingSkill.name === "体砕きの斬舞" && skillTarget.buffs.martialReflection) {
    damage *= 3;
  }

  //以下加算処理
  const AllElements = ["fire", "ice", "thunder", "wind", "io", "light", "dark"];
  let damageModifier = 1;

  //skillUser対象バフ
  // 装備
  if (skillUser.gear?.name === "竜神爪" && ["???", "ドラゴン"].includes(skillTarget.race)) {
    damageModifier += 0.1;
  }
  //全属性バフ
  if (skillUser.buffs.allElementalBoost && AllElements.includes(executingSkill.element)) {
    damageModifier += skillUser.buffs.allElementalBoost.strength;
  }
  //特技錬金
  if (skillUser.gear?.skillAlchemy) {
    if (skillUser.gear?.skillAlchemy === executingSkill.name || (skillUser.gear?.skillAlchemy === "必殺の双撃" && executingSkill.name === "必殺の双撃後半")) {
      damageModifier += skillUser.gear.skillAlchemyStrength;
    }
  }
  //種別錬金

  // デュラン
  if (skillUser.id === "dhuran" && (skillTarget.race === "超魔王" || skillTarget.race === "超伝説") && hasEnoughMonstersOfType(parties[skillUser.teamID], "悪魔", 5)) {
    damageModifier += 0.5;
  }
  // 禁忌の封印
  if (skillUser.race === "悪魔" && parties[skillUser.teamID].some((monster) => monster.id === "tanisu")) {
    damageModifier += 0.5;
  }
  if (skillUser.buffs.tabooSeal) {
    damageModifier -= 0.5;
  }
  // リズ
  if (skillUser.buffs.rizuIceBuff && executingSkill.element === "ice") {
    damageModifier += 0.4;
  }

  // world反撃ののろし
  if (skillUser.buffs.worldBuff) {
    damageModifier += skillUser.buffs.worldBuff.strength;
  }

  //skillTarget対象バフ
  //全ダメージ軽減
  if (skillTarget.buffs.sinriReduction) {
    damageModifier -= 0.3;
  }
  if (skillTarget.buffs.fireGuard && executingSkill.element === "fire") {
    damageModifier -= skillTarget.buffs.fireGuard.strength;
  }
  //被ダメージ増加
  if (skillTarget.buffs.controlOfRapu) {
    damageModifier += 0.2;
  }
  if (skillTarget.buffs.murakumo && executingSkill.type === "breath") {
    damageModifier += 0.5;
  }
  // 特殊系
  // 天使のしるしデフォルト
  if (parties[skillTarget.enemyTeamID].some((monster) => monster.name === "超エルギ") && executingSkill.element === "light") {
    damageModifier += 0.3;
  }
  // 天使のしるし
  if (skillTarget.buffs.angelMark && executingSkill.element === "light") {
    damageModifier -= 0.3;
  }

  //skill特有の特殊計算
  if (executingSkill.damageModifier) {
    damageModifier += executingSkill.damageModifier(skillUser, skillTarget);
  }

  damage *= damageModifier;

  // ダメージ付与処理
  damage = Math.floor(damage);
  //damage上限
  if (skillTarget.buffs.damageLimit && damage > skillTarget.buffs.damageLimit.strength) {
    damage = skillTarget.buffs.damageLimit.strength;
  }

  // 障壁 ダメージが1以上で判定(もともと0はmiss判定のまま処理)
  let reducedByElementalShield = false; //障壁によって0になっただけで、appliedEffectやダメージ0表示は実行
  if (
    !isReflection &&
    damage > 0 &&
    skillTarget.buffs.elementalShield &&
    (skillTarget.buffs.elementalShield.targetElement === executingSkill.element || (skillTarget.buffs.elementalShield.targetElement === "all" && AllElements.includes(executingSkill.element)))
  ) {
    reducedByElementalShield = true;
    if (skillTarget.buffs.elementalShield.remain <= damage) {
      // 障壁が割れる場合
      damage -= skillTarget.buffs.elementalShield.remain;
      delete skillTarget.buffs.elementalShield;
      updateMonsterBuffsDisplay(skillTarget);
      addHexagonShine(skillTarget.iconElementId, true);
    } else {
      skillTarget.buffs.elementalShield.remain -= damage;
      damage = 0;
      addHexagonShine(skillTarget.iconElementId, false);
    }
  }

  // applyDamage実行前に、appliedEffectのいては系によるリザオ解除を実行
  if (
    (reducedByElementalShield || damage > 0) &&
    executingSkill.appliedEffect &&
    (executingSkill.appliedEffect === "disruptiveWave" || executingSkill.appliedEffect === "divineWave") &&
    skillTarget.buffs.revive &&
    !skillTarget.buffs.revive.unDispellable
  ) {
    if (executingSkill.appliedEffect === "divineWave" || !skillTarget.buffs.revive.divineDispellable) {
      delete skillTarget.buffs.revive;
    }
  }

  applyDamage(skillTarget, damage, resistance, false, reducedByElementalShield);

  // wave系はtargetの死亡にかかわらずダメージ存在時に確実に実行(死亡時発動によるリザオ蘇生前に解除)
  if (reducedByElementalShield || damage > 0) {
    await processAppliedEffectWave(skillTarget, executingSkill);
  }
  // それ以外の追加効果は  常に実行 または target生存かつdamageが0超えのときに追加効果付与を実行 skillUserForAppliedEffectで完全に反転して渡す
  if (executingSkill.alwaysAct || (!skillTarget.flags.recentlyKilled && (reducedByElementalShield || damage > 0))) {
    await processAppliedEffect(skillTarget, executingSkill, skillUserForAppliedEffect, true, isReflection);
  }

  // monsterActionまたはAI追撃のとき、反撃対象にする
  if ((isProcessMonsterAction || isAIattack) && (reducedByElementalShield || damage > 0)) {
    if (!damagedMonsters.includes(skillTarget.monsterId)) {
      damagedMonsters.push(skillTarget.monsterId);
    }
  }

  //ダメージとact処理直後にrecentlyを持っている敵を、渡されてきたkilledThisSkillに追加
  if (skillTarget.flags.recentlyKilled) {
    if (!killedThisSkill.has(skillTarget)) {
      killedThisSkill.add(skillTarget);
      // 反射かつ死亡時は、handleDeath内で予約された亡者化を解除する
      if (isReflection && skillTarget.flags.willZombify) {
        delete skillTarget.flags.willZombify;
        skillTarget.commandInput = "skipThisTurn";
      }
    }
    delete skillTarget.flags.recentlyKilled;
  }
}

function checkEvasionAndDazzle(skillUser, executingSkill, skillTarget) {
  // マヌーサ処理
  if (skillUser.buffs.dazzle && !executingSkill.ignoreDazzle) {
    if (Math.random() < 0.36) {
      console.log(`${skillTarget.name}は目を回して攻撃を外した！`);
      return "miss";
    }
  }
  // みかわし処理
  if (!executingSkill.ignoreEvasion && !(skillTarget.buffs.fear || skillTarget.buffs.seal || skillTarget.buffs.tempted)) {
    // みかわしバフ
    if (skillTarget.buffs.dodgeBuff) {
      if (Math.random() < skillTarget.buffs.dodgeBuff.strength) {
        console.log(`${skillTarget.name}は攻撃をかわした！`);
        return "miss";
      }
    }
    // 素早さによる回避
    else {
      const speedRatio = skillTarget.currentStatus.spd / skillUser.currentStatus.spd;
      let evasionRate = 0;
      if (speedRatio >= 1 && speedRatio < 1.5) {
        evasionRate = 0.01; //下方修正
      } else if (speedRatio >= 1.5 && speedRatio < 1.75) {
        evasionRate = 0.15;
      } else if (speedRatio >= 1.75 && speedRatio < 2) {
        evasionRate = 0.25;
      } else if (speedRatio >= 2 && speedRatio < 2.5) {
        evasionRate = 0.3;
      } else if (speedRatio >= 2.5 && speedRatio < 3) {
        evasionRate = 0.4;
      } else if (speedRatio >= 3) {
        evasionRate = 0.5;
      }

      if (Math.random() < evasionRate) {
        console.log(`${skillTarget.name}は攻撃をかわした！`);
        return "miss";
      }
    }
  }
  // みかわし・マヌーサ処理が適用されなかった場合
  return "hit";
}

//damageCalc、耐性表示、耐性ダウン付与、状態異常耐性取得で実行。耐性ダウン確率判定ではskillUserをnull指定
function calculateResistance(skillUser, executingSkillElement, skillTarget, distorted = null) {
  const element = executingSkillElement;
  const baseResistance = skillTarget.resistance[element] ?? 1;
  const resistanceValues = [-1, 0, 0.25, 0.5, 0.75, 1, 1.5];
  const distortedResistanceValues = [1.5, 1.5, 1.5, 1, 1, 0, -1];

  // --- 無属性の処理 ---
  if (element === "notskill") {
    return 1;
  }
  if (element === "none") {
    let noneResistance = 1; //初期値
    if (skillTarget.buffs.nonElementalResistance) {
      noneResistance = 0;
    }
    if (!distorted && skillTarget.name === "ダグジャガルマ") {
      noneResistance = -1; //非歪曲
    } else if (skillTarget.name === "ダグジャガルマ") {
      noneResistance = 1.5; //歪曲
    }
    return noneResistance;
  }

  // --- 通常時の処理 ---
  if (!distorted) {
    let normalResistanceIndex = resistanceValues.indexOf(baseResistance);

    //もともと無効や吸収のときは処理せずにそのまま格納 それ以外の場合はバフ等があれば反映した後、最大でも無効止まりにする
    if (normalResistanceIndex !== 0 && normalResistanceIndex !== 1) {
      // 装備効果
      if (skillTarget.gear?.[element + "GearResistance"]) {
        normalResistanceIndex -= skillTarget.gear[element + "GearResistance"];
      }
      // 属性耐性バフ効果
      if (skillTarget.buffs[element + "Resistance"]) {
        normalResistanceIndex -= skillTarget.buffs[element + "Resistance"].strength;
      }
      // プリズムヴェール
      if (skillTarget.buffs.prismVeil) {
        normalResistanceIndex -= skillTarget.buffs.prismVeil.strength;
      }
      // インデックスの範囲を制限 最大でも無効
      normalResistanceIndex = Math.max(1, Math.min(normalResistanceIndex, 6));
    }
    //ここまでの処理の結果を格納
    let normalResistance = resistanceValues[normalResistanceIndex];

    // skillUserが渡された場合のみ使い手効果を適用
    if (skillUser) {
      const AllElements = ["fire", "ice", "thunder", "wind", "io", "light", "dark"];
      if (skillUser.buffs[element + "Break"]) {
        normalResistanceIndex += skillUser.buffs[element + "Break"].strength;
        if (skillUser.buffs[element + "BreakBoost"]) {
          normalResistanceIndex += skillUser.buffs[element + "BreakBoost"].strength;
        }
      } else if (skillUser.buffs.allElementalBreak && AllElements.includes(element)) {
        //全属性の使い手 状態異常以外 普通の属性の場合に処理
        normalResistanceIndex += skillUser.buffs.allElementalBreak.strength;
      }
      normalResistanceIndex = Math.max(0, Math.min(normalResistanceIndex, 6));
      normalResistance = resistanceValues[normalResistanceIndex];
      // 大弱点・超弱点処理
      if (normalResistance == 1.5 && skillUser.buffs[element + "SuperBreak"]) {
        normalResistance = 2;
      } else if (normalResistance == 1.5 && skillUser.buffs[element + "UltraBreak"]) {
        normalResistance = 2.5;
      }
    }
    return normalResistance;
  } else {
    // --- 属性歪曲時の処理 ---
    let distortedResistanceIndex = resistanceValues.indexOf(baseResistance);

    // 装備効果・属性耐性バフ効果 反転後に無効吸収になる弱点普通は変化させない
    if (distortedResistanceIndex !== 5 && distortedResistanceIndex !== 6) {
      // 装備効果
      if (skillTarget.gear?.[element + "GearResistance"]) {
        distortedResistanceIndex += skillTarget.gear[element + "GearResistance"];
      }
      // 属性耐性バフ効果
      if (skillTarget.buffs[element + "Resistance"]) {
        distortedResistanceIndex += skillTarget.buffs[element + "Resistance"].strength;
      }
      // プリズムヴェール
      if (skillTarget.buffs.prismVeil) {
        normalResistanceIndex += skillTarget.buffs.prismVeil.strength;
      }
    }
    // インデックスの範囲を制限
    distortedResistanceIndex = Math.max(0, Math.min(distortedResistanceIndex, 6));
    //ここまでの処理の結果を変換後に格納
    let distortedResistance = distortedResistanceValues[distortedResistanceIndex];

    // skillUserが渡された場合のみ使い手効果を適用 (反転)
    if (skillUser) {
      if (skillUser.buffs[element + "Break"]) {
        // 変換後の耐性値からresistanceValuesのインデックスを取得 変換後の耐性値を本来の耐性表のindexに変えてから操作
        distortedResistanceIndex = resistanceValues.indexOf(distortedResistance);
        // インデックスに対する操作
        distortedResistanceIndex -= skillUser.buffs[element + "Break"].strength;
        // ブレイク深化も同様
        if (skillUser.buffs[element + "BreakBoost"]) {
          distortedResistanceIndex -= skillUser.buffs[element + "BreakBoost"].strength;
        }
        // インデックスの範囲を制限
        distortedResistanceIndex = Math.max(0, Math.min(distortedResistanceIndex, 6));
        // distortedResistanceを更新
        distortedResistance = resistanceValues[distortedResistanceIndex];
      } else if (skillUser.buffs.allElementalBreak) {
        distortedResistanceIndex = resistanceValues.indexOf(distortedResistance);
        distortedResistanceIndex -= skillUser.buffs.allElementalBreak.strength;
        distortedResistanceIndex = Math.max(0, Math.min(distortedResistanceIndex, 6));
        distortedResistance = resistanceValues[distortedResistanceIndex];
      }
    }

    return distortedResistance;
  }
}

// deathActionQueue および processDeathActionの実行中かどうかを示すフラグ: isProcessingDeathActionを使用
// 死亡時発動能力の処理
async function processDeathAction(skillUser, killedThisSkill) {
  // キューに死亡時発動能力を持つモンスターを追加する関数
  function enqueueDeathAction(monster) {
    if (monster.flags.beforeDeathActionCheck && !deathActionQueue.includes(monster)) {
      deathActionQueue.unshift(monster);
    }
  }
  // 敵逆順処理
  for (const monster of [...parties[skillUser.enemyTeamID]].reverse()) {
    if (killedThisSkill.has(monster)) {
      enqueueDeathAction(monster);
    }
  }
  // 味方逆順処理
  for (const monster of [...parties[skillUser.teamID]].reverse()) {
    if (killedThisSkill.has(monster)) {
      enqueueDeathAction(monster);
    }
  }

  if (isProcessingDeathAction) {
    // すでに processDeathAction が実行中の場合は、キューに追加するだけで処理を終了
    return;
  }
  // processDeathAction の実行開始フラグを立てる
  isProcessingDeathAction = true;

  while (deathActionQueue.length > 0) {
    const monster = deathActionQueue.shift();
    delete monster.flags.beforeDeathActionCheck;

    // 死亡時発動能力の実行
    if (monster.flags.skipDeathAbility) {
      delete monster.flags.skipDeathAbility;
    } else {
      await executeDeathAbilities(monster);
    }

    // 復活処理
    if ((monster.buffs.revive && !monster.buffs.reviveBlock) || monster.buffs.tagTransformation) {
      await reviveMonster(monster);
    } else if (monster.flags.willZombify) {
      await zombifyMonster(monster);
    }
  }
  isProcessingDeathAction = false;
}

// 死亡時発動能力を実行する関数
async function executeDeathAbilities(monster) {
  const abilitiesToExecute = [];
  // 復活とタグ変化が予定されているか判定
  let isReviving = monster.buffs.revive || monster.buffs.tagTransformation;
  // 各ability配列の中身を展開して追加
  abilitiesToExecute.push(...(monster.abilities.deathAbilities ?? []));
  abilitiesToExecute.push(...(monster.abilities.additionalDeathAbilities ?? []));
  for (const ability of abilitiesToExecute) {
    //実行済 または 蘇生かつ常に実行ではない能力 または使用不可能条件に引っかかった場合はcontinue
    if (monster.flags.executedAbilities.includes(ability.name) || (isReviving && !ability.alwaysExecute) || (ability.unavailableIf && ability.unavailableIf(monster))) {
      continue;
    }
    await sleep(500);
    if (!ability.disableMessage) {
      if (ability.hasOwnProperty("message")) {
        ability.message(monster);
        await sleep(150);
      } else if (ability.hasOwnProperty("name")) {
        displayMessage(`${monster.name}の特性 ${ability.name}が発動！`);
        await sleep(150);
      }
    }
    await ability.act(monster);
    //実行後の記録
    if (ability.isOneTimeUse) {
      monster.flags.executedAbilities.push(ability.name);
    }
    await sleep(200);
  }
  await sleep(150);
}

// モンスターを蘇生させる関数
async function reviveMonster(monster, HPratio = 1, ignoreReviveBlock = false) {
  await sleep(400);
  if (!monster.flags.isDead) {
    displayMiss(monster);
    return;
  }
  if (monster.buffs.tagTransformation) {
    // tag変化時
    monster.currentStatus.HP = monster.defaultStatus.HP;
    delete monster.flags.isDead;
    console.log(`なんと${monster.name}が変身した！`);
    if (monster.buffs.tagTransformation.act) {
      await monster.abilities.tagTransformationAct(monster, monster.buffs.tagTransformation.act);
    }
    delete monster.buffs.tagTransformation;
  } else {
    // リザオまたは通常蘇生時、蘇生封じ持ちの場合はreturn
    if (monster.buffs.reviveBlock && !ignoreReviveBlock) {
      delete monster.buffs.revive;
      displayMiss(monster);
      return;
    }
    // 蘇生封じなしの場合は蘇生
    delete monster.flags.isDead;
    console.log(`なんと${monster.name}が生き返った！`);
    displayMessage(`なんと${monster.name}が生き返った！`);

    // リザオの場合の処理
    if (monster.buffs.revive) {
      monster.currentStatus.HP = Math.ceil(monster.defaultStatus.HP * monster.buffs.revive.strength);
      // abilities.reviveActにmonsterとact: 名前を渡して、abilities内の名前と一致した場合にのみ実行
      if (monster.buffs.revive.act && monster.abilities.reviveAct) {
        // act実行でreviveを再付与してから削除してしまわないよう、nameを保存、バフ削除してからactで再付与
        const oldReviveBuffName = monster.buffs.revive.act;
        delete monster.buffs.revive;
        await monster.abilities.reviveAct(monster, oldReviveBuffName);
      } else {
        delete monster.buffs.revive;
      }
    } else {
      // リザオ以外の通常蘇生の場合の処理
      monster.currentStatus.HP = Math.ceil(monster.defaultStatus.HP * HPratio);
    }
  }
  updateMonsterBar(monster);
  updateBattleIcons(monster);
  updateMonsterBuffsDisplay(monster);
  await sleep(300);
}

// モンスターを亡者化させる関数
async function zombifyMonster(monster) {
  await sleep(400);
  delete monster.flags.isDead;
  delete monster.flags.willZombify;
  monster.flags.isZombie = true;
  updateBattleIcons(monster);
  await sleep(300);
}

// 指定 milliseconds だけ処理を一時停止する関数
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

//AI追撃targetを返す
function decideNormalAttackTarget(skillUser) {
  const enemyParty = parties[skillUser.enemyTeamID];

  // 生きている敵のみに絞り込む
  const aliveEnemies = enemyParty.filter((monster) => !monster.flags.isDead);

  // #1: 状態異常・反射のどちらも持っていない敵を探す
  let candidates = aliveEnemies.filter((monster) => !hasAbnormalityOfAINormalAttack(monster) && !(monster.buffs.slashReflection && monster.buffs.slashReflection.isKanta));
  if (candidates.length > 0) {
    return findLowestHPRateTarget(candidates);
  }

  // #2: 状態異常は持っているが、反射は持っていない敵を探す
  candidates = aliveEnemies.filter((monster) => hasAbnormalityOfAINormalAttack(monster) && !(monster.buffs.slashReflection && monster.buffs.slashReflection.isKanta));
  if (candidates.length > 0) {
    return findLowestHPRateTarget(candidates);
  }

  // #3: 反射を持っている敵を探す
  candidates = aliveEnemies.filter((monster) => monster.buffs.slashReflection && monster.buffs.slashReflection.isKanta);
  if (candidates.length > 0) {
    return findLowestHPRateTarget(candidates);
  }

  // 対象が見つからない場合はnullを返す
  return null;
}

// 最もHP割合が低いモンスターを探すヘルパー関数
function findLowestHPRateTarget(candidates) {
  let target = candidates[0];
  let lowestHPRate = target.currentStatus.HP / target.defaultStatus.HP;

  for (let i = 1; i < candidates.length; i++) {
    const currentHPRate = candidates[i].currentStatus.HP / candidates[i].defaultStatus.HP;
    if (currentHPRate < lowestHPRate) {
      target = candidates[i];
      lowestHPRate = currentHPRate;
    }
  }

  return target;
}

function hasAbnormalityOfAINormalAttack(monster) {
  const abnormalityKeys = ["confused", "paralyzed", "asleep"];
  //Todo: 麻痺どうだっけ
  for (const key of abnormalityKeys) {
    if (monster.buffs[key]) {
      return true;
    }
  }
  return false;
}

//monster選択部分
//枠をクリック時、ウィンドウを開き、どの枠を選択中か取得、selectingMonsterIcon(partyIcon0-4)、selectingMonsterNum(0-4)
//global: selectingMonsterNumを使用
document.querySelectorAll(".partyIcon").forEach((icon) => {
  icon.addEventListener("click", function () {
    document.body.style.overflow = "hidden"; //todo:?
    document.getElementById("selectMonsterOverlay").style.visibility = "visible";
    document.getElementById("selectMonsterPopupWindow").style.opacity = "1";
    //どの要素をクリックして選択中か格納
    const selectingMonsterIcon = icon.id;
    //要素idから選択中のモンスターの数値を生成
    selectingMonsterNum = Number(selectingMonsterIcon.replace(/(party|Icon)/g, ""));
  });
});

//まわりクリックで閉じる
document.getElementById("selectMonsterOverlay").addEventListener("click", function () {
  //ここselectMonsterBg_grayではなくselectMonsterOverlayにすると、ウィンドウ白部分をタップでウィンドウ閉じるように
  document.getElementById("selectMonsterOverlay").style.visibility = "hidden";
  document.getElementById("selectMonsterPopupWindow").style.opacity = "0";
  document.body.style.overflow = "";
});

//window内の各画像クリックで、選択処理を起動
document.querySelectorAll(".monsterListIcon").forEach((img) => {
  img.addEventListener("click", () => {
    const imgSrc = img.getAttribute("src");
    const selectedMonsterName = imgSrc.replace("images/icons/", "").replace(".jpeg", "");
    selectMonster(selectedMonsterName);
  });
});

//ポップアップ内各画像クリックで、そのモンスターを代入してウィンドウを閉じる
function selectMonster(monsterName) {
  //選択中partyの該当monsterに引数monsterNameとidが等しいmonsterのデータの配列を丸ごと代入
  selectingParty[selectingMonsterNum] = structuredClone(monsters.find((monster) => monster.id == monsterName));
  // 新規生成したselectingMonster内に、initailからdefaultを作成、以下defaultを操作する
  selectingParty[selectingMonsterNum].defaultSkill = [...selectingParty[selectingMonsterNum].initialSkill];
  //表示更新
  updatePartyIcon(selectingMonsterNum);

  //格納後、新規モンスターの詳細を表示するため、selectingMonsterNumのtabに表示を切り替える
  switchTab(selectingMonsterNum);

  // ポップアップウィンドウを閉じる
  document.getElementById("selectMonsterOverlay").style.visibility = "hidden";
  document.getElementById("selectMonsterPopupWindow").style.opacity = "0";
  document.body.style.overflow = "";

  // 初期表示状態で種選択が無効化されている場合に解除
  disableSeedSelect(false);

  //デフォ装備選択
  if (selectingParty[selectingMonsterNum].defaultGear) {
    selectingGearNum = selectingMonsterNum;
    selectGear(selectingParty[selectingMonsterNum].defaultGear);
  }
}

//装備選択部分
//装備枠クリック時、ウィンドウを開き、どの装備枠を選択中か取得
//global: selectingGearNumを使用
document.querySelectorAll(".partyGear").forEach((icon) => {
  icon.addEventListener("click", function () {
    //どの装備をクリックして選択中か格納
    const selectingGear = icon.id;
    //要素idから選択中の装備の数値を生成
    selectingGearNum = Number(selectingGear.replace(/(party|Gear)/g, ""));
    // モンスターが空のときはreturn
    if (Object.keys(selectingParty[selectingGearNum]).length === 0) return;
    document.body.style.overflow = "hidden";
    document.getElementById("selectGearOverlay").style.visibility = "visible";
    document.getElementById("selectGearPopupWindow").style.opacity = "1";
  });
});

//まわりクリックで閉じる
document.getElementById("selectGearOverlay").addEventListener("click", function () {
  //ここselectGearBg_grayではなくselectGearOverlayにすると、ウィンドウ白部分をタップでウィンドウ閉じる
  document.getElementById("selectGearOverlay").style.visibility = "hidden";
  document.getElementById("selectGearPopupWindow").style.opacity = "0";
  document.body.style.overflow = "";
});

//window内の各画像クリックで、選択処理を起動
document.querySelectorAll(".gearList").forEach((img) => {
  img.addEventListener("click", () => {
    const imgSrc = img.getAttribute("src");
    const selectedGearName = imgSrc.replace("images/gear/", "").replace(".jpeg", "");
    selectGear(selectedGearName);
  });
});

//ポップアップ内各画像クリックで、その装備を代入してウィンドウを閉じる
function selectGear(gearName) {
  //表示値計算などはcurrentTabを元に情報を取得するため、タブ遷移しておく
  switchTab(selectingGearNum);
  //選択中partyの該当monsterの装備を変更
  const foundGear = gear.find((gear) => gear.id === gearName);
  selectingParty[selectingGearNum].gear = { ...foundGear };
  //表示更新
  updatePartyIcon(selectingGearNum);

  //currentTabや種も不変のため、display再計算と表示変更のみ
  calcAndAdjustDisplayStatus();
  //装備増分表示はreset
  displayGearIncrement();

  // ポップアップウィンドウを閉じる
  document.getElementById("selectGearOverlay").style.visibility = "hidden";
  document.getElementById("selectGearPopupWindow").style.opacity = "0";
  document.body.style.overflow = "";
}
//装備選択部分終了

//switchTabでタブ遷移時や新規モンス選択時起動、currentTabのステータス、特技、種select、種増分表示更新
function adjustStatusAndSkillDisplay() {
  //丸ごと放り込まれているor操作済みのため、ただ引っ張ってくれば良い
  //所持特技名表示変更
  addSkillOptions();
  //種表示変更
  document.getElementById("selectSeedAtk").value = selectingParty[currentTab].seed.atk;
  document.getElementById("selectSeedDef").value = selectingParty[currentTab].seed.def;
  document.getElementById("selectSeedSpd").value = selectingParty[currentTab].seed.spd;
  document.getElementById("selectSeedInt").value = selectingParty[currentTab].seed.int;
  displayGearIncrement();
  changeSeedSelect();
}

function addSkillOptions() {
  for (let j = 0; j < 4; j++) {
    const selectElement = document.getElementById(`skill${j}`);
    const defaultSkills = selectingParty[currentTab].defaultSkill;
    const superSkills = [
      "精霊の守り・強",
      "防刃の守り",
      "タップダンス",
      "マインドバリア",
      "ピオリム",
      "ザオリク",
      "リザオラル",
      "光のはどう",
      "斬撃よそく",
      "体技よそく",
      "踊りよそく",
      "昇天斬り",
      "メゾラゴン",
      "メラゾロス",
      "おぞましいおたけび",
      "天の裁き",
      "ダイヤモンドダスト",
      "スパークふんしゃ",
      "体技封じの息",
      "キャンセルステップ",
      "体砕きの斬舞",
    ];
    // 未実装: ベホマラー マジックバリア マホカンタ おいかぜ バギラ

    let defaultOptGroup = selectElement.querySelector("optgroup[label='固有特技']");
    if (!defaultOptGroup) {
      defaultOptGroup = document.createElement("optgroup");
      defaultOptGroup.label = "固有特技";
      selectElement.appendChild(defaultOptGroup);
    }
    defaultOptGroup.innerHTML = "";

    let superOptGroup = selectElement.querySelector("optgroup[label='超マス特技']");
    if (!superOptGroup) {
      superOptGroup = document.createElement("optgroup");
      superOptGroup.label = "超マス特技";
      selectElement.appendChild(superOptGroup);
      for (const skill of superSkills) {
        // 超マス特技を追加
        const option = document.createElement("option");
        option.value = skill;
        option.text = skill;
        superOptGroup.appendChild(option);
      }
    }

    for (let i = 0; i < defaultSkills.length; i++) {
      if (defaultSkills[i]) {
        const option = document.createElement("option");
        option.value = defaultSkills[i];
        option.text = defaultSkills[i];
        if (i === j) {
          option.selected = true;
        }
        defaultOptGroup.appendChild(option); // 固有特技optgroupに追加
      }
    }
  }
}

for (let i = 0; i < 4; i++) {
  document.getElementById(`skill${i}`).addEventListener("change", function (event) {
    const skillIndex = parseInt(event.target.id.replace("skill", ""), 10);
    selectingParty[currentTab].defaultSkill[skillIndex] = event.target.value;
  });
}

//種変更時: 値を取得、party内の現在のtabのmonsterに格納、種max120処理と、seedIncrementCalcによる増分計算、格納、表示
//tab遷移・モンスター変更時: switchTabからadjustStatusAndSkillDisplay、changeSeedSelectを起動、seedIncrementCalcで増分計算 このとき種表示変更は実行済なので前半は無意味
function changeSeedSelect() {
  // 選択された数値を取得
  const selectSeedAtk = document.getElementById("selectSeedAtk").value;
  const selectSeedDef = document.getElementById("selectSeedDef").value;
  const selectSeedSpd = document.getElementById("selectSeedSpd").value;
  const selectSeedInt = document.getElementById("selectSeedInt").value;

  //この新たな値を、selectingParty内の表示中のタブのseed情報に格納
  selectingParty[currentTab].seed.atk = selectSeedAtk;
  selectingParty[currentTab].seed.def = selectSeedDef;
  selectingParty[currentTab].seed.spd = selectSeedSpd;
  selectingParty[currentTab].seed.int = selectSeedInt;
  seedIncrementCalc(selectSeedAtk, selectSeedDef, selectSeedSpd, selectSeedInt);

  // 120上限種無効化処理
  //select変化時、全部の合計値を算出、120-その合計値を算出 = remain
  const remainingSelectSeedSum = 120 - Number(selectSeedAtk) - Number(selectSeedDef) - Number(selectSeedSpd) - Number(selectSeedInt);
  //すべてのselectで、現状の値+remainを超える選択肢をdisable化
  document.querySelectorAll(".selectSeed").forEach(function (element) {
    const selectedValue = parseInt(element.value);
    const newLimit = remainingSelectSeedSum + selectedValue;

    const options = element.options;
    for (let i = 0; i < options.length; i++) {
      const optionValue = parseInt(options[i].value);
      if (optionValue > newLimit) {
        options[i].disabled = true;
      } else {
        options[i].disabled = false;
      }
    }
  });
}

//増分計算fun selectSeedAtkを元に、増分計算、増分格納、増分表示更新  さらに表示値を更新
function seedIncrementCalc(selectSeedAtk, selectSeedDef, selectSeedSpd, selectSeedInt) {
  //事前定義
  function seedCalc(limit, targetArray) {
    let sum = 0;
    for (let i = 0; i < limit; i++) {
      sum += targetArray[i];
    }
    return sum;
  }
  //種を5で割った数値までの配列内の項をすべて足す
  const atkSeedArrayAtk = [4, 0, 10, 0, 10, 0, 10, 0, 6, 0, 6, 0, 6, 0, 4, 0, 2, 0, 2, 0];
  const atkSeedArrayHP = [0, 4, 0, 4, 0, 4, 0, 3, 0, 3, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1];
  const defSeedArrayDef = [8, 0, 20, 0, 20, 0, 20, 0, 12, 0, 12, 0, 12, 0, 8, 0, 4, 0, 4, 0];
  const defSeedArrayHP = [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2];
  const defSeedArrayMP = [0, 4, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0];

  const atkSeedLimit = selectSeedAtk / 5;
  const defSeedLimit = selectSeedDef / 5;
  const spdSeedLimit = selectSeedSpd / 5;
  const intSeedLimit = selectSeedInt / 5;

  const HPIncrement = seedCalc(atkSeedLimit, atkSeedArrayHP) + seedCalc(defSeedLimit, defSeedArrayHP) + seedCalc(spdSeedLimit, defSeedArrayMP);
  const MPIncrement = seedCalc(defSeedLimit, defSeedArrayMP) + seedCalc(spdSeedLimit, defSeedArrayHP) + seedCalc(intSeedLimit, atkSeedArrayHP);
  const atkIncrement = seedCalc(atkSeedLimit, atkSeedArrayAtk);
  const defIncrement = seedCalc(defSeedLimit, defSeedArrayDef);
  const spdIncrement = seedCalc(spdSeedLimit, atkSeedArrayAtk);
  const intIncrement = seedCalc(intSeedLimit, defSeedArrayDef);

  //格納
  if (!selectingParty[currentTab].hasOwnProperty("seedIncrement")) {
    selectingParty[currentTab].seedIncrement = {};
  }
  selectingParty[currentTab].seedIncrement.HP = HPIncrement;
  selectingParty[currentTab].seedIncrement.MP = MPIncrement;
  selectingParty[currentTab].seedIncrement.atk = atkIncrement;
  selectingParty[currentTab].seedIncrement.def = defIncrement;
  selectingParty[currentTab].seedIncrement.spd = spdIncrement;
  selectingParty[currentTab].seedIncrement.int = intIncrement;

  //増分表示
  document.getElementById("statusInfoSeedIncrementHP").textContent = `(+${HPIncrement})`;
  document.getElementById("statusInfoSeedIncrementMP").textContent = `(+${MPIncrement})`;
  document.getElementById("statusInfoSeedIncrementatk").textContent = `(+${atkIncrement})`;
  document.getElementById("statusInfoSeedIncrementdef").textContent = `(+${defIncrement})`;
  document.getElementById("statusInfoSeedIncrementspd").textContent = `(+${spdIncrement})`;
  document.getElementById("statusInfoSeedIncrementint").textContent = `(+${intIncrement})`;

  calcAndAdjustDisplayStatus();
}

function calcAndAdjustDisplayStatus() {
  //statusとseedIncrementとgearIncrementを足して、displayStatusを計算、表示値を更新
  const gearStatus = selectingParty[currentTab].gear?.status || {};

  selectingParty[currentTab].displayStatus = {
    HP: selectingParty[currentTab].status.HP + selectingParty[currentTab].seedIncrement.HP + (gearStatus.HP || 0),
    MP: selectingParty[currentTab].status.MP + selectingParty[currentTab].seedIncrement.MP + (gearStatus.MP || 0),
    atk: selectingParty[currentTab].status.atk + selectingParty[currentTab].seedIncrement.atk + (gearStatus.atk || 0),
    def: selectingParty[currentTab].status.def + selectingParty[currentTab].seedIncrement.def + (gearStatus.def || 0),
    spd: selectingParty[currentTab].status.spd + selectingParty[currentTab].seedIncrement.spd + (gearStatus.spd || 0),
    int: selectingParty[currentTab].status.int + selectingParty[currentTab].seedIncrement.int + (gearStatus.int || 0),
  };

  document.getElementById("statusInfoDisplayStatusHP").textContent = selectingParty[currentTab].displayStatus.HP;
  document.getElementById("statusInfoDisplayStatusMP").textContent = selectingParty[currentTab].displayStatus.MP;
  document.getElementById("statusInfoDisplayStatusatk").textContent = selectingParty[currentTab].displayStatus.atk;
  document.getElementById("statusInfoDisplayStatusdef").textContent = selectingParty[currentTab].displayStatus.def;
  document.getElementById("statusInfoDisplayStatusspd").textContent = selectingParty[currentTab].displayStatus.spd;
  document.getElementById("statusInfoDisplayStatusint").textContent = selectingParty[currentTab].displayStatus.int;
}

function displayGearIncrement() {
  // 各ステータスごとに表示を更新
  const updateStatus = (statusName) => {
    // 初期値 非表示化
    document.getElementById(`statusInfoGearIncrement${statusName}`).style.visibility = "hidden";
    document.getElementById(`statusInfoGearIncrement${statusName}`).textContent = "0";
    // 装備が存在してかつ0より大きければ表示
    if (selectingParty[currentTab].gear) {
      const statusValue = selectingParty[currentTab].gear.status[statusName];
      if (statusValue > 0) {
        document.getElementById(`statusInfoGearIncrement${statusName}`).style.visibility = "visible";
        document.getElementById(`statusInfoGearIncrement${statusName}`).textContent = `(+${statusValue})`;
      }
    }
  };

  updateStatus("HP");
  updateStatus("MP");
  updateStatus("atk");
  updateStatus("def");
  updateStatus("spd");
  updateStatus("int");
}

//タブ処理

//tab選択時の詳細や表示中の切り替えだけ
function addTabClass(targetTabNum) {
  const tabButtons = document.querySelectorAll(".eachTab");
  const targetTabButton = document.getElementById(`tab${targetTabNum}`);
  tabButtons.forEach((tabButton) => {
    tabButton.classList.remove("selectedTab");
    tabButton.textContent = "詳細";
  });
  targetTabButton.classList.add("selectedTab");
  targetTabButton.textContent = "表示中";
}

//global: currentTabを使用
function switchTab(tabNumber) {
  // tab button押した時または新規モンスター選択時に起動、currentTab更新、引数tabNum番目のモンスター情報を取り出して下に表示(ステ、特技、種)
  // tabの中身が存在するとき
  if (selectingParty[tabNumber].length !== 0) {
    currentTab = tabNumber;
    adjustStatusAndSkillDisplay();
    // タブ自体の詳細/表示中を切り替え
    addTabClass(tabNumber);
    disableSeedSelect(false);
  } else if (tabNumber == 0) {
    // 中身が空かつ0は例外的に空tab選択可能にして、初期表示
    currentTab = tabNumber;
    // タブ自体の詳細/表示中を切り替え
    addTabClass(tabNumber);
    //各種表示reset
    // skill表示空に
    document.getElementById("skill0").value = "";
    document.getElementById("skill1").value = "";
    document.getElementById("skill2").value = "";
    document.getElementById("skill3").value = "";
    // 種表示reset
    document.getElementById("selectSeedAtk").value = 0;
    document.getElementById("selectSeedDef").value = 0;
    document.getElementById("selectSeedSpd").value = 0;
    document.getElementById("selectSeedInt").value = 0;
    // 増分表示reset
    document.getElementById("statusInfoSeedIncrementHP").textContent = "(+0)";
    document.getElementById("statusInfoSeedIncrementMP").textContent = "(+0)";
    document.getElementById("statusInfoSeedIncrementatk").textContent = "(+0)";
    document.getElementById("statusInfoSeedIncrementdef").textContent = "(+0)";
    document.getElementById("statusInfoSeedIncrementspd").textContent = "(+0)";
    document.getElementById("statusInfoSeedIncrementint").textContent = "(+0)";
    // 表示値reset
    document.getElementById("statusInfoDisplayStatusHP").textContent = "0";
    document.getElementById("statusInfoDisplayStatusMP").textContent = "0";
    document.getElementById("statusInfoDisplayStatusatk").textContent = "0";
    document.getElementById("statusInfoDisplayStatusdef").textContent = "0";
    document.getElementById("statusInfoDisplayStatusspd").textContent = "0";
    document.getElementById("statusInfoDisplayStatusint").textContent = "0";
    // 装備増分表示reset adjustStatusAndSkillDisplayを実行しない分ここで
    displayGearIncrement();
    //種選択無効化
    disableSeedSelect(true);
  }
}
switchTab(0);

// 特技選択無効化も相乗り
function disableSeedSelect(boolean) {
  document.querySelectorAll(".selectSeed, select.changeSkill").forEach((element) => {
    element.disabled = boolean;
  });
}

document.getElementById("drapa").addEventListener("click", function () {
  selectAllPartyMembers(["masudora", "sinri", "rusia", "orochi", "voruka"]);
});

document.getElementById("yuzupa").addEventListener("click", function () {
  selectAllPartyMembers(["world", "nerugeru", "erugi", "ifshiba", "skull"]);
});

document.getElementById("omudopa").addEventListener("click", function () {
  selectAllPartyMembers(["omudo", "rapu", "esta", "dogu", "dorunisu"]);
});

document.getElementById("akumapa").addEventListener("click", function () {
  selectAllPartyMembers(["tanisu", "dhuran", "rogos", "magesu", "zuisho"]);
});

document.getElementById("beastpa").addEventListener("click", function () {
  selectAllPartyMembers(["azu", "gorago", "tenkai", "reopa", "kingreo"]);
});

async function selectAllPartyMembers(monsters) {
  for (selectingMonsterNum = 0; selectingMonsterNum < monsters.length; selectingMonsterNum++) {
    selectMonster(monsters[selectingMonsterNum]);
  }
  decideParty();
  await sleep(9);
  // 選択画面を開く
  if (currentPlayer === "B") {
    document.body.style.overflow = "hidden";
    document.getElementById("selectMonsterOverlay").style.visibility = "visible";
    document.getElementById("selectMonsterPopupWindow").style.opacity = "1";
    selectingMonsterNum = 0;
  }
}

const monsters = [
  {
    name: "マスタードラゴン",
    id: "masudora",
    rank: 10,
    race: "ドラゴン",
    status: { HP: 886, MP: 398, atk: 474, def: 536, spd: 500, int: 259 },
    initialSkill: ["天空竜の息吹", "エンドブレス", "テンペストブレス", "煉獄火炎"],
    defaultGear: "familyNail",
    attribute: {
      initialBuffs: {
        breathEnhancement: { keepOnDeath: true },
        mindAndSealBarrier: { keepOnDeath: true },
        allElementalBoost: { strength: 0.2, duration: 4, targetType: "ally" },
      },
      1: {
        allElementalBreak: { strength: 1, duration: 4, divineDispellable: true, targetType: "ally" },
        breathCharge: { strength: 1.2 },
      },
      2: { breathCharge: { strength: 1.5 } },
      3: { breathCharge: { strength: 2 } },
    },
    seed: { atk: 15, def: 35, spd: 70, int: 0 },
    ls: { HP: 1.15, spd: 1.3 },
    lsTarget: "ドラゴン",
    AINormalAttack: [2, 3],
    resistance: { fire: 0, ice: 1, thunder: -1, wind: 1, io: 0.5, light: 0, dark: 1, poisoned: 0, asleep: 0.5, confused: 1, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "宵の華シンリ",
    id: "sinri",
    rank: 10,
    race: "ドラゴン",
    status: { HP: 772, MP: 365, atk: 293, def: 341, spd: 581, int: 483 },
    initialSkill: ["涼風一陣", "神楽の術", "昇天斬り", "タップダンス"],
    defaultGear: "metalNail",
    attribute: {
      permanentBuffs: {
        mindAndSealBarrier: { divineDispellable: true, duration: 3, probability: 0.25 },
      },
    },
    seed: { atk: 0, def: 25, spd: 95, int: 0 },
    ls: { HP: 1 },
    lsTarget: "ドラゴン",
    resistance: { fire: 0, ice: 0, thunder: 1, wind: 1, io: 1, light: 0.5, dark: 1, poisoned: 1, asleep: 0.5, confused: 1, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 0.5 },
  },
  {
    name: "魔夏姫アンルシア",
    id: "rusia",
    rank: 10,
    race: "ドラゴン",
    status: { HP: 785, MP: 318, atk: 635, def: 447, spd: 545, int: 294 },
    initialSkill: ["氷華大繚乱", "フローズンシャワー", "おぞましいおたけび", "スパークふんしゃ"],
    defaultGear: "killerEarrings",
    attribute: {
      initialBuffs: {
        iceBreak: { keepOnDeath: true, strength: 1 },
        mindBarrier: { keepOnDeath: true },
        demonKingBarrier: { divineDispellable: true },
        spdUp: { strength: 1 },
      },
      1: {
        powerCharge: { strength: 2 },
        protection: { divineDispellable: true, strength: 0.5, duration: 3 },
        fireGuard: { strength: 0.5, duration: 4, targetType: "ally" },
      },
    },
    seed: { atk: 45, def: 0, spd: 75, int: 0 },
    ls: { HP: 1 },
    lsTarget: "ドラゴン",
    AINormalAttack: [2],
    resistance: { fire: 0.5, ice: 0, thunder: 0, wind: 1, io: 1, light: 1, dark: 0.5, poisoned: 1, asleep: 1, confused: 0, paralyzed: 0, zaki: 0, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "怪竜やまたのおろち",
    id: "orochi",
    rank: 10,
    race: "ドラゴン",
    status: { HP: 909, MP: 368, atk: 449, def: 675, spd: 296, int: 286 },
    initialSkill: ["むらくもの息吹", "獄炎の息吹", "ほとばしる暗闇", "防刃の守り"],
    defaultGear: "kudaki",
    attribute: {
      initialBuffs: {
        fireBreak: { keepOnDeath: true, strength: 2 },
        breathEnhancement: { keepOnDeath: true },
        mindBarrier: { keepOnDeath: true },
      },
      1: {
        preemptiveAction: {},
      },
      evenTurnBuffs: { slashBarrier: { strength: 1 } },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { HP: 1 },
    lsTarget: "ドラゴン",
    AINormalAttack: [2, 3],
    resistance: { fire: -1, ice: 1.5, thunder: 0.5, wind: 1, io: 1, light: 1, dark: 0.5, poisoned: 0.5, asleep: 1, confused: 1, paralyzed: 0.5, zaki: 0, dazzle: 0.5, spellSeal: 1, breathSeal: 0.5 },
  },
  {
    name: "ヴォルカドラゴン",
    id: "voruka",
    rank: 10,
    race: "ドラゴン",
    status: { HP: 1025, MP: 569, atk: 297, def: 532, spd: 146, int: 317 },
    initialSkill: ["ラヴァフレア", "におうだち", "大樹の守り", "みがわり"],
    defaultGear: "flute",
    attribute: {
      initialBuffs: {
        metal: { keepOnDeath: true, strength: 0.75 },
        mpCostMultiplier: { strength: 1.2, keepOnDeath: true },
      },
      1: {
        spellBarrier: { strength: 1, targetType: "ally" },
        stonedBlock: { duration: 3, targetType: "ally" },
      },
    },
    seed: { atk: 50, def: 60, spd: 10, int: 0 },
    ls: { HP: 1.3 },
    lsTarget: "ドラゴン",
    resistance: { fire: -1, ice: 1.5, thunder: 0.5, wind: 0.5, io: 1.5, light: 1, dark: 1, poisoned: 1, asleep: 0, confused: 0, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "WORLD",
    id: "world",
    rank: 10,
    race: "???",
    weight: "30",
    status: { HP: 809, MP: 332, atk: 659, def: 473, spd: 470, int: 324 },
    initialSkill: ["超魔滅光", "真・ゆうきの斬舞", "神獣の封印", "斬撃よそく"],
    defaultGear: "kudaki",
    attribute: {
      initialBuffs: {
        lightBreak: { keepOnDeath: true, strength: 2 },
        isUnbreakable: { keepOnDeath: true, left: 1, name: "不屈の闘志" },
        mindBarrier: { divineDispellable: true, duration: 3 },
        martialReflection: { divineDispellable: true, strength: 1.5, duration: 3 },
      },
      buffsFromTurn2: {
        lightBreakBoost: { strength: 1, maxStrength: 2 },
      },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { HP: 1.13, spd: 1.13, atk: 1.05 },
    lsTarget: "all",
    AINormalAttack: [2, 3],
    resistance: { fire: 0, ice: 1, thunder: 0.5, wind: 0.5, io: 1, light: -1, dark: 1, poisoned: 1.5, asleep: 0.5, confused: 0.5, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 0.5, breathSeal: 1 },
  },
  {
    name: "超ネルゲル",
    id: "nerugeru",
    rank: 10,
    race: "超魔王",
    weight: "40",
    status: { HP: 907, MP: 373, atk: 657, def: 564, spd: 577, int: 366 },
    initialSkill: ["ソウルハーベスト", "黄泉の封印", "暗黒閃", "冥王の奪命鎌"],
    defaultGear: "hunkiNail",
    attribute: {
      initialBuffs: {
        darkBreak: { keepOnDeath: true, strength: 2 },
        mindBarrier: { keepOnDeath: true },
        protection: { divineDispellable: true, strength: 0.5, duration: 3 },
      },
      evenTurnBuffs: {
        baiki: { strength: 1 },
        defUp: { strength: 1 },
        spdUp: { strength: 1 },
        intUp: { strength: 1 },
      },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    AINormalAttack: [3],
    resistance: { fire: 0.5, ice: 0, thunder: 0, wind: 0.5, io: 1, light: 1, dark: 0, poisoned: 1, asleep: 0, confused: 0.5, paralyzed: 0, zaki: 0, dazzle: 0, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "超エルギ",
    id: "erugi",
    rank: 10,
    race: "超魔王",
    weight: "40",
    status: { HP: 870, MP: 411, atk: 603, def: 601, spd: 549, int: 355 },
    initialSkill: ["失望の光舞", "パニッシュスパーク", "堕天使の理", "光速の連打"],
    attribute: {
      initialBuffs: {
        lightBreak: { keepOnDeath: true, strength: 2 },
        mindBarrier: { keepOnDeath: true },
        protection: { divineDispellable: true, strength: 0.5, duration: 3 },
      },
      evenTurnBuffs: {
        baiki: { strength: 1 },
        defUp: { strength: 1 },
        spdUp: { strength: 1 },
        intUp: { strength: 1 },
      },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    AINormalAttack: [3],
    resistance: { fire: 1, ice: 0, thunder: 0.5, wind: 0.5, io: 0, light: 1, dark: 0, poisoned: 1, asleep: 0, confused: 0, paralyzed: 0.5, zaki: 0, dazzle: 0, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "イフシバ",
    id: "ifshiba",
    rank: 10,
    race: "???",
    weight: "25",
    status: { HP: 750, MP: 299, atk: 540, def: 385, spd: 461, int: 415 },
    initialSkill: ["ヘルバーナー", "氷魔のダイヤモンド", "炎獣の爪", "プリズムヴェール"],
    defaultGear: "genjiNail",
    attribute: {
      initialBuffs: {
        tagTransformation: { keepOnDeath: true, act: "幻獣のタッグ" },
        fireBreak: { keepOnDeath: true, strength: 2 },
        iceBreak: { keepOnDeath: true, strength: 2 },
        mindBarrier: { duration: 3 },
      },
    },
    seed: { atk: 0, def: 25, spd: 95, int: 0 },
    ls: { HP: 1, MP: 1 },
    lsTarget: "all",
    resistance: { fire: -1, ice: -1, thunder: 1, wind: 1, io: 0.5, light: 1, dark: 0.5, poisoned: 0.5, asleep: 0, confused: 0.5, paralyzed: 1, zaki: 0.5, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "スカルナイト",
    id: "skull",
    rank: 8,
    race: "ゾンビ",
    weight: "8",
    status: { HP: 483, MP: 226, atk: 434, def: 304, spd: 387, int: 281 },
    initialSkill: ["ルカナン", "みがわり", "ザオリク", "防刃の守り"],
    defaultGear: "familyNail",
    attribute: {},
    seed: { atk: 20, def: 5, spd: 95, int: 0 },
    ls: { spd: 1.08 },
    lsTarget: "ゾンビ",
    resistance: { fire: 1.5, ice: 1, thunder: 1, wind: 0.5, io: 1, light: 1, dark: 0, poisoned: 1, asleep: 0, confused: 1, paralyzed: 0.5, zaki: 0.5, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "超オムド",
    id: "omudo",
    rank: 10,
    race: "超魔王",
    weight: "40",
    status: { HP: 937, MP: 460, atk: 528, def: 663, spd: 263, int: 538 },
    initialSkill: ["タイムストーム", "零時の儀式", "エレメントエラー", "かくせいリバース"],
    defaultGear: "dragonCane",
    attribute: {
      initialBuffs: {
        mindBarrier: { keepOnDeath: true },
        protection: { divineDispellable: true, strength: 0.5, duration: 3 },
      },
      evenTurnBuffs: {
        intUp: { strength: 1 },
        defUp: { strength: 1 },
        spellBarrier: { strength: 1 },
      },
    },
    seed: { atk: 30, def: 70, spd: 0, int: 20 },
    ls: { HP: 1.4, spd: 0.8 },
    lsTarget: "all",
    AINormalAttack: [3],
    resistance: { fire: 1, ice: 1, thunder: 0, wind: 0, io: 1, light: 1, dark: 0, poisoned: 1, asleep: 0, confused: 0, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 0, breathSeal: 1 },
  },
  {
    name: "超ラプ",
    id: "rapu",
    rank: 10,
    race: "超魔王",
    weight: "40",
    status: { HP: 1075, MP: 457, atk: 380, def: 513, spd: 405, int: 559 },
    initialSkill: ["呪いの儀式", "はめつの流星", "暗黒神の連撃", "真・闇の結界"],
    attribute: {
      initialBuffs: {
        mindBarrier: { keepOnDeath: true },
        ioBreak: { keepOnDeath: true, strength: 2 },
        protection: { divineDispellable: true, strength: 0.5, duration: 3 },
      },
      evenTurnBuffs: {
        intUp: { strength: 1 },
        defUp: { strength: 1 },
        spellBarrier: { strength: 1 },
      },
      permanentBuffs: {
        slashReflection: { strength: 1, duration: 1, unDispellable: true, isKanta: true },
        martialReflection: { strength: 1, duration: 1, unDispellable: true },
      },
    },
    seed: { atk: 80, def: 30, spd: 10, int: 0 },
    ls: { HP: 1.35, int: 1.15 },
    lsTarget: "all",
    AINormalAttack: [3],
    resistance: { fire: 0, ice: 1, thunder: 1, wind: 1, io: 0, light: 0, dark: 0, poisoned: 0, asleep: 0, confused: 0.5, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 0, breathSeal: 1 },
  },
  {
    name: "エスターク",
    id: "esta",
    rank: 10,
    race: "???",
    weight: "32",
    status: { HP: 862, MP: 305, atk: 653, def: 609, spd: 546, int: 439 },
    initialSkill: ["必殺の双撃", "帝王のかまえ", "体砕きの斬舞", "ザオリク"],
    attribute: {
      initialBuffs: {
        demonKingBarrier: { divineDispellable: true },
        protection: { strength: 0.5, duration: 3 },
      },
      evenTurnBuffs: {
        baiki: { strength: 1 },
        defUp: { strength: 1 },
        spdUp: { strength: 1 },
        intUp: { strength: 1 },
      },
    },
    seed: { atk: 100, def: 10, spd: 10, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    AINormalAttack: [3, 4],
    resistance: { fire: 0, ice: 0.5, thunder: 1, wind: 0.5, io: 1, light: 1, dark: 0.5, poisoned: 1, asleep: 1.5, confused: 0.5, paralyzed: 0.5, zaki: 0, dazzle: 0, spellSeal: 0, breathSeal: 1 },
  },
  {
    name: "ミステリドール",
    id: "dogu",
    rank: 9,
    race: "物質",
    weight: "16",
    status: { HP: 854, MP: 305, atk: 568, def: 588, spd: 215, int: 358 },
    initialSkill: ["アストロンゼロ", "衝撃波", "みがわり", "防刃の守り"],
    defaultGear: "familyNail",
    attribute: {
      initialBuffs: {
        mindBarrier: { duration: 3 },
      },
      evenTurnBuffs: {
        defUp: { strength: 1 },
        spellBarrier: { strength: 1 },
        breathBarrier: { strength: 1 },
      },
      permanentBuffs: {
        anchorAction: {},
      },
    },
    seed: { atk: 40, def: 80, spd: 0, int: 0 },
    ls: { HP: 1.15 },
    lsTarget: "all",
    resistance: { fire: 1, ice: 1, thunder: 0, wind: 1.5, io: 0, light: 1.5, dark: 1, poisoned: 0, asleep: 0, confused: 0.5, paralyzed: 0.5, zaki: 0, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "ティトス",
    id: "dorunisu",
    rank: 9,
    race: "???",
    weight: "14",
    status: { HP: 837, MP: 236, atk: 250, def: 485, spd: 303, int: 290 },
    initialSkill: ["おおいかくす", "闇の紋章", "防刃の守り", "タップダンス"],
    attribute: {
      initialBuffs: {
        metal: { keepOnDeath: true, strength: 0.75, isMetal: true },
        mpCostMultiplier: { strength: 1.2, keepOnDeath: true },
        elementalShield: { targetElement: "dark", remain: 250, unDispellable: true, targetType: "ally" },
        damageLimit: { strength: 250 },
      },
    },
    seed: { atk: 50, def: 60, spd: 10, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    resistance: { fire: 1, ice: 1, thunder: 1, wind: 1, io: 1, light: 1, dark: 0, poisoned: 1, asleep: 0.5, confused: 0.5, paralyzed: 0.5, zaki: 1, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "タイタニス",
    id: "tanisu",
    rank: 10,
    race: "悪魔",
    weight: "30",
    status: { HP: 772, MP: 458, atk: 329, def: 495, spd: 462, int: 501 },
    initialSkill: ["邪悪なこだま", "絶氷の嵐", "禁忌のかくせい", "邪道のかくせい"],
    attribute: {
      initialBuffs: {
        iceBreak: { keepOnDeath: true, strength: 1 },
        mindAndSealBarrier: { keepOnDeath: true },
        protection: { strength: 0.5, duration: 3 },
      },
    },
    seed: { atk: 0, def: 0, spd: 55, int: 65 },
    ls: { HP: 1.3, spd: 1.25 },
    lsTarget: "悪魔",
    resistance: { fire: 1, ice: 0, thunder: 0.5, wind: 0.5, io: 0.5, light: 1, dark: 0, poisoned: 0.5, asleep: 0, confused: 0.5, paralyzed: 1, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "デュラン",
    id: "dhuran",
    rank: 10,
    race: "悪魔",
    weight: "28",
    status: { HP: 845, MP: 315, atk: 689, def: 502, spd: 483, int: 255 },
    initialSkill: ["無双のつるぎ", "瞬撃", "昇天斬り", "光のはどう"],
    defaultGear: "shoten",
    attribute: {
      initialBuffs: {
        isUnbreakable: { keepOnDeath: true, left: 1, name: "不屈の闘志" },
      },
      evenTurnBuffs: {
        powerCharge: { strength: 2 },
      },
    },
    seed: { atk: 55, def: 0, spd: 65, int: 0 },
    ls: { atk: 1.12, spd: 1.18 },
    lsTarget: "悪魔",
    AINormalAttack: [2, 3],
    resistance: { fire: 1, ice: 1, thunder: 0, wind: 0.5, io: 1, light: 0.5, dark: 0, poisoned: 1, asleep: 0, confused: 0, paralyzed: 1, zaki: 0, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "ディアロゴス",
    id: "rogos",
    rank: 10,
    race: "悪魔",
    weight: "32",
    status: { HP: 823, MP: 314, atk: 504, def: 383, spd: 486, int: 535 },
    initialSkill: ["カタストロフ", "らいてい弾", "ラストストーム", "メラゾロス"],
    defaultGear: "familyNail",
    attribute: {
      initialBuffs: {
        thunderBreak: { keepOnDeath: true, strength: 2 },
        windBreak: { keepOnDeath: true, strength: 2 },
        darkBreak: { keepOnDeath: true, strength: 2 },
        autoRadiantWave: { removeAtTurnStart: true, duration: 3, targetType: "ally" },
      },
      evenTurnBuffs: {
        thunderBreakBoost: { strength: 1, maxStrength: 3 },
        windBreakBoost: { strength: 1, maxStrength: 3 },
        darkBreakBoost: { strength: 1, maxStrength: 3 },
      },
    },
    seed: { atk: 0, def: 0, spd: 95, int: 25 },
    ls: { HP: 1.15, spd: 1.15 },
    lsTarget: "悪魔",
    AINormalAttack: [2, 3],
    resistance: { fire: 1, ice: 0, thunder: 0, wind: 0, io: 1, light: 1, dark: -1, poisoned: 1, asleep: 0.5, confused: 0.5, paralyzed: 0.5, zaki: 0, dazzle: 0, spellSeal: 0.5, breathSeal: 1 },
  },
  {
    name: "涼風の魔女グレイツェル",
    id: "tseru",
    rank: 10,
    race: "悪魔",
    weight: "25",
    status: { HP: 852, MP: 314, atk: 258, def: 422, spd: 519, int: 503 },
    initialSkill: ["蠱惑の舞い", "宵の暴風", "悪魔の息見切り", "スパークふんしゃ"],
    attribute: {
      initialBuffs: {
        windBreak: { keepOnDeath: true, strength: 1 },
      },
      permanentBuffs: {
        mindAndSealBarrier: { divineDispellable: true, duration: 3, probability: 0.25 },
      },
    },
    seed: { atk: 0, def: 0, spd: 95, int: 25 },
    ls: { spd: 1.2 },
    lsTarget: "悪魔",
    resistance: { fire: 0.5, ice: 0, thunder: 1, wind: 0, io: 1, light: 0.5, dark: 0.5, poisoned: 0.5, asleep: 1, confused: 0.5, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "魔性の道化ドルマゲス",
    id: "magesu",
    rank: 10,
    race: "悪魔",
    weight: "25",
    status: { HP: 743, MP: 379, atk: 470, def: 421, spd: 506, int: 483 },
    initialSkill: ["秘術イオマータ", "狂気のいあつ", "マインドバリア", "あんこくのはばたき"],
    defaultGear: "waveNail",
    attribute: {
      initialBuffs: {
        spdUp: { strength: 2 },
      },
      evenTurnBuffs: {
        manaBoost: { strength: 1.5 },
      },
    },
    seed: { atk: 10, def: 55, spd: 30, int: 25 },
    ls: { spd: 1.18 },
    lsTarget: "悪魔",
    resistance: { fire: 1, ice: 0.5, thunder: 0.5, wind: 1, io: 1, light: 0.5, dark: 0, poisoned: 1, asleep: 0, confused: 0.5, paralyzed: 1, zaki: 0, dazzle: 1, spellSeal: 0, breathSeal: 1 },
  },
  {
    name: "幻惑のムドー",
    id: "mudo",
    rank: 10,
    race: "悪魔",
    weight: "28",
    status: { HP: 799, MP: 408, atk: 260, def: 589, spd: 435, int: 492 },
    initialSkill: ["催眠の邪弾", "夢の世界", "ギラマータ", "幻術のひとみ"],
    attribute: {
      initialBuffs: {
        thunderBreak: { keepOnDeath: true, strength: 1 },
        asleepBreak: { keepOnDeath: true, strength: 1 },
        mindBarrier: { keepOnDeath: true },
      },
      evenTurnBuffs: { defUp: { strength: 1 }, slashBarrier: { strength: 1 } },
    },
    seed: { atk: 0, def: 0, spd: 95, int: 25 },
    ls: { HP: 1.15, def: 1.15 },
    lsTarget: "all",
    resistance: { fire: 0.5, ice: 0, thunder: 1, wind: 0.5, io: 0, light: 1, dark: 1, poisoned: 1, asleep: 0, confused: 0, paralyzed: 1, zaki: 0, dazzle: 1, spellSeal: 0.5, breathSeal: 1 },
  },
  {
    name: "ズイカク&ショウカク",
    id: "zuisho",
    rank: 10,
    race: "悪魔",
    weight: "25",
    status: { HP: 844, MP: 328, atk: 502, def: 613, spd: 399, int: 158 },
    initialSkill: ["におうだち", "だいぼうぎょ", "昇天斬り", "精霊の守り・強"],
    defaultGear: "flute",
    attribute: {
      initialBuffs: {
        metal: { keepOnDeath: true, strength: 0.75, isMetal: true },
        mpCostMultiplier: { strength: 1.2, keepOnDeath: true },
        breathReflection: { strength: 1, keepOnDeath: true },
      },
    },
    seed: { atk: 55, def: 0, spd: 65, int: 0 },
    ls: { HP: 1.3 },
    lsTarget: "悪魔",
    AINormalAttack: [2],
    resistance: { fire: 1, ice: 1, thunder: 0.5, wind: 0.5, io: 0.5, light: 0.5, dark: 0, poisoned: 0.5, asleep: 0.5, confused: 1.5, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "ジャハガロス",
    id: "jaha",
    rank: 10,
    race: "悪魔",
    weight: "28",
    status: { HP: 810, MP: 403, atk: 256, def: 588, spd: 445, int: 483 },
    initialSkill: ["巨岩投げ", "苛烈な暴風", "魔の忠臣", "精霊の守り・強"],
    attribute: {
      initialBuffs: {
        protection: { strength: 0.34, duration: 3 },
        intUp: { strength: 1 },
        revive: { keepOnDeath: true, divineDispellable: true, strength: 1, act: "復讐の闘志" },
        spellBarrier: { strength: 2 },
      },
      evenTurnBuffs: { defUp: { strength: 1 }, intUp: { strength: 1 } },
    },
    seed: { atk: 30, def: 55, spd: 35, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    resistance: { fire: 1, ice: 0.5, thunder: 1, wind: 0, io: 0.5, light: 1, dark: 0, poisoned: 0.5, asleep: 0, confused: 1, paralyzed: 0.5, zaki: 0, dazzle: 1, spellSeal: 0.5, breathSeal: 1 },
  },
  {
    name: "リーズレット",
    id: "rizu",
    rank: 10,
    race: "悪魔",
    weight: "25",
    status: { HP: 780, MP: 375, atk: 326, def: 398, spd: 492, int: 509 },
    initialSkill: ["フローズンスペル", "氷の王国", "雪だるま", "メゾラゴン"],
    attribute: {
      initialBuffs: {
        breathReflection: { keepOnDeath: true, strength: 1 },
        dodgeBuff: { keepOnDeath: true, strength: 0.5 },
      },
    },
    seed: { atk: 0, def: 25, spd: 95, int: 0 },
    ls: { spd: 1.15, int: 1.15 },
    lsTarget: "悪魔",
    resistance: { fire: 1, ice: -1, thunder: 1, wind: 0, io: 1, light: 0.5, dark: 0.5, poisoned: 1, asleep: 1, confused: 0, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 0, breathSeal: 1 },
  },
  {
    name: "キングアズライル",
    id: "azu",
    rank: 10,
    race: "魔獣",
    weight: "30",
    status: { HP: 967, MP: 293, atk: 267, def: 531, spd: 534, int: 419 },
    initialSkill: ["ヘブンリーブレス", "裁きの極光", "昇天斬り", "光のはどう"],
    defaultGear: "cursedNail",
    attribute: {
      initialBuffs: {
        breathReflection: { strength: 1, keepOnDeath: true },
        aiExtraAttacks: { strength: 1, keepOnDeath: true, targetType: "ally" },
      },
    },
    seed: { atk: 0, def: 25, spd: 95, int: 0 },
    ls: { spd: 1.45 },
    lsTarget: "魔獣",
    AINormalAttack: [2],
    resistance: { fire: 1, ice: 0, thunder: 1, wind: 0.5, io: 1, light: 0, dark: 1, poisoned: 0.5, asleep: 0, confused: 0.5, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 0 },
  },
  {
    name: "ヘルゴラゴ",
    id: "gorago",
    rank: 10,
    race: "魔獣",
    weight: "30",
    status: { HP: 692, MP: 406, atk: 609, def: 455, spd: 577, int: 366 },
    initialSkill: ["獣王の猛撃", "波状裂き", "スパークふんしゃ", "キャンセルステップ"],
    defaultGear: "familyNailBeast",
    attribute: {
      initialBuffs: {
        mindBarrier: { keepOnDeath: true },
      },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { atk: 1.1, spd: 1.3 },
    lsTarget: "魔獣",
    AINormalAttack: [2, 3],
    resistance: { fire: 0.5, ice: 0.5, thunder: 1, wind: 0.5, io: 0.5, light: 1, dark: 0.5, poisoned: 0, asleep: 1, confused: 0.5, paralyzed: 0, zaki: 0, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "てんかいじゅう",
    id: "tenkai",
    rank: 10,
    race: "魔獣",
    weight: "28",
    status: { HP: 865, MP: 396, atk: 506, def: 428, spd: 513, int: 275 },
    initialSkill: ["ツイスター", "浄化の風", "天翔の舞い", "タップダンス"],
    defaultGear: "ryujinNail",
    attribute: {
      initialBuffs: {
        breathEnhancement: { keepOnDeath: true },
        windBreak: { keepOnDeath: true, strength: 1 },
      },
      1: {
        spdUp: { keepOnDeath: true, strength: 1, targetType: "ally" },
      },
    },
    seed: { atk: 0, def: 25, spd: 95, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    AINormalAttack: [2, 3],
    resistance: { fire: 1, ice: 1, thunder: 0.5, wind: 0.5, io: 1, light: 0, dark: 0, poisoned: 1, asleep: 1, confused: 0, paralyzed: 0.5, zaki: 0, dazzle: 0, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "魔犬レオパルド",
    id: "reopa",
    rank: 10,
    race: "魔獣",
    weight: "28",
    status: { HP: 791, MP: 333, atk: 590, def: 436, spd: 533, int: 295 },
    initialSkill: ["狂乱のやつざき", "火葬のツメ", "暗黒の誘い", "スパークふんしゃ"],
    defaultGear: "kanazuchi",
    attribute: {
      initialBuffs: {
        isUnbreakable: { keepOnDeath: true, name: "くじけぬ心" },
      },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { HP: 1 },
    lsTarget: "all",
    AINormalAttack: [2],
    resistance: { fire: 1, ice: 0.5, thunder: 1, wind: 0.5, io: 1, light: 1.5, dark: -1, poisoned: 1, asleep: 0, confused: 0, paralyzed: 1, zaki: 0, dazzle: 0.5, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "百獣の王キングレオ",
    id: "kingreo",
    rank: 10,
    race: "魔獣",
    weight: "28",
    status: { HP: 780, MP: 305, atk: 579, def: 530, spd: 487, int: 309 },
    initialSkill: ["ビーストアイ", "無慈悲なきりさき", "スパークふんしゃ", "防刃の守り"],
    defaultGear: "hunkiNail",
    attribute: {
      initialBuffs: {
        baiki: { strength: 2, keepOnDeath: true },
        spdUp: { strength: 2 },
        isUnbreakable: { keepOnDeath: true, left: 1, name: "不屈の闘志" },
      },
      evenTurnBuffs: { defUp: { strength: 1 }, spdUp: { strength: 1 }, breathBarrier: { strength: 1 } },
    },
    seed: { atk: 25, def: 0, spd: 95, int: 0 },
    ls: { HP: 1.18, atk: 1.15 },
    lsTarget: "魔獣",
    AINormalAttack: [2, 3],
    resistance: { fire: 0.5, ice: 1, thunder: -1, wind: 0.5, io: 0, light: 1.5, dark: 1, poisoned: 0.5, asleep: 1, confused: 0.5, paralyzed: 0.5, zaki: 0.5, dazzle: 0, spellSeal: 1, breathSeal: 0.5 },
  },
  {
    name: "魔炎鳥",
    id: "maen",
    rank: 10,
    race: "ゾンビ",
    weight: "25",
    status: { HP: 300000, MP: 328, atk: 400, def: 500, spd: 399, int: 450 },
    initialSkill: ["ザオリク", "エンドブレス", "debugbreath", "神のはどう"],
    attribute: {
      initialBuffs: {
        asleep: { duration: 999 },
        elementalShield: { targetElement: "all", remain: 3000, unDispellable: true },
      },
      permanentBuffs: {
        elementalShield: { targetElement: "all", remain: 3000, unDispellable: true },
      },
    },
    seed: { atk: 55, def: 0, spd: 65, int: 0 },
    ls: { HP: 1 },
    lsTarget: "ゾンビ",
    AINormalAttack: [2],
    resistance: { fire: 1, ice: 1, thunder: 0.5, wind: 0.5, io: 0.5, light: 0.5, dark: 0, poisoned: 0.5, asleep: 0.5, confused: 1.5, paralyzed: 0, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
  {
    name: "sample",
    id: "",
    rank: 10, // SSが10で下げる
    race: "", // 日本語
    weight: "",
    status: { HP: 1, MP: 1, atk: 1, def: 1, spd: 1, int: 1 },
    initialSkill: ["", "", "", ""],
    attribute: "",
    seed: { atk: 0, def: 0, spd: 95, int: 0 },
    ls: { HP: 1, MP: 1 },
    lsTarget: "all", //日本語
    AINormalAttack: [2, 3],
    resistance: { fire: 1, ice: 1, thunder: 1, wind: 1, io: 1, light: 1, dark: 1, poisoned: 0, asleep: 0.5, confused: 1, paralyzed: 1, zaki: 0, dazzle: 1, spellSeal: 1, breathSeal: 1 },
  },
];
//ウェイトなども。あと、特技や特性は共通項もあるので別指定も可能。

// 必要ならばasyncにするのに注意
function getMonsterAbilities(monsterId) {
  const monsterAbilities = {
    masudora: {
      initialAbilities: [
        {
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.race === "ドラゴン") {
                monster.abilities.additionalAfterActionAbilities.push({
                  name: "天の竜気上昇",
                  disableMessage: true,
                  unavailableIf: (skillUser, executingSkill, executedSkills) => {
                    const aliveMasudora = parties[skillUser.teamID].filter((member) => member.id === "masudora" && !member.flags.isDead);
                    // 生存しているマスドラがいない または skillが実行されてない時はunavailable
                    if (aliveMasudora.length < 1 || !executingSkill) {
                      return true;
                    } else {
                      if (executingSkill.name === "涼風一陣") {
                        return false;
                      } else if (executingSkill.type === "breath") {
                        return false;
                      } else if (executingSkill.type === "martial") {
                        return Math.random() < 0.576; //0.424
                      } else {
                        return true;
                      }
                    }
                  },
                  act: async function (skillUser, executingSkill) {
                    await applyDragonPreemptiveAction(skillUser, executingSkill);
                  },
                });
              }
            }
          },
        },
      ],
      attackAbilities: {
        permanentAbilities: [
          {
            name: "天の竜気発動",
            isOneTimeUse: true,
            unavailableIf: (skillUser) => !skillUser.buffs.dragonPreemptiveAction || skillUser.buffs.dragonPreemptiveAction.strength < 3,
            act: async function (skillUser) {
              const aliveDragons = parties[skillUser.teamID].filter((member) => member.race === "ドラゴン" && !member.flags.isDead);
              for (const member of aliveDragons) {
                displayMessage("天の竜気の", "効果が発動！");
                applyBuff(member, { preemptiveAction: {} });
                await sleep(150);
              }
            },
          },
        ],
      },
    },
    sinri: {
      initialAbilities: [
        {
          name: "祭の名残",
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.race === "ドラゴン") {
                monster.abilities.additionalAfterActionAbilities.push({
                  name: "祭の名残付与",
                  disableMessage: true,
                  act: async function (skillUser, executingSkill) {
                    applyBuff(skillUser, { sinriReduction: { duration: 1, removeAtTurnStart: true, unDispellable: true } });
                  },
                });
              }
            }
          },
        },
      ],
      attackAbilities: {
        1: [
          {
            name: "竜衆の鎮魂",
            unavailableIf: (skillUser) => !hasEnoughMonstersOfType(parties[skillUser.teamID], "ドラゴン", 5),
            act: async function (skillUser) {
              for (const monster of parties[skillUser.enemyTeamID]) {
                applyBuff(monster, { reviveBlock: { name: "竜衆の鎮魂" } });
              }
            },
          },
        ],
      },
    },
    orochi: {
      supportAbilities: {
        permanentAbilities: [
          {
            name: "怪竜の竜鱗",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
      },
      attackAbilities: {
        permanentAbilities: [
          {
            name: "紅蓮の炎熱",
            act: function (skillUser) {
              for (const monster of parties[skillUser.enemyTeamID]) {
                applyBuff(monster, { fireResistance: { strength: -1 } });
              }
            },
          },
        ],
      },
    },
    voruka: {
      deathAbilities: [
        {
          name: "最後に祝福",
          isOneTimeUse: true,
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              applyBuff(monster, { continuousHealing: { removeAtTurnStart: true, duration: 3 } });
            }
          },
        },
      ],
    },
    world: {
      initialAbilities: [
        {
          name: "反撃ののろし",
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              monster.abilities.additionalDeathAbilities.push({
                name: "反撃ののろしダメージバフ",
                message: function (skillUser) {
                  displayMessage(`${skillUser.name} がチカラつき`, "反撃ののろし の効果が発動！");
                },
                act: async function (skillUser) {
                  for (const monster of parties[skillUser.teamID]) {
                    //直接挿入
                    if (!monster.buffs.worldBuff) {
                      monster.buffs.worldBuff = { keepOnDeath: true, strength: 0.05 };
                    } else if (monster.buffs.worldBuff.strength === 0.05) {
                      monster.buffs.worldBuff.strength = 0.1;
                    } else {
                      monster.buffs.worldBuff.strength = 0.15;
                    }
                    if (!monster.flags.isDead) {
                      displayMessage(`${monster.name}の`, "与えるダメージが 上がった！");
                      updateMonsterBuffsDisplay(monster);
                      await sleep(150);
                    }
                  }
                },
              });
            }
          },
        },
      ],
      deathAbilities: [
        {
          name: "反撃ののろし回復",
          isOneTimeUse: true,
          message: function (skillUser) {
            displayMessage(`${skillUser.name}が チカラつき`, "反撃ののろしがあがった！");
          },
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              applyBuff(monster, { continuousHealing: { removeAtTurnStart: true, duration: 3 } });
            }
          },
        },
      ],
    },
    nerugeru: {
      initialAbilities: [
        {
          act: function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.id !== skillUser.id && monster.skill[3] !== "プチ神のはどう") {
                monster.skill[3] = "供物をささげる";
              }
            }
          },
        },
      ],
      supportAbilities: {
        evenTurnAbilities: [
          {
            name: "死の化身",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
      },
      afterActionAbilities: [
        {
          name: "冥王の構え付与",
          message: function (skillUser) {
            displayMessage(`${skillUser.name}の特性により`, "冥王の構え が発動！");
          },
          unavailableIf: (skillUser, executingSkill, executedSkills) => !executingSkill || executingSkill.type !== "slash",
          act: async function (skillUser, executingSkill) {
            await executeSkill(skillUser, findSkillByName("冥王の構え"));
          },
        },
      ],
    },
    erugi: {
      initialAttackAbilities: [
        {
          name: "天使のしるし付与",
          act: function (skillUser) {
            for (const monster of parties[skillUser.enemyTeamID]) {
              applyBuff(monster, { angelMark: { keepOnDeath: true } });
            }
          },
        },
      ],
      supportAbilities: {
        permanentAbilities: [
          {
            name: "堕天の化身",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
      },
    },
    ifshiba: {
      tagTransformationAct: async function (monster, buffName) {
        if (buffName === "幻獣のタッグ") {
          if (Math.random() < 0.5) {
            applyBuff(monster, { slashReflection: { strength: 1, removeAtTurnStart: true, duration: 1, name: "幻獣のタッグ反射" } });
          } else {
            applyBuff(monster, { spellReflection: { strength: 1, removeAtTurnStart: true, duration: 1, name: "幻獣のタッグ反射" } });
          }
        }
      },
      followingAbilities: {
        name: "双璧の幻獣・改",
        availableIf: (executingSkill) => executingSkill.element === "fire" || executingSkill.element === "ice",
        followingSkillName: (executingSkill) => {
          if (executingSkill.element === "fire") return "アイスエイジ";
          if (executingSkill.element === "ice") return "地獄の火炎";
        },
      },
    },
    skull: {
      initialAttackAbilities: [
        {
          name: "亡者の執念",
          act: function (skillUser) {
            skillUser.flags.zombieProbability = 1;
          },
        },
      ],
    },
    omudo: {
      supportAbilities: {
        2: [
          {
            message: function (skillUser) {
              displayMessage(`${skillUser.name}の`, "まわりの時間が巻き戻る！");
            },
            act: function (skillUser) {
              applyDamage(skillUser, skillUser.defaultStatus.HP, -1);
            },
          },
        ],
        permanentAbilities: [
          {
            name: "遡る時",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
        evenTurnAbilities: [
          {
            name: "偶数ラウンドリバース",
            message: function (skillUser) {
              displayMessage(`${skillUser.name}の特性により`, "リバースが 発動！");
            },
            act: function (skillUser) {
              displayMessage("全員の 行動順と素早さが", "逆転した！");
              fieldState.isReverse = true;
              adjustFieldStateDisplay();
            },
          },
        ],
      },
      attackAbilities: {
        permanentAbilities: [
          {
            name: "オムド変身",
            disableMessage: true,
            isOneTimeUse: true,
            unavailableIf: (skillUser) => !skillUser.flags.willTransformOmudo || skillUser.flags.hasTransformed,
            act: async function (skillUser) {
              delete skillUser.flags.willTransformOmudo;
              await transformTyoma(skillUser);
            },
          },
        ],
      },
    },
    rapu: {
      supportAbilities: {
        permanentAbilities: [
          {
            name: "混沌の化身",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
      },
      attackAbilities: {
        permanentAbilities: [
          {
            name: "ラプ変身",
            disableMessage: true,
            unavailableIf: (skillUser) => {
              // turnNum管理で直前のtargetのみを指定、支配更新による旧flag削除がラプ死亡により行われなくてもそれは対象にしない
              const previousTarget = parties[skillUser.enemyTeamID].find((member) => member.flags.rapuFlag === fieldState.turnNum);
              if (skillUser.flags.hasTransformed) {
                return true;
              } else if (previousTarget && previousTarget.flags.isDead) {
                //未変身かつ対象が死亡していたら変身処理へ
                return false;
              } else {
                return true;
              }
            },
            act: async function (skillUser) {
              await transformTyoma(skillUser);
            },
          },
          {
            name: "暗黒神の支配",
            act: async function (skillUser) {
              // 一応既存のflagをすべて削除
              for (const party of parties) {
                for (const monster of party) {
                  delete monster.flags.rapuFlag;
                }
              }
              // デバフ付与: 自動解除  flag付与: 判定される次ターンを格納
              const aliveEnemies = parties[skillUser.enemyTeamID].filter((member) => !member.flags.isDead);
              const newTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
              //TODO: newTargetが存在しない=全滅時にはerror
              applyBuff(newTarget, { controlOfRapu: { keepOnDeath: true, removeAtTurnStart: true, duration: 1 } });
              newTarget.flags.rapuFlag = fieldState.turnNum + 1;
            },
          },
        ],
      },
    },
    esta: {
      supportAbilities: {
        evenTurnAbilities: [
          {
            act: async function (skillUser) {
              applyHeal(skillUser, skillUser.defaultStatus.HP * 0.4);
              await sleep(400);
              applyHeal(skillUser, skillUser.defaultStatus.MP * 0.13, true);
            },
          },
        ],
      },
    },
    dhuran: {
      supportAbilities: {
        1: [
          {
            name: "強者のいげん",
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  applyBuff(monster, { martialBarrier: { strength: 1 }, slashBarrier: { strength: 1 } });
                } else {
                  displayMiss(monster);
                }
              }
            },
          },
        ],
      },
    },
    tanisu: {
      supportAbilities: {
        1: [
          {
            name: "一族のいかり",
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  monster.abilities.additionalDeathAbilities.push({
                    name: "一族のいかり",
                    message: function (skillUser) {
                      displayMessage(`${skillUser.name} がチカラつき`, "一族のいかり の効果が発動！");
                    },
                    act: async function (skillUser) {
                      for (const monster of parties[skillUser.teamID]) {
                        if (monster.race === "悪魔") {
                          applyBuff(monster, { baiki: { strength: 1 }, defUp: { strength: 1 }, spdUp: { strength: 1 }, intUp: { strength: 1 } });
                        } else {
                          displayMiss(skillUser);
                        }
                      }
                    },
                  });
                } else {
                  displayMiss(skillUser);
                }
              }
            },
          },
        ],
      },
      attackAbilities: {
        1: [
          {
            name: "禁忌の封印",
            message: function (skillUser) {
              displayMessage("特性により", "禁忌の封印 が発動！");
            },
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  // damageには自動的に、spdMultiplierには+0.5  tabooSeal所持時は0.5を引いて無効化
                  applyBuff(monster, { tabooSeal: { keepOnDeath: true }, internalSpdUp: { keepOnDeath: true, strength: 0.5 } }, false, true);
                } else {
                  displayMiss(skillUser);
                }
              }
            },
          },
        ],
      },
      afterActionAbilities: [
        {
          name: "魔の心臓",
          isOneTimeUse: true,
          unavailableIf: (skillUser, executingSkill, executedSkills) => !executingSkill || executingSkill.type !== "martial",
          act: async function (skillUser, executingSkill, executedSkills) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.race === "悪魔") {
                applyBuff(monster, { revive: { keepOnDeath: true, strength: 0.5 } });
              } else {
                displayMiss(skillUser);
              }
            }
          },
        },
        {
          name: "超回復",
          disableMessage: true,
          act: async function (skillUser, executingSkill, executedSkills) {
            applyHeal(skillUser, skillUser.defaultStatus.HP * 0.2);
          },
        },
      ],
    },
    rogos: {
      initialAbilities: [
        {
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.race === "悪魔") {
                monster.abilities.supportAbilities.additionalPermanentAbilities.push({
                  name: "偽神の威光",
                  message: function (skillUser) {
                    displayMessage("偽神の威光の", "効果が発動！");
                  },
                  unavailableIf: (skillUser, executingSkill, executedSkills) => !skillUser.buffs.hasOwnProperty("autoRadiantWave"),
                  act: async function (skillUser) {
                    executeRadiantWave(skillUser);
                  },
                });
              }
            }
          },
        },
      ],
      supportAbilities: {
        permanentAbilities: [
          {
            name: "奈落の衣",
            act: async function (skillUser) {
              if (hasAbnormality(skillUser)) {
                displayMiss(skillUser);
              } else {
                applyBuff(skillUser, { protection: { removeAtTurnStart: true, divineDispellable: true, strength: 0.5, duration: 1 } });
              }
            },
          },
        ],
      },
    },
    magesu: {
      supportAbilities: {
        1: [
          {
            name: "道化の舞踏",
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  applyBuff(monster, { lightResistance: { strength: 1 } });
                } else {
                  displayMiss(monster);
                }
              }
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  applyBuff(monster, { dodgeBuff: { strength: 0.5 } });
                } else {
                  displayMiss(monster);
                }
              }
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  applyBuff(monster, { intUp: { strength: 1 } });
                } else {
                  displayMiss(monster);
                }
              }
            },
          },
          {
            name: "デビルバーハ",
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  applyBuff(monster, { breathBarrier: { strength: 2 } });
                } else {
                  displayMiss(monster);
                }
              }
            },
          },
        ],
      },
      deathAbilities: [
        {
          name: "道化のさいご",
          isOneTimeUse: true,
          act: async function (skillUser) {
            for (const monster of parties[skillUser.enemyTeamID]) {
              applyBuff(monster, { spellBarrier: { strength: -1, probability: 0.55 } });
            }
          },
        },
      ],
    },
    tseru: {
      supportAbilities: {
        1: [
          {
            name: "魔女のベール",
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.race === "悪魔") {
                  applyBuff(monster, { slashBarrier: { strength: 1 }, paralyzeBarrier: { duration: 3 } });
                } else {
                  displayMiss(monster);
                }
              }
            },
          },
        ],
      },
      followingAbilities: {
        name: "悪魔衆の踊り",
        availableIf: (executingSkill) => executingSkill.type === "dance",
        followingSkillName: (executingSkill) => {
          return "ディバインフェザー";
        },
      },
    },
    mudo: {
      counterAbilities: [
        {
          name: "ねむりボディ",
          act: async function (skillUser, counterTarget) {
            applyBuff(counterTarget, { asleep: { probability: 0.562 } }, skillUser);
          },
        },
      ],
    },
    jaha: {
      reviveAct: async function (monster, buffName) {
        if (buffName === "復讐の闘志") {
          applyBuff(monster, { baiki: { strength: 1 }, defUp: { strength: 1 }, spdUp: { strength: 1 }, intUp: { strength: 1 } });
          if (Math.random() < 0.72) {
            applyBuff(monster, { revive: { keepOnDeath: true, divineDispellable: true, strength: 1, act: "復讐の闘志" } });
          }
        }
      },
    },
    rizu: {
      initialAbilities: [
        {
          name: "悪魔衆の氷雪",
          act: async function (skillUser) {
            if (hasEnoughMonstersOfType(parties[skillUser.teamID], "悪魔", 4)) {
              applyBuff(skillUser, { iceBreak: { keepOnDeath: true, strength: 1 }, rizuIceBuff: { duration: 3 } });
            }
          },
        },
      ],
    },
    gorago: {
      initialAbilities: [
        {
          name: "一族のほこり",
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.race === "魔獣") {
                applyBuff(monster, { goragoAtk: { strength: 0.15, divineDispellable: true } });
                applyBuff(monster, { goragoSpd: { strength: 0.15, divineDispellable: true } });
              }
            }
          },
        },
      ],
      supportAbilities: {
        1: [
          {
            name: "孤高の獣",
            act: async function (skillUser) {
              for (const monster of parties[skillUser.teamID]) {
                if (monster.monsterId === skillUser.monsterId) {
                  continue;
                } else if (monster.race === "魔獣") {
                  monster.abilities.additionalDeathAbilities.push({
                    name: "孤高の獣発動",
                    isOneTimeUse: true,
                    message: function (skillUser) {
                      displayMessage(`${skillUser.name} がチカラつき`, "孤高の獣 の効果が発動！");
                    },
                    unavailableIf: (skillUser) => parties[skillUser.teamID].find((monster) => monster.name === "ヘルゴラゴ" && !monster.flags.isDead && !monster.flags.isZombie) === undefined,
                    act: async function (skillUser) {
                      const helgoragos = parties[skillUser.teamID].filter((monster) => monster.name === "ヘルゴラゴ" && !monster.flags.isDead && !monster.flags.isZombie);
                      for (const helgorago of helgoragos) {
                        if (!helgorago.buffs.powerCharge) {
                          applyBuff(helgorago, { powerCharge: { strength: 1.5 } });
                        } else {
                          const newStrength = Math.min(helgorago.buffs.powerCharge.strength + 0.5, 3);
                          applyBuff(helgorago, { powerCharge: { strength: newStrength } });
                        }
                      }
                    },
                  });
                } else {
                  displayMiss(skillUser);
                }
              }
            },
          },
        ],
        permanentAbilities: [
          {
            name: "孤高の獣ぴかぱ",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
      },
    },
    tenkai: {
      initialAbilities: [
        {
          name: "獣衆の保護踊り",
          disableMessage: true,
          act: async function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              if (monster.race === "魔獣") {
                monster.attribute.additionalPermanentBuffs.danceEvasion = { unDispellable: true, duration: 0 };
              }
            }
          },
        },
      ],
    },
    reopa: {
      supportAbilities: {
        permanentAbilities: [
          {
            name: "自然治癒",
            disableMessage: true,
            act: function (skillUser) {
              executeRadiantWave(skillUser);
            },
          },
        ],
      },
    },
  };

  return monsterAbilities[monsterId] || {};
}

const skill = [
  {
    name: "sample",
    id: "number?",
    type: "", //spell slash martial breath ritual notskill
    howToCalculate: "", //atk int fix def spd
    ratio: 1,
    damage: 142,
    minInt: 500,
    minIntDamage: 222,
    maxInt: 1000,
    maxIntDamage: 310,
    skillPlus: 1.15,
    element: "", //fire ice thunder io wind light dark
    targetType: "", //single random all self field dead
    targetTeam: "enemy", //ally enemy
    excludeTarget: "self",
    hitNum: 3,
    MPcost: 76,
    order: "", //preemptive anchor
    preemptiveGroup: 3, //1封印の霧,邪神召喚,error 2マイバリ精霊タップ 3におう 4みがわり 5予測構え 6ぼうぎょ 7全体 8random単体
    isOneTimeUse: true,
    skipDeathCheck: true, // 死亡時 isDeadでも常に実行
    isCounterSkill: true, // 反撃 isDeadでは実行しない　両方ともskipThisTurnは無視
    skipSkillSealCheck: true,
    weakness18: true,
    criticalHitProbability: 1, //noSpellSurgeはリスト管理
    RaceBane: ["スライム", "ドラゴン"],
    RaceBaneValue: 3,
    anchorBonus: 3,
    damageByLevel: true,
    SubstituteBreaker: 3,
    ignoreProtection: true,
    ignoreReflection: true,
    ignoreSubstitute: true,
    ignoreGuard: true,
    ignoreEvasion: true,
    ignoreTypeEvasion: true,
    ignoreDazzle: true,
    penetrateStoned: true,
    ignoreBaiki: true,
    ignoreManaBoost: true,
    ignorePowerCharge: true,
    damageByHpPercent: true,
    specialMessage: function (skillUserName, skillName) {
      displayMessage(`${skillUserName}は闇に身をささげた！`);
    },
    followingSkill: "涼風一陣後半",
    appliedEffect: { defUp: { strength: -1 } }, //radiantWave divineWave disruptiveWave
    zakiProbability: 0.78,
    act: function (skillUser, skillTarget) {
      console.log("hoge");
    },
    alwaysAct: true,
    afterActionAct: async function (skillUser) {
      console.log("hoge"); //missとかにかかわらず、一回だけ実行するact 死亡していても実行
    },
    selfAppliedEffect: async function (skillUser) {
      console.log("hoge"); //missとかにかかわらず、一回だけ実行するact
    },
    damageModifier: function (skillUser, skillTarget) {
      return Math.pow(1.6, power) - 1;
    },
    unavailableIf: (skillUser) => skillUser.flags.isSubstituting,
  },
  {
    name: "通常攻撃",
    type: "notskill",
    howToCalculate: "atk",
    ratio: 1,
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
  },
  {
    name: "通常攻撃ザキ攻撃",
    type: "notskill",
    howToCalculate: "atk",
    ratio: 1,
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
    zakiProbability: 0.6,
  },
  {
    name: "昇天槍",
    type: "notskill",
    howToCalculate: "atk",
    ratio: 1,
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
    followingSkill: "昇天槍昇天部分",
  },
  {
    name: "昇天槍昇天部分",
    type: "notskill",
    howToCalculate: "none",
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
    ignoreReflection: true,
    act: function (skillUser, skillTarget) {
      ascension(skillTarget);
    },
  },
  {
    name: "心砕き",
    type: "notskill",
    howToCalculate: "atk",
    ratio: 0.33,
    element: "notskill",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 3,
    MPcost: 0,
    act: function (skillUser, skillTarget) {
      if (skillTarget.buffs.isUnbreakable && !skillTarget.buffs.isUnbreakable.isToukon && !skillTarget.flags.isZombie) {
        //防壁などによる失敗はないので、通常攻撃成功時はactも100%実行
        displayMessage("そうびの特性により", "くじけぬ心が ゆらいだ！");
        skillTarget.buffs.isUnbreakable.left = 1;
        skillTarget.buffs.isUnbreakable.isToukon = true;
        skillTarget.buffs.isUnbreakable.isBroken = true;
        updateMonsterBuffsDisplay(skillTarget);
      }
    },
  },
  {
    name: "はやぶさ攻撃弱",
    type: "notskill",
    howToCalculate: "atk",
    ratio: 0.55,
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    hitNum: 2,
    MPcost: 0,
  },
  {
    name: "会心通常攻撃",
    type: "notskill",
    howToCalculate: "atk",
    ratio: 1,
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
    criticalHitProbability: 1,
  },
  {
    name: "魔獣の追撃",
    type: "notskill",
    howToCalculate: "spd",
    ratio: 0.6,
    element: "notskill",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
  },
  {
    name: "ぼうぎょ",
    type: "notskill",
    howToCalculate: "none",
    element: "notskill",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 0,
    order: "preemptive",
    preemptiveGroup: 6,
    act: function (skillUser, skillTarget) {
      skillUser.flags.guard = true;
    },
  },
  {
    name: "涼風一陣",
    type: "martial",
    howToCalculate: "fix",
    damage: 142,
    element: "ice",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 96,
    followingSkill: "涼風一陣後半",
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "涼風一陣後半",
    type: "breath",
    howToCalculate: "fix",
    damage: 420,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    ignoreProtection: true,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "神楽の術",
    type: "spell",
    howToCalculate: "int",
    minInt: 500,
    minIntDamage: 222,
    maxInt: 1000,
    maxIntDamage: 310,
    skillPlus: 1.15,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 65,
    SubstituteBreaker: 3,
    appliedEffect: "divineWave",
  },
  {
    name: "昇天斬り",
    type: "slash",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 35,
    appliedEffect: { zombifyBlock: { dispellableByRadiantWave: true, removeAtTurnStart: true, duration: 1 } },
    act: function (skillUser, skillTarget) {
      ascension(skillTarget);
    },
    followingSkill: "昇天斬り後半",
  },
  {
    name: "昇天斬り後半",
    type: "slash",
    howToCalculate: "atk",
    ratio: 1.74,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
  },
  {
    name: "タップダンス",
    type: "dance",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 30,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { dodgeBuff: { strength: 0.5 } },
  },
  {
    name: "氷華大繚乱",
    type: "slash",
    howToCalculate: "atk",
    ratio: 0.9,
    element: "ice",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 65,
    ignoreReflection: true,
    appliedEffect: { iceResistance: { strength: -1, probability: 0.57 } },
  },
  {
    name: "フローズンシャワー",
    type: "martial",
    howToCalculate: "fix",
    damage: 190,
    element: "ice",
    targetType: "single",
    targetTeam: "enemy",
    hitNum: 7,
    MPcost: 70,
    order: "anchor",
    ignoreProtection: true,
    ignoreReflection: true,
  },
  {
    name: "おぞましいおたけび",
    type: "martial",
    howToCalculate: "atk",
    ratio: 1.4,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 65,
    criticalHitProbability: 0,
    ignoreDazzle: true,
    ignoreBaiki: true,
    appliedEffect: { fear: { probability: 0.57 }, confused: { probability: 0.57 } },
  },
  {
    name: "スパークふんしゃ",
    type: "breath",
    howToCalculate: "fix",
    damage: 230,
    element: "thunder",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 58,
    appliedEffect: "disruptiveWave",
  },
  {
    name: "天空竜の息吹",
    type: "breath",
    howToCalculate: "fix",
    damage: 184,
    element: "light",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 48,
    ignoreProtection: true,
  },
  {
    name: "エンドブレス",
    type: "breath",
    howToCalculate: "fix",
    damage: 100,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 524,
    ignoreReflection: true,
    ignoreSubstitute: true,
    ignoreGuard: true,
    damageModifier: function (skillUser, skillTarget) {
      const power = skillUser.buffs.dragonPreemptiveAction?.strength ?? 0;
      return Math.pow(1.6, power) - 1;
    },
    afterActionAct: async function (skillUser) {
      delete skillUser.buffs.dragonPreemptiveAction;
    },
  },
  {
    name: "テンペストブレス",
    type: "breath",
    howToCalculate: "fix",
    damage: 369,
    element: "wind",
    targetType: "single",
    targetTeam: "enemy",
    hitNum: 3,
    MPcost: 47,
  },
  {
    name: "煉獄火炎",
    type: "breath",
    howToCalculate: "fix",
    damage: 333,
    element: "fire",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 136,
    appliedEffect: { fear: { probability: 0.213 } },
  },
  {
    name: "むらくもの息吹",
    type: "breath",
    howToCalculate: "fix",
    damage: 140,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 70,
    appliedEffect: { murakumo: { dispellableByRadiantWave: true, duration: 3 } },
  },
  {
    name: "獄炎の息吹",
    type: "breath",
    howToCalculate: "fix",
    damage: 230,
    element: "fire",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 60,
    weakness18: true,
  },
  {
    name: "ほとばしる暗闇",
    type: "martial",
    howToCalculate: "fix",
    damage: 162,
    element: "dark",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 82,
    damageByLevel: true,
    appliedEffect: "disruptiveWave",
    act: function (skillUser, skillTarget) {
      delete skillTarget.buffs.powerCharge;
      delete skillTarget.buffs.manaBoost;
      delete skillTarget.buffs.breathCharge;
    },
  },
  {
    name: "ダイヤモンドダスト",
    type: "breath",
    howToCalculate: "fix",
    damage: 215,
    element: "ice",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 64,
    appliedEffect: { asleep: { probability: 0.58 } },
  },
  {
    name: "防刃の守り",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 54,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { slashBarrier: { strength: 1 }, protection: { strength: 0.2, duration: 2, removeAtTurnStart: true } },
  },
  {
    name: "ラヴァフレア",
    type: "breath",
    howToCalculate: "fix",
    damage: 243,
    element: "fire",
    targetType: "single",
    targetTeam: "enemy",
    order: "anchor",
    hitNum: 3,
    MPcost: 76,
    anchorBonus: 3,
    ignoreProtection: true,
  },
  {
    name: "におうだち",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 14,
    order: "preemptive",
    preemptiveGroup: 3,
    act: function (skillUser, skillTarget) {
      applySubstitute(skillUser, skillTarget, true);
    },
  },
  {
    name: "大樹の守り",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 79,
    order: "preemptive",
    preemptiveGroup: 2,
    isOneTimeUse: true,
    appliedEffect: { protection: { strength: 0.5, duration: 2, removeAtTurnStart: true } },
  },
  {
    name: "みがわり",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "ally",
    excludeTarget: "self",
    MPcost: 5,
    order: "preemptive",
    preemptiveGroup: 4,
    act: function (skillUser, skillTarget) {
      applySubstitute(skillUser, skillTarget);
    },
  },
  {
    name: "超魔滅光",
    type: "martial",
    howToCalculate: "fix",
    damage: 475,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 78,
    RaceBane: ["???", "超魔王"],
    RaceBaneValue: 4,
    damageByLevel: true,
    followingSkill: "超魔滅光後半",
  },
  {
    name: "超魔滅光後半",
    type: "martial",
    howToCalculate: "fix",
    damage: 200,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    RaceBane: ["???", "超魔王"],
    RaceBaneValue: 4,
    damageByLevel: true,
  },
  {
    name: "真・ゆうきの斬舞",
    type: "dance",
    howToCalculate: "atk",
    ratio: 0.91,
    element: "light",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 71,
    order: "preemptive",
    preemptiveGroup: 8,
    criticalHitProbability: 0,
    ignoreDazzle: true,
    selfAppliedEffect: async function (skillUser) {
      await sleep(150);
      applyBuff(skillUser, { baiki: { strength: 1 }, spdUp: { strength: 1 } });
    },
  },
  {
    name: "神獣の封印",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 34,
    isOneTimeUse: true,
    ignoreReflection: true,
    ignoreTypeEvasion: true,
    appliedEffect: { sealed: {} },
  },
  {
    name: "ソウルハーベスト",
    type: "slash",
    howToCalculate: "atk",
    ratio: 0.9,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 9,
    MPcost: 58,
    ignoreReflection: true,
    appliedEffect: { reviveBlock: { duration: 1 } },
  },
  {
    name: "黄泉の封印",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 39,
    isOneTimeUse: true,
    appliedEffect: { sealed: {}, reviveBlock: { unDispellableByRadiantWave: true } },
  },
  {
    name: "暗黒閃",
    type: "slash",
    howToCalculate: "atk",
    ratio: 3.6,
    element: "dark",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 43,
    order: "preemptive",
    preemptiveGroup: 8,
    ignoreEvasion: true,
  },
  {
    name: "冥王の奪命鎌",
    type: "slash",
    howToCalculate: "atk",
    ratio: 1.12,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 52,
    SubstituteBreaker: 3,
    ignoreEvasion: true,
    zakiProbability: 0.78,
  },
  {
    name: "終の流星",
    type: "martial",
    howToCalculate: "fix",
    damage: 580,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 79,
    order: "anchor",
    ignoreProtection: true,
    ignoreReflection: true,
  },
  {
    name: "暴獣の右ウデ",
    type: "martial",
    howToCalculate: "fix",
    damage: 380,
    element: "dark",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 4,
    MPcost: 54,
    appliedEffect: "divineWave",
    followingSkill: "暴獣の右ウデ後半",
  },
  {
    name: "暴獣の右ウデ後半",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 0,
    appliedEffect: { martialEvasion: { duration: 2 } },
  },
  {
    name: "供物をささげる",
    type: "ritual",
    howToCalculate: "none",
    element: "none",
    targetType: "field",
    targetTeam: "ally",
    MPcost: 0,
    specialMessage: function (skillUserName, skillName) {
      displayMessage(`${skillUserName}は闇に身をささげた！`);
    },
    act: function (skillUser, skillTarget) {
      // skipDeathAbilityを付与してhandleDeath
      handleDeath(skillUser, true, true);
      skillUser.skill[3] = skillUser.defaultSkill[3];
    },
    followingSkill: "供物をささげる死亡",
  },
  {
    name: "供物をささげる死亡",
    type: "ritual",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 0,
    skipDeathCheck: true,
    act: async function (skillUser, skillTarget) {
      const nerugeru = parties[skillUser.teamID].find((member) => member.id === "nerugeru");
      if (!nerugeru.flags.isDead && !nerugeru.flags.hasTransformed) {
        delete nerugeru.buffs.reviveBlock;
        delete nerugeru.buffs.poisonDepth;
        // skipDeathAbilityを付与してhandleDeath
        handleDeath(nerugeru, true, true);
        //生存かつ未変身かつここでリザオ等せずにしっかり死亡した場合、変身許可
        if (nerugeru.flags.isDead) {
          nerugeru.flags.willTransform = true;
        }
      }
    },
    followingSkill: "供物をささげる変身",
  },
  {
    name: "供物をささげる変身",
    type: "ritual",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 0,
    skipDeathCheck: true,
    act: async function (skillUser, skillTarget) {
      const nerugeru = parties[skillUser.teamID].find((member) => member.id === "nerugeru");
      if (nerugeru.flags.willTransform) {
        delete nerugeru.flags.willTransform;
        for (const monster of parties[skillUser.teamID]) {
          monster.skill[3] = monster.defaultSkill[3];
        }
        await sleep(200);
        delete nerugeru.flags.isDead;
        nerugeru.currentStatus.HP = nerugeru.defaultStatus.HP;
        updateMonsterBar(nerugeru);
        updateBattleIcons(nerugeru);
        await transformTyoma(nerugeru);
      }
    },
  },
  {
    name: "冥王の構え",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    order: "preemptive",
    preemptiveGroup: 5,
    MPcost: 22,
    specialMessage: function (skillUserName, skillName) {
      displayMessage(`${skillUserName}は`, "攻撃に対して 反撃する状態になった！");
    },
    appliedEffect: { counterAttack: { keepOnDeath: true, decreaseTurnEnd: true, duration: 1 } },
    act: function (skillUser, skillTarget) {
      skillUser.abilities.additionalCounterAbilities.push({
        name: "冥王の構え反撃状態",
        unavailableIf: (skillUser) => !skillUser.buffs.counterAttack,
        act: async function (skillUser, counterTarget) {
          await executeSkill(skillUser, findSkillByName("冥王の構え反撃"), counterTarget);
        },
      });
    },
  },
  {
    name: "冥王の構え反撃",
    type: "slash",
    howToCalculate: "fix",
    damage: 50,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 0,
    ignoreReflection: true,
    ignoreSubstitute: true,
    ignoreEvasion: true,
    isCounterSkill: true,
    specialMessage: function (skillUserName, skillName) {
      displayMessage(`${skillUserName}の 反撃！`);
    },
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "失望の光舞",
    type: "dance",
    howToCalculate: "fix",
    damage: 210,
    element: "light",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 65,
    appliedEffect: "disruptiveWave",
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "絶望の天舞",
    type: "dance",
    howToCalculate: "fix",
    damage: 210,
    element: "light",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 75,
    appliedEffect: "divineWave",
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "パニッシュスパーク",
    type: "martial",
    howToCalculate: "fix",
    damage: 310,
    element: "thunder",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 92,
    appliedEffect: "divineWave",
    followingSkill: "パニッシュスパーク後半",
  },
  {
    name: "パニッシュスパーク後半",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    appliedEffect: { slashSeal: {} },
  },
  {
    name: "堕天使の理",
    type: "dance",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 50,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { dodgeBuff: { strength: 1 }, spdUp: { strength: 1 } },
  },
  {
    name: "光速の連打",
    type: "dance",
    howToCalculate: "atk",
    ratio: 0.9,
    element: "light",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 51,
    ignoreEvasion: true,
    appliedEffect: { lightResistance: { strength: -1, probability: 0.57 } },
  },
  {
    name: "ヘルバーナー",
    type: "martial",
    howToCalculate: "fix",
    damage: 891,
    element: "fire",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 74,
    ignoreSubstitute: true,
  },
  {
    name: "氷魔のダイヤモンド",
    type: "breath",
    howToCalculate: "fix",
    damage: 891,
    element: "ice",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 74,
    ignoreSubstitute: true,
  },
  {
    name: "炎獣の爪",
    type: "slash",
    howToCalculate: "atk",
    ratio: 2.15,
    element: "fire",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 30,
    order: "preemptive",
    preemptiveGroup: 8,
    RaceBane: ["ドラゴン", "???"],
    RaceBaneValue: 2,
  },
  {
    name: "アイスエイジ",
    type: "martial",
    howToCalculate: "fix",
    damage: 230,
    element: "ice",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 0,
    appliedEffect: { martialBarrier: { strength: -1, probability: 0.387 } },
  },
  {
    name: "地獄の火炎",
    type: "breath",
    howToCalculate: "fix",
    damage: 230,
    element: "fire",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 0,
    appliedEffect: { fireResistance: { strength: -1, probability: 0.58 } },
  },
  {
    name: "プリズムヴェール",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 54,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { prismVeil: { strength: 1, duration: 3 } },
  },
  {
    name: "ルカナン",
    type: "spell",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 18,
    appliedEffect: { defUp: { strength: -1, probability: 0.2 } },
  },
  {
    name: "ザオリク",
    type: "spell",
    howToCalculate: "none",
    element: "none",
    targetType: "dead",
    targetTeam: "ally",
    MPcost: 103,
    act: async function (skillUser, skillTarget) {
      await reviveMonster(skillTarget);
    },
  },
  {
    name: "零時の儀式",
    type: "ritual",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 150,
    maxInt: 600,
    maxIntDamage: 330,
    skillPlus: 1.09,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    order: "preemptive",
    preemptiveGroup: 7,
    MPcost: 120,
    followingSkill: "零時の儀式後半",
  },
  {
    name: "零時の儀式後半",
    type: "ritual",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 0,
    appliedEffect: { spellBarrier: { strength: 1 } },
  },
  {
    name: "タイムストーム",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 130,
    maxInt: 1000,
    maxIntDamage: 218,
    skillPlus: 1.09,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 85,
    ignoreReflection: true,
    appliedEffect: { fear: { probability: 0.3647 } },
  },
  {
    name: "クロノストーム",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 140,
    maxInt: 1000,
    maxIntDamage: 244,
    skillPlus: 1,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 85,
    order: "preemptive",
    preemptiveGroup: 8,
    ignoreReflection: true,
    appliedEffect: { sealed: { probability: 0.1912 } },
  },
  {
    name: "エレメントエラー",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "field",
    targetTeam: "ally",
    order: "preemptive",
    preemptiveGroup: 1,
    MPcost: 39,
    act: function (skillUser, skillTarget) {
      fieldState.isDistorted = true;
      adjustFieldStateDisplay();
    },
  },
  {
    name: "かくせいリバース",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "field",
    targetTeam: "ally",
    MPcost: 60,
    order: "anchor",
    isOneTimeUse: true,
    act: function (skillUser, skillTarget) {
      fieldState.isReverse = true;
      fieldState.isPermanentReverse = true;
      adjustFieldStateDisplay();
      applyBuff(skillUser, { powerCharge: { strength: 1.5 }, manaBoost: { strength: 1.5 } });
    },
  },
  {
    name: "永劫の闇冥",
    type: "martial",
    howToCalculate: "fix",
    damage: 310,
    element: "dark",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 75,
    weakness18: true,
    appliedEffect: { healBlock: {} },
  },
  {
    name: "呪いの儀式",
    type: "ritual",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 150,
    maxInt: 600,
    maxIntDamage: 330,
    skillPlus: 1.09,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 90,
    appliedEffect: { statusLock: { probability: 0.7 } },
  },
  {
    name: "はめつの流星",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 95,
    maxInt: 1000,
    maxIntDamage: 230,
    skillPlus: 1.15,
    element: "io",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 88,
    damageByHpPercent: true,
  },
  {
    name: "暗黒神の連撃",
    type: "martial",
    howToCalculate: "fix",
    damage: 324,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    hitNum: 3,
    MPcost: 80,
    order: "anchor",
    anchorBonus: 3,
    damageByLevel: true,
  },
  {
    name: "真・神々の怒り",
    type: "martial",
    howToCalculate: "fix",
    damage: 676,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 65,
    RaceBane: ["???"],
    RaceBaneValue: 0.333,
    ignoreReflection: true,
    damageByLevel: true,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "爆炎の儀式",
    type: "ritual",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 225,
    maxInt: 600,
    maxIntDamage: 365,
    skillPlus: 1,
    element: "io",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 65,
    weakness18: true,
  },
  {
    name: "真・闇の結界",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    order: "preemptive",
    preemptiveGroup: 5,
    MPcost: 38,
    appliedEffect: { slashReflection: { strength: 1, duration: 1, removeAtTurnStart: true, isKanta: true }, martialReflection: { strength: 1, duration: 1, removeAtTurnStart: true } },
  },
  {
    name: "必殺の双撃",
    type: "slash",
    howToCalculate: "atk",
    ratio: 4.6,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 100,
    ignoreSubstitute: true,
    ignoreEvasion: true,
    ignoreTypeEvasion: true,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
    followingSkill: "必殺の双撃後半",
  },
  {
    name: "必殺の双撃後半",
    type: "slash",
    howToCalculate: "atk",
    ratio: 4.6,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 100,
    ignoreSubstitute: true,
    ignoreEvasion: true,
    ignoreTypeEvasion: true,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "帝王のかまえ",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    order: "preemptive",
    preemptiveGroup: 5,
    MPcost: 37,
    appliedEffect: {
      powerCharge: { strength: 2, duration: 3 },
      slashReflection: { strength: 1, duration: 2, removeAtTurnStart: true, isKanta: true },
      spellReflection: { strength: 1, duration: 2, removeAtTurnStart: true },
      damageLimit: { strength: 200, duration: 2 },
    },
  },
  {
    name: "体砕きの斬舞",
    type: "dance",
    howToCalculate: "atk",
    ratio: 0.44,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 41,
    criticalHitProbability: 0,
    //反射特攻はcalc内で
  },
  {
    name: "アストロンゼロ",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 52,
    order: "preemptive",
    preemptiveGroup: 5,
    isOneTimeUse: true,
    appliedEffect: { stoned: { duration: 1 } },
    act: function (skillUser, skillTarget) {
      skillUser.abilities.attackAbilities.nextTurnAbilities.push({
        act: async function (skillUser) {
          displayMessage(`${skillUser.name}は 全身から`, `いてつくはどうを はなった！`);
          await sleep(100);
          await executeSkill(skillUser, findSkillByName("いてつくはどう"));
        },
      });
    },
  },
  {
    name: "衝撃波",
    type: "martial",
    howToCalculate: "atk",
    ratio: 1.24,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 38,
    order: "anchor",
    anchorBonus: 3,
    appliedEffect: { fear: { probability: 0.3287 } },
  },
  {
    name: "おおいかくす",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "ally",
    excludeTarget: "self",
    MPcost: 16,
    order: "preemptive",
    preemptiveGroup: 3,
    act: function (skillUser, skillTarget) {
      applySubstitute(skillUser, skillTarget, false, true);
    },
    unavailableIf: (skillUser) => skillUser.flags.isSubstituting,
  },
  {
    name: "闇の紋章",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 53,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { darkResistance: { strength: 2 } },
    selfAppliedEffect: async function (skillUser) {
      for (const monster of parties[skillUser.enemyTeamID]) {
        applyBuff(monster, { darkResistance: { strength: 2 } });
      }
    },
    isOneTimeUse: true,
  },
  {
    name: "物質の爆発",
    type: "martial",
    howToCalculate: "fix",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    skipDeathCheck: true,
    skipAbnormalityCheck: true,
    damage: 100,
    trigger: "death",
    ignoreBaiki: true,
    ignorePowerCharge: true,
    MPcost: 0,
  },
  {
    name: "いてつくはどう",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 42,
    appliedEffect: "disruptiveWave",
  },
  {
    name: "神のはどう",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 42,
    appliedEffect: "divineWave",
  },
  {
    name: "プチ神のはどう",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 56,
    appliedEffect: "divineWave",
  },
  {
    name: "光のはどう",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 50,
    act: function (skillUser, skillTarget) {
      executeRadiantWave(skillTarget);
    },
  },
  {
    name: "邪悪なこだま",
    type: "martial",
    howToCalculate: "int",
    ratio: 1.09,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    MPcost: 63,
    hitNum: 5,
    ignoreProtection: true,
    ignoreEvasion: true,
    ignoreDazzle: true,
  },
  {
    name: "絶氷の嵐",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 245,
    maxInt: 800,
    maxIntDamage: 434,
    skillPlus: 1.15,
    element: "ice",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 68,
    hitNum: 3,
    ignoreReflection: true,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "禁忌のかくせい",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 74,
    order: "preemptive",
    preemptiveGroup: 1,
    act: function (skillUser, skillTarget) {
      if (skillTarget.race === "悪魔" && skillUser.monsterId !== skillTarget.monsterId) {
        applyBuff(skillTarget, { powerCharge: { strength: 1.5 }, manaBoost: { strength: 1.5 }, dotDamage: { strength: 0.33 } });
      }
    },
  },
  {
    name: "邪道のかくせい",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "field",
    targetTeam: "ally",
    MPcost: 86,
    order: "preemptive",
    preemptiveGroup: 1,
    isOneTimeUse: true,
    act: function (skillUser, skillTarget) {
      if (hasEnoughMonstersOfType(parties[skillUser.teamID], "悪魔", 5)) {
        skillUser.abilities.attackAbilities.nextTurnAbilities.push({
          act: function (skillUser) {
            for (const monster of parties[skillUser.teamID]) {
              applyBuff(monster, { powerCharge: { strength: 3 }, manaBoost: { strength: 3 }, anchorAction: {} });
            }
          },
        });
      }
    },
  },
  {
    name: "無双のつるぎ",
    type: "slash",
    howToCalculate: "fix",
    damage: 1300,
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 78,
    ignoreEvasion: true,
    followingSkill: "無双のつるぎ後半",
  },
  {
    name: "無双のつるぎ後半",
    type: "slash",
    howToCalculate: "atk",
    ratio: 1,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    ignoreEvasion: true,
    ignoreReflection: true,
  },
  {
    name: "瞬撃",
    type: "martial",
    howToCalculate: "atk",
    ratio: 1.08,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 68,
    ignoreReflection: true,
    ignoreEvasion: true,
    appliedEffect: "divineWave",
  },
  {
    name: "カタストロフ",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 162,
    maxInt: 1000,
    maxIntDamage: 290,
    skillPlus: 1.15,
    element: "dark",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 92,
    appliedEffect: "divineWave",
  },
  {
    name: "らいてい弾",
    type: "martial",
    howToCalculate: "fix",
    damage: 270,
    element: "thunder",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 44,
  },
  {
    name: "ラストストーム",
    type: "slash",
    howToCalculate: "atk",
    ratio: 2.2,
    element: "wind",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 91,
    order: "anchor",
    ignoreSubstitute: true,
    ignoreEvasion: true,
    appliedEffect: { statusLock: {}, paralyzed: { probability: 0.58 } },
  },
  {
    name: "陰惨な暗闇",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 54,
    maxInt: 600,
    maxIntDamage: 164,
    skillPlus: 1.15,
    element: "dark",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 54,
    appliedEffect: { darkResistance: { strength: -1, probability: 0.57 } },
  },
  {
    name: "メゾラゴン",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 110,
    maxInt: 500,
    maxIntDamage: 300,
    skillPlus: 1.15,
    element: "fire",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 72,
    followingSkill: "メゾラゴン後半",
  },
  {
    name: "メゾラゴン後半",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 105,
    maxInt: 600,
    maxIntDamage: 240,
    skillPlus: 1.15,
    element: "thunder",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
  },
  {
    name: "メラゾロス",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 110,
    maxInt: 500,
    maxIntDamage: 300,
    skillPlus: 1.15,
    element: "fire",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 72,
    followingSkill: "メラゾロス後半",
  },
  {
    name: "メラゾロス後半",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 90,
    maxInt: 500,
    maxIntDamage: 200,
    skillPlus: 1.15,
    element: "wind",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
  },
  {
    name: "蠱惑の舞い",
    type: "dance",
    howToCalculate: "fix",
    damage: 280,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 98,
    SubstituteBreaker: 3,
    appliedEffect: { confused: { probability: 0.377 } },
  },
  {
    name: "宵の暴風",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 120,
    maxInt: 1000,
    maxIntDamage: 144,
    skillPlus: 1.15,
    element: "wind",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 61,
    order: "preemptive",
    preemptiveGroup: 8,
    RaceBane: ["ドラゴン"],
    RaceBaneValue: 2,
    appliedEffect: { manaReduction: { strength: 0.5, duration: 2 } },
  },
  {
    name: "妖艶イオマータ",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 50,
    maxInt: 600,
    maxIntDamage: 160,
    skillPlus: 1.15,
    element: "io",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 45,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "キャンセルステップ",
    type: "dance",
    howToCalculate: "fix",
    damage: 95,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 3,
    MPcost: 41,
    damageByLevel: true,
    appliedEffect: "disruptiveWave",
  },
  {
    name: "ディバインフェザー",
    type: "martial",
    howToCalculate: "fix",
    damage: 85,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 4,
    MPcost: 48,
    damageByLevel: true,
    appliedEffect: { spellBarrier: { strength: -2, probability: 0.33 } },
  },
  {
    name: "悪魔の息見切り",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "ally",
    MPcost: 69,
    order: "preemptive",
    preemptiveGroup: 5,
    act: function (skillUser, skillTarget) {
      if (skillTarget.race === "悪魔") {
        applyBuff(skillTarget, { breathEvasion: { duration: 1, removeAtTurnStart: true } });
      } else {
        displayMiss(target);
      }
      applyBuff(skillUser, { breathEvasion: { duration: 1, removeAtTurnStart: true } });
    },
  },
  {
    name: "秘術イオマータ",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 90,
    maxInt: 600,
    maxIntDamage: 200,
    skillPlus: 1.15,
    element: "io",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 48,
    ignoreReflection: true,
  },
  {
    name: "狂気のいあつ",
    type: "martial",
    howToCalculate: "fix",
    damage: 287,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 98,
    SubstituteBreaker: 3,
    damageByLevel: true,
    followingSkill: "狂気のいあつ魅了",
  },
  {
    name: "狂気のいあつ魅了",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    appliedEffect: { tempted: { probability: 0.39 } },
    followingSkill: "狂気のいあつルカニ",
  },
  {
    name: "狂気のいあつルカニ",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    appliedEffect: { defUp: { strength: -1, probability: 0.4 } },
  },
  {
    name: "マインドバリア",
    type: "spell",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 27,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { mindBarrier: { duration: 4 } },
  },
  {
    name: "あんこくのはばたき",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 56,
    appliedEffect: "disruptiveWave",
    followingSkill: "あんこくのはばたき後半",
  },
  {
    name: "あんこくのはばたき後半",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 0,
    appliedEffect: { spellBarrier: { strength: -1, probability: 0.55 } },
  },
  {
    name: "催眠の邪弾",
    type: "spell",
    howToCalculate: "int",
    minInt: 200,
    minIntDamage: 130,
    maxInt: 600,
    maxIntDamage: 162,
    skillPlus: 1.15,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 72,
    appliedEffect: { asleep: { probability: 0.53 } },
  },
  {
    name: "夢の世界",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 39,
    order: "preemptive",
    preemptiveGroup: 5,
    isOneTimeUse: true,
    appliedEffect: { protection: { strength: 0.9, duration: 2, removeAtTurnStart: true }, manaBoost: { strength: 2 }, asleepBreakBoost: { strength: 1, duration: 2, removeAtTurnStart: true } },
    //本来は2R行動後にブレイクは消失
  },
  {
    name: "ギラマータ",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 50,
    maxInt: 600,
    maxIntDamage: 160,
    skillPlus: 1.15,
    element: "thunder",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 38,
  },
  {
    name: "幻術のひとみ",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 48,
    order: "preemptive",
    preemptiveGroup: 8,
    appliedEffect: { asleep: { probability: 0.76 } },
  },
  {
    name: "だいぼうぎょ",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 37,
    order: "preemptive",
    preemptiveGroup: 5,
    isOneTimeUse: true,
    appliedEffect: { protection: { strength: 0.9, duration: 2, removeAtTurnStart: true } },
  },
  {
    name: "精霊の守り・強",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 84,
    order: "preemptive",
    preemptiveGroup: 2,
    appliedEffect: { protection: { strength: 0.34, duration: 2, removeAtTurnStart: true } },
  },
  {
    name: "巨岩投げ",
    type: "martial",
    howToCalculate: "fix",
    damage: 325,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 88,
    damageByHpPercent: true,
  },
  {
    name: "苛烈な暴風",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 50,
    maxInt: 600,
    maxIntDamage: 160,
    skillPlus: 1.15,
    element: "wind",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 45,
    appliedEffect: { windResistance: { strength: -1, probability: 0.57 } },
  },
  {
    name: "魔の忠臣",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 14,
    order: "preemptive",
    preemptiveGroup: 3,
    act: function (skillUser, skillTarget) {
      if (hasEnoughMonstersOfType(parties[skillUser.teamID], "悪魔", 4)) {
        applySubstitute(skillUser, skillTarget, true);
      }
    },
  },
  {
    name: "フローズンスペル",
    type: "spell",
    howToCalculate: "int",
    minInt: 100,
    minIntDamage: 50,
    maxInt: 600,
    maxIntDamage: 160,
    skillPlus: 1.15,
    element: "ice",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 54,
    appliedEffect: { fear: { element: "ice", probability: 0.7685 } },
  },
  {
    name: "氷の王国",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 53,
    ignoreReflection: true,
    ignoreSubstitute: true,
    ignoreTypeEvasion: true,
    appliedEffect: { sealed: { removeAtTurnStart: true, duration: 1, element: "ice", probability: 0.7533 } },
    selfAppliedEffect: async function (skillUser) {
      for (const monster of parties[skillUser.teamID]) {
        // skillUserを渡して使い手反映
        applyBuff(monster, { sealed: { removeAtTurnStart: true, duration: 1, element: "ice", probability: 0.7533 } }, skillUser);
      }
    },
    isOneTimeUse: true,
  },
  {
    name: "雪だるま",
    type: "martial",
    howToCalculate: "fix",
    damage: 180,
    element: "ice",
    targetType: "single",
    targetTeam: "enemy",
    MPcost: 51,
    isOneTimeUse: true,
    appliedEffect: { sealed: {} },
  },
  {
    name: "ヘブンリーブレス",
    type: "breath",
    howToCalculate: "fix",
    damage: 293,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 71,
  },
  {
    name: "裁きの極光",
    type: "martial",
    howToCalculate: "fix",
    damage: 310,
    element: "light",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 112,
    damageByLevel: true,
    appliedEffect: { fear: { probability: 0.3663 } },
  },
  {
    name: "獣王の猛撃",
    type: "slash",
    howToCalculate: "atk",
    ratio: 0.8,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 67,
    appliedEffect: "divineWave",
  },
  {
    name: "波状裂き",
    type: "slash",
    howToCalculate: "fix",
    damage: 60,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 150,
  },
  {
    name: "ツイスター",
    type: "breath",
    howToCalculate: "fix",
    damage: 250,
    element: "wind",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 72,
    appliedEffect: "divineWave",
  },
  {
    name: "浄化の風",
    type: "breath",
    howToCalculate: "fix",
    damage: 144,
    element: "wind",
    targetType: "single",
    targetTeam: "enemy",
    hitNum: 3,
    MPcost: 57,
    RaceBane: ["???", "超魔王"],
    RaceBaneValue: 4,
    ignoreProtection: true,
    appliedEffect: { reviveBlock: { duration: 1 }, zombifyBlock: { dispellableByRadiantWave: true, removeAtTurnStart: true, duration: 1 } },
  },
  {
    name: "天翔の舞い",
    type: "dance",
    howToCalculate: "spd",
    ratio: 0.2,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 11,
    MPcost: 65,
  },
  {
    name: "狂乱のやつざき",
    type: "slash",
    howToCalculate: "atk",
    ratio: 1.09,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 5,
    MPcost: 48,
    appliedEffect: { asleep: { probability: 0.25 } }, //不明
  },
  {
    name: "火葬のツメ",
    type: "slash",
    howToCalculate: "atk",
    ratio: 0.5,
    element: "fire",
    targetType: "single",
    targetTeam: "enemy",
    hitNum: 3,
    MPcost: 55,
    ignoreBaiki: true,
    criticalHitProbability: 0.75,
  },
  {
    name: "暗黒の誘い",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 55,
    appliedEffect: { tempted: { probability: 0.78 } },
  },
  {
    name: "ビーストアイ",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "field",
    targetTeam: "ally",
    MPcost: 36,
    order: "preemptive",
    preemptiveGroup: 7, //防御後
    isOneTimeUse: true,
    act: async function (skillUser, skillTarget) {
      if (hasEnoughMonstersOfType(parties[skillUser.teamID], "魔獣", 5)) {
        for (const monster of parties[skillUser.enemyTeamID]) {
          //全部削除
          delete monster.flags.isSubstituting;
          delete monster.flags.hasSubstitute;
          skillTarget.flags.thisTurn.substituteSeal = true;
          updateMonsterBuffsDisplay(monster);
          displayMessage(`${monster.name}は`, "みがわりを ふうじられた！");
          await sleep(50);
        }
      }
    },
  },
  {
    name: "無慈悲なきりさき",
    type: "slash",
    howToCalculate: "atk",
    ratio: 1,
    element: "none",
    targetType: "random",
    targetTeam: "enemy",
    hitNum: 6,
    MPcost: 48,
    ignoreEvasion: true,
    act: function (skillUser, skillTarget) {
      deleteUnbreakable(skillTarget);
    },
  },
  {
    name: "ピオリム",
    type: "spell",
    howToCalculate: "none",
    element: "none",
    targetType: "all",
    targetTeam: "ally",
    MPcost: 21,
    appliedEffect: { spdUp: { strength: 1 } },
  },
  {
    name: "天の裁き",
    type: "martial",
    howToCalculate: "fix",
    damage: 123,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 62,
    damageByLevel: true,
    act: function (skillUser, skillTarget) {
      if (Math.random() < 0.8) {
        deleteUnbreakable(skillTarget);
      }
    },
  },
  {
    name: "体技封じの息",
    type: "breath",
    howToCalculate: "fix",
    damage: 75,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 32,
    appliedEffect: { martialSeal: { probability: 0.448 } },
  },
  {
    name: "斬撃よそく",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 5,
    order: "preemptive",
    preemptiveGroup: 5,
    appliedEffect: { slashReflection: { strength: 1.5, duration: 1, removeAtTurnStart: true } },
  },
  {
    name: "体技よそく",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 5,
    order: "preemptive",
    preemptiveGroup: 5,
    appliedEffect: { martialReflection: { strength: 1.5, duration: 1, removeAtTurnStart: true } },
  },
  {
    name: "踊りよそく",
    type: "martial",
    howToCalculate: "none",
    element: "none",
    targetType: "self",
    targetTeam: "ally",
    MPcost: 5,
    order: "preemptive",
    preemptiveGroup: 5,
    appliedEffect: { danceReflection: { strength: 1.5, duration: 1, removeAtTurnStart: true } },
  },
  {
    name: "リザオラル",
    type: "spell",
    howToCalculate: "none",
    element: "none",
    targetType: "single",
    targetTeam: "ally",
    MPcost: 120,
    appliedEffect: { revive: { keepOnDeath: true, strength: 0.65 } },
  },
  {
    name: "debugbreath",
    type: "breath",
    howToCalculate: "fix",
    damage: 2000,
    element: "none",
    targetType: "all",
    targetTeam: "enemy",
    MPcost: 524,
    ignoreReflection: true,
    ignoreSubstitute: true,
    ignoreGuard: true,
  },
  {},
];

const gear = [
  {
    name: "かがやく魔神剣",
    id: "dreamSword",
    status: { HP: 0, MP: 0, atk: 60, def: 0, spd: 15, int: 0 },
    //斬撃5 ?への斬撃10 絶技8
  },
  {
    name: "系統爪",
    id: "familyNail",
    status: { HP: 0, MP: 0, atk: 0, def: 15, spd: 50, int: 0 },
    initialBuffs: { isUnbreakable: { keepOnDeath: true, left: 3, isToukon: true, name: "とうこん" }, mindBarrier: { duration: 3 }, confusionBarrier: { duration: 3 } },
  },
  {
    name: "系統爪魔獣",
    id: "familyNailBeast",
    status: { HP: 0, MP: 0, atk: 0, def: 15, spd: 50, int: 0 },
    initialBuffs: { isUnbreakable: { keepOnDeath: true, left: 3, isToukon: true, name: "とうこん" }, mindBarrier: { duration: 3 }, sleepBarrier: { duration: 3 } },
  },
  {
    name: "系統爪ザキ",
    id: "familyNailZaki",
    status: { HP: 0, MP: 0, atk: 0, def: 15, spd: 50, int: 0 },
    initialBuffs: { isUnbreakable: { keepOnDeath: true, left: 3, isToukon: true, name: "とうこん" } },
  },
  {
    name: "メタルキングの爪",
    id: "metalNail",
    status: { HP: 0, MP: 0, atk: 15, def: 0, spd: 56, int: 0 },
    initialBuffs: { metalKiller: { strength: 1.5, keepOnDeath: true } },
    alchemy: true,
  },
  {
    name: "おうごんのツメ",
    id: "goldenNail",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 53, int: 0 },
    alchemy: true,
  },
  {
    name: "源氏の小手",
    id: "genjiNail",
    status: { HP: 0, MP: 0, atk: 0, def: 10, spd: 55, int: 0 },
    //体技5 はやぶさ攻撃
  },
  {
    name: "竜神爪",
    id: "ryujinNail",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 42, int: 0 },
    alchemy: true,
  },
  {
    name: "呪われし爪",
    id: "cursedNail",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 42, int: 0 },
    alchemy: true,
  },
  {
    name: "はどうのツメ",
    id: "waveNail",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 34, int: 0 },
    initialAbilities: true,
    alchemy: true,
  },
  {
    name: "奮起のツメ",
    id: "hunkiNail",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 34, int: 0 },
    turn1buffs: { powerCharge: { strength: 1.1 } },
    alchemy: true,
  },
  {
    name: "キラーピアス",
    id: "killerEarrings",
    status: { HP: 0, MP: 0, atk: 10, def: 0, spd: 40, int: 0 },
    alchemy: true,
  },
  {
    name: "心砕き",
    id: "kudaki",
    status: { HP: 0, MP: 0, atk: 22, def: 0, spd: 15, int: 0 },
  },
  {
    name: "昇天",
    id: "shoten",
    status: { HP: 0, MP: 0, atk: 23, def: 0, spd: 0, int: 28 },
  },
  {
    name: "りゅうおうの杖",
    id: "dragonCane",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 0, int: 116 },
    initialBuffs: { revive: { strength: 1, keepOnDeath: true, unDispellable: true } },
  },
  {
    name: "魔神のかなづち",
    id: "kanazuchi",
    status: { HP: 0, MP: 0, atk: 34, def: 32, spd: 0, int: 0 },
  },
  {
    name: "天空のフルート",
    id: "flute",
    status: { HP: 0, MP: 0, atk: 30, def: 60, spd: 0, int: 0 },
    turn1buffs: { dodgeBuff: { strength: 1 } },
  },
  {
    name: "天空の衣",
    id: "heavenlyClothes",
    status: { HP: 0, MP: 0, atk: 0, def: 105, spd: 0, int: 0 },
    turn1buffs: { danceEvasion: { unDispellable: true, duration: 1, removeAtTurnStart: true } },
  },
  {
    name: "炎よけのおまもり",
    id: "fireCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    fireGearResistance: 2,
  },
  {
    name: "氷よけのおまもり",
    id: "iceCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    iceGearResistance: 2,
  },
  {
    name: "雷よけのおまもり",
    id: "thunderCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    thunderGearResistance: 2,
  },
  {
    name: "風よけのおまもり",
    id: "windCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    windGearResistance: 2,
  },
  {
    name: "爆発よけのおまもり",
    id: "ioCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    ioGearResistance: 2,
  },
  {
    name: "光よけのおまもり",
    id: "lightCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    lightGearResistance: 2,
  },
  {
    name: "闇よけのおまもり",
    id: "darkCharm",
    status: { HP: 0, MP: 0, atk: 0, def: 0, spd: 17, int: 0 },
    darkGearResistance: 2,
  },
];

// 必要ならばasyncにするのに注意
const gearAbilities = {
  waveNail: {
    initialAbilities: function (skillUser) {
      skillUser.skill[3] = "プチ神のはどう";
    },
  },
};

//画像の暗転と無効化 trueで暗転
function toggleDarkenAndClick(imgElement, enable) {
  if (enable) {
    // 画像を暗くする
    imgElement.style.filter = "brightness(40%)";
    // ポインターイベントを無効化
    imgElement.style.pointerEvents = "none";
  } else {
    // 元の明るさに戻す
    imgElement.style.filter = "brightness(100%)";
    // ポインターイベントを有効化
    imgElement.style.pointerEvents = "auto";
  }
}

function findSkillByName(skillName) {
  // グローバル変数 skill を参照して、一致するスキルを検索
  return skill.find((skill) => skill.name === skillName);
}

function displayDamage(monster, damage, resistance = 1, isMPdamage = false, reducedByElementalShield = false) {
  const monsterIcon = document.getElementById(monster.iconElementId);

  if (damage === 0 && !reducedByElementalShield) {
    if (resistance === -1) {
      // 回復でダメージが0の場合は、回復効果画像と数字0を表示
      const damageContainer = document.createElement("div");
      damageContainer.style.position = "absolute";
      damageContainer.style.display = "flex";
      damageContainer.style.top = "50%";
      damageContainer.style.left = "50%";
      damageContainer.style.transform = "translate(-50%, -50%)";
      damageContainer.style.justifyContent = "center";

      const effectImagePath = isMPdamage ? "images/systems/effectImages/MPRecovery.png" : "images/systems/effectImages/HPRecovery.png"; // MP回復かHP回復か

      const effectImage = document.createElement("img");
      effectImage.src = effectImagePath;
      effectImage.style.position = "absolute";
      effectImage.style.width = monsterIcon.offsetWidth + "px";
      effectImage.style.height = monsterIcon.offsetHeight + "px";
      effectImage.style.top = monsterIcon.offsetTop + "px";
      effectImage.style.left = monsterIcon.offsetLeft + "px";
      effectImage.style.scale = "80%";

      monsterIcon.parentElement.appendChild(effectImage);
      monsterIcon.parentElement.appendChild(damageContainer);

      const digitImage = document.createElement("img");
      digitImage.src = isMPdamage ? "images/systems/MPRecoveryNumbers/0.png" : "images/systems/HPRecoveryNumbers/0.png"; // 数字0の画像
      digitImage.style.maxWidth = "60%";
      digitImage.style.height = "auto";
      digitImage.style.marginLeft = "-1.5px";
      digitImage.style.marginRight = "-1.5px";
      damageContainer.appendChild(digitImage);

      // 各数字のアニメーションを設定
      setTimeout(() => {
        digitImage.style.transition = "transform 0.03s ease-in-out";
        digitImage.style.transform = "translateY(-15%)";
        setTimeout(() => {
          digitImage.style.transform = "translateY(-50%)";
          setTimeout(() => {
            digitImage.style.transform = "translateY(-15%)";
            setTimeout(() => {
              digitImage.style.transform = "translateY(0)";
            }, 30);
          }, 30);
        }, 30);
      }, 0);

      // 表示を消去
      setTimeout(() => {
        effectImage.remove();
        damageContainer.remove();
      }, 0 + 90 + 140);
    } else {
      // ダメージでダメージが0の場合はmissを表示
      const missImage = document.createElement("img");
      missImage.src = "images/systems/miss.png";
      missImage.style.position = "absolute";
      missImage.style.width = monsterIcon.offsetWidth + "px";
      missImage.style.height = "auto";
      missImage.style.top = "50%";
      missImage.style.left = "50%";
      missImage.style.transform = "translate(-50%, -50%)";
      monsterIcon.parentElement.appendChild(missImage);

      // missImageのアニメーション
      setTimeout(() => {
        missImage.style.transition = "transform 0.04s ease-in-out";
        const currentTransform = missImage.style.transform;
        missImage.style.transform = `${currentTransform} translateY(-15%)`;
        setTimeout(() => {
          missImage.style.transform = currentTransform;
          setTimeout(() => {
            missImage.remove();
          }, 200);
        }, 40);
      }, 60);
    }
  } else {
    // ダメージが0以外の場合は、ダメージ画像と数値を表示
    // ダメージ効果画像と数値画像をまとめるコンテナを作成
    const damageEffectContainer = document.createElement("div");
    damageEffectContainer.style.position = "absolute";
    damageEffectContainer.style.top = "50%";
    damageEffectContainer.style.left = "50%";
    damageEffectContainer.style.transform = "translate(-50%, -50%)";

    const damageContainer = document.createElement("div");
    damageContainer.style.position = "relative";
    damageContainer.style.display = "flex";
    damageContainer.style.justifyContent = "center";

    // ダメージ/回復効果画像を設定
    let effectImagePath = "";
    if (resistance === -1) {
      // 回復の場合
      effectImagePath = isMPdamage ? "images/systems/effectImages/MPRecovery.png" : "images/systems/effectImages/HPRecovery.png";
    } else {
      // ダメージの場合
      effectImagePath = isMPdamage
        ? "images/systems/effectImages/MPDamaged.png"
        : monster.teamID === 0
        ? "images/systems/effectImages/allyDamaged.png"
        : "images/systems/effectImages/enemyDamaged.png";

      // 耐性によって画像を変更 (HPダメージの場合のみ)
      if (!isMPdamage) {
        if (resistance === 1.5) {
          effectImagePath = monster.teamID === 0 ? "images/systems/effectImages/allyDamagedWeakness.png" : "images/systems/effectImages/enemyDamagedWeakness.png";
        } else if (resistance === 2) {
          effectImagePath = monster.teamID === 0 ? "images/systems/effectImages/allyDamagedSuperWeakness.png" : "images/systems/effectImages/enemyDamagedSuperWeakness.png";
        } else if (resistance === 2.5) {
          effectImagePath = monster.teamID === 0 ? "images/systems/effectImages/allyDamagedUltraWeakness.png" : "images/systems/effectImages/enemyDamagedUltraWeakness.png";
        }
      }
    }

    const effectImage = document.createElement("img");
    effectImage.src = effectImagePath;
    effectImage.style.position = "absolute";
    let scale = 1;
    if (resistance > 1.4) {
      scale = 2;
    } else if (resistance === -1) {
      scale = 0.8;
    }
    effectImage.style.width = monsterIcon.offsetWidth * scale + "px";
    effectImage.style.height = "auto";
    // effectImage を damageEffectContainer の中心に配置
    effectImage.style.top = "50%";
    effectImage.style.left = "50%";
    effectImage.style.transform = "translate(-50%, -50%)";

    // 既に表示されているダメージエフェクトの数を取得
    const existingDamageEffects = monsterIcon.parentElement.querySelectorAll('div[style*="translate(-50%, -50%)"], img[src*="Damaged"], img[src*="MPDamaged"]').length;

    // ダメージエフェクトが既に存在する場合はランダムな位置にずらす
    if (resistance !== -1 && existingDamageEffects > 1) {
      const randomOffsetX = Math.floor(Math.random() * 21) - 10; // -10px から 10px までのランダムな値
      const randomOffsetY = Math.floor(Math.random() * 21) - 10;
      damageEffectContainer.style.transform = `translate(-50%, -50%) translate(${randomOffsetX}px, ${randomOffsetY}px)`; // コンテナごとずらす
    }

    // 子要素を追加
    damageEffectContainer.appendChild(effectImage);
    damageEffectContainer.appendChild(damageContainer);
    monsterIcon.parentElement.appendChild(damageEffectContainer);

    // ダメージ/回復量の数値画像を生成
    const digits = Math.abs(damage).toString().split("");
    for (let i = 0; i < digits.length; i++) {
      const digitImage = document.createElement("img");
      digitImage.src =
        resistance === -1
          ? isMPdamage
            ? `images/systems/MPRecoveryNumbers/${digits[i]}.png`
            : `images/systems/HPRecoveryNumbers/${digits[i]}.png`
          : isMPdamage
          ? `images/systems/MPDamageNumbers/${digits[i]}.png`
          : `images/systems/HPDamageNumbers/${digits[i]}.png`;
      digitImage.style.maxWidth = "60%";
      if (resistance > 1.4) {
        digitImage.style.maxWidth = "80%";
      }
      digitImage.style.height = "auto";
      digitImage.style.marginLeft = "-1.5px";
      digitImage.style.marginRight = "-1.5px";
      damageContainer.appendChild(digitImage);

      // 各数字のアニメーションを設定
      const delay = i * 30;
      setTimeout(() => {
        digitImage.style.transition = "transform 0.03s ease-in-out";
        digitImage.style.transform = "translateY(-15%)";
        setTimeout(() => {
          digitImage.style.transform = "translateY(-50%)";
          setTimeout(() => {
            digitImage.style.transform = "translateY(-15%)";
            setTimeout(() => {
              digitImage.style.transform = "translateY(0)";
            }, 30);
          }, 30);
        }, 30);
      }, delay);
    }

    // ダメージ/回復表示を消去
    setTimeout(() => {
      damageEffectContainer.remove(); // コンテナごと削除
    }, digits.length * 30 + 90 + 140);
  }
}

document.getElementById("resetBtn").addEventListener("click", async function () {
  fieldState.isBattleOver = true;
  skipBtn(true);
  //500以上の処理が実行中の場合良くない sleepがすべてこの秒数未満である必要
  await originalSleep(700);
  for (const party of parties) {
    for (const monster of party) {
      monster.currentStatus.HP = 200;
      delete monster.flags.beforeDeathActionCheck;
      delete monster.flags.isDead;
      delete monster.flags.isZombie;
      applyDamage(monster, -1500, -1);
      applyDamage(monster, -1500, -1, true);
      updateBattleIcons(monster);
      displayMessage("戦闘リセット");
    }
  }
  await prepareBattle();
  skipBtn(false);
});

document.getElementById("elementErrorBtn").addEventListener("click", function () {
  const elementErrorText = document.getElementById("elementErrorBtn").textContent;
  if (elementErrorText === "エレエラ") {
    document.getElementById("elementErrorBtn").textContent = "エラ解除";
    fieldState.isDistorted = true;
  } else {
    document.getElementById("elementErrorBtn").textContent = "エレエラ";
    delete fieldState.isDistorted;
  }
  adjustFieldStateDisplay();
});

document.getElementById("floBtn").addEventListener("click", function () {
  executeSkill(parties[0][2], findSkillByName("フローズンシャワー"), parties[1][0]);
});

document.getElementById("rezaoBtn").addEventListener("click", function () {
  for (const monster of parties[1]) {
    applyBuff(monster, { revive: { keepOnDeath: true, strength: 0.5 } });
  }
  displayMessage("リザオ付与");
});
document.getElementById("harvestBtn").addEventListener("click", function () {
  executeSkill(parties[0][0], findSkillByName("ソウルハーベスト"), parties[1][1]);
});
document.getElementById("endBtn").addEventListener("click", function () {
  executeSkill(parties[0][1], findSkillByName("debugbreath"), parties[1][0]);
});

document.getElementById("skipBtn").addEventListener("click", function () {
  if (document.getElementById("skipBtn").textContent === "skip解除") {
    skipBtn(false);
  } else {
    skipBtn(true);
  }
});

function skipBtn(isSkip = false) {
  if (isSkip) {
    document.getElementById("skipBtn").textContent = "skip解除";
    sleep = function (milliseconds) {
      return Promise.resolve(); // 即時解決するPromiseを返す
    };
  } else {
    document.getElementById("skipBtn").textContent = "skip";
    // 元のsleep関数に戻す
    sleep = originalSleep;
  }
}

document.getElementById("finishBtn").addEventListener("click", async function () {
  //displayで全体切り替え、battle画面へ
  document.getElementById("pageHeader").style.display = "block";
  document.getElementById("adjustPartyPage").style.display = "block";
  document.getElementById("battlePage").style.display = "none";
  // 戦闘終了フラグを立て、skipしてコマンド画面に
  fieldState.isBattleOver = true;
  skipBtn(true);
  //500以上の処理が実行中の場合良くない sleepがすべてこの秒数未満である必要
  await originalSleep(1000);
  skipBtn(false);
});

function displayMessage(line1Text, line2Text = "", centerText = false) {
  const messageLine1 = document.getElementById("message-line1");
  const messageLine2 = document.getElementById("message-line2");
  const consoleScreen = document.getElementById("consoleScreen");
  // 空白を挿入 全角スペース
  if (line1Text) line1Text = line1Text.replace(/ /g, "　");
  if (line2Text) line2Text = line2Text.replace(/ /g, "　");
  messageLine1.textContent = line1Text;
  messageLine2.textContent = line2Text;
  if (centerText) {
    // 第三引数がtrueの場合、中央揃えのスタイルを適用し、文字を大きくする
    consoleScreen.style.justifyContent = "center";
    messageLine1.style.textAlign = "center";
    messageLine1.style.fontSize = "1.05rem";
  } else {
    consoleScreen.style.justifyContent = "space-between";
    messageLine1.style.textAlign = "";
    messageLine1.style.fontSize = "0.9rem";
  }
}

function addMirrorEffect(targetImageId) {
  // 対象の画像要素を取得
  const targetImage = document.getElementById(targetImageId);

  // ミラー要素を作成
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.top = "-15%";
  mirror.style.width = "130%";
  mirror.style.height = "130%";
  mirror.style.borderRadius = "50%";
  mirror.style.overflow = "hidden";

  // 縁の要素を作成
  const border = document.createElement("div");
  border.style.position = "absolute";
  border.style.top = "0";
  border.style.left = "0";
  border.style.width = "100%";
  border.style.height = "100%";
  border.style.borderRadius = "50%";
  border.style.border = "3px solid #fffcfb";
  border.style.boxSizing = "border-box";
  mirror.appendChild(border);

  // 内側の要素を作成
  const inner = document.createElement("div");
  inner.style.position = "absolute";
  inner.style.top = "0";
  inner.style.left = "0";
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.style.backgroundColor = "#9347d1";
  inner.style.opacity = "0.8";
  inner.style.mixBlendMode = "screen"; // 透過しながら光らせる効果
  mirror.appendChild(inner);

  // ミラー要素を画像要素の親に追加
  targetImage.parentNode.appendChild(mirror);
  // 300msかけてフェードアウト
  setTimeout(() => {
    inner.style.transition = "opacity 0.5s ease-in-out";
    inner.style.opacity = "0";
    // 縁を狭めるアニメーション
    border.style.transition = "border-width 0.5s ease-in-out"; // border-width をアニメーション
    border.style.borderWidth = "2px"; // 縁の幅を 0px に
  }, 0);

  // 完全に消えたら要素を削除
  setTimeout(() => {
    mirror.remove();
  }, 300);
}

//global: imageCache = {};を使用
async function imageExists(imageUrl) {
  // 画像のURLごとにキャッシュを保持
  if (!(imageUrl in imageCache)) {
    imageCache[imageUrl] = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = imageUrl;
    });
  }
  return await imageCache[imageUrl];
}

//global: buffDisplayTimers = {};を使用
async function updateMonsterBuffsDisplay(monster, isReversed = false) {
  // 前回のタイマーをクリア
  if (buffDisplayTimers[monster.monsterId]) {
    clearTimeout(buffDisplayTimers[monster.monsterId]);
    buffDisplayTimers[monster.monsterId] = null;
  }

  let wrapper = document.getElementById(monster.iconElementId).parentElement;
  let newId = monster.iconElementId;
  if (isReversed) {
    // monster.iconElementId を入れ替える
    newId = monster.iconElementId.includes("ally") ? monster.iconElementId.replace("ally", "enemy") : monster.iconElementId.replace("enemy", "ally");

    // wrapper を新しい要素の親要素に置き換える
    wrapper = document.getElementById(newId).parentElement;
  }

  // buffContainerを初回のみ生成
  let buffContainer = wrapper.querySelector(".buffContainer");
  if (!buffContainer) {
    buffContainer = document.createElement("div");
    buffContainer.classList.add("buffContainer");
    wrapper.appendChild(buffContainer);
  }

  // buffIconを初回のみ生成
  let buffIcons = buffContainer.querySelectorAll(".buffIcon");
  if (buffIcons.length === 0) {
    for (let i = 0; i < 3; i++) {
      const buffIcon = document.createElement("img");
      buffIcon.classList.add("buffIcon");
      buffContainer.appendChild(buffIcon);
      buffIcons = buffContainer.querySelectorAll(".buffIcon"); // 再取得
    }
  }

  // isDeadの場合、すべてのbuffIconを非表示化
  if (monster.flags.isDead) {
    buffIcons.forEach((icon) => (icon.style.display = "none"));
    // 味方側の場合 棺桶だけ表示
    if (newId.includes("ally")) {
      buffIcons[0].src = "images/buffIcons/isDead.png";
      buffIcons[0].style.display = "block"; // 表示する
    }
    return;
  }

  // 亡者の場合、すべてのbuffIconを非表示化
  if (monster.flags.isZombie) {
    buffIcons.forEach((icon) => (icon.style.display = "none"));
    // 味方側の場合 亡者だけ表示
    if (newId.includes("ally")) {
      buffIcons[0].src = "images/buffIcons/isZombie.png";
      buffIcons[0].style.display = "block"; // 表示する
    }
    return;
  }

  // 画像が存在するバフのデータのみを格納する配列
  const activeBuffs = [];
  for (const buffKey in monster.buffs) {
    // 基本のアイコンパス
    let iconSrc = `images/buffIcons/${buffKey}.png`;

    // keepOnDeath, divineDispellable, unDispellableByRadiantWave, strength の順に確認し、
    // 対応するアイコンが存在すればパスを更新
    const buffAttributes = ["keepOnDeath", "unDispellable", "divineDispellable", "unDispellableByRadiantWave", "strength"];
    for (const prop of buffAttributes) {
      if (monster.buffs[buffKey]?.[prop] !== undefined) {
        const tempSrc = `images/buffIcons/${buffKey}${prop === "strength" ? "str" + monster.buffs[buffKey][prop] : prop}.png`;
        if (await imageExists(tempSrc)) {
          iconSrc = tempSrc;
          break;
        }
      }
    }
    //アタカン処理
    if (buffKey === "slashReflection" && monster.buffs.slashReflection.isKanta) {
      iconSrc = "images/buffIcons/atakan.png";
    }
    //アタカン処理
    if (buffKey === "isUnbreakable" && monster.buffs.isUnbreakable.isBroken) {
      iconSrc = "images/buffIcons/brokenHeart.png";
    }

    // 画像が存在する場合は、activeBuffsにバフデータを追加
    if (await imageExists(iconSrc)) {
      activeBuffs.push({ key: buffKey, src: iconSrc });
    }
  }

  // みがわりアイコンをpush
  if (monster.flags.hasSubstitute) {
    activeBuffs.push({ key: "hasSubstitute", src: "images/buffIcons/hasSubstitute.png" });
  }
  if (monster.flags.isSubstituting) {
    activeBuffs.push({ key: "isSubstituting", src: "images/buffIcons/isSubstituting.png" });
  }
  // 亡者アイコンをpushはせず、亡者アイコンのみに
  //if (monster.flags.isZombie && newId.includes("ally")) {
  //  activeBuffs.unshift({ key: "isZombie", src: "images/buffIcons/isZombie.png" });
  //}

  if (activeBuffs.length === 0) {
    // バフがない場合は、すべてのbuffIconを非表示にする
    buffIcons.forEach((icon) => (icon.style.display = "none"));
    return;
  }

  let buffIndex = 0;

  function showNextBuffs() {
    buffIcons.forEach((icon) => (icon.style.display = "none"));

    const startIndex = buffIndex * 3;
    const buffsToShow = activeBuffs.slice(startIndex, startIndex + 3);

    buffsToShow.forEach((buff, index) => {
      const buffIcon = buffIcons[index];
      buffIcon.src = buff.src;
      buffIcon.style.display = "block"; // 表示する
    });

    buffIndex = (buffIndex + 1) % Math.ceil(activeBuffs.length / 3);

    if (activeBuffs.length > 3) {
      // タイマーを設定する前に、既存のタイマーをクリア
      if (buffDisplayTimers[monster.monsterId]) {
        clearTimeout(buffDisplayTimers[monster.monsterId]);
      }
      buffDisplayTimers[monster.monsterId] = setTimeout(showNextBuffs, 600);
    }
  }

  showNextBuffs();
}

//光の波動 dispellableByRadiantWave指定以外を残す
function executeRadiantWave(monster) {
  monster.buffs = Object.fromEntries(Object.entries(monster.buffs).filter(([key, value]) => !value.dispellableByRadiantWave));
  updateCurrentStatus(monster);
  updateMonsterBuffsDisplay(monster);
}

//keepOnDeath・状態異常フラグ2種・かみは解除不可・(かみは限定解除)は解除しない  別途指定: 非keepOnDeathバフ 力ため 行動早い 無属性無効 石化バリア
function executeWave(monster, isDivine = false) {
  const keepKeys = ["powerCharge", "manaBoost", "breathCharge", "damageLimit", "statusLock", "preemptiveAction", "anchorAction", "nonElementalResistance", "stonedBlock"];
  const newBuffs = {};
  for (const key in monster.buffs) {
    const value = monster.buffs[key];
    // keepOnDeathでも削除するバフ群 竜王杖のようなunDispellable指定以外は削除
    const deleteKeys = ["counterAttack", "revive", "tabooSeal", "angelMark"];
    if (deleteKeys.includes(key) && !value.unDispellable && (!value.divineDispellable || isDivine)) {
      continue;
    }
    if (keepKeys.includes(key) || value.keepOnDeath || value.unDispellable || value.dispellableByRadiantWave || value.unDispellableByRadiantWave || (!isDivine && value.divineDispellable)) {
      newBuffs[key] = value;
    }
  }
  monster.buffs = newBuffs;
  updateCurrentStatus(monster);
  updateMonsterBuffsDisplay(monster);
}

//みがわり付与
function applySubstitute(skillUser, skillTarget, isAll = false, isCover = false) {
  //石化へのみがわり失敗はprocessHit内の石化無効化で判定
  if (isAll) {
    //自分以外に身代わりisSubstitutingがあるときは仁王立ち失敗で毎回return (hasだと初回付与したらそれ以降引っかかり連続処理が止まるのでこう処理)
    for (const monster of parties[skillUser.teamID]) {
      if (monster.flags.isSubstituting && monster.monsterId !== skillUser.monsterId) {
        return;
      }
    }
    //自分自身は仁王立ちの対象にしない
    if (skillTarget.monsterId == skillUser.monsterId) {
      return;
    }
  }
  if (skillTarget.flags.isZombie || skillTarget.flags.thisTurn.substituteSeal) {
    return;
  }
  skillTarget.flags.hasSubstitute = {};
  skillTarget.flags.hasSubstitute.targetMonsterId = skillUser.monsterId;
  if (!skillUser.flags.hasOwnProperty("isSubstituting")) {
    skillUser.flags.isSubstituting = {};
    skillUser.flags.isSubstituting.targetMonsterId = [];
  }
  skillUser.flags.isSubstituting.targetMonsterId.push(skillTarget.monsterId);
  if (isCover) {
    skillTarget.flags.hasSubstitute.cover = true;
    skillUser.flags.isSubstituting.cover = true;
  }
}

function preloadImages() {
  const imageUrls = [
    "images/systems/miss.png",
    "images/systems/effectImages/allyDamagedSuperWeakness.png",
    "images/systems/effectImages/allyDamagedUltraWeakness.png",
    "images/systems/effectImages/allyDamagedWeakness.png",
    "images/systems/effectImages/enemyDamaged.png",
    "images/systems/effectImages/enemyDamagedSuperWeakness.png",
    "images/systems/effectImages/enemyDamagedUltraWeakness.png",
    "images/systems/effectImages/enemyDamagedWeakness.png",
    "images/systems/effectImages/HPRecovery.png",
    "images/systems/effectImages/MPRecovery.png",
    "images/systems/HPDamageNumbers/0.png",
    "images/systems/HPDamageNumbers/1.png",
    "images/systems/HPDamageNumbers/2.png",
    "images/systems/HPDamageNumbers/3.png",
    "images/systems/HPDamageNumbers/4.png",
    "images/systems/HPDamageNumbers/5.png",
    "images/systems/HPDamageNumbers/6.png",
    "images/systems/HPDamageNumbers/7.png",
    "images/systems/HPDamageNumbers/8.png",
    "images/systems/HPDamageNumbers/9.png",
  ];
  imageUrls.forEach((imageUrl) => {
    const img = new Image();
    img.src = imageUrl;
  });
}

//MPcostを返す スキル選択時と実行時
function calculateMPcost(skillUser, executingSkill) {
  if (executingSkill.MPcost === "all") {
    return skillUser.currentStatus.MP;
  }
  let calcMPcost = executingSkill.MPcost;
  //メタル
  if (skillUser.buffs.mpCostMultiplier) {
    calcMPcost = Math.ceil(calcMPcost * skillUser.buffs.mpCostMultiplier.strength);
  }
  //超伝説
  if (skillUser.race === "超伝説" && !skillUser.buffs.tagTransformation) {
    calcMPcost = Math.ceil(calcMPcost * 1.2);
  }
  //コツの半減
  if (
    (skillUser.buffs.breathEnhancement && executingSkill.type === "breath") ||
    (skillUser.buffs.elementEnhancement && executingSkill.type === "spell" && skillUser.buffs.elementEnhancement.element === executingSkill.element)
  ) {
    calcMPcost = Math.floor(calcMPcost * 0.5);
  }
  return calcMPcost;
}

function displayBuffMessage(buffTarget, buffName, buffData) {
  // バフメッセージ定義
  const buffMessages = {
    fireBreak: {
      start: `${buffTarget.name}は メラ耐性を`,
      message: `${buffData.strength}ランク下げて 攻撃する状態になった！`,
    },
    allElementalBreak: {
      start: `${buffTarget.name}は 属性耐性を`,
      message: `${buffData.strength}ランク下げて 攻撃する状態になった！`,
    },
    powerCharge: {
      start: `${buffTarget.name}は`,
      message: "ちからをためている！",
    },
    manaBoost: {
      start: `${buffTarget.name}は`,
      message: "魔力をためている！",
    },
    preemptiveAction: {
      start: `${buffTarget.name}の`,
      message: "こうどうが はやくなった！",
    },
    anchorAction: {
      start: `${buffTarget.name}の`,
      message: "こうどうが おそくなった！",
    },
    nonElementalResistance: {
      start: `${buffTarget.name}は`,
      message: "無属性攻撃を受けなくなった！",
    },
    damageLimit: {
      start: `${buffTarget.name}は`,
      message: `被ダメージ上限値${buffData.strength}の状態になった！`,
    },
    stonedBlock: {
      start: "アストロンを ふうじられた！",
      message: "",
    },
    spellSeal: {
      start: `${buffTarget.name}は`,
      message: "呪文を ふうじられた！",
    },
    breathSeal: {
      start: `${buffTarget.name}は`,
      message: "息を ふうじられた！",
    },
    slashSeal: {
      start: `${buffTarget.name}は`,
      message: "斬撃を ふうじられた！",
    },
    martialSeal: {
      start: `${buffTarget.name}は`,
      message: "体技を ふうじられた！",
    },
    fear: {
      start: `${buffTarget.name}は`,
      message: "動きを ふうじられた！",
    },
    tempted: {
      start: `${buffTarget.name}の`,
      message: "防御力がさがり 動けなくなった！",
    },
    sealed: {
      start: `${buffTarget.name}は`,
      message: "動きを ふうじられた！",
    },
    confused: {
      start: `${buffTarget.name}の`,
      message: "あたまは こんらんした！",
    },
    paralyzed: {
      start: `${buffTarget.name}は`,
      message: "しびれて動けなくなった！",
    },
    asleep: {
      start: `${buffTarget.name}は`,
      message: "ふかい ねむりにおちた！",
    },
    stoned: {
      start: `${buffTarget.name}の身体が`,
      message: "金のかたまりになった！",
    },
    poisoned: {
      start: `${buffTarget.name}は`,
      message: "どくにおかされた！",
    },
    reviveBlock: {
      start: `${buffTarget.name}は`,
      message: "蘇生を ふうじられた！",
    },
    demonKingBarrier: {
      start: `${buffTarget.name}は`,
      message: "あらゆる状態異常が効かなくなった！",
    },
    demonKingBarrier: {
      start: "行動停止系の効果が  効かなくなった！",
      message: "",
    },
    protection: {
      start: `${buffTarget.name}の`,
      message: "受けるダメージが減少した！",
    },
    dodgeBuff: {
      start: `${buffTarget.name}の`,
      message: "回避率が あがった！",
    },
    continuousHealing: {
      start: `${buffTarget.name}は`,
      message: "HPが 回復する状態になった！",
    },
    revive: {
      start: `${buffTarget.name}は`,
      message: "自動で復活する状態になった！",
    },
    controlOfRapu: {
      start: `${buffTarget.name}は`,
      message: "暗黒神の支配状態になった",
    },
    spellEvasion: {
      start: `${buffTarget.name}は`,
      message: "呪文攻撃を うけなくなった！",
    },
    slashEvasion: {
      start: `${buffTarget.name}は`,
      message: "斬撃攻撃を うけなくなった！",
    },
    martialEvasion: {
      start: `${buffTarget.name}は`,
      message: "体技攻撃を うけなくなった！",
    },
    breathEvasion: {
      start: `${buffTarget.name}は`,
      message: "息攻撃を うけなくなった！",
    },
    internalAtkUp: {
      start: `${buffTarget.name}の`,
      message: `攻撃力が ${buffData.strength + 1}倍になった！`,
    },
    internalDefUp: {
      start: `${buffTarget.name}の`,
      message: `防御力が ${buffData.strength + 1}倍になった！`,
    },
    internalIntUp: {
      start: `${buffTarget.name}の`,
      message: `賢さが ${buffData.strength + 1}倍になった！`,
    },
  };

  const stackableBuffs = {
    baiki: "攻撃力",
    defUp: "防御力",
    spdUp: "素早さ",
    intUp: "賢さ",
    spellBarrier: "呪文に対する防御力",
    slashBarrier: "斬撃に対する防御力",
    martialBarrier: "体技に対する防御力",
    breathBarrier: "息に対する防御力",
    fireResistance: "メラ耐性",
    iceResistance: "ヒャド耐性",
    thunderResistance: "ギラ耐性",
    windResistance: "バギ耐性",
    ioResistance: "イオ耐性",
    lightResistance: "デイン耐性",
    darkResistance: "ドルマ耐性",
  };

  const breakBoosts = ["fireBreakBoost", "iceBreakBoost", "thunderBreakBoost", "windBreakBoost", "ioBreakBoost", "lightBreakBoost", "darkBreakBoost"];

  //dazzle, dotDamage, healBlock
  //  !の  回避率が最大になった!

  if (buffMessages[buffName]) {
    displayMessage(buffMessages[buffName].start, buffMessages[buffName].message);
  } else if (stackableBuffs.hasOwnProperty(buffName)) {
    if (buffData.strength < 0) {
      displayMessage(`${buffTarget.name}の`, `${stackableBuffs[buffName]}が さがった！！`);
    } else {
      displayMessage(`${buffTarget.name}の`, `${stackableBuffs[buffName]}が あがった！！`);
    }
  } else if (breakBoosts.includes(buffName)) {
    displayMessage(`${buffTarget.name}の`, "ブレイク状態が強化された！");
  }
}

async function transformTyoma(monster) {
  // 冗長性
  if (monster.flags.isDead) {
    return;
  }
  await sleep(200);
  monster.iconSrc = "images/icons/" + monster.id + "Transformed.jpeg";
  updateBattleIcons(monster);
  // 複数回変身に注意
  monster.flags.hasTransformed = true;
  delete monster.buffs.stoned;

  // skill変更と、各種message
  if (monster.name === "超エルギ") {
    monster.skill[0] = "絶望の天舞";
    displayMessage("＊「憎悪のはげしさを…… 絶望の深さを…", "  今こそ 思いしらせてくれるわッ！！");
  } else if (monster.name === "超ネルゲル") {
    monster.attribute.additionalPermanentBuffs = { spellBarrier: { strength: 2, unDispellable: true, duration: 0 }, breathBarrier: { strength: 2, unDispellable: true, duration: 0 } };
    monster.skill[0] = "終の流星";
    monster.skill[1] = "暴獣の右ウデ";
    displayMessage("＊「……大いなる闇の根源よ。", "  我にチカラを 与えたまえ！");
    await sleep(200);
    displayMessage("＊「見よっ この強靱なる肉体をぉ！", "  この絶大なる魔力をぉ！");
  } else if (monster.name === "超オムド") {
    monster.skill[0] = "クロノストーム";
    monster.skill[2] = "永劫の闇冥";
    displayMessage("＊「くだらぬ希望など", "  すべて消し去ってやろう。");
  } else if (monster.name === "超ラプ") {
    monster.buffs.ioBreak.strength = 3;
    monster.skill[0] = "真・神々の怒り";
    monster.skill[1] = "爆炎の儀式";
    displayMessage("＊「死してなお消えぬほどの 永遠の恐怖を", "  その魂に 焼きつけてくれるわっ！！");
  }
  await sleep(400);

  // 共通バフ
  applyBuff(monster, { demonKingBarrier: { divineDispellable: true }, nonElementalResistance: {}, protection: { divineDispellable: true, strength: 0.5, duration: 3 } });
  // 各種buff
  if (monster.name === "超エルギ") {
    applyBuff(monster, { dodgeBuff: { strength: 1, keepOnDeath: true } });
    monster.abilities.attackAbilities.nextTurnAbilities.push({
      act: async function (skillUser) {
        await executeSkill(skillUser, findSkillByName("堕天使の理"));
      },
    });
  } else if (monster.name === "超ネルゲル") {
    applyBuff(monster, { internalDefUp: { strength: 0.5, keepOnDeath: true } });
  }

  // 回復
  if (monster.name !== "超ネルゲル") {
    //ネルのみHP回復を実行しない
    await sleep(400);
    applyDamage(monster, monster.defaultStatus.HP, -1);
  }
  await sleep(500);
  applyDamage(monster, monster.defaultStatus.MP, -1, true); //MP

  // 回復後発動する変身時特性など
  if (monster.name === "超エルギ") {
    await sleep(400);
    for (const target of parties[monster.enemyTeamID]) {
      if (!target.buffs.angelMark) {
        applyBuff(target, { healBlock: {} });
      }
    }
  } else if (monster.name === "超オムド") {
    await sleep(400);
    displayMessage(`${monster.name}の特性`, "歪みの根源 が発動！");
    fieldState.isDistorted = true;
    fieldState.isPermanentDistorted = true;
    adjustFieldStateDisplay();
  } else if (monster.name === "超ラプ") {
    await sleep(400);
    displayMessage("無属性とくぎを防ぐ状態が", "解除された！");
    for (const party of parties) {
      for (const monster of party) {
        if (monster.buffs.nonElementalResistance && monster.name !== "超ラプ") {
          delete monster.buffs.nonElementalResistance;
          updateMonsterBuffsDisplay(monster);
        }
      }
    }
  }
  await sleep(400);
}

function deleteSubstitute(target) {
  if (target.flags.isSubstituting) {
    //みがわり中 hasSubstituteのtargetが死亡者と一致する場合に削除
    for (const monster of parties.flat()) {
      if (monster.flags.hasSubstitute && monster.flags.hasSubstitute.targetMonsterId === target.monsterId) {
        delete monster.flags.hasSubstitute;
        updateMonsterBuffsDisplay(monster);
      }
    }
    delete target.flags.isSubstituting;
  }
  if (target.flags.hasSubstitute) {
    //みがわられ中 hasSubstituteのtargetのisSubstitutingをupdate
    const substitutingMonster = parties.flat().find((monster) => monster.monsterId === target.flags.hasSubstitute.targetMonsterId);
    if (substitutingMonster) {
      // その要素のflags.isSubstituting.targetMonsterIdの配列内から、target.monsterIdと等しい文字列を削除する。
      substitutingMonster.flags.isSubstituting.targetMonsterId = substitutingMonster.flags.isSubstituting.targetMonsterId.filter((id) => id !== target.monsterId);
      //空になったら削除・みがわり表示更新
      if (substitutingMonster.flags.isSubstituting.targetMonsterId.length === 0) {
        delete substitutingMonster.flags.isSubstituting;
        updateMonsterBuffsDisplay(substitutingMonster);
      }
    }
    delete target.flags.hasSubstitute;
  }
}

function getNormalAttackName(skillUser) {
  let NormalAttackName = "通常攻撃";
  //上から優先的に処理して当てはまったらその時点で確定
  if (skillUser.gear?.name === "心砕き") {
    NormalAttackName = "心砕き";
  } else if (skillUser.gear?.name === "昇天") {
    NormalAttackName = "昇天槍";
  } else if (skillUser.gear?.name === "系統爪ザキ") {
    NormalAttackName = "通常攻撃ザキ攻撃";
  } else if (skillUser.gear?.name === "キラーピアス") {
    NormalAttackName = "はやぶさ攻撃弱";
  } else if (skillUser.id === "reopa" && fieldState.turnNum % 2 === 0 && hasEnoughMonstersOfType(parties[skillUser.teamID], "魔獣", 4)) {
    NormalAttackName = "会心通常攻撃";
  } else if (skillUser.race === "魔獣" && parties[skillUser.teamID].some((monster) => monster.name === "キングアズライル")) {
    NormalAttackName = "魔獣の追撃";
  }
  return NormalAttackName;
}

function col(argument) {
  console.log(argument);
}

function displayMiss(skillTarget) {
  displayMessage("しかし なにも おこらなかった！");
  displayDamage(skillTarget, 0);
}

// 自分を含めた数
function hasEnoughMonstersOfType(party, targetRace, requiredCount) {
  if (requiredCount <= 0) {
    return true; // requiredCountが0以下の場合はtrue
  }
  let count = 0;
  for (const monster of party) {
    if (monster && monster.race === targetRace) {
      count++;
    }
  }
  return count >= requiredCount;
}

// 竜気 行動後に上げる
async function applyDragonPreemptiveAction(skillUser, executingSkill) {
  const aliveMasudora = parties[skillUser.teamID].filter((member) => member.id === "masudora" && !member.flags.isDead);
  const firstMasudora = aliveMasudora?.[0];
  const newStrength = Math.min((firstMasudora?.buffs?.dragonPreemptiveAction?.strength ?? 0) + 1, 9);
  for (const member of aliveMasudora) {
    member.buffs.dragonPreemptiveAction = { unDispellable: true, strength: newStrength };
  }
  displayMessage("マスタードラゴンの", `天の竜気レベルが ${newStrength}に上がった！`);
  // 涼風の場合はさらに増加可能性
  if (executingSkill.name === "涼風一陣" && Math.random() < 0.424) {
    await sleep(150);
    const ryouhuStrength = Math.min(newStrength + 1, 9);
    for (const member of aliveMasudora) {
      member.buffs.dragonPreemptiveAction = { unDispellable: true, strength: ryouhuStrength };
    }
    displayMessage("マスタードラゴンの", `天の竜気レベルが ${ryouhuStrength}に上がった！`);
  }
}

// 継続回復
async function executeContinuousHealing(monster) {
  if (monster.buffs.continuousHealing) {
    await sleep(200);
    applyHeal(monster, 275);
    await sleep(200);
  }
}

function addHexagonShine(targetElementId, cracked = false) {
  const targetElement = document.getElementById(targetElementId);
  if (!targetElement) {
    console.error("Target element not found.");
    return;
  }

  const hexagon = document.createElement("div");
  hexagon.style.position = "absolute";
  hexagon.style.width = "180%";
  hexagon.style.height = "180%";
  hexagon.style.top = "-45%";
  hexagon.style.clipPath = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
  hexagon.style.backgroundColor = "white";
  hexagon.style.opacity = "0.8";
  hexagon.style.mixBlendMode = "screen";
  hexagon.style.transformOrigin = "center"; // 回転の中心を設定

  targetElement.parentNode.appendChild(hexagon);

  hexagon.style.overflow = "hidden"; // 追加: ひび割れがクリップされないようにする

  if (cracked) {
    hexagon.style.opacity = "1";
    const cracks = document.createElement("div");
    cracks.style.position = "absolute";
    cracks.style.width = "100%";
    cracks.style.height = "100%";
    cracks.style.top = "0";
    cracks.style.left = "0";
    cracks.style.overflow = "visible"; // 追加: ひび割れがクリップされないようにする

    const numCracks = 20;
    for (let i = 0; i < numCracks; i++) {
      const crack = document.createElement("div");
      crack.style.position = "absolute";
      crack.style.width = "2px";
      crack.style.height = 50 + Math.random() * 20 + "%"; // ひびの長さを50%~70%でランダムに
      crack.style.background = "rgba(0, 0, 0, 0.3)";
      crack.style.transformOrigin = "bottom";
      crack.style.left = "calc(50% - 1px)";
      crack.style.bottom = "50%";

      const angle = (360 / numCracks) * i + Math.random() * 5 - 2.5; // ランダムな角度のずれを追加
      crack.style.transform = `rotate(${angle}deg)`;
      cracks.appendChild(crack);
    }
    hexagon.appendChild(cracks);
  }

  let timeOutDuration = 0;
  if (cracked) {
    hexagon.style.transition = "opacity 0.3s ease-in-out, transform 0.3s ease-in-out";
    timeOutDuration = 200;
  } else {
    hexagon.style.transition = "opacity 0.5s ease-in-out, transform 0.5s ease-in-out"; //もと0.5
    timeOutDuration = 300;
  }

  setTimeout(() => {
    hexagon.style.opacity = "0";
    if (cracked) {
      hexagon.style.transform = "scale(1.3)"; // 少し拡大しながら消える
    }
  }, 0);

  setTimeout(() => {
    hexagon.remove();
  }, timeOutDuration);
}
function adjustFieldStateDisplay() {
  const fieldStateDisplay1 = document.getElementById("fieldStateDisplay1");
  const fieldStateDisplay2 = document.getElementById("fieldStateDisplay2");
  let display1Content = "";
  let display2Content = "";

  if (fieldState.isReverse) {
    display1Content = fieldState.isPermanentReverse ? `リバース 残り11ラウンド` : `リバース 残り1ラウンド`;
  }

  if (fieldState.isDistorted) {
    if (display1Content === "") {
      // display1が空ならdistortedをdisplay1に割り当てる
      display1Content = fieldState.isPermanentDistorted ? `属性歪曲 残り11ラウンド` : `属性歪曲 残り1ラウンド`;
    } else {
      // display1が埋まっているならdistortedをdisplay2に割り当てる
      display2Content = fieldState.isPermanentDistorted ? `属性歪曲 残り11ラウンド` : `属性歪曲 残り1ラウンド`;
    }
  }

  // display1の表示設定
  if (display1Content === "") {
    fieldStateDisplay1.style.visibility = "hidden";
  } else {
    fieldStateDisplay1.style.visibility = "visible";
    fieldStateDisplay1.textContent = display1Content;
  }

  // display2の表示設定
  if (display2Content === "") {
    fieldStateDisplay2.style.visibility = "hidden";
  } else {
    fieldStateDisplay2.style.visibility = "visible";
    fieldStateDisplay2.textContent = display2Content;
  }
}
// 昇天
function ascension(monster) {
  if (monster.flags.isUnAscensionable || !monster.flags.isZombie) {
    return;
  }
  delete monster.flags.isZombie;
  delete monster.buffs.sealed;
  monster.flags.isDead = true;
  updateMonsterBar(monster); //isDead付与後にupdateでbar非表示化
  updateBattleIcons(monster);
  /*
  let wrapper = document.getElementById(target.iconElementId).parentElement;
  const buffContainer = wrapper.querySelector(".buffContainer");
  if (buffContainer) {
    buffContainer.remove();
  }*/
  updateMonsterBuffsDisplay(monster);
  document.getElementById(monster.iconElementId).parentNode.classList.remove("stickOut");
  document.getElementById(monster.iconElementId).parentNode.classList.remove("recede");
}

function deleteUnbreakable(skillTarget) {
  if (!skillTarget.flags.isDead && !skillTarget.flags.isZombie) {
    delete skillTarget.buffs.isUnbreakable;
  }
}

function showCooperationEffect(currentTeamID, cooperationAmount) {
  const cooperationDisplayContainer = document.getElementById("cooperationDisplayContainer");
  const cooperationAmountSpan = document.getElementById("cooperationAmount");
  const cooperationMultiplierSpan = document.getElementById("cooperationMultiplier");

  // 連携数、倍率を設定
  cooperationAmountSpan.textContent = cooperationAmount;
  cooperationMultiplierSpan.textContent = {
    1: 1,
    2: 1.2,
    3: 1.3,
    4: 1.4,
    5: 1.5,
    6: 1.5,
  }[cooperationAmount];

  // 敵の場合色変更
  if (currentTeamID === 0) {
    cooperationDisplayContainer.style.color = "#ffaf06";
  } else {
    cooperationDisplayContainer.style.color = "#e72e2c";
  }

  // 初期状態：左に隠れている状態にする
  cooperationDisplayContainer.style.transform = "translateX(-100%)";
  cooperationDisplayContainer.style.visibility = "visible"; // 表示化

  // アニメーション開始：左からスライドイン
  setTimeout(() => {
    // 少し遅らせてアニメーションを滑らかにする
    cooperationDisplayContainer.style.transition = "transform 0.1s ease-in-out"; // transitionを追加
    cooperationDisplayContainer.style.transform = "translateX(0)";
  }, 10);

  // 一定時間後に非表示にする
  setTimeout(() => {
    cooperationDisplayContainer.style.transition = "opacity 0.1s ease-in-out"; // opacityのみtransitionを設定
    cooperationDisplayContainer.style.opacity = "0";

    cooperationDisplayContainer.addEventListener(
      "transitionend",
      function () {
        cooperationDisplayContainer.style.visibility = "hidden";
        cooperationDisplayContainer.style.opacity = "1";
        cooperationDisplayContainer.style.transition = ""; // transitionをリセット
      },
      { once: true }
    );
  }, 500);
}

// 終了時trueを返す
function isBattleOver() {
  if (parties.some((party) => party.every((monster) => monster.flags.isDead))) {
    fieldState.isBattleOver = true;
  }
  return fieldState.isBattleOver;
}
