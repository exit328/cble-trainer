/* CBLE Rote Memory Trainer
 *
 * HARD INVARIANTS - do not change:
 *   1. questions.json holds ONE canonical order (examDate asc, then question number asc).
 *      That order is never re-sorted, reversed, or shuffled here. We render bank[] as loaded.
 *   2. Each question's choices keep their ORIGINAL letters and ORIGINAL sequence from the
 *      CBP exam paper. We never re-letter and never re-order choices.
 *   3. Groups are fixed sequential slices of that same order: group 1 = items 1..N, etc.
 *   4. Grading always maps back to the original letter from the official CBP answer key.
 * There is no shuffle anywhere in this file, by design.
 */

var COOKIE_SIZE = 'cble_group_size';
var COOKIE_GROUP = 'cble_group_number';
var LS_SCORES = 'cble_group_stats_v1';   // localStorage: per-group attempts + best score
var LS_INSTANT = 'cble_instant_feedback_v1'; // localStorage: '1' = show answer after each question
var SIZES = [10, 20, 40];

var bank = [];          // canonical order, never mutated
var groupSize = 20;
var groupNumber = 1;
var current = [];       // the slice being taken (a view of bank, same order)
var answers = {};       // questionId -> chosen letter
var revealed = {};      // questionId -> true once Show Answer was used; grades as missed
var instantFeedback = false; // ON: right/wrong shown as soon as a choice is picked; scores normally
var cursor = 0;

/* ---------- cookies ---------- */
function setCookie(name, value) {
  var d = new Date();
  d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
  document.cookie = name + '=' + encodeURIComponent(value) +
    ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}
function getCookie(name) {
  var parts = document.cookie ? document.cookie.split(';') : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

/* ---------- per-group stats (localStorage) ---------- */
function loadStats() {
  try { return JSON.parse(localStorage.getItem(LS_SCORES) || '{}'); }
  catch (e) { return {}; }
}
function saveStats(s) {
  try { localStorage.setItem(LS_SCORES, JSON.stringify(s)); } catch (e) {}
}
function statKey(size, num) { return size + ':' + num; }
function recordAttempt(size, num, correct, total) {
  var s = loadStats();
  var k = statKey(size, num);
  var e = s[k] || { attempts: 0, best: -1, bestTotal: total };
  e.attempts += 1;
  if (correct > e.best) { e.best = correct; e.bestTotal = total; }
  s[k] = e;
  saveStats(s);
  return e;
}
function getStat(size, num) { return loadStats()[statKey(size, num)] || null; }

/* ---------- grouping (fixed sequential slices) ---------- */
function groupCount() { return Math.ceil(bank.length / groupSize); }
function sliceFor(num) {
  var start = (num - 1) * groupSize;
  return bank.slice(start, Math.min(start + groupSize, bank.length));
}

/* ---------- rendering ---------- */
function $(id) { return document.getElementById(id); }
function show(id) {
  ['setup', 'quiz', 'results'].forEach(function (s) { $(s).classList.add('hidden'); });
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}

function renderSizeButtons() {
  var wrap = $('sizeButtons');
  wrap.innerHTML = '';
  var all = SIZES.slice();
  if (all.indexOf(groupSize) === -1) all.push(groupSize);
  all.forEach(function (n) {
    var b = document.createElement('button');
    b.className = 'btn size' + (n === groupSize ? ' active' : '');
    b.textContent = n;
    b.onclick = function () { setSize(n); };
    wrap.appendChild(b);
  });
  $('customSize').value = SIZES.indexOf(groupSize) === -1 ? groupSize : '';
}

function renderGroupButtons() {
  var wrap = $('groupButtons');
  wrap.innerHTML = '';
  var total = groupCount();
  $('groupHint').textContent =
    total + ' groups of ' + groupSize + ' (last group has ' +
    (bank.length - (total - 1) * groupSize) + '). Order is fixed.';
  for (var i = 1; i <= total; i++) {
    (function (n) {
      var s = getStat(groupSize, n);
      var b = document.createElement('button');
      b.className = 'btn group' + (n === groupNumber ? ' active' : '');
      var label = '<span class="gnum">' + n + '</span>';
      if (s && s.best >= 0) {
        var pct = Math.round(s.best / s.bestTotal * 100);
        label += '<span class="gbest' + (pct >= 75 ? ' pass' : '') + '">' + pct + '%</span>';
      }
      b.innerHTML = label;
      b.onclick = function () { startGroup(n); };
      wrap.appendChild(b);
    })(i);
  }
}

function setSize(n) {
  n = Math.max(1, Math.min(1000, Math.floor(n)));
  groupSize = n;
  if (groupNumber > groupCount()) groupNumber = 1;
  setCookie(COOKIE_SIZE, groupSize);
  setCookie(COOKIE_GROUP, groupNumber);
  renderSizeButtons();
  renderGroupButtons();
}

function startGroup(n) {
  groupNumber = n;
  setCookie(COOKIE_SIZE, groupSize);
  setCookie(COOKIE_GROUP, groupNumber);
  current = sliceFor(n);      // same canonical order, always
  answers = {};
  revealed = {};
  cursor = 0;
  show('quiz');
  renderQuestion();
}

function setInstant(on) {
  instantFeedback = !!on;
  try { localStorage.setItem(LS_INSTANT, instantFeedback ? '1' : '0'); } catch (e) {}
  $('instantToggle').checked = instantFeedback;
  $('instantToggleQuiz').checked = instantFeedback;
  if (!$('quiz').classList.contains('hidden')) renderQuestion();
}

function renderQuestion() {
  var q = current[cursor];
  var isRevealed = !!revealed[q.id];
  // Instant mode shows the same feedback as a reveal once a choice is picked,
  // but the question still scores normally; only Show Answer grades as missed.
  var showFeedback = isRevealed || (instantFeedback && !!answers[q.id]);
  $('progress').textContent =
    'Group ' + groupNumber + '  .  Q ' + (cursor + 1) + ' of ' + current.length;
  $('qmeta').textContent =
    q.examLabel + '  .  exam question ' + q.number + (q.category ? '  .  ' + q.category : '') +
    (isRevealed ? '  .  REVEALED' : '');
  $('qtext').textContent = q.question;

  var wrap = $('choices');
  wrap.innerHTML = '';
  // Choices rendered in stored order. No sort, no shuffle.
  q.choices.forEach(function (c) {
    var isRight = q.correct.indexOf(c.letter) !== -1;
    var isPicked = answers[q.id] === c.letter;
    var b = document.createElement('button');
    b.className = 'choice' + (isPicked ? ' picked' : '') +
      (showFeedback && isRight ? ' correct' : '') +
      (showFeedback && isPicked && !isRight ? ' wrongpick' : '');
    b.innerHTML = '<span class="letter">' + c.letter + '</span><span class="ctext"></span>' +
      (showFeedback && isRight ? '<span class="tag">correct</span>' : '') +
      (showFeedback && isPicked && !isRight ? '<span class="tag bad">you chose</span>' : '');
    b.querySelector('.ctext').textContent = c.text;
    b.onclick = function () {
      if (revealed[q.id]) return;   // answer shown: locked, grades as missed
      if (instantFeedback && answers[q.id]) return;  // instant mode: locked once answered
      answers[q.id] = c.letter;
      renderQuestion();
    };
    wrap.appendChild(b);
  });

  var note = $('qnote');
  if (showFeedback && q.note) {
    note.textContent = q.note;
    note.classList.remove('hidden');
  } else {
    note.textContent = '';
    note.classList.add('hidden');
  }

  var rb = $('revealBtn');
  rb.disabled = isRevealed;
  rb.textContent = isRevealed ? 'Revealed  .  counts as missed' : 'Show Answer';
  // Instant feedback already shows the answer once picked; hide the reveal
  // button there so a stray tap cannot turn a scored answer into a miss.
  if (showFeedback && !isRevealed) rb.classList.add('hidden');
  else rb.classList.remove('hidden');

  $('prevBtn').disabled = cursor === 0;
  $('nextBtn').textContent = (cursor === current.length - 1) ? 'Finish and grade' : 'Next';
  var missing = current.filter(function (x) { return !answers[x.id] && !revealed[x.id]; }).length;
  $('unanswered').textContent = missing ? missing + ' unanswered' : 'all answered';
}

function isCorrect(q, letter) {
  if (!letter) return false;
  return q.correct.indexOf(letter) !== -1;
}
// A revealed question never scores, even if the right letter was picked afterwards.
function countsCorrect(q) {
  return !revealed[q.id] && isCorrect(q, answers[q.id]);
}

function grade() {
  var correct = 0;
  current.forEach(function (q) { if (countsCorrect(q)) correct++; });
  var total = current.length;
  var pct = Math.round(correct / total * 100);
  var stat = recordAttempt(groupSize, groupNumber, correct, total);

  $('resultTitle').textContent = 'Group ' + groupNumber + ' results';
  $('score').innerHTML =
    '<span class="big' + (pct >= 75 ? ' pass' : ' fail') + '">' + correct + ' / ' + total + '</span>' +
    '<span class="pct">' + pct + '%</span>';
  $('bestline').textContent =
    'Attempts: ' + stat.attempts + '  .  Best: ' + stat.best + ' / ' + stat.bestTotal +
    ' (' + Math.round(stat.best / stat.bestTotal * 100) + '%)  .  Passing is 75%';

  var missed = current.filter(function (q) { return !countsCorrect(q); });
  $('reviewHead').textContent = missed.length ? 'Missed (' + missed.length + ')' : 'Nothing missed';
  var rv = $('review');
  rv.innerHTML = '';
  missed.forEach(function (q) {
    var picked = answers[q.id];
    var d = document.createElement('div');
    d.className = 'rev';
    var head = document.createElement('div');
    head.className = 'revmeta';
    head.textContent = q.examLabel + '  .  question ' + q.number +
      (revealed[q.id] ? '  .  answer revealed' : '');
    var qt = document.createElement('div');
    qt.className = 'revq';
    qt.textContent = q.question;
    d.appendChild(head); d.appendChild(qt);

    q.choices.forEach(function (c) {
      var isRight = q.correct.indexOf(c.letter) !== -1;
      var isPicked = picked === c.letter;
      if (!isRight && !isPicked) return;
      var row = document.createElement('div');
      row.className = 'revrow ' + (isRight ? 'right' : 'wrong');
      row.innerHTML = '<span class="letter">' + c.letter + '</span><span class="ctext"></span>' +
        '<span class="tag">' + (isRight ? 'correct' : 'you chose') + '</span>';
      row.querySelector('.ctext').textContent = c.text;
      d.appendChild(row);
    });
    if (!picked) {
      var no = document.createElement('div');
      no.className = 'revrow wrong';
      no.innerHTML = '<span class="letter">-</span><span class="ctext"></span>';
      no.querySelector('.ctext').textContent =
        revealed[q.id] ? 'Answer was revealed.' : 'You left this blank.';
      d.appendChild(no);
    }
    if (q.note) {
      var n = document.createElement('div');
      n.className = 'revnote';
      n.textContent = q.note;
      d.appendChild(n);
    }
    rv.appendChild(d);
  });

  show('results');
}

/* ---------- wiring ---------- */
function backToGroups() {
  renderSizeButtons();
  renderGroupButtons();
  show('setup');
}

$('revealBtn').onclick = function () {
  revealed[current[cursor].id] = true;
  renderQuestion();
};
$('prevBtn').onclick = function () { if (cursor > 0) { cursor--; renderQuestion(); } };
$('nextBtn').onclick = function () {
  if (cursor < current.length - 1) { cursor++; renderQuestion(); }
  else grade();
};
$('backBtn').onclick = backToGroups;
$('backBtn2').onclick = backToGroups;
$('retakeBtn').onclick = function () { startGroup(groupNumber); };
$('nextGroupBtn').onclick = function () {
  startGroup(groupNumber < groupCount() ? groupNumber + 1 : 1);
};
$('instantToggle').onchange = function () { setInstant(this.checked); };
$('instantToggleQuiz').onchange = function () { setInstant(this.checked); };
$('customGo').onclick = function () {
  var v = parseInt($('customSize').value, 10);
  if (v > 0) setSize(v);
};
$('customSize').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') $('customGo').click();
});

/* ---------- boot ---------- */
fetch('questions.json')
  .then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function (data) {
    // Trust the file's canonical order exactly as written. Do not sort.
    bank = data.questions;
    $('bankline').textContent =
      bank.length + ' questions from ' + data.exams.length + ' official CBP exams. Fixed order, no shuffling.';

    var cs = parseInt(getCookie(COOKIE_SIZE), 10);
    if (cs > 0) groupSize = cs;
    var cg = parseInt(getCookie(COOKIE_GROUP), 10);
    if (cg > 0 && cg <= groupCount()) groupNumber = cg;

    try { instantFeedback = localStorage.getItem(LS_INSTANT) === '1'; } catch (e) {}
    $('instantToggle').checked = instantFeedback;
    $('instantToggleQuiz').checked = instantFeedback;

    renderSizeButtons();
    renderGroupButtons();
    show('setup');
  })
  .catch(function (e) {
    $('bankline').textContent =
      'Could not load questions.json (' + e.message + '). Serve this folder over HTTP, for example: python3 -m http.server 8080';
  });
