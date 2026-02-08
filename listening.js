(function(){
  const $ = s => document.querySelector(s);

  const app = $("#app");
  const statusEl = $("#scormStatus");
  const err = $("#loadError");
  const phraseSelect=$("#phraseSelect"), targetText=$("#targetText");
  const kpiBest=$("#kpiBest"), kpiLast=$("#kpiLast"), kpiTries=$("#kpiTries"), kpiFluency=$("#kpiFluency");
  const recState=$("#recState"), recognizedText=$("#recognizedText"), percent=$("#percent"), bar=$("#bar"), diff=$("#diff"), countdownEl=$("#countdown");
  const rate=$("#rate"), rateVal=$("#rateVal"), accent=$("#accent"), voiceSelect=$("#voiceSelect");
  const play=$("#play"), startBtn=$("#start"), stopBtn=$("#stop"), clearBtn=$("#clear"), repeat=$("#repeat"), practice3=$("#practice3");
  const phoneticTips=$("#phoneticTips");

  let phrases = [];
  let progress = {}; // idx -> {best,last,tries}
  const PRACTICE_WINDOW_MS = 6000;
  const TTS_TO_STT_BUFFER_MS = 600;

  let lastComputedPercent = 0;

  // ====== TTS VOICES (Google US/UK only) ======
  let allVoices = [];
  function loadVoices(){
    allVoices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    renderVoices();
  }
  function renderVoices(){
    if(!voiceSelect) return;
    const chosenLocale = (accent && accent.value) || "en-US";
    voiceSelect.innerHTML = "";
    const isUS = chosenLocale.toLowerCase().startsWith("en-us");
    const allowLangs = isUS ? ["en-US"] : ["en-GB"];
    const candidates = allVoices.filter(v=>{
      const okName = v.name && v.name.toLowerCase().includes("google");
      const okLang = v.lang && allowLangs.some(l=>v.lang.toLowerCase().startsWith(l.toLowerCase()));
      return okName && okLang;
    });
    candidates.forEach(v=>{
      const opt=document.createElement("option");
      opt.value = v.name;
      opt.textContent = ${v.name} (${v.lang});
      voiceSelect.appendChild(opt);
    });
    if(voiceSelect.options.length===0){
      const opt=document.createElement("option");
      opt.value=""; opt.textContent="(Google no disponible; s'usarÃ  la veu per defecte)";
      voiceSelect.appendChild(opt);
    }
  }
  if(window.speechSynthesis){
    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }

  function normalizeText(t){ return (t||'').toLowerCase().replace(/[^a-z'\s-]/g,' ').replace(/\s+/g,' ').trim(); }
  function tokenize(t){ return normalizeText(t).split(' ').filter(Boolean); }
  function levenshtein(a,b){
    const m=a.length, n=b.length;
    const dp = Array.from({length:m+1}, _=>Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0]=i;
    for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++){
      for(let j=1;j<=n;j++){
        const cost = a[i-1]===b[j-1]?0:1;
        dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
      }
    }
    return dp[m][n];
  }
  function backtrackOps(refTokens, hypTokens){
    const m=refTokens.length, n=hypTokens.length;
    const dp = Array.from({length:m+1}, _=>Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0]=i;
    for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++){
      for(let j=1;j<=n;j++){
        const cost = refTokens[i-1]===hypTokens[j-1]?0:1;
        dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
      }
    }
    let i=m,j=n,ops=[];
    while(i>0||j>0){
      if(i>0&&j>0&&dp[i][j]===dp[i-1][j-1]&&refTokens[i-1]===hypTokens[j-1]){ ops.push({type:"match", ref:refTokens[i-1], hyp:hypTokens[j-1]}); i--; j--; }
      else if(i>0&&j>0&&dp[i][j]===dp[i-1][j-1]+1){ ops.push({type:"sub", ref:refTokens[i-1], hyp:hypTokens[j-1]}); i--; j--; }
      else if(i>0&&dp[i][j]===dp[i-1][j]+1){ ops.push({type:"del", ref:refTokens[i-1], hyp:null}); i--; }
      else { ops.push({type:"ins", ref:null, hyp:hypTokens[j-1]}); j--; }
    }
    return ops.reverse();
  }
  function buildDiff(refTokens,hypTokens){
    const ops = backtrackOps(refTokens,hypTokens);
    return ops.map(op=>{
      if(op.type==="match") return <ins>${op.ref}</ins>;
      if(op.type==="sub") return <em>${op.hyp}</em>/<del>${op.ref}</del>;
      if(op.type==="del") return <del>${op.ref}</del>;
      return <em>${op.hyp}</em>;
    }).join(' ');
  }

  function setScoreDisplay(p){
    lastComputedPercent = Math.max(0, Math.min(100, Math.round(p||0)));
    if(percent) percent.textContent = lastComputedPercent + "%";
    if(bar) bar.style.width = lastComputedPercent + "%";
  }

  function percentFromWER(refTokens,hypTokens){
    if(refTokens.length===0) return 0;
    const dist = levenshtein(refTokens,hypTokens);
    const wer = Math.min(1, dist/refTokens.length);
    return Math.round((1-wer)*100);
  }
  function setPhoneticTips(keys){
    if(!phoneticTips) return;
    if(!keys || keys.length===0){ phoneticTips.textContent="Cap patrÃ³ dâ€™error detectat. Bona feina!"; return; }
    const map = {
      th_voiceless: "Sona /Î¸/ (â€œthinâ€): llengua lleu entre dents, sense vibraciÃ³.",
      th_voiced:   "Sona /Ã°/ (â€œthisâ€): llengua entre dents amb vibraciÃ³ suau.",
      dropped_ed:  "Final -ed: marca la -ed (verbs en passat).",
      plural_s:    "Final -s/-es: marca plurals i 3a persona.",
      final_stop:  "Consonant final: tanca lleument p/t/k/d/g/b."
    };
    const ul = document.createElement("ul");
    keys.forEach(k=>{ const li=document.createElement("li"); li.textContent=map[k]||k; ul.appendChild(li); });
    phoneticTips.innerHTML=""; phoneticTips.appendChild(ul);
  }
  function renderKPIs(idx){
    const p = progress[idx] || {best:0,last:0,tries:0};
    if(kpiBest) kpiBest.textContent = Millor: ${p.best||0}%;
    if(kpiLast) kpiLast.textContent = Ãšltim: ${p.last||0}%;
    if(kpiTries) kpiTries.textContent = Intents: ${p.tries||0};
  }
  function refreshPhraseSelect(opts){ opts=Object.assign({preserve:false, updateTarget:true}, opts||{});
    if(!phraseSelect) return;
    const prev = parseInt(phraseSelect.value||"0",10)||0;
    phraseSelect.innerHTML="";
    phrases.forEach((p,idx)=>{
      const stats = progress[idx] || {};
      const ok = (stats.best||0) >= window.SCORMCFG.passmarkPerPhrase;
      const opt=document.createElement("option");
      opt.value=idx; opt.textContent=${idx+1}. ${p}${ok?" âœ”ï¸":""};
      phraseSelect.appendChild(opt);
    });
    let idxToUse = 0;
    if (opts.preserve) idxToUse = Math.min(prev, Math.max(phrases.length-1,0));
    phraseSelect.value = String(idxToUse);
    if (opts.updateTarget && targetText){
      targetText.textContent = phrases[idxToUse] || "";
      renderKPIs(idxToUse);
    }
  }
  function updateScoreAndDiff(){
    if(!recognizedText || !targetText) return;
    const ref=tokenize(targetText.textContent);
    const hyp=tokenize(recognizedText.textContent);
    const p=percentFromWER(ref,hyp);
    setScoreDisplay(p); // live preview
    if(diff) diff.innerHTML=buildDiff(ref,hyp);
  }
  function setState(s){ if(recState) recState.textContent=s; }

  function pickVoice(){
    if(!window.speechSynthesis) return null;
    const chosenName = voiceSelect && voiceSelect.value;
    const chosenLocale = (accent && accent.value) || "en-US";
    const voices = speechSynthesis.getVoices();
    if(chosenName){
      const v = voices.find(v=>v.name===chosenName);
      if(v) return v;
    }
    const prefer = voices.filter(v => v.name && v.name.toLowerCase().includes("google") && v.lang && v.lang.toLowerCase().startsWith(chosenLocale.toLowerCase()));
    return prefer[0] || null;
  }

  function speak(text){
    return new Promise(resolve=>{
      try{
        const u=new SpeechSynthesisUtterance(text);
        u.lang=(accent && accent.value)||"en-US";
        const v = pickVoice();
        if(v) u.voice = v;
        u.rate=(rate && +rate.value)||1;
        u.onend=()=>resolve();
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      }catch(e){ resolve(); }
    });
  }

  // ===== Robust SpeechRecognition session wrapper =====
  function startRecognitionSession(lang){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) throw new Error("Web Speech API no suportada");
    const r=new SR(); r.lang=lang||"en-US"; r.continuous=true; r.interimResults=true; r.maxAlternatives=1;

    let finalTextLocal = "", interimTextLocal = "", lastFinalChunk="";
    let ended=false;

    r.onresult = (ev)=>{
      for(let i=ev.resultIndex; i<ev.results.length; i++){
        const res = ev.results[i];
        const str = res[0].transcript;
        if(res.isFinal){
          const curr = (str||"").trim().toLowerCase();
          if(curr && curr !== lastFinalChunk){
            finalTextLocal = (finalTextLocal + " " + str).trim();
            lastFinalChunk = curr;
          }
          interimTextLocal = "";
        } else {
          interimTextLocal = str;
        }
      }
      if(recognizedText){
        recognizedText.textContent = normalizeText((finalTextLocal + " " + interimTextLocal).trim());
        updateScoreAndDiff();
      }
    };
    r.onend = ()=>{ ended=true; };
    r.start();

    async function stop(){
      try{ r.stop(); }catch(_){}
      // Drain any late results:
      const t0 = Date.now();
      while(!ended && Date.now()-t0 < 800){ await new Promise(r=>setTimeout(r,40)); }
      // Extra small delay to ensure UI updated
      await new Promise(r=>setTimeout(r,120));
      const frozen = normalizeText((finalTextLocal + " " + interimTextLocal).trim());
      return frozen;
    }

    return { stop };
  }

  function computeScoreForText(text){
    const ref=tokenize(targetText.textContent||"");
    const hyp=tokenize(text||"");
    return percentFromWER(ref,hyp);
  }

  function recordAttemptAll(frozenText, durationMs, frozenScore){
    if(recognizedText) recognizedText.textContent = frozenText || "";
    updateScoreAndDiff(); // refresh diff with frozen text
    setScoreDisplay(frozenScore); // freeze big counter

    const idx = phraseSelect ? parseInt(phraseSelect.value,10) : 0;
    const p = progress[idx] || {best:0,last:0,tries:0};
    p.last = frozenScore; p.best = Math.max(p.best||0, frozenScore); p.tries = (p.tries||0)+1;
    progress[idx]=p;
    renderKPIs(idx);
    refreshPhraseSelect({preserve:true, updateTarget:false});

    // Tips (based on frozen text)
    const refTokens = tokenize(targetText.textContent||"");
    const hypTokens = tokenize(frozenText||"");
    const ops = backtrackOps(refTokens, hypTokens);
    const tips = [];
    for(const op of ops){
      if(op.type==="sub"){
        const r=op.ref||"", h=op.hyp||"";
        if(r.startsWith("th") && (h.startsWith("t")||h.startsWith("s")||h.startsWith("f"))) tips.push("th_voiceless");
        if(["this","that","these","those","there","their","them","the","then","though"].includes(r) && (h.startsWith("d")||h.startsWith("z"))) tips.push("th_voiced");
        if(r.endsWith("ed") && (h===r.slice(0,-2) || h.endsWith("e") || h.endsWith("d"))) tips.push("dropped_ed");
        if(r.endsWith("s") && !h.endsWith("s")) tips.push("plural_s");
        if(/[ptkbdg]$/.test(r) && !/[ptkbdg]$/.test(h)) tips.push("final_stop");
      } else if(op.type==="del"){
        const r=op.ref||"";
        if(r.startsWith("th")) tips.push("th_voiceless");
        if(["this","that","these","those","there","their","them","the","then","though"].includes(r)) tips.push("th_voiced");
        if(r.endsWith("ed")) tips.push("dropped_ed");
        if(r.endsWith("s")) tips.push("plural_s");
        if(/[ptkbdg]$/.test(r)) tips.push("final_stop");
      }
    }
    setPhoneticTips(Array.from(new Set(tips)));

    if(durationMs && durationMs>0 && kpiFluency){
      const wordsSpoken = tokenize(frozenText).length || 1;
      const wpm = Math.round(wordsSpoken / (durationMs/60000));
      kpiFluency.textContent = FluÃ¯desa: ${wpm} WPM;
    }

    if (window.onAttemptRecorded) {
      window.onAttemptRecorded({score: frozenScore, progress, phrases});
    }
  }

  async function countdown(n=3){
    if(!countdownEl) return;
    for(let i=n;i>0;i--){ countdownEl.textContent = i; await new Promise(r=>setTimeout(r,700)); }
    countdownEl.textContent = "JA!"; await new Promise(r=>setTimeout(r,300)); countdownEl.textContent = "";
  }

  async function practiceOnce(){
    if(targetText) await speak(targetText.textContent);
    await new Promise(r=>setTimeout(r, TTS_TO_STT_BUFFER_MS));
    await countdown(3);

    if(recognizedText) recognizedText.textContent="";
    if(diff) diff.innerHTML=""; setScoreDisplay(0);

    let session;
    try{
      session = startRecognitionSession((accent && accent.value)||"en-US");
    }catch(e){
      alert("El teu navegador no admet la Web Speech API."); return;
    }
    const startMs = Date.now();
    await new Promise(r=>setTimeout(r, PRACTICE_WINDOW_MS));
    const frozen = await session.stop();
    const frozenScore = computeScoreForText(frozen);
    recordAttemptAll(frozen, Date.now()-startMs, frozenScore);
  }

  function wireUI(){
    if(rate && rateVal){ rate.addEventListener("input",()=> rateVal.textContent=${(+rate.value).toFixed(2)}Ã—); }
    if(accent){ accent.addEventListener("change", renderVoices); }
    if(phraseSelect){
      phraseSelect.addEventListener("change", ()=>{
        const idx = parseInt(phraseSelect.value, 10);
        if(targetText) targetText.textContent = phrases[idx] || "";
        if(recognizedText) recognizedText.textContent=""; if(diff) diff.innerHTML=""; setScoreDisplay(0);
        renderKPIs(idx);
      });
    }
    if(play){ play.addEventListener("click",()=>{ if(targetText) speak(targetText.textContent); }); }
    if(repeat){ repeat.addEventListener("click",()=>{ if(targetText) speak(targetText.textContent); }); }
    if(clearBtn){ clearBtn.addEventListener("click", ()=>{ if(recognizedText) recognizedText.textContent=""; if(diff) diff.innerHTML=""; setScoreDisplay(0); }); }

    if(startBtn){
      let runningSession = null, startMs=0;
      startBtn.addEventListener("click", async ()=>{
        if(runningSession) return;
        if(recognizedText) recognizedText.textContent=""; if(diff) diff.innerHTML=""; setScoreDisplay(0);
        try{
          runningSession = startRecognitionSession((accent && accent.value)||"en-US");
        }catch(e){ alert("El teu navegador no admet la Web Speech API. Usa Chrome o Edge."); return; }
        startMs = Date.now();
        if(stopBtn) stopBtn.disabled=false; startBtn.disabled=true; setState("escoltantâ€¦");
      });
      if(stopBtn){
        stopBtn.addEventListener("click", async ()=>{
          if(!runningSession) return;
          const frozen = await runningSession.stop();
          runningSession = null;
          const frozenScore = computeScoreForText(frozen);
          recordAttemptAll(frozen, Date.now()-startMs, frozenScore);
          if(startBtn) startBtn.disabled=false; if(stopBtn) stopBtn.disabled=true; setState("inactiu");
        });
      }
    }

    if(practice3){
      practice3.addEventListener("click", async ()=>{
        practice3.disabled=true;
        for(let i=0;i<3;i++){
          await practiceOnce();
          await new Promise(r=>setTimeout(r,400));
        }
        practice3.disabled=false;
      });
    }
  }

function bindShift() {
  const SHORT_MS = 200;
  let running = false;

  async function practiceAllPhrases() {
    if (running || !phraseSelect) return;
    running = true;

    for (let i = 0; i < phraseSelect.options.length; i++) {
      phraseSelect.value = i;
      phraseSelect.dispatchEvent(new Event("change"));

      let session;
      try {
        session = startRecognitionSession(
          (accent && accent.value) || "en-US"
        );
      } catch (e) {
        console.error("SpeechRecognition not supported.");
        break;
      }

      await new Promise((r) => setTimeout(r, SHORT_MS));
      const frozen = await session.stop();
      const frozenScore = computeScoreForText(frozen);
      recordAttemptAll(frozen, SHORT_MS, frozenScore);
    }

    running = false;
  }

  document.addEventListener("keydown", (e) => {
    if (e.shiftKey && !e.repeat) {
      e.preventDefault();
      practiceAllPhrases();
    }
  });

  console.log("Shift key bound: auto-run all phrases (200ms each)");
}

  async function boot(){
    let cfg={activityType:"exam", passmark:70, passmarkPerPhrase:80, gradeMethod:"best"};
    try{
      const resCfg = await fetch('scorm_config.json', {cache:'no-store'});
      if(resCfg.ok){ cfg = Object.assign(cfg, await resCfg.json()); }
    }catch(_){}
    window.SCORMCFG = cfg;

    let scormOK=false;
    try{ scormOK = window.SCORM12 && SCORM12.init(); }catch(_){}
    if(statusEl){ statusEl.textContent = scormOK ? "SCORM connectat" : "SCORM no disponible (mode local)"; }

    try{
      const res = await fetch('./phrases.json', { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const arr = await res.json();
      if(!Array.isArray(arr) || !arr.every(x=>typeof x==='string')) throw new Error('El JSON ha de ser un array de cadenes.');
      phrases = arr;
    }catch(e){
      if(err) err.textContent = "No s'han pogut carregar les frases des de phrases.json ("+(e.message||e)+").";
      return;
    }
    if(phrases.length===0){ if(err) err.textContent = "El fitxer phrases.json estÃ  buit."; return; }

    if(app) app.hidden=false;
    refreshPhraseSelect({preserve:false, updateTarget:true});
    wireUI();
    bindShift();

    if (window.afterBoot) window.afterBoot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

window.afterBoot = function(){
  try{ if(SCORM12){ SCORM12.set("cmi.core.lesson_status","incomplete"); SCORM12.commit(); } }catch(_){}
};
window.onAttemptRecorded = function({score, progress, phrases}){
  var pass = true;
  var req = (window.SCORMCFG && window.SCORMCFG.passmarkPerPhrase) || 80;
  for(var i=0;i<phrases.length;i++){
    var p=progress[i] || {best:0};
    if((p.best||0) < req){ pass=false; break; }
  }
  try{
    if(SCORM12){
      if(pass){
        SCORM12.set("cmi.core.lesson_status","completed");
        SCORM12.set("cmi.core.score.raw", 100);
      }else{
        SCORM12.set("cmi.core.lesson_status","incomplete");
        SCORM12.set("cmi.core.score.raw", 0);
      }
      SCORM12.commit();
    }
  }catch(_){}
};