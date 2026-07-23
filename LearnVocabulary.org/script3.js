function parseText(txt) {
    const blocks = txt.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const cards = [];
    for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length >= 1) {
            const sentenceBlock = lines.join(' ');
            const sentenceRegex = /\((\d+)\)\s+((?:(?!\(\d+\)\s).)+)/g;
            const sentencesByGroup = {};
            let match;
            let found = false;
            
            while((match = sentenceRegex.exec(sentenceBlock)) !== null) {
                found = true;
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
            
            if (found) {
                cards.push({ mainWord: 'GapFill', sentencesByGroup });
            } else {
                let text = sentenceBlock;
                let answers = [];
                const starIndex = text.lastIndexOf('*');
                if (starIndex !== -1) {
                    answers = text.substring(starIndex + 1).split(',').map(s => s.trim().toLowerCase());
                    text = text.substring(0, starIndex).trim();
                }
                cards.push({ mainWord: 'GapFill', sentencesByGroup: { '1': [{ text, answers }] }});
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

let allCards = [], globalQueue = [], currentBatch = [];
let batchSize = 6, totalBatches = 0, currentBatchIndex = 0;
let usedSentences = {};
let hasStartedSession = false;
let isSessionFinished = false;
let musicEnabled = true;
let currentFileName = '';

const fileInput = document.getElementById('file'), fileLabel = document.getElementById('fileLabel');
const startBtn = document.getElementById('start'), resetBtn = document.getElementById('reset');
const progress = document.getElementById('progress'), quiz = document.getElementById('quiz');
const counter = document.getElementById('counter'), resultEl = document.getElementById('result');
const progressBar = document.getElementById('progressBar'), switchBox = document.getElementById('switchBox');
const musicSwitch = document.getElementById('musicSwitch'), periodSel = document.getElementById('period');
const wordBank = document.getElementById('wordBank'), sentencesArea = document.getElementById('sentencesArea');
const nextBatchBtn = document.getElementById('nextBatchBtn');

const correctSound = document.getElementById('correctSound');
const finishBatchSound = document.getElementById('finishBatchSound');
const finishAllSound = document.getElementById('finishAllSound');

let selectedWordEl = null;

function getPeriod() {
    return parseInt(periodSel.value, 10);
}

function applyDefaultPeriodByCount(c) {
    let p = 6;
    if (c > 17 && c <= 35) p = 9;
    if (c > 35) p = 12;
    periodSel.value = String(p);
}

musicSwitch.addEventListener('change', () => {
    musicEnabled = musicSwitch.checked;
    if (!musicEnabled) stopAllAudio();
});

document.getElementById('themeSel').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
});

periodSel.addEventListener('change', () => {
    if (hasStartedSession && !isSessionFinished) {
        const ok = confirm('Changing the period will restart your session. Are you sure?');
        if (ok) {
            beginStudy();
        } else {
            periodSel.value = String(batchSize);
        }
    } else {
        if (currentFileName) {
            let actionBtnText = hasStartedSession ? '"Restart"' : '"Start"';
            progress.textContent = currentFileName + ': ' + allCards.length + ' cards loaded. Select a period then click ' + actionBtnText + ' (Period: ' + getPeriod() + ').';
        }
    }
});

function playSound(s) {
    if (!musicEnabled) return;
    s.currentTime = 0;
    s.play();
}

function stopAllAudio() {
    correctSound.pause();
    finishBatchSound.pause();
    finishAllSound.pause();
    correctSound.currentTime = 0;
    finishBatchSound.currentTime = 0;
    finishAllSound.currentTime = 0;
}

function updateProgressBar() {
    if (totalBatches === 0) return;
    let completedBatches = currentBatchIndex - 1;
    if (completedBatches < 0) completedBatches = 0;
    progressBar.style.width = (completedBatches / totalBatches * 100) + '%';
}

function hardReset() {
    stopAllAudio();
    allCards = [];
    globalQueue = [];
    currentBatch = [];
    usedSentences = {};
    hasStartedSession = false;
    isSessionFinished = false;
    currentBatchIndex = 0;
    totalBatches = 0;
    selectedWordEl = null;
    currentFileName = '';
    
    musicSwitch.checked = true;
    musicEnabled = true;
    
    quiz.style.display = 'none';
    nextBatchBtn.style.display = 'none';
    resultEl.textContent = '';
    counter.textContent = '';
    wordBank.innerHTML = '';
    sentencesArea.innerHTML = '';
    fileInput.value = '';
    switchBox.style.display = 'none';
    periodSel.style.display = 'none';
    
    const reportContainer = document.getElementById('reportContainer');
    if (reportContainer) reportContainer.remove();
    
    document.getElementById('fileUploadWrapper').style.display = 'flex';
    
    startBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    startBtn.textContent = 'Start';
    progress.textContent = 'Please upload your txt file.';
    progressBar.style.width = '0%';
}

fileInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.txt')) {
        progress.textContent = 'Invalid file format. Please select a .txt file.';
        fileInput.value = '';
        return;
    }
    currentFileName = f.name;
    const r = new FileReader();
    r.onload = ev => {
        allCards = parseText(ev.target.result);
        if (allCards.length) {
            applyDefaultPeriodByCount(allCards.length);
            document.getElementById('fileUploadWrapper').style.display = 'none';
            const elink = document.getElementById('exampleLink');
            if (elink) elink.style.display = 'none';
            periodSel.style.display = 'inline-block';
            startBtn.style.display = 'inline-block';
            resetBtn.style.display = 'inline-block';
            progress.textContent = currentFileName + ': ' + allCards.length + ' cards loaded. Select a period then click "Start" (Period: ' + getPeriod() + ').';
        } else {
            progress.textContent = 'File is empty or invalid format.';
        }
    };
    r.readAsText(f, 'utf-8');
});

startBtn.addEventListener('click', () => {
    if (hasStartedSession && !isSessionFinished) {
        const ok = confirm('Restarting will reset your progress. Are you sure?');
        if (ok) beginStudy();
    } else {
        beginStudy();
    }
});

resetBtn.addEventListener('click', () => {
    const ok = confirm('This will completely reset the application. Are you sure?');
    if (ok) hardReset();
});

function beginStudy() {
    if (!allCards.length) return;
    stopAllAudio();
    shuffle(allCards);
    
    const reportContainer = document.getElementById('reportContainer');
    if (reportContainer) reportContainer.remove();
    
    batchSize = getPeriod();
    globalQueue = allCards.slice();
    totalBatches = Math.ceil(globalQueue.length / batchSize);
    currentBatchIndex = 0;
    
    hasStartedSession = true;
    isSessionFinished = false;
    startBtn.textContent = 'Restart';
    switchBox.style.display = 'flex';
    
    progress.textContent = currentFileName + ': ' + allCards.length + ' cards loaded (Period: ' + batchSize + ').';
    progressBar.style.width = '0%';
    
    prepareNextBatch();
}

function displayFinalReport() {
    isSessionFinished = true;
    playSound(finishAllSound);
    quiz.style.display = 'none';
    progressBar.style.width = '100%';
    
    progress.textContent = currentFileName + ': All (' + totalBatches + ') periods (' + allCards.length + ' cards) completed.';
    
    let reportHTML = `<div class="card" style="text-align: left;">`;
    reportHTML += `<p style="text-align: center; color: #166534; font-weight: 600; font-size: 16px;">Perfect, you completed all exercises!</p>`;
    reportHTML += `</div>`;
    
    document.getElementById('quiz').insertAdjacentHTML('afterend', `<div id="reportContainer">${reportHTML}</div>`);
}

function prepareNextBatch() {
    if (globalQueue.length === 0) {
        displayFinalReport();
        return;
    }
    
    currentBatchIndex++;
    updateProgressBar();
    currentBatch = globalQueue.splice(0, batchSize);
    
    let batchSentences = [];
    let batchAnswers = [];
    
    currentBatch.forEach(wordObj => {
        const groups = Object.keys(wordObj.sentencesByGroup);
        groups.forEach(grp => {
            const sentences = wordObj.sentencesByGroup[grp];
            const historyKey = wordObj.mainWord + '|' + grp;
            
            if (!usedSentences[historyKey]) usedSentences[historyKey] = [];
            let available = sentences.filter(s => !usedSentences[historyKey].includes(s.text));
            
            if (available.length === 0) {
                usedSentences[historyKey] = [];
                available = sentences;
            }
            
            const randomSentence = available[Math.floor(Math.random() * available.length)];
            usedSentences[historyKey].push(randomSentence.text);
            
            batchSentences.push({
                wordObj: wordObj,
                text: randomSentence.text,
                answers: randomSentence.answers
            });
            batchAnswers.push(...randomSentence.answers);
        });
    });
    
    shuffle(batchSentences);
    shuffle(batchAnswers);
    
    renderBatch(batchSentences, batchAnswers);
}

function renderBatch(sentences, answers) {
    quiz.style.display = 'block';
    nextBatchBtn.style.display = 'none';
    wordBank.style.display = 'flex';
    resultEl.textContent = 'Drag and drop words into the correct gaps, or click to select and place.';
    counter.textContent = currentBatchIndex + ' / ' + totalBatches;
    
    wordBank.innerHTML = '';
    sentencesArea.innerHTML = '';
    selectedWordEl = null;
    
    answers.forEach((ans, idx) => {
        let el = document.createElement('div');
        el.className = 'draggable-word';
        el.textContent = ans;
        el.draggable = true;
        el.dataset.id = 'word-' + idx;
        
        el.addEventListener('click', () => {
            if (selectedWordEl === el) {
                el.classList.remove('selected');
                selectedWordEl = null;
            } else {
                if (selectedWordEl) selectedWordEl.classList.remove('selected');
                selectedWordEl = el;
                el.classList.add('selected');
            }
        });
        
        el.addEventListener('dragstart', (e) => {
            if (selectedWordEl) selectedWordEl.classList.remove('selected');
            selectedWordEl = null;
            e.dataTransfer.setData('text/plain', e.target.dataset.id);
        });
        
        wordBank.appendChild(el);
    });

    let blankIdCounter = 0;
    sentences.forEach(s => {
        let parts = s.text.split('_');
        let sentenceDiv = document.createElement('div');
        sentenceDiv.className = 'sentence-row';
        
        for (let i = 0; i < parts.length; i++) {
            let textNode = document.createTextNode(parts[i]);
            sentenceDiv.appendChild(textNode);
            
            if (i < parts.length - 1) {
                let expected = s.answers[i] || '';
                let dropZone = document.createElement('span');
                dropZone.className = 'drop-zone';
                dropZone.dataset.answer = expected;
                dropZone.dataset.blankId = blankIdCounter++;
                dropZone.dataset.mainWord = s.wordObj.mainWord;
                
                dropZone.addEventListener('click', () => handleDropZoneClick(dropZone));
                
                dropZone.addEventListener('dragover', (e) => e.preventDefault());
                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (dropZone.classList.contains('correct') || dropZone.classList.contains('incorrect')) return;
                    const wordId = e.dataTransfer.getData('text/plain');
                    if (!wordId) return;
                    const wordEl = document.querySelector(`[data-id="${wordId}"]`);
                    if (wordEl) placeWordInBlank(wordEl, dropZone);
                });
                
                sentenceDiv.appendChild(dropZone);
            }
        }
        sentencesArea.appendChild(sentenceDiv);
    });
}

function handleDropZoneClick(dropZone) {
    if (dropZone.classList.contains('correct')) return;

    if (dropZone.classList.contains('incorrect')) {
        let text = dropZone.textContent.trim();
        dropZone.textContent = '';
        dropZone.classList.remove('incorrect');
        
        let bankWord = document.querySelector(`.draggable-word[data-origin-blank="${dropZone.dataset.blankId}"]`);
        if (bankWord) {
            bankWord.style.display = 'inline-block';
            bankWord.removeAttribute('data-origin-blank');
        }
        return;
    }

    if (selectedWordEl && !dropZone.textContent) {
        placeWordInBlank(selectedWordEl, dropZone);
        selectedWordEl.classList.remove('selected');
        selectedWordEl = null;
    }
}

function placeWordInBlank(wordEl, dropZone) {
    let placedText = wordEl.textContent;
    let expected = dropZone.dataset.answer;

    dropZone.textContent = placedText;
    wordEl.style.display = 'none';
    wordEl.dataset.originBlank = dropZone.dataset.blankId;

    if (placedText.toLowerCase() === expected.toLowerCase()) {
        dropZone.classList.add('correct');
        playSound(correctSound);
        checkBatchComplete();
    } else {
        dropZone.classList.add('incorrect');
    }
}

function checkBatchComplete() {
    let allBlanks = document.querySelectorAll('.drop-zone');
    let allCorrect = Array.from(allBlanks).every(b => b.classList.contains('correct'));
    if (allCorrect) {
        wordBank.style.display = 'none';
        nextBatchBtn.style.display = 'inline-block';
        resultEl.textContent = 'Awesome! Click the button to continue.';
        if (globalQueue.length > 0) {
            playSound(finishBatchSound);
        }
    }
}

nextBatchBtn.addEventListener('click', () => {
    prepareNextBatch();
});