(function(){
  "use strict";

  // ===== CONFIG =====
  const DAY_LENGTH_SECONDS = 24 * 60; // 24 real minutes = 24 in-game hours
  const PHASES = [
    { name:"morning", from:0,    to:0.25, icon:"🌅", cls:"time-morning" },
    { name:"day",     from:0.25, to:0.5,  icon:"☀️", cls:"time-day" },
    { name:"evening", from:0.5,  to:0.75, icon:"🌆", cls:"time-evening" },
    { name:"night",   from:0.75, to:1.0,  icon:"🌙", cls:"time-night" },
  ];

  // ===== STATE (exposed on window so Pass 2/3 can hook in) =====
  const Game = window.FairyGame = window.FairyGame || {};
  Game.state = {
    secondsLeft: DAY_LENGTH_SECONDS,
    coins: 0,
    running: true,
    currentPhase: "morning",
  };
  Game.locations = {}; // populated below, other passes can read positions
  Game.addCoins = function(amount){
    Game.state.coins = Math.max(0, Game.state.coins + amount);
    document.getElementById("coinCount").textContent = Game.state.coins;
  };
  Game.showFeed = function(text){
    const el = document.getElementById("feedMsg");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(Game._feedTimer);
    Game._feedTimer = setTimeout(()=> el.classList.remove("show"), 2600);
  };

  // ===== DOM refs =====
  const body = document.body;
  const fairy = document.getElementById("fairy");
  const clockPhase = document.getElementById("clockPhase");
  const clockText = document.getElementById("clockText");
  const dayringFill = document.getElementById("dayringFill");
  const titleSub = document.getElementById("titleSub");
  const endModal = document.getElementById("endModal");
  const endSummary = document.getElementById("endSummary");

  // ===== map locations: fairy walks here on click =====
  const locEls = document.querySelectorAll(".location");
  locEls.forEach(btn=>{
    const key = btn.id.replace("loc-","");
    Game.locations[key] = { left: btn.style.left, top: btn.style.top, name: btn.dataset.name };
    btn.addEventListener("click", ()=> visitLocation(key, btn));
  });

  function visitLocation(key, btn){
    fairy.style.left = btn.style.left;
    fairy.style.top = btn.style.top;
    titleSub.textContent = `visiting ${btn.dataset.name.toLowerCase()}...`;
    // small delay so the fairy is seen arriving before the challenge/shop opens
    setTimeout(()=> Game.onLocationOpen(key, btn.dataset.name), 550);
  }

  // ===== clock / day-night cycle =====
  function getPhase(fracElapsed){
    return PHASES.find(p => fracElapsed >= p.from && fracElapsed < p.to) || PHASES[PHASES.length-1];
  }

  function tick(){
    if (!Game.state.running) return;
    Game.state.secondsLeft -= 1;

    if (Game.state.secondsLeft <= 0){
      Game.state.secondsLeft = 0;
      endDay();
      return;
    }

    const elapsed = DAY_LENGTH_SECONDS - Game.state.secondsLeft;
    const frac = elapsed / DAY_LENGTH_SECONDS;
    const phase = getPhase(frac);

    if (phase.name !== Game.state.currentPhase){
      Game.state.currentPhase = phase.name;
      body.classList.remove("time-morning","time-day","time-evening","time-night");
      body.classList.add(phase.cls);
      Game.showFeed(`${phase.icon} ${phase.name} has arrived`);
    }

    clockPhase.textContent = phase.icon;
    const mm = Math.floor(Game.state.secondsLeft/60).toString().padStart(2,"0");
    const ss = (Game.state.secondsLeft%60).toString().padStart(2,"0");
    clockText.textContent = `${mm}:${ss} left`;
    dayringFill.style.width = (frac*100).toFixed(2) + "%";

    setTimeout(tick, 1000);
  }

  function endDay(){
    Game.state.running = false;
    clearTimeout(Game._eventTimer);
    const itemCount = Game.owned.size - 2; // minus the two free defaults
    endSummary.textContent = `you finished with 🪙 ${Game.state.coins} coins and ${Math.max(0,itemCount)} items collected. a perfect day, well spent.`;
    endModal.classList.add("show");
  }

  document.getElementById("restartDayBtn").addEventListener("click", ()=>{
    Game.state.secondsLeft = DAY_LENGTH_SECONDS;
    Game.state.running = true;
    Game.state.currentPhase = "morning";
    body.classList.remove("time-day","time-evening","time-night");
    body.classList.add("time-morning");
    endModal.classList.remove("show");
    tick();
    scheduleNextEvent();
  });

  // ================= PASS 2: challenges =================
  const challengeOverlay = document.getElementById("challengeOverlay");
  const challengeContent = document.getElementById("challengeContent");

  function openChallengeOverlay(){ challengeOverlay.classList.add("show"); }
  function closeChallengeOverlay(){
    if (Game._activeCleanup){ Game._activeCleanup(); Game._activeCleanup = null; }
    challengeOverlay.classList.remove("show");
  }
  document.getElementById("challengeCloseBtn").addEventListener("click", closeChallengeOverlay);

  function showChallengeResult(emoji, title, desc, coins){
    if (Game._activeCleanup){ Game._activeCleanup(); Game._activeCleanup = null; }
    challengeContent.innerHTML = `
      <div class="challenge-result">
        <div style="font-size:2.2rem;">${emoji}</div>
        <h2>${title}</h2>
        <p style="color:var(--plum-soft); font-size:.9rem;">${desc}</p>
        <div class="challenge-result__coins">+${coins} 🪙</div>
        <button id="collectCoinsBtn">collect &amp; continue</button>
      </div>`;
    document.getElementById("collectCoinsBtn").addEventListener("click", ()=>{
      Game.addCoins(coins);
      Game.showFeed(`+${coins} 🪙 from ${title}`);
      closeChallengeOverlay();
    });
  }

  // ---------- 1. Lost Keys ----------
  function startLostKeys(){
    const total = 12, keyCount = 3;
    const keyIndices = new Set();
    while (keyIndices.size < keyCount) keyIndices.add(Math.floor(Math.random()*total));
    let found = 0, clicks = 0;

    challengeContent.innerHTML = `
      <h2>🗝️ Lost Keys</h2>
      <p class="challenge-modal__intro">Three keys are hidden in the grass — tap tiles to search.</p>
      <div class="tile-grid" id="keysGrid"></div>
      <p class="challenge-status" id="keysStatus">found 0 / 3</p>`;

    const grid = document.getElementById("keysGrid");
    for (let i=0;i<total;i++){
      const btn = document.createElement("button");
      btn.className = "tile"; btn.type = "button"; btn.textContent = "🌿";
      btn.addEventListener("click", ()=>{
        if (btn.disabled) return;
        clicks++;
        if (keyIndices.has(i)){
          btn.textContent = "🗝️"; btn.classList.add("found"); btn.disabled = true;
          found++;
          document.getElementById("keysStatus").textContent = `found ${found} / ${keyCount}`;
          if (found === keyCount){
            const coins = Math.max(10, 34 - (clicks-3)*4);
            showChallengeResult("🗝️", "keys found!", `you found all three keys in ${clicks} tries.`, coins);
          }
        } else {
          btn.textContent = "🍃"; btn.classList.add("empty-hit"); btn.disabled = true;
          setTimeout(()=>{ if (btn.isConnected){ btn.textContent = "🌿"; btn.classList.remove("empty-hit"); btn.disabled = false; } }, 500);
        }
      });
      grid.appendChild(btn);
    }
    Game._activeCleanup = ()=>{};
    openChallengeOverlay();
  }

  // ---------- 2. Fairy Obby ----------
  function startFairyObby(){
    const rounds = 5;
    let round = 0, passes = 0, animId = null, pos = 0, dir = 1, zoneLeft = 0;

    challengeContent.innerHTML = `
      <h2>🧚 Fairy Obby</h2>
      <p class="challenge-modal__intro">Click Jump when your fairy is inside the pink zone!</p>
      <div class="obby-rounds" id="obbyDots"></div>
      <div class="obby-track" id="obbyTrack">
        <div class="obby-track__zone" id="obbyZone"></div>
        <div class="obby-track__marker" id="obbyMarker">🧚</div>
      </div>
      <button class="jump-btn" id="jumpBtn">Jump!</button>
      <p class="challenge-status" id="obbyStatus">round 1 of ${rounds}</p>`;

    const dotsWrap = document.getElementById("obbyDots");
    for (let i=0;i<rounds;i++){ const d = document.createElement("span"); d.className = "obby-rounds__dot"; dotsWrap.appendChild(d); }

    function randomZone(){
      const left = 15 + Math.random()*55;
      document.getElementById("obbyZone").style.left = left + "%";
      return left;
    }
    zoneLeft = randomZone();

    function animate(){
      pos += dir * 1.4;
      if (pos >= 100){ pos = 100; dir = -1; }
      if (pos <= 0){ pos = 0; dir = 1; }
      document.getElementById("obbyMarker").style.left = pos + "%";
      animId = requestAnimationFrame(animate);
    }
    animId = requestAnimationFrame(animate);

    function handleJump(){
      const zoneWidth = 18;
      const inZone = pos >= zoneLeft && pos <= zoneLeft + zoneWidth;
      const dot = dotsWrap.children[round];
      dot.classList.add(inZone ? "pass" : "fail");
      if (inZone) passes++;
      round++;
      if (round >= rounds){
        cancelAnimationFrame(animId);
        const coins = Math.max(5, passes*8 + (passes===rounds ? 10 : 0));
        showChallengeResult("🧚", passes===rounds ? "flawless flight!" : "obby cleared", `you landed ${passes} of ${rounds} jumps.`, coins);
      } else {
        document.getElementById("obbyStatus").textContent = `round ${round+1} of ${rounds}`;
        zoneLeft = randomZone();
        pos = 0; dir = 1;
      }
    }
    document.getElementById("jumpBtn").addEventListener("click", handleJump);
    Game._activeCleanup = ()=>{ if (animId) cancelAnimationFrame(animId); };
    openChallengeOverlay();
  }

  // ---------- 3. Perfect Outfit ----------
  function startPerfectOutfit(){
    const themes = [
      { name:"Garden Party", wings:1, top:0, acc:2 },
      { name:"Moonlight Ball", wings:2, top:1, acc:0 },
      { name:"Meadow Picnic", wings:0, top:2, acc:1 },
    ];
    const theme = themes[Math.floor(Math.random()*themes.length)];
    const wingsOpts = ["🦋","🪽","✨"];
    const topOpts = ["🌸","💫","🍃"];
    const accOpts = ["🎀","👑","🔮"];
    const picks = { wings:null, top:null, acc:null };

    challengeContent.innerHTML = `
      <h2>👗 Perfect Outfit</h2>
      <p class="challenge-modal__intro">Theme: <strong>${theme.name}</strong> — pick the pieces that fit best.</p>
      <div class="outfit-category"><p class="outfit-category__label">wings</p><div class="outfit-options" id="wingsOpts"></div></div>
      <div class="outfit-category"><p class="outfit-category__label">top</p><div class="outfit-options" id="topOpts"></div></div>
      <div class="outfit-category"><p class="outfit-category__label">accessory</p><div class="outfit-options" id="accOpts"></div></div>
      <button class="jump-btn" id="outfitSubmit" disabled>reveal your fairy ✨</button>`;

    function renderGroup(id, opts, key){
      const wrap = document.getElementById(id);
      opts.forEach((emoji, idx)=>{
        const b = document.createElement("button");
        b.className = "outfit-option"; b.type = "button"; b.textContent = emoji;
        b.addEventListener("click", ()=>{
          [...wrap.children].forEach(c=>c.classList.remove("picked"));
          b.classList.add("picked");
          picks[key] = idx;
          document.getElementById("outfitSubmit").disabled = !(picks.wings!==null && picks.top!==null && picks.acc!==null);
        });
        wrap.appendChild(b);
      });
    }
    renderGroup("wingsOpts", wingsOpts, "wings");
    renderGroup("topOpts", topOpts, "top");
    renderGroup("accOpts", accOpts, "acc");

    document.getElementById("outfitSubmit").addEventListener("click", ()=>{
      let matches = 0;
      if (picks.wings === theme.wings) matches++;
      if (picks.top === theme.top) matches++;
      if (picks.acc === theme.acc) matches++;
      const coins = Math.max(6, matches*12 + (matches===3 ? 14 : 0));
      const label = matches===3 ? "perfect match!" : matches===2 ? "lovely fit" : "a bold choice";
      showChallengeResult("👗", label, `your outfit matched ${matches} of 3 pieces for ${theme.name}.`, coins);
    });

    Game._activeCleanup = ()=>{};
    openChallengeOverlay();
  }

  // ---------- 4. Enchanted Garden ----------
  function startEnchantedGarden(){
    const duration = 15, size = 9;
    let timeLeft = duration, score = 0, spawnTimer = null, countdownTimer = null;

    challengeContent.innerHTML = `
      <h2>🌸 Enchanted Garden</h2>
      <p class="challenge-modal__intro">Tap the sparkling flowers before they vanish!</p>
      <div class="challenge-timer"><div class="challenge-timer__fill" id="gardenTimerFill"></div></div>
      <div class="tile-grid" id="gardenGrid"></div>
      <p class="challenge-status" id="gardenStatus">score: 0</p>`;

    const grid = document.getElementById("gardenGrid");
    const tiles = [];
    for (let i=0;i<size;i++){
      const btn = document.createElement("button");
      btn.className = "tile"; btn.type = "button"; btn.textContent = "🌿"; btn.dataset.active = "0";
      btn.addEventListener("click", ()=>{
        if (btn.dataset.active === "1"){
          score++;
          document.getElementById("gardenStatus").textContent = `score: ${score}`;
          btn.dataset.active = "0"; btn.textContent = "🌿"; btn.classList.remove("found");
        }
      });
      grid.appendChild(btn); tiles.push(btn);
    }

    function spawn(){
      tiles.forEach(t=>{ if (t.dataset.active === "1"){ t.dataset.active = "0"; t.textContent = "🌿"; t.classList.remove("found"); } });
      const idx = Math.floor(Math.random()*size);
      tiles[idx].dataset.active = "1";
      tiles[idx].textContent = "🌸";
      tiles[idx].classList.add("found");
      spawnTimer = setTimeout(spawn, 750);
    }
    spawn();

    countdownTimer = setInterval(()=>{
      timeLeft--;
      document.getElementById("gardenTimerFill").style.width = (timeLeft/duration*100) + "%";
      if (timeLeft <= 0){
        clearInterval(countdownTimer); clearTimeout(spawnTimer);
        const coins = Math.max(8, Math.min(60, score*6));
        showChallengeResult("🌸", score>=6 ? "garden in full bloom!" : "garden explored", `you gathered ${score} sparkles.`, coins);
      }
    }, 1000);

    Game._activeCleanup = ()=>{ clearInterval(countdownTimer); clearTimeout(spawnTimer); };
    openChallengeOverlay();
  }

  // ---------- 5. Cooking Chaos ----------
  function startCookingChaos(){
    const icons = ["☕","🥐","🍰","🍓","🧁","🍯","🥧","🍵"];
    const orders = 3, perOrderTime = 10;
    let orderNum = 0, score = 0, currentOrder = [], progress = 0, timeLeft = 0, timer = null;

    challengeContent.innerHTML = `
      <h2>🍳 Cooking Chaos</h2>
      <p class="challenge-modal__intro">Serve each order by tapping the ingredients in the order shown!</p>
      <div class="challenge-timer"><div class="challenge-timer__fill" id="cookTimerFill"></div></div>
      <div class="order-ticket"><p class="order-ticket__label">order <span id="cookOrderNum">1</span> of ${orders}</p><div class="order-ticket__items" id="cookOrderItems"></div></div>
      <div class="cook-options" id="cookOptions"></div>
      <p class="cook-score" id="cookScore">served: 0 / ${orders}</p>`;

    const optWrap = document.getElementById("cookOptions");
    icons.forEach(icon=>{
      const b = document.createElement("button");
      b.className = "cook-option"; b.type = "button"; b.textContent = icon;
      b.addEventListener("click", ()=> handleIngredient(icon, b));
      optWrap.appendChild(b);
    });

    function newOrder(){
      orderNum++;
      progress = 0;
      const len = 2 + Math.floor(Math.random()*2);
      currentOrder = Array.from({length:len}, ()=> icons[Math.floor(Math.random()*icons.length)]);
      document.getElementById("cookOrderNum").textContent = orderNum;
      document.getElementById("cookOrderItems").textContent = currentOrder.join(" ");
      timeLeft = perOrderTime;
      document.getElementById("cookTimerFill").style.width = "100%";
      clearInterval(timer);
      timer = setInterval(()=>{
        timeLeft -= 0.2;
        document.getElementById("cookTimerFill").style.width = Math.max(0, (timeLeft/perOrderTime*100)) + "%";
        if (timeLeft <= 0){ clearInterval(timer); nextOrFinish(); }
      }, 200);
    }

    function handleIngredient(icon, btn){
      if (icon === currentOrder[progress]){
        progress++;
        if (progress === currentOrder.length){
          clearInterval(timer);
          score++;
          document.getElementById("cookScore").textContent = `served: ${score} / ${orders}`;
          nextOrFinish();
        }
      } else {
        btn.classList.add("wrong-flash");
        setTimeout(()=> btn.classList.remove("wrong-flash"), 250);
      }
    }

    function nextOrFinish(){
      if (orderNum >= orders){
        const coins = Math.max(8, score*15);
        showChallengeResult("🍳", score===orders ? "kitchen hero!" : "orders served", `you completed ${score} of ${orders} orders.`, coins);
      } else {
        newOrder();
      }
    }
    newOrder();

    Game._activeCleanup = ()=>{ clearInterval(timer); };
    openChallengeOverlay();
  }

  // ---------- 6. Fairy Library ----------
  function startLibrary(){
    const books = [
      { title:"Moonlit Tales", fact:"Fairies who read at dusk see truer dreams." },
      { title:"Petal & Ash", fact:"Every garden hides one door that only opens at midnight." },
      { title:"The Lantern Keeper", fact:"A single kindness can light a whole forest." },
      { title:"Whispers of the Grove", fact:"The oldest trees remember every wish ever made beneath them." },
    ];
    const book = books[Math.floor(Math.random()*books.length)];
    challengeContent.innerHTML = `
      <h2>📚 Fairy Library</h2>
      <p class="challenge-modal__intro">You pull a book from the shelf: <strong>${book.title}</strong></p>
      <p style="text-align:center; font-style:italic; color:var(--plum-soft);">"${book.fact}"</p>
      <button class="jump-btn" id="libContinue">close the book</button>`;
    document.getElementById("libContinue").addEventListener("click", ()=>{
      showChallengeResult("📚", "story discovered", "a little lore is part of a perfect day too.", 8);
    });
    Game._activeCleanup = ()=>{};
    openChallengeOverlay();
  }

  // ================= PASS 3: shops, customization, random events =================

  // ---------- catalog ----------
  const CATALOG = {
    wings: [
      { id:"w1", name:"Petal Wings", emoji:"🦋", price:0 },
      { id:"w2", name:"Glass Wings", emoji:"🪽", price:40 },
      { id:"w3", name:"Starlight Wings", emoji:"✨", price:90 },
    ],
    accessories: [
      { id:"a1", name:"Daisy Crown", emoji:"🌼", price:0 },
      { id:"a2", name:"Royal Tiara", emoji:"👑", price:60 },
      { id:"a3", name:"Moon Charm", emoji:"🔮", price:100 },
    ],
    home: [
      { id:"h1", name:"Mushroom Lamp", emoji:"🍄", price:30 },
      { id:"h2", name:"Flower Bed", emoji:"🛏️", price:55 },
      { id:"h3", name:"Star Window", emoji:"🌠", price:85 },
    ],
    market: [
      { id:"m1", name:"Lucky Charm", emoji:"🍀", price:35 },
      { id:"m2", name:"Dream Jar", emoji:"🫙", price:50 },
      { id:"m3", name:"Tiny Lantern", emoji:"🏮", price:45 },
    ],
    flowers: [
      { id:"f1", name:"Wild Rose", emoji:"🌹", price:20 },
      { id:"f2", name:"Moon Lily", emoji:"🌙", price:45 },
      { id:"f3", name:"Sunburst Daisy", emoji:"🌻", price:35 },
    ],
  };

  Game.wardrobe = { wings:"w1", accessory:"a1" };
  Game.owned = new Set(["w1","a1"]);

  function renderAvatar(){
    const wing = CATALOG.wings.find(w=>w.id===Game.wardrobe.wings);
    const acc = CATALOG.accessories.find(a=>a.id===Game.wardrobe.accessory);
    fairy.textContent = `${acc.emoji}🧚‍♀️${wing.emoji}`;
  }

  // ---------- generic shop screen ----------
  function openShop(title, emoji, categories, defaultCat){
    let activeCat = defaultCat;

    function render(){
      const items = CATALOG[activeCat];
      const isWardrobe = activeCat === "wings" || activeCat === "accessories";
      challengeContent.innerHTML = `
        <h2>${emoji} ${title}</h2>
        <div class="avatar-preview" id="shopAvatarPreview"></div>
        <div class="shop-tabs" id="shopTabs"></div>
        <div class="shop-grid" id="shopGrid"></div>
        <p class="challenge-status">🪙 ${Game.state.coins} coins</p>`;

      if (isWardrobe) document.getElementById("shopAvatarPreview").textContent = fairy.textContent;
      else document.getElementById("shopAvatarPreview").remove();

      const tabsWrap = document.getElementById("shopTabs");
      categories.forEach(cat=>{
        const b = document.createElement("button");
        b.className = "shop-tab" + (cat.key===activeCat ? " active" : "");
        b.type = "button"; b.textContent = cat.label;
        b.addEventListener("click", ()=>{ activeCat = cat.key; render(); });
        tabsWrap.appendChild(b);
      });

      const grid = document.getElementById("shopGrid");
      items.forEach(item=>{
        const owned = Game.owned.has(item.id);
        const equipped = isWardrobe && (Game.wardrobe.wings===item.id || Game.wardrobe.accessory===item.id);
        const btn = document.createElement("button");
        btn.className = "shop-item" + (owned ? " owned" : "") + (equipped ? " equipped" : "");
        btn.type = "button";
        btn.disabled = !owned && item.price > Game.state.coins;
        btn.innerHTML = `
          <span class="shop-item__emoji">${item.emoji}</span>
          <span class="shop-item__name">${item.name}</span>
          <span class="shop-item__price">${owned ? (equipped ? "equipped" : "tap to equip") : "🪙 " + item.price}</span>`;
        btn.addEventListener("click", ()=>{
          if (!owned){
            if (item.price > Game.state.coins) return;
            Game.addCoins(-item.price);
            Game.owned.add(item.id);
            Game.showFeed(`bought ${item.name} 🪙-${item.price}`);
          }
          if (isWardrobe){
            if (activeCat === "wings") Game.wardrobe.wings = item.id;
            else Game.wardrobe.accessory = item.id;
            renderAvatar();
          } else {
            Game.showFeed(`${item.name} added to your ${title.toLowerCase()} ✨`);
          }
          render();
        });
        grid.appendChild(btn);
      });
    }
    render();
    Game._activeCleanup = ()=>{};
    openChallengeOverlay();
  }

  function startBoutique(){
    openShop("Fairy Boutique", "👗",
      [{key:"wings",label:"wings"},{key:"accessories",label:"accessories"}], "wings");
  }
  function startHome(){
    openShop("Fairy Home", "🏡", [{key:"home",label:"decor"}], "home");
  }
  function startMarket(){
    openShop("Fairy Market", "🛍️", [{key:"market",label:"lifestyle"}], "market");
  }
  function startFlowerShop(){
    openShop("Flower Shop", "🌷", [{key:"flowers",label:"blooms"}], "flowers");
  }
  function startPark(){
    // light activity: quick relaxing mini-interaction, small guaranteed coin reward
    challengeContent.innerHTML = `
      <h2>🌳 Fairy Park</h2>
      <p class="challenge-modal__intro">You wander the park, greet fellow fairies, and rest under a blossom tree.</p>
      <p style="text-align:center; font-size:2rem;">🌳🦋🌼</p>
      <button class="jump-btn" id="parkContinue">continue your day</button>`;
    document.getElementById("parkContinue").addEventListener("click", ()=>{
      showChallengeResult("🌳", "peaceful stroll", "a little rest is part of a perfect day too.", 8);
    });
    Game._activeCleanup = ()=>{};
    openChallengeOverlay();
  }

  // ---------- random events ----------
  const EVENTS = [
    { icon:"🌙", name:"Nightfall", msg:"Nightfall settles early — the sky dims softly.", effect:()=>{} },
    { icon:"🧚", name:"Pixie Storm", msg:"A Pixie Storm swirls through! +15 🪙", effect:()=>Game.addCoins(15) },
    { icon:"🔐", name:"Lockdown", msg:"A gentle Lockdown — the market closes for a moment.", effect:()=>{} },
    { icon:"🌸", name:"Flower Bloom", msg:"A Flower Bloom bursts across the garden! +10 🪙", effect:()=>Game.addCoins(10) },
    { icon:"💎", name:"Treasure Drop", msg:"A Treasure Drop sparkles nearby! +25 🪙", effect:()=>Game.addCoins(25) },
    { icon:"🌀", name:"Fairy Portal", msg:"A Fairy Portal hums to life, humming with magic.", effect:()=>{} },
    { icon:"🌧️", name:"Enchanted Rain", msg:"Enchanted Rain falls — every petal glimmers.", effect:()=>{} },
    { icon:"🦋", name:"Butterfly Swarm", msg:"A Butterfly Swarm drifts past! +12 🪙", effect:()=>Game.addCoins(12) },
  ];
  const eventBanner = document.getElementById("eventBanner");

  function triggerRandomEvent(){
    if (!Game.state.running) return;
    const ev = EVENTS[Math.floor(Math.random()*EVENTS.length)];
    ev.effect();
    eventBanner.innerHTML = `<span>${ev.icon}</span><span>${ev.msg}</span>`;
    eventBanner.classList.add("show");
    setTimeout(()=> eventBanner.classList.remove("show"), 3200);
  }

  function scheduleNextEvent(){
    // a random event roughly every 2.5-4.5 in-game minutes (150-270 real seconds)
    const delay = (150 + Math.random()*120) * 1000;
    Game._eventTimer = setTimeout(()=>{
      triggerRandomEvent();
      scheduleNextEvent();
    }, delay);
  }

  // ---------- router: wires the map to the games/shops above ----------
  Game.onLocationOpen = function(key, name){
    switch (key){
      case "keys":        startLostKeys(); break;
      case "obby":         startFairyObby(); break;
      case "boutique":     startPerfectOutfit(); break;
      case "garden":       startEnchantedGarden(); break;
      case "cafe":         startCookingChaos(); break;
      case "home":         startHome(); break;
      case "market":       startMarket(); break;
      case "park":         startPark(); break;
      case "library":      startLibrary(); break;
      case "flowershop":   startFlowerShop(); break;
      default: Game.showFeed(`${name} isn't ready yet`);
    }
  };

  renderAvatar();
  scheduleNextEvent();

  // ===== boot =====
  body.classList.add("time-morning");
  tick();
})();
