function parseText(txt) {
    const blocks = txt.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const cards = [];
    for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length >= 3) {
            const formsText = lines[0];
            const translationsText = lines[1];
            
            const formsParts = formsText.split('*');
            const mainWordStr = formsParts[0];
            const mainWord = mainWordStr.split(',')[0].replace(/\s*\([^)]+\)\s*/g, '').trim();
            const rawForms = mainWordStr.split(',').map(s => s.trim()).filter(Boolean);
            
            const transParts = translationsText.split('*');
            const rawTranslations = transParts[0].split(',').map(s => s.trim()).filter(Boolean);
            
            const forms = rawForms.map(s => s.replace(/\s*\([^)]+\)\s*/g, '').trim().toLowerCase());
            
            const sentenceBlock = lines.slice(2).join(' ');
            const sentenceRegex = /\((\d+)\)\s+((?:(?!\(\d+\)\s).)+)/g;
            const sentencesByGroup = {};
            let match;
            
            while((match = sentenceRegex.exec(sentenceBlock)) !== null) {
                const grp = match[1];
                let text = match[2].trim();
                let answers = [];
                const starIndex = text.lastIndexOf('*');
                if (starIndex !== -1) {
                    answers = text.substring(starIndex + 1).split(',').map(s => s.trim().toLowerCase());
                    text = text.substring(0, starIndex).trim();
                }
                if(!sentencesByGroup[grp]) sentencesByGroup[grp] = [];
                sentencesByGroup[grp].push({ text, answers });
            }
            
            if(Object.keys(sentencesByGroup).length > 0) {
                cards.push({ mainWord, rawForms, rawTranslations, forms, sentencesByGroup });
            }
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

let allCards = [], currentBatch = [], classicQueue = [], flashcardQueue = [];
let batchSize = 4, globalQueue = [], state = 'idle'; 
let waitingClassic = false, totalCorrect = 0, lastAskedClassicCard = null, lastConfirmedPeriod = null;
let loadedFileName = '', speechEnabled = true, musicEnabled = true, useFlashcards = true, delayedControlsTimer = null;
let errorStats = {};
let usedSentences = {};
let isProcessingAnswer = false;
let hasStartedSession = false;
let hasUploadedValidFile = false;
let totalClassicItems = 0;
let currentBatchTotal = 0;
let fcSequenceActive = false;
let fcCurrentCard = null;
let sequenceIndex = 0;
let sequenceTimer = null;

const fileInput = document.getElementById('file'), fileLabel = document.getElementById('fileLabel');
const periodSel = document.getElementById('period'), langSel = document.getElementById('lang');
const startBtn = document.getElementById('start'), resetBtn = document.getElementById('reset');
const progress = document.getElementById('progress'), quiz = document.getElementById('quiz');
const definitionEl = document.getElementById('definition');
const checkTyped = document.getElementById('checkTyped');
const writeArea = document.getElementById('writeArea'), resultEl = document.getElementById('result');
const counter = document.getElementById('counter'), continueBtn = document.getElementById('continueBtn');
const hintBtn = document.getElementById('hintBtn'), dontKnowBtn = document.getElementById('dontKnowBtn');
const progressBar = document.getElementById('progressBar'), switchBox = document.getElementById('switchBox');
const speechSwitch = document.getElementById('speechSwitch'), musicSwitch = document.getElementById('musicSwitch'), flashcardSwitch = document.getElementById('flashcardSwitch');

const correctSound = document.getElementById('correctSound');
const finishBatchSound = document.getElementById('finishBatchSound');
const finishAllSound = document.getElementById('finishAllSound');

const flashcardArea = document.getElementById('flashcardArea');
const fcBox = document.getElementById('fcBox');
const fcWord = document.getElementById('fcWord');
const fcDetails = document.getElementById('fcDetails');
const fcPairsContainer = document.getElementById('fcPairsContainer');
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

function getPeriod() { 
    return parseInt(periodSel.value, 10); 
}

function getDefaultPeriodByCount(c) {
    return c <= 15 ? 4 : c <= 23 ? 8 : 12;
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
    const t = totalClassicItems;
    if(t === 0) return;
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

function recordClassicError(word) {
    if (!errorStats[word]) {
        errorStats[word] = 0;
    }
    errorStats[word]++;
}

function hardReset() {
    if (delayedControlsTimer) clearTimeout(delayedControlsTimer);
    if (sequenceTimer) clearTimeout(sequenceTimer);
    fcSequenceActive = false;
    stopSpeech();
    stopAllAudio();
    resetProgressBar();
    allCards = [];
    currentBatch = [];
    classicQueue = [];
    globalQueue = [];
    flashcardQueue = [];
    errorStats = {};
    usedSentences = {};
    state = 'idle';
    waitingClassic = false;
    isProcessingAnswer = false;
    hasStartedSession = false;
    totalCorrect = 0;
    totalClassicItems = 0;
    currentBatchTotal = 0;
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
    writeArea.style.display = 'none';
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    resultEl.textContent = '';
    counter.textContent = '';
    definitionEl.textContent = '';
    fileInput.value = '';
    periodSel.value = '4';
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
    if (sequenceTimer) clearTimeout(sequenceTimer);
    fcSequenceActive = false;
    stopSpeech();
    resetProgressBar();
    shuffle(allCards);
    batchSize = getPeriod();
    globalQueue = allCards.slice();
    errorStats = {};
    
    totalClassicItems = 0;
    for(let w of allCards) {
        let scount = 0;
        const groups = Object.keys(w.sentencesByGroup);
        for(let g of groups) {
            scount += 1;
        }
        totalClassicItems += scount;
    }
    
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
            progress.textContent = 'File is empty or invalid format.';
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
    let totalPeriods = Math.ceil(allCards.length / lastConfirmedPeriod);
    let totalCardsCount = allCards.length;
    let fileName = loadedFileName ? loadedFileName : "File";
    progress.textContent = `${fileName}: All (${totalPeriods}) periods (${totalCardsCount} cards) completed.`;
    
    writeArea.style.display = 'none';
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    resultEl.textContent = '';
    counter.textContent = '';
    
    setStartButtonLabel();
    langSel.disabled = false;
    state = 'idle';
    updateSpeechVisibility();

    let reportHTML = `<div style="text-align: left; margin-top: 10px;">`;
    reportHTML += `<h2 style="font-size: 20px; color: var(--text-sec); text-align: center; margin-bottom: 15px;">Detailed Study Report</h2>`;
    
    const errorWords = Object.keys(errorStats).filter(w => errorStats[w] > 0);
    
    if (errorWords.length === 0) {
        reportHTML += `<p style="text-align: center; color: #166534; font-weight: 600; font-size: 16px;">Perfect, you completed all exercises with zero mistakes!</p>`;
    } else {
        reportHTML += `<div style="max-height: 280px; overflow-y: auto; border: 1px solid var(--card-border); border-radius: 10px; background: var(--input-bg); padding: 12px;">`;
        reportHTML += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
        reportHTML += `<tr style="border-bottom: 2px solid var(--card-border); font-weight: 600;">`;
        reportHTML += `<th style="padding: 8px; text-align: left; color: var(--text-sec);">Word</th>`;
        reportHTML += `<th style="padding: 8px; text-align: center; color: var(--text-sec);">Mistakes</th>`;
        reportHTML += `</tr>`;
        
        errorWords.forEach(word => {
            const errs = errorStats[word];
            reportHTML += `<tr style="border-bottom: 1px solid var(--card-border);">`;
            reportHTML += `<td style="padding: 8px; font-weight: 500;">${word}</td>`;
            reportHTML += `<td style="padding: 8px; text-align: center; color: var(--error-border); font-weight: 600;">${errs}</td>`;
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
        startQuizPhase();
    }
}

function renderFlashcard() {
    if (sequenceTimer) clearTimeout(sequenceTimer);
    fcSequenceActive = false;
    stopSpeech();
    
    const c = flashcardQueue[0];
    fcWord.textContent = c.mainWord;
    
    fcDetails.style.display = 'none';
    fcPairsContainer.innerHTML = '';
    fcInstruction.style.display = 'block';
    fcNextBtn.style.display = 'none';
}

fcBox.addEventListener('click', () => {
    if (fcDetails.style.display === 'none' && state === 'flashcard') {
        fcDetails.style.display = 'block';
        fcInstruction.style.display = 'none';
        fcPairsContainer.innerHTML = '';
        fcNextBtn.style.display = 'none';
        
        fcSequenceActive = true;
        fcCurrentCard = flashcardQueue[0];
        sequenceIndex = 0;
        
        runSequence();
    }
});

function runSequence() {
    if (!fcSequenceActive || state !== 'flashcard') return;
    
    if (sequenceIndex >= fcCurrentCard.rawForms.length) {
        fcNextBtn.style.display = 'inline-block';
        fcSequenceActive = false;
        return;
    }
    
    const p = document.createElement('div');
    p.className = 'fc-pair';
    
    const f = fcCurrentCard.rawForms[sequenceIndex];
    const t = fcCurrentCard.rawTranslations[sequenceIndex] || '';
    
    p.innerHTML = `<span>${f}</span><span class="fc-arrow">&#10142;</span><span>${t}</span>`;
    fcPairsContainer.appendChild(p);

    const cleanWord = f.replace(/\s*\([^)]+\)\s*/g, '').trim();

    let ttsTimeout = null;
    let sequenceProceeded = false;

    const advanceSequence = (delay) => {
        if (sequenceProceeded) return;
        sequenceProceeded = true;
        if (ttsTimeout) clearTimeout(ttsTimeout);
        sequenceIndex++;
        sequenceTimer = setTimeout(runSequence, delay);
    };

    if (speechEnabled && isOnline && langSel.value !== 'none') {
        const map = {
            en: 'en-US', tr: 'tr-TR', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT',
            ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', pt: 'pt-PT',
            nl: 'nl-NL', sv: 'sv-SE', pl: 'pl-PL', hi: 'hi-IN', id: 'id-ID', cs: 'cs-CZ',
            el: 'el-GR', he: 'he-IL', th: 'th-TH', vi: 'vi-VN'
        };
        const utter = new SpeechSynthesisUtterance(cleanWord);
        utter.lang = map[langSel.value] || 'en-US';
        
        utter.onend = () => advanceSequence(150);
        utter.onerror = () => advanceSequence(150);
        
        stopSpeech();
        
        ttsTimeout = setTimeout(() => advanceSequence(0), 1500);
        
        speechSynthesis.speak(utter);
    } else {
        sequenceIndex++;
        sequenceTimer = setTimeout(runSequence, 800);
    }
}

fcNextBtn.addEventListener('click', () => {
    fcSequenceActive = false;
    if (sequenceTimer) clearTimeout(sequenceTimer);
    stopSpeech();
    
    flashcardQueue.shift();
    if (flashcardQueue.length > 0 && useFlashcards) {
        renderFlashcard();
    } else {
        flashcardArea.style.display = 'none';
        startQuizPhase();
    }
});

function startQuizPhase() {
    classicQueue = [];
    currentBatch.forEach(wordObj => {
        const groups = Object.keys(wordObj.sentencesByGroup);
        groups.forEach(grp => {
            const sentences = wordObj.sentencesByGroup[grp];
            const historyKey = wordObj.mainWord + '|' + grp;
            
            if (!usedSentences[historyKey]) {
                usedSentences[historyKey] = [];
            }
            
            let available = sentences.filter(s => !usedSentences[historyKey].includes(s.text));
            
            if (available.length === 0) {
                usedSentences[historyKey] = [];
                available = sentences;
            }
            
            const randomSentence = available[Math.floor(Math.random() * available.length)];
            usedSentences[historyKey].push(randomSentence.text);
            
            classicQueue.push({
                wordObj: wordObj,
                sentenceText: randomSentence.text,
                answers: randomSentence.answers
            });
        });
    });
    
    shuffle(classicQueue);
    currentBatchTotal = classicQueue.length;
    
    classicQueue.forEach((c, index) => {
        c.batchIndex = index + 1;
    });
    
    state = 'classic';
    waitingClassic = false;
    lastAskedClassicCard = null;
    flashcardArea.style.display = 'none';
    quiz.style.display = 'block';
    updateSpeechVisibility();
    renderClassic();
}

continueBtn.addEventListener('click', () => {
    if (waitingClassic) {
        waitingClassic = false;
        continueBtn.style.display = 'none';
        writeArea.style.display = 'flex';
        renderClassic();
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
    
    const parts = c.sentenceText.split('_');
    let html = '';
    for (let i = 0; i < parts.length; i++) {
        html += parts[i];
        if (i < parts.length - 1) {
            html += `<input type="text" class="inline-input" autocomplete="off">`;
        }
    }
    
    definitionEl.innerHTML = html;
    writeArea.style.display = 'flex';
    resultEl.textContent = 'Fill in the blanks and click Check button.';
    
    counter.textContent = 'Classic: ' + c.batchIndex + '/' + currentBatchTotal;
    
    hintBtn.style.display = 'none';
    dontKnowBtn.style.display = 'none';
    continueBtn.style.display = 'none';
    showDelayedControls();
    updateSpeechVisibility();
    
    const inputs = document.querySelectorAll('.inline-input');
    if (inputs.length > 0) {
        setTimeout(() => inputs[0].focus(), 50);
        inputs.forEach(inp => {
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    checkTyped.click();
                }
            });
        });
    }
}

checkTyped.addEventListener('click', () => {
    if (state !== 'classic' || waitingClassic || isProcessingAnswer) return;
    if (classicQueue.length === 0) return;

    const inputs = document.querySelectorAll('.inline-input');
    const userAnswers = Array.from(inputs).map(inp => inp.value.trim().toLowerCase());
    
    if (userAnswers.some(a => a === '')) {
        resultEl.textContent = 'Please fill all blanks.';
        return;
    }

    const c = classicQueue.shift();
    const isLastClassicInBatch = classicQueue.length === 0;
    const isLastBatch = globalQueue.length === 0;
    
    let lengthMatch = userAnswers.length > 0 && userAnswers.length === c.answers.length;
    let completelyCorrect = lengthMatch;
    
    if (lengthMatch) {
        for (let i = 0; i < c.answers.length; i++) {
            if (userAnswers[i] !== c.answers[i]) {
                completelyCorrect = false;
                inputs[i].style.color = 'var(--error-border)';
                inputs[i].style.borderBottomColor = 'var(--error-border)';
            } else {
                inputs[i].style.color = 'var(--success-border)';
                inputs[i].style.borderBottomColor = 'var(--success-border)';
            }
        }
    } else {
        completelyCorrect = false;
        inputs.forEach(inp => {
            inp.style.color = 'var(--error-border)';
            inp.style.borderBottomColor = 'var(--error-border)';
        });
    }
    
    if (completelyCorrect) {
        isProcessingAnswer = true;
        stopSpeech();
        resultEl.textContent = 'Correct!';
        
        inputs.forEach(inp => {
            inp.disabled = true;
        });
        
        totalCorrect++;
        updateProgressBar();
        lastAskedClassicCard = null;
        waitingClassic = false;
        
        if (!isLastClassicInBatch) playSound(correctSound);
        if (isLastClassicInBatch && !isLastBatch) playSound(finishBatchSound);
        if (isLastClassicInBatch && isLastBatch) playSound(finishAllSound);
        
        setTimeout(() => renderClassic(), 400);
    } else {
        resultEl.textContent = 'Wrong. Correct answer(s): ' + c.answers.join(', ');
        recordClassicError(c.wordObj.mainWord);
        classicQueue.push(c);
        lastAskedClassicCard = c;
        waitingClassic = true;
        continueBtn.style.display = 'inline-block';
        hintBtn.style.display = 'none';
        dontKnowBtn.style.display = 'none';
        writeArea.style.display = 'none';
    }
});

hintBtn.addEventListener('click', () => {
    if (classicQueue.length > 0 && !waitingClassic) {
        const c = classicQueue[0];
        const inputs = document.querySelectorAll('.inline-input');
        let hintTexts = [];
        
        inputs.forEach((inp, i) => {
            if (c.answers[i]) {
                let ans = c.answers[i].toLowerCase();
                let matches = [];
                for (let rf of c.wordObj.rawForms) {
                    let clean = rf.replace(/\s*\([^)]+\)\s*/g, '').trim().toLowerCase();
                    if (clean === ans) {
                        let m = rf.match(/\(([^)]+)\)/g);
                        if (m) matches.push(...m);
                    }
                }
                let h = [...new Set(matches)].join('/');
                if (h) {
                    inp.placeholder = h;
                    hintTexts.push(h);
                } else {
                    hintTexts.push('(?)');
                }
            }
        });
        
        if (hintTexts.length > 0) {
            if (inputs.length === 1) {
                resultEl.textContent = 'Hint: ' + hintTexts[0];
            } else {
                resultEl.textContent = 'Hint: ' + hintTexts.map((h, index) => (index + 1) + '. ' + h).join(' | ');
            }
        }
        hintBtn.style.display = 'none';
    }
});

dontKnowBtn.addEventListener('click', () => {
    if (classicQueue.length > 0 && !waitingClassic) {
        const c = classicQueue.shift();
        const inputs = document.querySelectorAll('.inline-input');
        inputs.forEach((inp, i) => {
            if (c.answers[i]) {
                inp.value = c.answers[i];
                inp.style.color = 'var(--error-border)';
                inp.style.borderBottomColor = 'var(--error-border)';
            }
            inp.disabled = true;
        });
        resultEl.textContent = 'Valid answers: ' + c.answers.join(', ');
        recordClassicError(c.wordObj.mainWord);
        classicQueue.push(c);
        lastAskedClassicCard = c;
        writeArea.style.display = 'none';
        hintBtn.style.display = 'none';
        dontKnowBtn.style.display = 'none';
        continueBtn.style.display = 'inline-block';
        waitingClassic = true;
    }
});

hardReset();