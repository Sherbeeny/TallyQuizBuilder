/**
 * TallyQuizBuilder
 *
 * Reads quiz data from the active Google Sheet and creates a scored Tally form via API.
 *
 * Features:
 *  - Dynamic option count per question
 *  - One question per page with randomized options
 *  - Automatic score calculation via conditional logic
 *  - Confirmation page ("Ready to Submit?")
 *  - Thank-you page shows score, missed questions, and user's incorrect answers
 *
 * Sheet format:
 *   Column 1       : Question  (question text)
 *   Columns 2..N-1 : A, B, C, D, E... (options — empty cells skipped)
 *   Column N       : Answer   (correct option label, e.g. "B")
 *
 * Setup:
 * 1. Open Extensions > Apps Script
 * 2. Paste this file into the script editor
 * 3. Go to Project Settings (gear icon) → Script Properties
 * 4. Add property: Key = TALLY_API_KEY, Value = your key from https://tally.so/settings/api
 * 5. Run createTallyQuizFromSheet()
 */

const TALLY_API_KEY = PropertiesService.getScriptProperties().getProperty('TALLY_API_KEY');
const TALLY_API_URL = 'https://api.tally.so/forms';

function createTallyQuizFromSheet() {
  if (!TALLY_API_KEY) {
    throw new Error('TALLY_API_KEY not found in Script Properties. ' +
      'Please add it in Project Settings (gear icon) > Script Properties.');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    throw new Error('Sheet must have at least a header row and one question row.');
  }

  const rawHeaders = data[0].map(h => String(h).trim());
  const lowerHeaders = rawHeaders.map(h => h.toLowerCase());

  const questionColIdx = lowerHeaders.indexOf('question');
  const answerColIdx   = lowerHeaders.indexOf('answer');

  if (questionColIdx === -1) throw new Error('Missing required column: "Question"');
  if (answerColIdx === -1)   throw new Error('Missing required column: "Answer"');
  if (answerColIdx <= questionColIdx + 1) {
    throw new Error('There must be at least one option column between "Question" and "Answer".');
  }

  const optionCols = [];
  for (let i = questionColIdx + 1; i < answerColIdx; i++) {
    optionCols.push({ label: rawHeaders[i], index: i });
  }

  Logger.log('Found ' + optionCols.length + ' option columns: ' +
    optionCols.map(c => c.label).join(', '));

  const questions = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const qText = String(row[questionColIdx] || '').trim();
    if (!qText) continue;

    const options = [];
    optionCols.forEach(oc => {
      const text = String(row[oc.index] || '').trim();
      if (text) options.push({ label: oc.label, text: text });
    });

    if (options.length === 0) {
      throw new Error('Row ' + (i + 1) + ': question has no options.');
    }

    const answerLabel = String(row[answerColIdx] || '').trim().toUpperCase();
    const correctOption = options.find(o => o.label.toUpperCase() === answerLabel);
    if (!correctOption) {
      throw new Error('Row ' + (i + 1) + ': answer key "' + answerLabel +
        '" not found among options: ' + options.map(o => o.label).join(', '));
    }

    questions.push({
      question: qText,
      options: options,
      correctText: correctOption.text,
      correctLabel: answerLabel,
    });
  }

  Logger.log('Parsed ' + questions.length + ' questions.');

  const blocks = buildBlocks(questions);
  const payload = { status: 'PUBLISHED', blocks: blocks, settings: { hasProgressBar: true, language: 'en' } };

  const response = UrlFetchApp.fetch(TALLY_API_URL, {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + TALLY_API_KEY, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code === 201) {
    const json = JSON.parse(body);
    Logger.log('✅ Form created! ID: ' + json.id + ' | URL: https://tally.so/r/' + json.id);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'URL: https://tally.so/r/' + json.id, '✅ Form created!', 10);
  } else {
    Logger.log('❌ Error ' + code + ': ' + body);
    throw new Error('Tally API returned ' + code + ': ' + body);
  }
}

function buildBlocks(questions) {
  const blocks = [];
  const totalQuestions = questions.length;

  // ============================================================
  // PHASE 1: Generate all UUIDs upfront
  // ============================================================

  const scoreFieldUuid = newUuid();
  const scoreGroupUuid = newUuid();
  const scoreMentionUuid = newUuid();

  const formTitleUuid = newUuid();
  const formTitleGroupUuid = newUuid();

  const questionMeta = [];

  questions.forEach((q, idx) => {
    const optionGroupUuid = newUuid();
    const optionUuids = [];
    let correctOptionUuid = null;

    q.options.forEach((opt) => {
      const optUuid = newUuid();
      optionUuids.push(optUuid);
      if (opt.label.toUpperCase() === q.correctLabel) {
        correctOptionUuid = optUuid;
      }
    });

    const questionMentionUuid = newUuid();
    const incorrectTextUuid = newUuid();

    questionMeta.push({
      question: q.question,
      correctText: q.correctText,
      optionGroupUuid: optionGroupUuid,
      optionUuids: optionUuids,
      correctOptionUuid: correctOptionUuid,
      incorrectTextUuid: incorrectTextUuid,
      questionMentionUuid: questionMentionUuid,
    });
  });

  // ============================================================
  // PHASE 2: FORM_TITLE with mentions for Score and all questions
  // ============================================================

  const formTitleMentions = [
    {
      uuid: scoreMentionUuid,
      field: {
        uuid: scoreFieldUuid,
        type: 'CALCULATED_FIELD',
        questionType: 'CALCULATED_FIELDS',
        blockGroupUuid: scoreGroupUuid,
        title: 'Score',
        calculatedFieldType: 'NUMBER',
      }
    }
  ];

  questionMeta.forEach((meta, idx) => {
    formTitleMentions.push({
      uuid: meta.questionMentionUuid,
      field: {
        uuid: meta.optionGroupUuid,
        type: 'INPUT_FIELD',
        questionType: 'MULTIPLE_CHOICE',
        blockGroupUuid: meta.optionGroupUuid,
        title: 'Q' + (idx + 1),
      }
    });
  });

  blocks.push({
    uuid: formTitleUuid,
    type: 'FORM_TITLE',
    groupUuid: formTitleGroupUuid,
    groupType: 'FORM_TITLE',
    payload: {
      mentions: formTitleMentions,
      safeHTMLSchema: [['Quiz Challenge']],
      title: 'Quiz Challenge',
    }
  });

  // ============================================================
  // PHASE 3: CALCULATED_FIELDS (Score)
  // ============================================================

  blocks.push({
    uuid: scoreFieldUuid,
    type: 'CALCULATED_FIELDS',
    groupUuid: scoreGroupUuid,
    groupType: 'CALCULATED_FIELDS',
    payload: {
      calculatedFields: [
        {
          uuid: scoreFieldUuid,
          name: 'Score',
          type: 'NUMBER',
          value: 0,
        }
      ]
    }
  });

  // ============================================================
  // PHASE 4: INTRO PAGE BREAK
  // ============================================================

  blocks.push({
    uuid: newUuid(),
    type: 'PAGE_BREAK',
    groupUuid: newUuid(),
    groupType: 'PAGE_BREAK',
    payload: {
      index: 0,
      isFirst: true,
      isLast: false,
      name: '',
    }
  });

  // ============================================================
  // PHASE 5: QUESTION PAGES
  // ============================================================

  questions.forEach((q, idx) => {
    const meta = questionMeta[idx];
    const isLastQuestion = idx === totalQuestions - 1;
    const pageBreakIndex = idx + 1;

    // Question title
    blocks.push({
      uuid: newUuid(),
      type: 'TITLE',
      groupUuid: newUuid(),
      groupType: 'QUESTION',
      payload: {
        safeHTMLSchema: [[escapeHtml(q.question)]],
      }
    });

    // Options (all share same name, randomize/isRequired on ALL)
    q.options.forEach((opt, optIdx) => {
      blocks.push({
        uuid: meta.optionUuids[optIdx],
        type: 'MULTIPLE_CHOICE_OPTION',
        groupUuid: meta.optionGroupUuid,
        groupType: 'MULTIPLE_CHOICE',
        payload: {
          index: optIdx,
          isFirst: optIdx === 0,
          isLast: optIdx === q.options.length - 1,
          text: escapeHtml(opt.text),
          randomize: true,
          isRequired: true,
          name: 'Q' + (idx + 1),
        }
      });
    });

    // Conditional logic: correct answer → Score + 1
    blocks.push({
      uuid: newUuid(),
      type: 'CONDITIONAL_LOGIC',
      groupUuid: newUuid(),
      groupType: 'CONDITIONAL_LOGIC',
      payload: {
        logicalOperator: 'AND',
        conditionals: [
          {
            uuid: newUuid(),
            type: 'SINGLE',
            payload: {
              field: {
                uuid: meta.optionGroupUuid,
                type: 'INPUT_FIELD',
                questionType: 'MULTIPLE_CHOICE',
                blockGroupUuid: meta.optionGroupUuid,
                title: 'Q' + (idx + 1),
              },
              comparison: 'IS',
              value: meta.correctOptionUuid,
            }
          }
        ],
        actions: [
          {
            uuid: newUuid(),
            type: 'CALCULATE',
            payload: {
              calculate: {
                field: {
                  uuid: scoreFieldUuid,
                  type: 'CALCULATED_FIELD',
                  questionType: 'CALCULATED_FIELDS',
                  blockGroupUuid: scoreGroupUuid,
                  title: 'Score',
                  calculatedFieldType: 'NUMBER',
                },
                operator: 'ADDITION',
                value: 1,
              }
            }
          }
        ],
        updateUuid: newUuid(),
      }
    });

    // Page break
    // For the last question, this break IS the confirmation page break
    blocks.push({
      uuid: newUuid(),
      type: 'PAGE_BREAK',
      groupUuid: newUuid(),
      groupType: 'PAGE_BREAK',
      payload: {
        index: pageBreakIndex,
        isFirst: false,
        isLast: false,
        name: isLastQuestion ? 'Confirmation' : '',
      }
    });
  });

  // ============================================================
  // PHASE 6: CONFIRMATION PAGE CONTENT (after last question's break)
  // ============================================================

  const perfectScoreUuid = newUuid();
  const reviewHeadingUuid = newUuid();

  blocks.push({
    uuid: newUuid(),
    type: 'HEADING_2',
    groupUuid: newUuid(),
    groupType: 'HEADING_2',
    payload: {
      safeHTMLSchema: [['✅ Ready to Submit?']],
    }
  });

  blocks.push({
    uuid: newUuid(),
    type: 'TEXT',
    groupUuid: newUuid(),
    groupType: 'TEXT',
    payload: {
      safeHTMLSchema: [['Click the button below to submit your answers and see your results.']],
    }
  });

  // Conditional logic: perfect score → show congrats, hide review heading on thank-you page
  blocks.push({
    uuid: newUuid(),
    type: 'CONDITIONAL_LOGIC',
    groupUuid: newUuid(),
    groupType: 'CONDITIONAL_LOGIC',
    payload: {
      logicalOperator: 'AND',
      conditionals: [
        {
          uuid: newUuid(),
          type: 'SINGLE',
          payload: {
            field: {
              uuid: scoreFieldUuid,
              type: 'CALCULATED_FIELD',
              questionType: 'CALCULATED_FIELDS',
              blockGroupUuid: scoreGroupUuid,
              title: 'Score',
              calculatedFieldType: 'NUMBER',
            },
            comparison: 'EQUAL',
            value: totalQuestions,
          }
        }
      ],
      actions: [
        {
          uuid: newUuid(),
          type: 'SHOW_BLOCKS',
          payload: {
            showBlocks: [perfectScoreUuid]
          }
        },
        {
          uuid: newUuid(),
          type: 'HIDE_BLOCKS',
          payload: {
            hideBlocks: [reviewHeadingUuid]
          }
        }
      ],
      updateUuid: newUuid(),
    }
  });

  // Per-question conditional logic: wrong answer → show review text on thank-you page
  questionMeta.forEach((meta, idx) => {
    blocks.push({
      uuid: newUuid(),
      type: 'CONDITIONAL_LOGIC',
      groupUuid: newUuid(),
      groupType: 'CONDITIONAL_LOGIC',
      payload: {
        logicalOperator: 'AND',
        conditionals: [
          {
            uuid: newUuid(),
            type: 'SINGLE',
            payload: {
              field: {
                uuid: meta.optionGroupUuid,
                type: 'INPUT_FIELD',
                questionType: 'MULTIPLE_CHOICE',
                blockGroupUuid: meta.optionGroupUuid,
                title: 'Q' + (idx + 1),
              },
              comparison: 'IS_NOT',
              value: meta.correctOptionUuid,
            }
          }
        ],
        actions: [
          {
            uuid: newUuid(),
            type: 'SHOW_BLOCKS',
            payload: {
              showBlocks: [meta.incorrectTextUuid]
            }
          }
        ],
        updateUuid: newUuid(),
      }
    });
  });

  // ============================================================
  // PHASE 7: THANK-YOU PAGE BREAK
  // ============================================================

  blocks.push({
    uuid: newUuid(),
    type: 'PAGE_BREAK',
    groupUuid: newUuid(),
    groupType: 'PAGE_BREAK',
    payload: {
      index: totalQuestions + 1,
      isFirst: false,
      isLast: true,
      isThankYouPage: true,
      name: 'Result',
    }
  });

  // ============================================================
  // PHASE 8: THANK-YOU PAGE CONTENT
  // ============================================================

  blocks.push({
    uuid: newUuid(),
    type: 'HEADING_2',
    groupUuid: newUuid(),
    groupType: 'HEADING_2',
    payload: {
      safeHTMLSchema: [['🏆 Your Results']],
    }
  });

  // Score display with @Score mention
  // FIX: removed extra nesting on the mention metadata array
  blocks.push({
    uuid: newUuid(),
    type: 'TEXT',
    groupUuid: newUuid(),
    groupType: 'TEXT',
    payload: {
      safeHTMLSchema: [
        ['You scored '],
        [
          [['@Score', [['tag', 'span'], ['font-weight', 'bold']]]],
          [['tag', 'span'], ['mention', scoreMentionUuid]]   // ← was [[['tag',...], ['mention',...]]]
        ],
        [' out of ' + totalQuestions + '.'],
      ],
    }
  });

  blocks.push({
    uuid: newUuid(),
    type: 'DIVIDER',
    groupUuid: newUuid(),
    groupType: 'DIVIDER',
    payload: {}
  });

  // Perfect score message (hidden by default)
  blocks.push({
    uuid: perfectScoreUuid,
    type: 'TEXT',
    groupUuid: perfectScoreUuid,
    groupType: 'TEXT',
    payload: {
      isHidden: true,
      safeHTMLSchema: [['🎉 Perfect score! You answered all ' + totalQuestions + ' questions correctly!']],
    }
  });

  // Review heading (visible by default)
  blocks.push({
    uuid: reviewHeadingUuid,
    type: 'HEADING_3',
    groupUuid: reviewHeadingUuid,
    groupType: 'HEADING_3',
    payload: {
      safeHTMLSchema: [['📝 Questions You Missed']],
    }
  });

  // Per-question review items (hidden by default)
  // Shows the user's incorrect answer via @Q1, @Q2, etc. mention
  questionMeta.forEach((meta, idx) => {
    blocks.push({
      uuid: meta.incorrectTextUuid,
      type: 'TEXT',
      groupUuid: meta.incorrectTextUuid,
      groupType: 'TEXT',
      payload: {
        isHidden: true,
        safeHTMLSchema: [
          ['Q' + (idx + 1) + ':', [['tag', 'span'], ['font-weight', 'bold']]],
          [' ' + escapeHtml(meta.question)],
          ['', [['tag', 'br']]],
          [
            [
              ['❌ Incorrect answer: '],
              ['@Q' + (idx + 1), [['tag', 'span'], ['mention', meta.questionMentionUuid]]]
            ],
            [
              [['tag', 'span'], ['color', 'rgb(231, 76, 60)']]
            ]
          ],
          ['', [['tag', 'br']]],
          ['✅ Correct answer: ' + escapeHtml(meta.correctText), [['tag', 'span'], ['color', 'rgb(39, 174, 96)']]],
        ],
      }
    });
  });

  return blocks;
}

function newUuid() {
  return Utilities.getUuid();
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tally Quiz')
    .addItem('Create Tally Form', 'createTallyQuizFromSheet')
    .addToUi();
}
