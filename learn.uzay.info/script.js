function parseText(txt) {
    const blocks = txt.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const cards = [];
    for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
            const word = lines[0];
            const definition = lines[1];
            const examples = lines.slice(2);
            cards.push({ word, definition, examples });
        }
    }
    return cards;
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

let allCards = [], currentBatch = [], mcQueue = [], classicQueue = [], flashcardQueue = [];
let batchSize = 12, globalQueue = [], state = 'idle'; 
let waitingClassic = false, totalCorrect = 0, lastAskedClassicCard = null, lastConfirmedPeriod = null;
let loadedFileName = '', speechEnabled = true, musicEnabled = true, useFlashcards = true, delayedControlsTimer = null;
let errorStats = {};
let isProcessingAnswer = false;
let hasStartedSession = false;
let hasUploadedValidFile = false;

const fileInput = document.getElementById('file'), fileLabel = document.getElementById('fileLabel');
const periodSel = document.getElementById('period'), langSel = document.getElementById('lang');
const startBtn = document.getElementById('start'), resetBtn = document.getElementById('reset');
const progress = document.getElementById('progress'), quiz = document.getElementById('quiz');
const definitionEl = document.getElementById('definition'), optionsEl = document.getElementById('options');
const typed = document.getElementById('typed'), checkTyped = document.getElementById('checkTyped');
const writeArea = document.getElementById('writeArea'), resultEl = document.getElementById('result');
const counter = document.getElementById('counter'), continueBtn = document.getElementById('continueBtn');
const hintBtn = document.getElementById('hintBtn'), correctBtn = document.getElementById('correctBtn'), dontKnowBtn = document.getElementById('dontKnowBtn');
const progressBar = document.getElementById('progressBar'), switchBox = document.getElementById('switchBox');
const speechSwitch = document.getElementById('speechSwitch'), musicSwitch = document.getElementById('musicSwitch'), flashcardSwitch = document.getElementById('flashcardSwitch');

const correctSound = document.getElementById('correctSound');
const finishBatchSound = document.getElementById('finishBatchSound');
const finishAllSound = document.getElementById('finishAllSound');

const flashcardArea = document.getElementById('flashcardArea');
const fcBox = document.getElementById('fcBox');
const fcWord = document.getElementById('fcWord');
const fcDetails = document.getElementById('fcDetails');
const fcDef = document.getElementById('fcDef');
const fcExamples = document.getElementById('fcExamples');
const fcNextBtn = document.getElementById('fcNextBtn');
const fcInstruction = document.getElementById('fcInstruction');
const wifiIcon = document.getElementById('wifiIcon');

let isOnline = navigator.onLine;

if (!isOnline) {
    wifiIcon.style.display = 'inline-block';
}

window.addEventListener('online', () => {
    isOnline = true;
    wifiIcon.style.display = 'none';
});

window.addEventListener('offline', () => {
    isOnline = false;
    wifiIcon.style.display = 'inline-block';
    stopSpeech();
});

function updateSwitchBoxLayout() {
    const v = [...switchBox.children].filter(e => e.style.display !== 'none');
    v.length === 1 ? switchBox.classList.add('single') : switchBox.classList.remove('single');
}

function stopSpeech() { 
    speechSynthesis.cancel(); 
}

function stopAllAudio() {
    correctSound.pause();
    finishBatchSound.pause();
    finishAllSound.pause();
    correctSound.currentTime = 0;
    finishBatchSound.currentTime = 0;
    finishAllSound.currentTime = 0;
}

function updateSpeechVisibility() {
    flashcardSwitch.parentElement.style.display = 'inline-flex';
    speechSwitch.parentElement.style.display = langSel.value === 'none' ? 'none' : 'inline-flex';
    musicSwitch.parentElement.style.display = 'inline-flex';
    updateSwitchBoxLayout();
}

speechSwitch.addEventListener('change', () => {
    speechEnabled = speechSwitch.checked;
    if (!speechEnabled) stopSpeech();
});

musicSwitch.addEventListener('change', () => {
    musicEnabled = musicSwitch.checked;
    if (!musicEnabled) stopAllAudio();
});

flashcardSwitch.addEventListener('change', () => {
    useFlashcards = flashcardSwitch.checked;
});

langSel.addEventListener('change', () => {
    updateSpeechVisibility();
    if (state === 'idle') setIdleStatusText();
    else setRunningStatusText();
});

document.getElementById('themeSel').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
});

function playSound(s) {
    if (!musicEnabled) return;
    s.currentTime = 0;
    s.play();
}

function speakWord(word) {
    if (!speechEnabled || !isOnline) return;
    if (state !== 'mc' && state !== 'flashcard') return;
    if (langSel.value === 'none') return;
    const lang = langSel.value;
    const utter = new SpeechSynthesisUtterance(word);
    const map = {
        en: 'en-US', tr: 'tr-TR', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT',
        ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', pt: 'pt-PT',
        nl: 'nl-NL', sv: 'sv-SE', pl: 'pl-PL', hi: 'hi-IN', id: 'id-ID', cs: 'cs-CZ',
        el: 'el-GR', he: 'he-IL', th: 'th-TH', vi: 'vi-VN'
    };
    utter.lang = map[lang] || 'en-US';
    stopSpeech();
    speechSynthesis.speak(utter);
}

function getPeriod() { 
    return parseInt(periodSel.value, 10); 
}

function getDefaultPeriodByCount(c) {
    return c <= 30 ? 6 : c <= 60 ? 12 : 24;
}

function applyDefaultPeriodByCount(c) {
    const p = getDefaultPeriodByCount(c);
    periodSel.value = String(p);
    lastConfirmedPeriod = p;
}

function resetProgressBar() {
    totalCorrect = 0;
    progressBar.style.width = '0%';
}

function updateProgressBar() {
    const t = allCards.length * 2;
    progressBar.style.width = (totalCorrect / t * 100) + '%';
}

function setFileInputVisible(v) {
    document.getElementById('fileUploadWrapper').style.display = v ? 'flex' : 'none';
}

function setStudyControlsVisible(v) {
    periodSel.style.display = v ? 'inline-block' : 'none';
    langSel.style.display = v ? 'inline-block' : 'none';
    startBtn.style.display = v ? 'inline-block' : 'none';
    resetBtn.style.display = v ? 'inline-block' : 'none';
    switchBox.style.display = v ? 'flex' : 'none';
}

function setStartButtonLabel() {
    startBtn.textContent = hasStartedSession ? 'Restart' : 'Start';
}

function langName() {
    return langSel.options[langSel.selectedIndex]?.text || 'None';
}

function getLoadedPrefix() {
    return loadedFileName ? loadedFileName + ': ' : '';
}

function setIdleStatusText() {
    progress.textContent = allCards.length ? 
        getLoadedPrefix() + allCards.length + ' cards loaded. Select a period and a language then click "Start" (Period: ' + getPeriod() + ', Language: ' + langName() + ').' : 
        'Please upload your txt file.';
}

function setRunningStatusText() {
    progress.textContent = getLoadedPrefix() + allCards.length + ' cards loaded (Period: ' + getPeriod() + ', Language: ' + langName() + ').';
}

function showDelayedControls() {
    if (delayedControlsTimer) clearTimeout(delayedControlsTimer);
    if (state !== 'classic' || classicQueue.length === 0) return;
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    hintBtn.style.opacity = '0';
    dontKnowBtn.style.opacity = '0';
    const t = 1600;
    delayedControlsTimer = setTimeout(() => {
        if (state === 'classic' && !waitingClassic && classicQueue.length > 0) {
            hintBtn.style.display = 'inline-block';
            dontKnowBtn.style.display = 'inline-block';
            setTimeout(() => {
                hintBtn.style.opacity = '1';
                dontKnowBtn.style.opacity = '1';
            }, 50);
        }
    }, t);
}

function recordMCError(word) {
    if (!errorStats[word]) {
        errorStats[word] = { mc: 0, classic: 0 };
    }
    errorStats[word].mc++;
}

function recordClassicError(word) {
    if (!errorStats[word]) {
        errorStats[word] = { mc: 0, classic: 0 };
    }
    errorStats[word].classic++;
}

function clearClassicError(word) {
    if (errorStats[word] && errorStats[word].classic > 0) {
        errorStats[word].classic--;
    }
}

function hardReset() {
    if (delayedControlsTimer) clearTimeout(delayedControlsTimer);
    stopSpeech();
    stopAllAudio();
    resetProgressBar();
    allCards = [];
    currentBatch = [];
    mcQueue = [];
    classicQueue = [];
    globalQueue = [];
    flashcardQueue = [];
    errorStats = {};
    state = 'idle';
    waitingClassic = false;
    isProcessingAnswer = false;
    hasStartedSession = false;
    totalCorrect = 0;
    lastAskedClassicCard = null;
    lastConfirmedPeriod = null;
    loadedFileName = '';
    
    flashcardSwitch.checked = true;
    speechSwitch.checked = true;
    musicSwitch.checked = true;
    
    useFlashcards = true;
    speechEnabled = true;
    musicEnabled = true;
    
    quiz.style.display = 'none';
    flashcardArea.style.display = 'none';
    optionsEl.innerHTML = '';
    writeArea.style.display = 'none';
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    correctBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    typed.value = '';
    resultEl.textContent = '';
    counter.textContent = '';
    definitionEl.textContent = '';
    fileInput.value = '';
    periodSel.value = '12';
    langSel.value = 'en';
    switchBox.style.display = 'none';
    
    const elink = document.getElementById('exampleLink');
    if (elink) {
        elink.style.display = hasUploadedValidFile ? 'none' : 'inline';
    }
    
    updateSpeechVisibility();
    setFileInputVisible(true);
    setStudyControlsVisible(false);
    setStartButtonLabel();
    setIdleStatusText();
    updateProgressBar();
    langSel.disabled = false;
    updateSwitchBoxLayout();
}

function beginStudy() {
    if (!allCards.length) {
        progress.textContent = 'Please upload your txt file first.';
        return;
    }
    stopSpeech();
    resetProgressBar();
    shuffle(allCards);
    batchSize = getPeriod();
    globalQueue = allCards.slice();
    errorStats = {};
    
    waitingClassic = false;
    isProcessingAnswer = false;
    hasStartedSession = true;
    lastAskedClassicCard = null;
    lastConfirmedPeriod = batchSize;
    
    setFileInputVisible(false);
    setStudyControlsVisible(true);
    setStartButtonLabel();
    setRunningStatusText();
    switchBox.style.display = 'flex';
    updateSpeechVisibility();
    langSel.disabled = true;
    
    prepareNextBatch();
    updateProgressBar();
}

fileInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.txt')) {
        progress.textContent = 'Invalid file format. Please select a .txt file.';
        fileInput.value = '';
        const elink = document.getElementById('exampleLink');
        if (elink) elink.style.display = 'inline';
        return;
    }
    loadedFileName = f.name;
    const r = new FileReader();
    r.onload = ev => {
        allCards = parseText(ev.target.result);
        if (allCards.length) {
            hasUploadedValidFile = true;
            shuffle(allCards);
            applyDefaultPeriodByCount(allCards.length);
            setFileInputVisible(false);
            setStudyControlsVisible(true);
            setIdleStatusText();
            setStartButtonLabel();
            const elink = document.getElementById('exampleLink');
            if (elink) elink.style.display = 'none';
        } else {
            loadedFileName = '';
            setFileInputVisible(true);
            setStudyControlsVisible(false);
            progress.textContent = 'File is empty or invalid.';
            const elink = document.getElementById('exampleLink');
            if (elink) elink.style.display = 'inline';
        }
    };
    r.readAsText(f, 'utf-8');
});

startBtn.addEventListener('click', () => {
    if (state !== 'idle') {
        const ok = confirm('Changing settings or restarting the session will reset your progress. Are you sure?');
        if (ok) beginStudy();
    } else {
        beginStudy();
    }
});

resetBtn.addEventListener('click', () => {
    const ok = confirm('This will completely reset the application and clear your loaded list. Are you sure?');
    if (ok) hardReset();
});

periodSel.addEventListener('change', () => {
    const v = getPeriod();
    if (state === 'idle') {
        lastConfirmedPeriod = v;
        setIdleStatusText();
        return;
    }
    const ok = confirm('Changing the period will restart your session. Are you sure?');
    if (ok) beginStudy();
    else {
        if (lastConfirmedPeriod != null) periodSel.value = String(lastConfirmedPeriod);
        setRunningStatusText();
    }
});

function displayFinalReport() {
    playSound(finishAllSound);
    progress.textContent = getLoadedPrefix() + 'All (' + batchSize + ') periods (' + allCards.length + ' cards) completed.';
    
    optionsEl.innerHTML = '';
    writeArea.style.display = 'none';
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    correctBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    resultEl.textContent = '';
    counter.textContent = '';
    
    setStartButtonLabel();
    langSel.disabled = false;
    state = 'idle';
    updateSpeechVisibility();

    let reportHTML = `<div style="text-align: left; margin-top: 10px;">`;
    reportHTML += `<h2 style="font-size: 20px; color: var(--text-sec); text-align: center; margin-bottom: 15px;">Detailed Study Report</h2>`;
    
    const errorWords = Object.keys(errorStats).filter(w => errorStats[w].mc > 0 || errorStats[w].classic > 0);
    
    if (errorWords.length === 0) {
        reportHTML += `<p style="text-align: center; color: #166534; font-weight: 600; font-size: 16px;">Perfect! You completed all cards with zero mistakes!</p>`;
    } else {
        reportHTML += `<div style="max-height: 280px; overflow-y: auto; border: 1px solid var(--card-border); border-radius: 10px; background: var(--input-bg); padding: 12px;">`;
        reportHTML += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
        reportHTML += `<tr style="border-bottom: 2px solid var(--card-border); font-weight: 600;">`;
        reportHTML += `<th style="padding: 8px; text-align: left; color: var(--text-sec);">Word</th>`;
        reportHTML += `<th style="padding: 8px; text-align: center; color: var(--text-sec);">Test Mistakes</th>`;
        reportHTML += `<th style="padding: 8px; text-align: center; color: var(--text-sec);">Classic Mistakes</th>`;
        reportHTML += `</tr>`;
        
        errorWords.forEach(word => {
            const mcErrors = errorStats[word].mc || 0;
            const clErrors = errorStats[word].classic || 0;
            reportHTML += `<tr style="border-bottom: 1px solid var(--card-border);">`;
            reportHTML += `<td style="padding: 8px; font-weight: 500;">${word}</td>`;
            reportHTML += `<td style="padding: 8px; text-align: center; color: ${mcErrors > 0 ? 'var(--error-border)' : 'inherit'}; font-weight: ${mcErrors > 0 ? '600' : 'normal'};">${mcErrors}</td>`;
            reportHTML += `<td style="padding: 8px; text-align: center; color: ${clErrors > 0 ? 'var(--error-border)' : 'inherit'}; font-weight: ${clErrors > 0 ? '600' : 'normal'};">${clErrors}</td>`;
            reportHTML += `</tr>`;
        });
        
        reportHTML += `</table>`;
        reportHTML += `</div>`;
    }
    reportHTML += `</div>`;
    
    definitionEl.innerHTML = reportHTML;
}

function prepareNextBatch() {
    if (delayedControlsTimer) clearTimeout(delayedControlsTimer);
    if (globalQueue.length === 0) {
        displayFinalReport();
        return;
    }
    
    currentBatch = globalQueue.splice(0, batchSize);
    
    if (useFlashcards) {
        flashcardQueue = currentBatch.slice();
        state = 'flashcard';
        quiz.style.display = 'none';
        flashcardArea.style.display = 'flex';
        updateSpeechVisibility();
        renderFlashcard();
    } else {
        flashcardArea.style.display = 'none';
        startQuizPhases();
    }
}

function renderFlashcard() {
    const c = flashcardQueue[0];
    fcWord.textContent = c.word;
    fcDef.textContent = c.definition;
    
    fcExamples.innerHTML = '';
    if (c.examples && c.examples.length > 0) {
        c.examples.forEach(ex => {
            const li = document.createElement('li');
            li.textContent = ex;
            fcExamples.appendChild(li);
        });
        fcExamples.style.display = 'block';
    } else {
        fcExamples.style.display = 'none';
    }
    
    fcDetails.style.display = 'none';
    fcInstruction.style.display = 'block';
    fcNextBtn.style.display = 'none';
    
    speakWord(c.word);
}

fcBox.addEventListener('click', () => {
    if (fcDetails.style.display === 'none') {
        fcDetails.style.display = 'block';
        fcInstruction.style.display = 'none';
        fcNextBtn.style.display = 'inline-block';
    }
});

fcNextBtn.addEventListener('click', () => {
    flashcardQueue.shift();
    if (flashcardQueue.length > 0 && useFlashcards) {
        renderFlashcard();
    } else {
        flashcardArea.style.display = 'none';
        startQuizPhases();
    }
});

function startQuizPhases() {
    mcQueue = currentBatch.slice();
    shuffle(mcQueue);
    classicQueue = currentBatch.slice();
    state = 'mc';
    waitingClassic = false;
    lastAskedClassicCard = null;
    flashcardArea.style.display = 'none';
    quiz.style.display = 'block';
    updateSpeechVisibility();
    renderMC();
}

function renderMC() {
    if (mcQueue.length === 0) {
        state = 'classic';
        updateSpeechVisibility();
        renderClassic();
        return;
    }
    const c = mcQueue[0];
    definitionEl.textContent = c.word;
    speakWord(c.word);
    optionsEl.innerHTML = '';
    
    const o = shuffle(allCards.map(x => x.definition).filter(d => d !== c.definition)).slice(0, 3);
    const ch = shuffle([c.definition, ...o]);
    for (const x of ch) {
        const b = document.createElement('button');
        b.className = 'opt-btn';
        b.textContent = x;
        b.onclick = () => handleMCAnswer(b, x, c);
        optionsEl.appendChild(b);
    }
    writeArea.style.display = 'none';
    typed.value = '';
    resultEl.textContent = 'MC: Please select one of the options.';
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    correctBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    counter.textContent = 'MC: ' + (currentBatch.indexOf(c) + 1) + '/' + currentBatch.length;
    updateSpeechVisibility();
}

function handleMCAnswer(btn, ans, c) {
    for (const b of optionsEl.children) b.disabled = true;
    if (ans === c.definition) {
        stopSpeech();
        btn.classList.add('correct');
        resultEl.textContent = 'Correct!';
        playSound(correctSound);
        totalCorrect++;
        updateProgressBar();
        mcQueue.shift();
        setTimeout(() => renderMC(), 500);
    } else {
        btn.classList.add('wrong');
        resultEl.textContent = 'Wrong. Correct: ' + c.definition;
        recordMCError(c.word);
        mcQueue.shift();
        mcQueue.push(c);
        continueBtn.style.display = 'inline-block';
        waitingClassic = true;
    }
}

continueBtn.addEventListener('click', () => {
    if (waitingClassic) {
        waitingClassic = false;
        continueBtn.style.display = 'none';
        if (state === 'classic') {
            writeArea.style.display = 'flex';
            renderClassic();
        } else {
            renderMC();
        }
    }
});

function renderClassic() {
    isProcessingAnswer = false;
    if (delayedControlsTimer) clearTimeout(delayedControlsTimer);
    if (classicQueue.length === 0) {
        if (globalQueue.length > 0) {
            playSound(finishBatchSound);
            prepareNextBatch();
            return;
        }
        displayFinalReport();
        return;
    }
    const c = classicQueue[0];
    definitionEl.textContent = c.definition;
    optionsEl.innerHTML = '';
    writeArea.style.display = 'flex';
    typed.value = '';
    resultEl.textContent = 'Classic: Type your written answer.';
    counter.textContent = 'Classic: ' + (currentBatch.indexOf(c) + 1) + '/' + currentBatch.length;
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    correctBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    showDelayedControls();
    updateSpeechVisibility();
    setTimeout(() => typed.focus(), 50);
}

checkTyped.addEventListener('click', () => {
    if (state !== 'classic' || waitingClassic || isProcessingAnswer) return;
    const a = typed.value.trim();
    if (!a) {
        resultEl.textContent = 'Please type something.';
        return;
    }
    if (classicQueue.length === 0) return;

    const c = classicQueue.shift();
    const isLastClassicInBatch = classicQueue.length === 0;
    const isLastBatch = globalQueue.length === 0;
    
    if (a.toLowerCase() === c.word.toLowerCase()) {
        isProcessingAnswer = true;
        stopSpeech();
        resultEl.textContent = 'Correct!';
        totalCorrect++;
        updateProgressBar();
        lastAskedClassicCard = null;
        waitingClassic = false;
        if (!isLastClassicInBatch) {
            playSound(correctSound);
        }
        if (isLastClassicInBatch && !isLastBatch) {
            playSound(finishBatchSound);
        }
        if (isLastClassicInBatch && isLastBatch) {
            playSound(finishAllSound);
        }
        setTimeout(() => renderClassic(), 400);
    } else {
        resultEl.textContent = 'Wrong. Correct: ' + c.word;
        recordClassicError(c.word);
        classicQueue.push(c);
        lastAskedClassicCard = c;
        waitingClassic = true;
        continueBtn.style.display = 'inline-block';
        correctBtn.style.display = 'inline-block';
        hintBtn.style.display = 'none';
        dontKnowBtn.style.display = 'none';
        writeArea.style.display = 'none';
    }
});

hintBtn.addEventListener('click', () => {
    if (classicQueue.length > 0 && !waitingClassic) {
        typed.value = classicQueue[0].word.slice(0, 2);
    }
});

dontKnowBtn.addEventListener('click', () => {
    if (classicQueue.length > 0 && !waitingClassic) {
        const c = classicQueue.shift();
        typed.value = c.word;
        resultEl.textContent = 'Correct: ' + c.word;
        recordClassicError(c.word);
        classicQueue.push(c);
        lastAskedClassicCard = c;
        writeArea.style.display = 'none';
        hintBtn.style.display = 'none';
        correctBtn.style.display = 'none';
        dontKnowBtn.style.display = 'none';
        continueBtn.style.display = 'inline-block';
        waitingClassic = true;
    }
});

correctBtn.addEventListener('click', () => {
    if (classicQueue.length > 0 && lastAskedClassicCard) {
        clearClassicError(lastAskedClassicCard.word);
        
        const i = classicQueue.indexOf(lastAskedClassicCard);
        if (i > -1) classicQueue.splice(i, 1);
        totalCorrect++;
        updateProgressBar();
        const isLastClassicInBatch = classicQueue.length === 0;
        const isLastBatch = globalQueue.length === 0;
        if (!isLastClassicInBatch) {
            playSound(correctSound);
        }
        if (isLastClassicInBatch && !isLastBatch) {
            playSound(finishBatchSound);
        }
        if (isLastClassicInBatch && isLastBatch) {
            playSound(finishAllSound);
        }
        lastAskedClassicCard = null;
        waitingClassic = false;
        continueBtn.style.display = 'none';
        correctBtn.style.display = 'none';
        writeArea.style.display = 'flex';
        renderClassic();
    } else if (classicQueue.length > 0) {
        classicQueue.shift();
        waitingClassic = false;
        continueBtn.style.display = 'none';
        correctBtn.style.display = 'none';
        renderClassic();
    }
});

typed.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        checkTyped.click();
    }
});

hardReset();